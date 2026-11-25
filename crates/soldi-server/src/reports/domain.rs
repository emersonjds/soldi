use std::collections::hash_map::Entry;
use std::collections::{BTreeMap, HashMap};

use chrono::{Datelike, Months, NaiveDate};
use rust_decimal::{Decimal, RoundingStrategy};
use soldi_types::categories::CategoryKind;
use soldi_types::months::Totals;
use soldi_types::reports::{
    CategoryGroup, CategoryReport, CategoryShare, SavingsMonth, SavingsTarget, SavingsYear,
    YearCard, YearGroup, YearMonth, YearReport,
};
use uuid::Uuid;

use crate::error::AppError;
use crate::months::domain::{first_of, month_end};

/// A category's total in one month; `month` is its first day. `group_*` describe its top-level
/// category: its parent, or itself.
pub struct CategorySum {
    pub category_id: Uuid,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub kind: CategoryKind,
    pub month: NaiveDate,
    pub amount: Decimal,
    pub parent_id: Option<Uuid>,
    pub group_name: String,
    pub group_icon: String,
    pub group_color: String,
    pub group_kind: CategoryKind,
    pub card_id: Option<Uuid>,
    pub card_name: Option<String>,
    /// Its category or its category's parent is `Economia` (`is_savings`).
    pub savings: bool,
    /// The entry has a `cofrinho_id` (a resgate unless it is a Saída).
    pub cofrinho: bool,
    /// The entry pays a card's fatura (its `recurring_bill` has a `closing_day`).
    pub fatura_payment: bool,
}

/// What an entry is to its month (D54).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Flow {
    Income,
    Spent,
    Saved,
    Withdrawn,
    Ignored,
}

impl CategorySum {
    fn group_id(&self) -> Uuid {
        self.parent_id.unwrap_or(self.category_id)
    }

    pub fn flow(&self) -> Flow {
        match self.kind {
            _ if self.fatura_payment => Flow::Ignored,
            CategoryKind::Bill if self.savings || self.cofrinho => Flow::Saved,
            _ if self.cofrinho => Flow::Withdrawn,
            CategoryKind::Income => Flow::Income,
            CategoryKind::Bill | CategoryKind::Daily => Flow::Spent,
        }
    }
}

/// Entradas (resgates out), Gastos and Guardado (deposits − resgates) of `sums` (D54).
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Spending {
    pub income: Decimal,
    pub spent: Decimal,
    pub saved: Decimal,
}

pub fn spending<'a>(sums: impl IntoIterator<Item = &'a CategorySum>) -> Spending {
    let mut total = Spending::default();
    for sum in sums {
        match sum.flow() {
            Flow::Income => total.income += sum.amount,
            Flow::Spent => total.spent += sum.amount,
            Flow::Saved => total.saved += sum.amount,
            Flow::Withdrawn => total.saved -= sum.amount,
            Flow::Ignored => {}
        }
    }
    total
}

impl Spending {
    pub fn totals(self) -> Totals {
        Totals {
            income: self.income,
            spent: self.spent,
            saved: self.saved,
            performance: self.income - self.spent - self.saved,
        }
    }
}

/// `part` as a percentage of `whole` with one decimal, half to even; none when `whole` is 0.
pub fn percent(part: Decimal, whole: Decimal) -> Option<Decimal> {
    if whole.is_zero() {
        return None;
    }
    let mut pct = (part * Decimal::ONE_HUNDRED / whole)
        .round_dp_with_strategy(1, RoundingStrategy::MidpointNearestEven);
    pct.rescale(1);
    Some(pct)
}

/// One month's income without resgates, its Economia deposits and its resgates; `month` is its first day.
pub struct MonthSaving {
    pub month: NaiveDate,
    pub income: Decimal,
    pub deposited: Decimal,
    pub withdrawn: Decimal,
}

/// A year from 2000 to 2100 (SOL-30's bound).
pub fn parse_year(text: &str) -> Result<i32, AppError> {
    Some(text)
        .filter(|text| text.len() == 4 && text.bytes().all(|byte| byte.is_ascii_digit()))
        .and_then(|text| text.parse().ok())
        .filter(|year| (2000..=2100).contains(year))
        .ok_or_else(|| AppError::invalid("year", "must be a year from 2000 to 2100"))
}

/// The dates `year` reads: from the opening date or January 1 to December 31; none before the
/// opening or after today's year.
pub fn year_range(
    year: i32,
    opening: NaiveDate,
    today: NaiveDate,
) -> Option<(NaiveDate, NaiveDate)> {
    let from = NaiveDate::from_ymd_opt(year, 1, 1)?.max(opening);
    let to = NaiveDate::from_ymd_opt(year, 12, 31)?;
    (from <= to && year <= today.year()).then_some((from, to))
}

/// `year_range` cut at the end of today's month (D31).
pub fn counted_range(
    year: i32,
    opening: NaiveDate,
    today: NaiveDate,
) -> Option<(NaiveDate, NaiveDate)> {
    let (from, to) = year_range(year, opening, today)?;
    let to = to.min(month_end(today));
    (from <= to).then_some((from, to))
}

/// Every month of `range`, newest first, the ones without entries at zero. Months after today's
/// are a forecast of the entries already dated there (D16), left out of the totals.
pub fn savings_year(
    year: i32,
    range: Option<(NaiveDate, NaiveDate)>,
    today: NaiveDate,
    sums: Vec<MonthSaving>,
) -> SavingsYear {
    let sums: HashMap<NaiveDate, MonthSaving> =
        sums.into_iter().map(|sum| (sum.month, sum)).collect();
    let mut months = Vec::new();
    if let Some((from, to)) = range {
        let mut month = first_of(to);
        while month >= first_of(from) {
            let (income, deposited, withdrawn) = sums
                .get(&month)
                .map_or((Decimal::ZERO, Decimal::ZERO, Decimal::ZERO), |sum| {
                    (sum.income, sum.deposited, sum.withdrawn)
                });
            let saved = deposited - withdrawn;
            months.push(SavingsMonth {
                month: month.format("%Y-%m").to_string(),
                income,
                deposited,
                withdrawn,
                saved,
                rate_pct: percent(saved, income),
                forecast: month > first_of(today),
                note: None,
            });
            month = month - Months::new(1);
        }
    }
    let past = || months.iter().filter(|month| !month.forecast);
    let income_total: Decimal = past().map(|month| month.income).sum();
    let deposited_total: Decimal = past().map(|month| month.deposited).sum();
    let withdrawn_total: Decimal = past().map(|month| month.withdrawn).sum();
    let saved_total = deposited_total - withdrawn_total;
    SavingsYear {
        year,
        income_total,
        deposited_total,
        withdrawn_total,
        saved_total,
        rate_pct: percent(saved_total, income_total),
        target: None,
        months,
    }
}

/// P5 (N4): `pct` of `income_total` half to even, what `saved_total` still lacks and how far it
/// got, floored at 0 and never capped so a beaten target reads above 100.
pub fn savings_target(pct: Decimal, income_total: Decimal, saved_total: Decimal) -> SavingsTarget {
    let mut amount = (pct * income_total / Decimal::ONE_HUNDRED)
        .round_dp_with_strategy(2, RoundingStrategy::MidpointNearestEven);
    amount.rescale(2);
    SavingsTarget {
        pct,
        amount,
        remaining: (amount - saved_total).max(Decimal::ZERO),
        progress_pct: percent(saved_total, amount).map(|pct| pct.max(Decimal::new(0, 1))),
        done: amount > Decimal::ZERO && saved_total >= amount,
    }
}

/// The year's totals as its months' (D54), the top three months, the top five outflow and income
/// groups and the card spends.
pub fn year_report(
    year: i32,
    range: Option<(NaiveDate, NaiveDate)>,
    sums: Vec<CategorySum>,
) -> YearReport {
    let zero = Decimal::ZERO;
    let totals = spending(&sums).totals();
    let mut by_month: BTreeMap<NaiveDate, Decimal> = BTreeMap::new();
    let mut by_card: HashMap<Uuid, YearCard> = HashMap::new();
    let mut by_group: HashMap<(Uuid, bool), YearGroup> = HashMap::new();
    for sum in &sums {
        let flow = sum.flow();
        if !matches!(flow, Flow::Spent | Flow::Income) {
            continue;
        }
        let income = flow == Flow::Income;
        if !income {
            *by_month.entry(sum.month).or_default() += sum.amount;
            if let Some(card_id) = sum.card_id {
                by_card
                    .entry(card_id)
                    .or_insert_with(|| YearCard {
                        card_id,
                        name: sum.card_name.clone().unwrap_or_default(),
                        amount: zero,
                    })
                    .amount += sum.amount;
            }
        }
        by_group
            .entry((sum.group_id(), income))
            .or_insert_with(|| YearGroup {
                category_id: sum.group_id(),
                name: sum.group_name.clone(),
                icon: sum.group_icon.clone(),
                color: sum.group_color.clone(),
                amount: zero,
                pct: zero,
            })
            .amount += sum.amount;
    }
    let mut top_months: Vec<YearMonth> = by_month
        .into_iter()
        .filter(|(_, spent)| *spent > zero)
        .map(|(month, spent)| YearMonth {
            month: month.format("%Y-%m").to_string(),
            spent,
        })
        .collect();
    top_months.sort_by_key(|month| std::cmp::Reverse(month.spent));
    top_months.truncate(3);
    let mut cards: Vec<YearCard> = by_card
        .into_values()
        .filter(|card| !card.amount.is_zero())
        .collect();
    cards.sort_by(|a, b| {
        b.amount
            .cmp(&a.amount)
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.card_id.cmp(&b.card_id))
    });
    let card_spent: Decimal = cards.iter().map(|card| card.amount).sum();
    let (income_groups, spending_groups): (Vec<_>, Vec<_>) =
        by_group.into_iter().partition(|((_, income), _)| *income);
    let top = |groups: Vec<((Uuid, bool), YearGroup)>, base: Decimal| -> Vec<YearGroup> {
        let mut groups: Vec<YearGroup> = groups.into_iter().map(|(_, group)| group).collect();
        groups.sort_by(|a, b| {
            b.amount
                .cmp(&a.amount)
                .then_with(|| a.name.cmp(&b.name))
                .then_with(|| a.category_id.cmp(&b.category_id))
        });
        groups.truncate(5);
        for group in &mut groups {
            group.pct = percent(group.amount, base).unwrap_or(Decimal::new(0, 1));
        }
        groups
    };
    let month = |date: NaiveDate| date.format("%Y-%m").to_string();
    YearReport {
        year,
        first_month: range.map(|(from, _)| month(from)),
        last_month: range.map(|(_, to)| month(to)),
        top_months,
        spending: top(spending_groups, totals.spent),
        income: top(income_groups, totals.income),
        card_spent,
        card_pct: percent(card_spent, totals.spent),
        cards,
        totals,
    }
}

/// `sums` hold `month` and the month before it; only Gastos and Entradas (D54) are shares, one per
/// category, and categories without them in `month` are left out. `saved` is the month's Guardado.
pub fn report(month: NaiveDate, sums: Vec<CategorySum>) -> CategoryReport {
    let saved = spending(sums.iter().filter(|sum| sum.month == month)).saved;
    let mut merged: HashMap<(NaiveDate, Uuid, Flow), CategorySum> = HashMap::new();
    for sum in sums {
        let flow = sum.flow();
        if !matches!(flow, Flow::Spent | Flow::Income) {
            continue;
        }
        match merged.entry((sum.month, sum.category_id, flow)) {
            Entry::Occupied(mut row) => row.get_mut().amount += sum.amount,
            Entry::Vacant(row) => {
                row.insert(sum);
            }
        }
    }
    let (mut current, previous): (Vec<CategorySum>, Vec<CategorySum>) =
        merged.into_values().partition(|sum| sum.month == month);
    let mut previous_group: HashMap<Uuid, Decimal> = HashMap::new();
    let mut previous_category: HashMap<Uuid, Decimal> = HashMap::new();
    for sum in &previous {
        *previous_group.entry(sum.group_id()).or_default() += sum.amount;
        *previous_category.entry(sum.category_id).or_default() += sum.amount;
    }
    let previous = previous_category;
    current.sort_by(|a, b| {
        b.amount
            .cmp(&a.amount)
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.category_id.cmp(&b.category_id))
    });
    let (income, outflow): (Vec<CategorySum>, Vec<CategorySum>) = current
        .into_iter()
        .partition(|sum| sum.flow() == Flow::Income);
    let mut groups = Vec::new();
    let mut shares = |section: Vec<CategorySum>| {
        let total: Decimal = section.iter().map(|sum| sum.amount).sum();
        let mut section_groups: Vec<CategoryGroup> = Vec::new();
        for sum in &section {
            let group_id = sum.group_id();
            let index = match section_groups
                .iter()
                .position(|g| g.category_id == group_id)
            {
                Some(index) => index,
                None => {
                    let previous_amount =
                        previous_group.get(&group_id).copied().unwrap_or_default();
                    section_groups.push(CategoryGroup {
                        category_id: group_id,
                        name: sum.group_name.clone(),
                        icon: sum.group_icon.clone(),
                        color: sum.group_color.clone(),
                        kind: sum.group_kind,
                        amount: Decimal::ZERO,
                        pct: Decimal::ZERO,
                        previous_amount,
                        delta_pct: None,
                        children: Vec::new(),
                    });
                    section_groups.len() - 1
                }
            };
            let group = &mut section_groups[index];
            group.amount += sum.amount;
            if sum.parent_id.is_some() {
                group.children.push(sum.category_id);
            }
        }
        for group in &mut section_groups {
            group.pct = percent(group.amount, total).unwrap_or_default();
            group.delta_pct = percent(group.amount - group.previous_amount, group.previous_amount);
        }
        section_groups.sort_by(|a, b| b.amount.cmp(&a.amount).then_with(|| a.name.cmp(&b.name)));
        groups.extend(section_groups);
        let shares = section
            .into_iter()
            .map(|sum| {
                let previous_amount = previous.get(&sum.category_id).copied().unwrap_or_default();
                CategoryShare {
                    pct: percent(sum.amount, total).unwrap_or_default(),
                    delta_pct: percent(sum.amount - previous_amount, previous_amount),
                    previous_amount,
                    category_id: sum.category_id,
                    name: sum.name,
                    icon: sum.icon,
                    color: sum.color,
                    kind: sum.kind,
                    parent_id: sum.parent_id,
                    amount: sum.amount,
                }
            })
            .collect();
        (total, shares)
    };
    let (spent_total, spending) = shares(outflow);
    let (income_total, income) = shares(income);
    CategoryReport {
        month: month.format("%Y-%m").to_string(),
        spent_total,
        income_total,
        saved,
        spending,
        income,
        groups,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soldi_types::categories::CategoryKind::{Bill, Daily, Income};

    fn money(text: &str) -> Decimal {
        text.parse().unwrap()
    }

    fn date(text: &str) -> NaiveDate {
        text.parse().unwrap()
    }

    #[test]
    fn p5_the_target_is_a_share_of_the_entries_so_far() {
        let dec = money;
        let target = savings_target(dec("20.00"), dec("64482.80"), dec("5416.53"));
        assert_eq!(
            (target.amount, target.remaining),
            (dec("12896.56"), dec("7480.03"))
        );
        assert_eq!(
            (target.progress_pct, target.done),
            (Some(dec("42.0")), false)
        );
        let beaten = savings_target(dec("10"), dec("1000.00"), dec("150.00"));
        assert_eq!(
            (beaten.remaining, beaten.progress_pct, beaten.done),
            (dec("0.00"), Some(dec("150.0")), true)
        );
        let empty = savings_target(dec("20"), Decimal::ZERO, dec("50.00"));
        assert_eq!(
            (empty.amount, empty.progress_pct, empty.done),
            (dec("0.00"), None, false)
        );
        let negative = savings_target(dec("20"), dec("1000.00"), dec("-30.00"));
        assert_eq!(negative.progress_pct.unwrap().to_string(), "0.0");
        let half = savings_target(dec("0.25"), dec("2.00"), dec("0.00"));
        assert_eq!(half.amount, dec("0.00"));
        let half_up = savings_target(dec("0.75"), dec("2.00"), dec("0.00"));
        assert_eq!(half_up.amount, dec("0.02"));
    }

    fn sum(id: u128, name: &str, kind: CategoryKind, month: &str, amount: &str) -> CategorySum {
        CategorySum {
            category_id: Uuid::from_u128(id),
            name: name.into(),
            icon: "circle".into(),
            color: "cat-1".into(),
            kind,
            month: date(&format!("{month}-01")),
            amount: money(amount),
            parent_id: None,
            group_name: name.into(),
            group_icon: "circle".into(),
            group_color: "cat-1".into(),
            group_kind: kind,
            card_id: None,
            card_name: None,
            savings: false,
            cofrinho: false,
            fatura_payment: false,
        }
    }

    fn on_card(row: CategorySum) -> CategorySum {
        CategorySum {
            card_id: Some(Uuid::from_u128(99)),
            card_name: Some("Porto".into()),
            ..row
        }
    }

    #[test]
    fn d54_each_rule_row_is_gastos_guardado_income_or_nothing() {
        let bill = || sum(1, "Luz", Bill, "2026-11", "187.35");
        let daily = || sum(2, "Mercado", Daily, "2026-11", "250.40");
        let income = || sum(3, "Salário", Income, "2026-11", "6000");
        let cases = [
            ("1, 2, 5: conta paid or saída avulsa", bill(), Flow::Spent),
            ("6: diário", daily(), Flow::Spent),
            ("7, 8: card purchase", on_card(daily()), Flow::Spent),
            (
                "9, 11: fatura payment",
                CategorySum {
                    fatura_payment: true,
                    ..bill()
                },
                Flow::Ignored,
            ),
            (
                "9: fatura payment edited to diário",
                CategorySum {
                    fatura_payment: true,
                    ..daily()
                },
                Flow::Ignored,
            ),
            (
                "9: fatura payment edited to entrada",
                CategorySum {
                    fatura_payment: true,
                    ..income()
                },
                Flow::Ignored,
            ),
            (
                "12: saída under Economia",
                CategorySum {
                    savings: true,
                    ..bill()
                },
                Flow::Saved,
            ),
            (
                "12: saída under an Economia child",
                CategorySum {
                    savings: true,
                    kind: Bill,
                    ..child(4, "Reserva", (5, "Economia"), "2026-11", "500")
                },
                Flow::Saved,
            ),
            (
                "12: deposit into a cofrinho",
                CategorySum {
                    cofrinho: true,
                    ..bill()
                },
                Flow::Saved,
            ),
            (
                "13: resgate",
                CategorySum {
                    cofrinho: true,
                    ..income()
                },
                Flow::Withdrawn,
            ),
            ("18: entrada", income(), Flow::Income),
        ];
        for (row, sum, flow) in cases {
            assert_eq!(sum.flow(), flow, "row {row}");
        }
    }

    /// Section 5 of SOL-174: October's card purchase and November's entries.
    fn seeded_month() -> Vec<CategorySum> {
        vec![
            on_card(child(10, "Lazer", (11, "Lazer"), "2026-10", "450.00")),
            child(20, "Mercado", (21, "Alimentação"), "2026-11", "250.40"),
            child(22, "Padaria", (21, "Alimentação"), "2026-11", "32.50"),
            sum(30, "Salário", Income, "2026-11", "6000.00"),
            CategorySum {
                savings: true,
                cofrinho: true,
                kind: Bill,
                ..child(40, "Viagem", (41, "Economia"), "2026-11", "500.00")
            },
            CategorySum {
                fatura_payment: true,
                ..sum(50, "Porto", Bill, "2026-11", "450.00")
            },
            CategorySum {
                kind: Bill,
                ..child(60, "Luz", (61, "Casa"), "2026-11", "187.35")
            },
            CategorySum {
                savings: true,
                cofrinho: true,
                kind: Income,
                ..child(40, "Viagem", (41, "Economia"), "2026-11", "120.00")
            },
            child(70, "Farmácia", (71, "Saúde"), "2026-11", "80.00"),
        ]
    }

    #[test]
    fn d54_the_seeded_month_spends_550_25_and_saves_380() {
        let rows = seeded_month();
        let (october, november): (Vec<_>, Vec<_>) =
            rows.iter().partition(|sum| sum.month == date("2026-10-01"));

        assert_eq!(
            spending(november),
            Spending {
                income: money("6000.00"),
                spent: money("550.25"),
                saved: money("380.00"),
            }
        );
        assert_eq!(spending(october).spent, money("450.00"));
    }

    #[test]
    fn d54_more_resgates_than_deposits_save_a_negative_amount() {
        let rows = [
            CategorySum {
                cofrinho: true,
                ..sum(1, "Viagem", Bill, "2026-11", "100")
            },
            CategorySum {
                cofrinho: true,
                ..sum(1, "Viagem", Income, "2026-11", "150")
            },
        ];

        assert_eq!(spending(&rows).saved, money("-50"));
    }

    #[test]
    fn d54_para_onde_vai_shows_gastos_by_group_and_guardado_apart() {
        let report = report(date("2026-11-01"), seeded_month());

        assert_eq!(report.spent_total, money("550.25"));
        assert_eq!(report.saved, money("380.00"));
        assert_eq!(report.income_total, money("6000.00"));
        let groups: Vec<_> = report
            .groups
            .iter()
            .map(|group| {
                (
                    group.name.as_str(),
                    group.amount.to_string(),
                    group.pct.to_string(),
                )
            })
            .collect();
        assert_eq!(
            groups,
            [
                ("Alimentação", "282.90".into(), "51.4".into()),
                ("Casa", "187.35".into(), "34.0".into()),
                ("Saúde", "80.00".into(), "14.5".into()),
                ("Salário", "6000.00".into(), "100.0".into()),
            ]
        );
        assert_eq!(report.income.len(), 1);
    }

    #[test]
    fn d54_cash_and_card_rows_of_one_category_make_one_share() {
        let report = report(
            date("2026-11-01"),
            vec![
                sum(1, "Mercado", Daily, "2026-11", "100"),
                on_card(sum(1, "Mercado", Daily, "2026-11", "50")),
                sum(1, "Mercado", Daily, "2026-10", "60"),
                on_card(sum(1, "Mercado", Daily, "2026-10", "40")),
            ],
        );

        assert_eq!(
            rows(&report.spending),
            [(
                "Mercado",
                "150".into(),
                "100.0".into(),
                "100".into(),
                Some("50.0".into())
            )]
        );
        assert_eq!(report.groups.len(), 1);
        assert_eq!(report.groups[0].previous_amount, money("100"));
    }

    fn child(id: u128, name: &str, parent: (u128, &str), month: &str, amount: &str) -> CategorySum {
        CategorySum {
            parent_id: Some(Uuid::from_u128(parent.0)),
            group_name: parent.1.into(),
            group_icon: "gamepad-2".into(),
            group_color: "cat-5".into(),
            ..sum(id, name, Daily, month, amount)
        }
    }

    fn rows(shares: &[CategoryShare]) -> Vec<(&str, String, String, String, Option<String>)> {
        shares
            .iter()
            .map(|share| {
                (
                    share.name.as_str(),
                    share.amount.to_string(),
                    share.pct.to_string(),
                    share.previous_amount.to_string(),
                    share.delta_pct.map(|delta| delta.to_string()),
                )
            })
            .collect()
    }

    #[test]
    fn rule_1_shares_of_the_outflow_and_the_delta_against_last_month() {
        let report = report(
            date("2026-11-01"),
            vec![
                sum(1, "Mercado", Daily, "2026-11", "900"),
                sum(2, "Comida fora", Daily, "2026-11", "300"),
                sum(3, "Aluguel", Bill, "2026-11", "2259.56"),
                sum(1, "Mercado", Daily, "2026-10", "760"),
            ],
        );

        assert_eq!(report.month, "2026-11");
        assert_eq!(report.spent_total, money("3459.56"));
        assert_eq!(report.income_total, money("0"));
        assert!(report.income.is_empty());
        assert_eq!(
            rows(&report.spending),
            [
                ("Aluguel", "2259.56".into(), "65.3".into(), "0".into(), None),
                (
                    "Mercado",
                    "900".into(),
                    "26.0".into(),
                    "760".into(),
                    Some("18.4".into())
                ),
                ("Comida fora", "300".into(), "8.7".into(), "0".into(), None),
            ]
        );
        assert_eq!(report.spending[0].category_id, Uuid::from_u128(3));
        assert_eq!(report.spending[0].kind, Bill);
    }

    #[test]
    fn rule_2_income_is_its_own_group_and_never_the_base_of_outflow() {
        let report = report(
            date("2026-11-01"),
            vec![
                sum(1, "Mercado", Daily, "2026-11", "900"),
                sum(4, "Extra", Income, "2026-11", "1000"),
                sum(5, "Salário", Income, "2026-11", "5000"),
            ],
        );

        assert_eq!(report.income_total, money("6000"));
        assert_eq!(report.spent_total, money("900"));
        assert_eq!(
            rows(&report.income),
            [
                ("Salário", "5000".into(), "83.3".into(), "0".into(), None),
                ("Extra", "1000".into(), "16.7".into(), "0".into(), None),
            ]
        );
        assert_eq!(report.spending[0].pct.to_string(), "100.0");
    }

    #[test]
    fn rule_3_delta_has_one_decimal_and_is_null_without_a_previous_month() {
        let report = report(
            date("2026-11-01"),
            vec![
                sum(1, "Mercado", Daily, "2026-11", "760"),
                sum(1, "Mercado", Daily, "2026-10", "900"),
                sum(2, "Luz", Bill, "2026-11", "100"),
                sum(2, "Luz", Bill, "2026-10", "100"),
            ],
        );

        assert_eq!(
            report
                .spending
                .iter()
                .map(|share| share.delta_pct.map(|delta| delta.to_string()))
                .collect::<Vec<_>>(),
            [Some("-15.6".into()), Some("0.0".into())]
        );
        assert_eq!(percent(money("5"), money("0")), None);
    }

    #[test]
    fn subcategories_roll_into_their_parents_group() {
        let report = report(
            date("2026-11-01"),
            vec![
                sum(1, "Casa", Daily, "2026-11", "100"),
                child(2, "Luz", (1, "Casa"), "2026-11", "60"),
                child(3, "Água", (1, "Casa"), "2026-11", "40"),
                sum(4, "Mercado", Daily, "2026-11", "250"),
                child(10, "Cinema", (9, "Lazer"), "2026-11", "50"),
                sum(5, "Salário", Income, "2026-11", "1000"),
                child(2, "Luz", (1, "Casa"), "2026-10", "50"),
                child(6, "Gás", (1, "Casa"), "2026-10", "25"),
            ],
        );

        assert_eq!(report.spent_total, money("500"));
        assert_eq!(
            rows(&report.spending),
            [
                ("Mercado", "250".into(), "50.0".into(), "0".into(), None),
                ("Casa", "100".into(), "20.0".into(), "0".into(), None),
                (
                    "Luz",
                    "60".into(),
                    "12.0".into(),
                    "50".into(),
                    Some("20.0".into())
                ),
                ("Cinema", "50".into(), "10.0".into(), "0".into(), None),
                ("Água", "40".into(), "8.0".into(), "0".into(), None),
            ]
        );
        assert_eq!(report.spending[2].parent_id, Some(Uuid::from_u128(1)));
        assert_eq!(report.spending[1].parent_id, None);
        let groups: Vec<_> = report
            .groups
            .iter()
            .map(|group| {
                (
                    group.name.as_str(),
                    group.amount.to_string(),
                    group.pct.to_string(),
                    group.previous_amount.to_string(),
                    group.delta_pct.map(|delta| delta.to_string()),
                    group.children.clone(),
                )
            })
            .collect();
        assert_eq!(
            groups,
            [
                (
                    "Mercado",
                    "250".into(),
                    "50.0".into(),
                    "0".into(),
                    None,
                    vec![]
                ),
                (
                    "Casa",
                    "200".into(),
                    "40.0".into(),
                    "75".into(),
                    Some("166.7".into()),
                    vec![Uuid::from_u128(2), Uuid::from_u128(3)]
                ),
                (
                    "Lazer",
                    "50".into(),
                    "10.0".into(),
                    "0".into(),
                    None,
                    vec![Uuid::from_u128(10)]
                ),
                (
                    "Salário",
                    "1000".into(),
                    "100.0".into(),
                    "0".into(),
                    None,
                    vec![]
                ),
            ]
        );
        let lazer = &report.groups[2];
        assert_eq!(
            (
                lazer.category_id,
                lazer.icon.as_str(),
                lazer.color.as_str(),
                lazer.kind
            ),
            (Uuid::from_u128(9), "gamepad-2", "cat-5", Daily)
        );
        assert_eq!(report.groups[3].kind, Income);
    }

    #[test]
    fn percentages_round_half_to_even() {
        assert_eq!(
            percent(money("1"), money("400")).unwrap().to_string(),
            "0.2"
        );
        assert_eq!(
            percent(money("3"), money("400")).unwrap().to_string(),
            "0.8"
        );
        assert_eq!(percent(money("1"), money("2")).unwrap().to_string(), "50.0");
    }

    fn saving(month: &str, income: &str, deposited: &str, withdrawn: &str) -> MonthSaving {
        MonthSaving {
            month: date(&format!("{month}-01")),
            income: money(income),
            deposited: money(deposited),
            withdrawn: money(withdrawn),
        }
    }

    fn row(month: &SavingsMonth) -> (String, String, String, Option<String>) {
        (
            month.month.clone(),
            month.income.to_string(),
            month.saved.to_string(),
            month.rate_pct.map(|pct| pct.to_string()),
        )
    }

    #[test]
    fn a_year_is_four_digits_from_2000_to_2100() {
        assert_eq!(parse_year("2026").unwrap(), 2026);
        assert_eq!(parse_year("2000").unwrap(), 2000);
        assert_eq!(parse_year("2100").unwrap(), 2100);
        for bad in ["1999", "2101", "abc", "", "+202", "20260", "202a"] {
            assert!(parse_year(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn the_year_runs_from_the_opening_date_to_december_up_to_todays_year() {
        let today = date("2026-11-11");
        assert_eq!(
            year_range(2025, date("2024-06-10"), today),
            Some((date("2025-01-01"), date("2025-12-31")))
        );
        assert_eq!(
            year_range(2026, date("2026-03-15"), today),
            Some((date("2026-03-15"), date("2026-12-31")))
        );
        assert_eq!(
            year_range(2028, date("2020-01-01"), date("2028-02-10")),
            Some((date("2028-01-01"), date("2028-12-31")))
        );
        assert_eq!(year_range(2023, date("2024-06-10"), today), None);
        assert_eq!(year_range(2027, date("2024-06-10"), today), None);
    }

    #[test]
    fn missing_months_read_zero_newest_first_with_totals_over_the_listed_months() {
        let year = savings_year(
            2026,
            Some((date("2026-03-15"), date("2026-06-30"))),
            date("2026-06-30"),
            vec![
                saving("2026-03", "1000", "100", "0"),
                saving("2026-05", "5921.20", "610", "0"),
            ],
        );

        assert_eq!(year.year, 2026);
        let rows: Vec<_> = year.months.iter().map(row).collect();
        assert_eq!(
            rows,
            [
                ("2026-06".into(), "0".into(), "0".into(), None),
                (
                    "2026-05".into(),
                    "5921.20".into(),
                    "610".into(),
                    Some("10.3".into())
                ),
                ("2026-04".into(), "0".into(), "0".into(), None),
                (
                    "2026-03".into(),
                    "1000".into(),
                    "100".into(),
                    Some("10.0".into())
                ),
            ]
        );
        assert_eq!(year.income_total, money("6921.20"));
        assert_eq!(year.saved_total, money("710"));
        assert_eq!(year.rate_pct.unwrap().to_string(), "10.3");
    }

    #[test]
    fn a_month_without_income_has_no_rate_and_more_resgates_than_savings_is_negative() {
        let year = savings_year(
            2025,
            Some((date("2025-01-01"), date("2025-02-28"))),
            date("2026-11-11"),
            vec![
                saving("2025-02", "0", "100", "0"),
                saving("2025-01", "1000", "100", "150"),
            ],
        );

        assert_eq!(year.months[0].rate_pct, None);
        assert_eq!(year.months[1].rate_pct.unwrap().to_string(), "-5.0");
        assert_eq!(year.saved_total, money("50"));
        assert_eq!(year.rate_pct.unwrap().to_string(), "5.0");
    }

    #[test]
    fn a_month_saved_is_its_deposits_minus_its_resgates() {
        let year = savings_year(
            2025,
            Some((date("2025-05-01"), date("2025-05-31"))),
            date("2026-11-11"),
            vec![saving("2025-05", "1000", "100", "300")],
        );

        let may = &year.months[0];
        assert_eq!(
            (may.deposited, may.withdrawn, may.saved),
            (money("100"), money("300"), money("-200"))
        );
        assert_eq!(may.rate_pct.unwrap().to_string(), "-20.0");
        assert_eq!(
            (year.deposited_total, year.withdrawn_total, year.saved_total),
            (money("100"), money("300"), money("-200"))
        );
    }

    #[test]
    fn rates_round_half_to_even_with_one_decimal() {
        let year = savings_year(
            2025,
            Some((date("2025-01-01"), date("2025-02-28"))),
            date("2026-11-11"),
            vec![
                saving("2025-02", "100", "0.25", "0"),
                saving("2025-01", "100", "0.35", "0"),
            ],
        );

        assert_eq!(year.months[0].rate_pct.unwrap().to_string(), "0.2");
        assert_eq!(year.months[1].rate_pct.unwrap().to_string(), "0.4");
        assert_eq!(year.rate_pct.unwrap().to_string(), "0.3");
    }

    #[test]
    fn months_after_todays_month_are_a_forecast_of_their_entries_left_out_of_the_totals() {
        let year = savings_year(
            2026,
            Some((date("2026-09-15"), date("2026-12-31"))),
            date("2026-11-11"),
            vec![
                saving("2026-12", "500", "450", "50"),
                saving("2026-11", "1000", "300", "200"),
                saving("2026-09", "1000", "50", "0"),
            ],
        );

        let rows: Vec<_> = year
            .months
            .iter()
            .map(|month| (row(month), month.forecast))
            .collect();
        assert_eq!(
            rows,
            [
                (
                    (
                        "2026-12".into(),
                        "500".into(),
                        "400".into(),
                        Some("80.0".into())
                    ),
                    true
                ),
                (
                    (
                        "2026-11".into(),
                        "1000".into(),
                        "100".into(),
                        Some("10.0".into())
                    ),
                    false
                ),
                (("2026-10".into(), "0".into(), "0".into(), None), false),
                (
                    (
                        "2026-09".into(),
                        "1000".into(),
                        "50".into(),
                        Some("5.0".into())
                    ),
                    false
                ),
            ]
        );
        assert_eq!(year.income_total, money("2000"));
        assert_eq!(year.saved_total, money("150"));
        assert_eq!(year.deposited_total, money("350"));
        assert_eq!(year.withdrawn_total, money("200"));
        assert_eq!(year.rate_pct.unwrap().to_string(), "7.5");
    }

    #[test]
    fn a_past_year_has_no_forecast() {
        let year = savings_year(
            2025,
            Some((date("2025-01-01"), date("2025-12-31"))),
            date("2026-01-05"),
            vec![saving("2025-12", "100", "10", "0")],
        );

        assert_eq!(year.months.len(), 12);
        assert!(year.months.iter().all(|month| !month.forecast));
        assert_eq!(year.saved_total, money("10"));
    }

    #[test]
    fn a_year_outside_the_opening_and_today_is_empty() {
        let year = savings_year(2023, None, date("2026-11-11"), Vec::new());

        assert_eq!(year.year, 2023);
        assert!(year.months.is_empty());
        assert_eq!(year.income_total, Decimal::ZERO);
        assert_eq!(year.saved_total, Decimal::ZERO);
        assert_eq!(year.rate_pct, None);
    }

    fn with_card(id: u128, name: &str, row: CategorySum) -> CategorySum {
        CategorySum {
            card_id: Some(Uuid::from_u128(id)),
            card_name: Some(name.into()),
            ..row
        }
    }

    fn deposit(month: &str, amount: &str) -> CategorySum {
        CategorySum {
            savings: true,
            ..sum(90, "Economia", Bill, month, amount)
        }
    }

    fn months(report: &YearReport) -> Vec<(&str, String)> {
        report
            .top_months
            .iter()
            .map(|month| (month.month.as_str(), month.spent.to_string()))
            .collect()
    }

    fn groups(groups: &[YearGroup]) -> Vec<(&str, String, String)> {
        groups
            .iter()
            .map(|group| {
                (
                    group.name.as_str(),
                    group.amount.to_string(),
                    group.pct.to_string(),
                )
            })
            .collect()
    }

    #[test]
    fn the_counted_year_runs_in_whole_months_up_to_todays_month() {
        let today = date("2026-11-11");
        assert_eq!(
            counted_range(2025, date("2024-06-10"), today),
            Some((date("2025-01-01"), date("2025-12-31")))
        );
        assert_eq!(
            counted_range(2026, date("2026-06-15"), today),
            Some((date("2026-06-15"), date("2026-11-30")))
        );
        assert_eq!(
            counted_range(2024, date("2024-02-01"), date("2024-02-10")),
            Some((date("2024-02-01"), date("2024-02-29")))
        );
        assert_eq!(counted_range(2023, date("2024-06-10"), today), None);
        assert_eq!(counted_range(2027, date("2024-06-10"), today), None);
        assert_eq!(counted_range(2026, date("2026-12-05"), today), None);
    }

    #[test]
    fn d54_the_seeded_year_spends_1000_25_and_saves_380() {
        let report = year_report(
            2026,
            Some((date("2026-10-01"), date("2026-11-30"))),
            seeded_month(),
        );

        assert_eq!(
            (
                report.totals.spent,
                report.totals.saved,
                report.totals.income
            ),
            (money("1000.25"), money("380.00"), money("6000.00"))
        );
        assert_eq!(report.totals.performance, money("4619.75"));
        assert_eq!(
            months(&report),
            [("2026-11", "550.25".into()), ("2026-10", "450.00".into())]
        );
        let cards: Vec<(&str, String)> = report
            .cards
            .iter()
            .map(|card| (card.name.as_str(), card.amount.to_string()))
            .collect();
        assert_eq!(cards, [("Porto", "450.00".into())]);
        assert_eq!(report.card_pct.unwrap().to_string(), "45.0");
        assert_eq!(
            groups(&report.spending),
            [
                ("Lazer", "450.00".into(), "45.0".into()),
                ("Alimentação", "282.90".into(), "28.3".into()),
                ("Casa", "187.35".into(), "18.7".into()),
                ("Saúde", "80.00".into(), "8.0".into()),
            ]
        );
        assert_eq!(
            groups(&report.income),
            [("Salário", "6000.00".into(), "100.0".into())]
        );
    }

    #[test]
    fn card_rows_fold_into_their_month_and_ties_go_to_the_older_month() {
        let porto = |row| with_card(1, "Porto", row);
        let report = year_report(
            2025,
            Some((date("2025-01-01"), date("2025-12-31"))),
            vec![
                sum(1, "Salário", Income, "2025-01", "1000"),
                sum(2, "Aluguel", Bill, "2025-01", "400"),
                sum(3, "Mercado", Daily, "2025-01", "50"),
                porto(sum(3, "Mercado", Daily, "2025-01", "30")),
                sum(2, "Aluguel", Bill, "2025-03", "200"),
                porto(sum(3, "Mercado", Daily, "2025-03", "280")),
                sum(2, "Aluguel", Bill, "2025-05", "100"),
                sum(2, "Aluguel", Bill, "2025-07", "480"),
                deposit("2025-09", "900"),
            ],
        );

        assert_eq!(
            months(&report),
            [
                ("2025-01", "480".into()),
                ("2025-03", "480".into()),
                ("2025-07", "480".into()),
            ]
        );
        assert_eq!(report.first_month.as_deref(), Some("2025-01"));
        assert_eq!(report.last_month.as_deref(), Some("2025-12"));
    }

    #[test]
    fn spending_and_income_keep_five_groups_with_shares_of_the_whole() {
        let report = year_report(
            2025,
            Some((date("2025-01-01"), date("2025-12-31"))),
            vec![
                sum(1, "Casa", Bill, "2025-01", "100"),
                sum(2, "Lazer", Daily, "2025-01", "100"),
                sum(3, "Alimentação", Daily, "2025-01", "250"),
                sum(4, "Saúde", Bill, "2025-01", "50"),
                sum(5, "Veículo", Bill, "2025-01", "150"),
                sum(6, "Gasto", Daily, "2025-01", "30"),
                sum(7, "Pets", Bill, "2025-01", "20"),
                sum(8, "Salário", Income, "2025-01", "797"),
                sum(9, "Extra", Income, "2025-01", "3"),
            ],
        );

        assert_eq!(
            groups(&report.spending),
            [
                ("Alimentação", "250".into(), "35.7".into()),
                ("Veículo", "150".into(), "21.4".into()),
                ("Casa", "100".into(), "14.3".into()),
                ("Lazer", "100".into(), "14.3".into()),
                ("Saúde", "50".into(), "7.1".into()),
            ]
        );
        assert_eq!(
            groups(&report.income),
            [
                ("Salário", "797".into(), "99.6".into()),
                ("Extra", "3".into(), "0.4".into()),
            ]
        );
    }

    #[test]
    fn group_shares_round_half_to_even() {
        let report = year_report(
            2025,
            Some((date("2025-01-01"), date("2025-12-31"))),
            vec![
                sum(1, "Casa", Bill, "2025-01", "397"),
                sum(2, "Lazer", Bill, "2025-01", "3"),
            ],
        );

        assert_eq!(
            groups(&report.spending),
            [
                ("Casa", "397".into(), "99.2".into()),
                ("Lazer", "3".into(), "0.8".into()),
            ]
        );
    }

    #[test]
    fn deposits_are_saving_not_spending_and_the_totals_read_like_a_month() {
        let porto = |row| with_card(1, "Porto", row);
        let itau = |row| with_card(2, "Itaú", row);
        let mercado = |month| sum(3, "Mercado", Daily, month, "0");
        let resgate = CategorySum {
            cofrinho: true,
            ..sum(4, "Resgate", Income, "2025-03", "50")
        };
        let report = year_report(
            2025,
            Some((date("2025-03-15"), date("2025-12-31"))),
            vec![
                sum(1, "Salário", Income, "2025-03", "2300"),
                resgate,
                deposit("2025-03", "200"),
                sum(2, "Aluguel", Bill, "2025-03", "800"),
                sum(3, "Mercado", Daily, "2025-03", "50"),
                porto(CategorySum {
                    amount: money("120"),
                    ..mercado("2025-03")
                }),
                itau(CategorySum {
                    amount: money("120"),
                    ..mercado("2025-04")
                }),
                porto(CategorySum {
                    amount: money("30"),
                    ..mercado("2025-04")
                }),
                deposit("2025-06", "500"),
            ],
        );

        let totals = &report.totals;
        assert_eq!(totals.income, money("2300"));
        assert_eq!(totals.spent, money("1120"));
        assert_eq!(totals.saved, money("650"));
        assert_eq!(totals.performance, money("530"));
        assert_eq!(
            months(&report),
            [("2025-03", "970".into()), ("2025-04", "150".into())]
        );
        assert_eq!(report.card_spent, money("270"));
        assert_eq!(
            report.card_pct.map(|pct| pct.to_string()),
            Some("24.1".into())
        );
        let cards: Vec<(&str, String)> = report
            .cards
            .iter()
            .map(|card| (card.name.as_str(), card.amount.to_string()))
            .collect();
        assert_eq!(cards, [("Porto", "150".into()), ("Itaú", "120".into())]);
        assert_eq!(report.first_month.as_deref(), Some("2025-03"));
    }

    #[test]
    fn a_year_with_only_deposits_has_no_card_share_and_no_top_month() {
        let report = year_report(
            2025,
            Some((date("2025-01-01"), date("2025-12-31"))),
            vec![deposit("2025-02", "300")],
        );

        assert_eq!(report.totals.spent, Decimal::ZERO);
        assert_eq!(report.totals.saved, money("300"));
        assert!(report.top_months.is_empty());
        assert_eq!(report.card_pct, None);
    }

    #[test]
    fn a_year_without_a_range_is_empty() {
        let report = year_report(2023, None, Vec::new());

        assert_eq!(report.year, 2023);
        assert_eq!(report.first_month, None);
        assert_eq!(report.last_month, None);
        assert_eq!(report.totals, Spending::default().totals());
        assert!(report.top_months.is_empty());
        assert!(report.spending.is_empty());
        assert!(report.income.is_empty());
        assert!(report.cards.is_empty());
        assert_eq!(report.card_pct, None);
    }

    #[test]
    fn ties_go_by_id_and_cards_without_spends_drop() {
        let report = year_report(
            2025,
            Some((date("2025-01-01"), date("2025-12-31"))),
            vec![
                with_card(2, "Porto", sum(2, "Casa", Daily, "2025-01", "50")),
                with_card(1, "Porto", sum(1, "Casa", Daily, "2025-01", "50")),
                with_card(3, "Itaú", sum(1, "Casa", Daily, "2025-01", "0")),
            ],
        );

        let cards: Vec<Uuid> = report.cards.iter().map(|card| card.card_id).collect();
        assert_eq!(cards, [Uuid::from_u128(1), Uuid::from_u128(2)]);
        let spending: Vec<Uuid> = report
            .spending
            .iter()
            .map(|group| group.category_id)
            .collect();
        assert_eq!(spending, [Uuid::from_u128(1), Uuid::from_u128(2)]);
    }

    #[test]
    fn a_share_of_nothing_reads_zero_with_one_decimal() {
        let report = year_report(
            2025,
            Some((date("2025-01-01"), date("2025-12-31"))),
            vec![sum(1, "Salário", Income, "2025-01", "0")],
        );

        assert_eq!(report.income[0].pct.to_string(), "0.0");
    }
}
