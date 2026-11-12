use std::collections::HashMap;

use chrono::{Datelike, Months, NaiveDate};
use rust_decimal::{Decimal, RoundingStrategy};
use soldi_types::categories::CategoryKind;
use soldi_types::reports::{
    CategoryGroup, CategoryReport, CategoryShare, SavingsMonth, SavingsYear,
};
use uuid::Uuid;

use crate::error::AppError;
use crate::months::domain::first_of;

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
}

impl CategorySum {
    fn group_id(&self) -> Uuid {
        self.parent_id.unwrap_or(self.category_id)
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
        months,
    }
}

/// `sums` hold `month` and the month before it; categories without spending in `month` are left out.
pub fn report(month: NaiveDate, sums: Vec<CategorySum>) -> CategoryReport {
    let (mut current, previous): (Vec<CategorySum>, Vec<CategorySum>) =
        sums.into_iter().partition(|sum| sum.month == month);
    let mut previous_group: HashMap<Uuid, Decimal> = HashMap::new();
    for sum in &previous {
        *previous_group.entry(sum.group_id()).or_default() += sum.amount;
    }
    let previous: HashMap<Uuid, Decimal> = previous
        .into_iter()
        .map(|sum| (sum.category_id, sum.amount))
        .collect();
    current.sort_by(|a, b| b.amount.cmp(&a.amount).then_with(|| a.name.cmp(&b.name)));
    let (income, outflow): (Vec<CategorySum>, Vec<CategorySum>) = current
        .into_iter()
        .partition(|sum| sum.kind == CategoryKind::Income);
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
    let (outflow_total, outflow) = shares(outflow);
    let (income_total, income) = shares(income);
    CategoryReport {
        month: month.format("%Y-%m").to_string(),
        outflow_total,
        income_total,
        outflow,
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
        }
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
        assert_eq!(report.outflow_total, money("3459.56"));
        assert_eq!(report.income_total, money("0"));
        assert!(report.income.is_empty());
        assert_eq!(
            rows(&report.outflow),
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
        assert_eq!(report.outflow[0].category_id, Uuid::from_u128(3));
        assert_eq!(report.outflow[0].kind, Bill);
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
        assert_eq!(report.outflow_total, money("900"));
        assert_eq!(
            rows(&report.income),
            [
                ("Salário", "5000".into(), "83.3".into(), "0".into(), None),
                ("Extra", "1000".into(), "16.7".into(), "0".into(), None),
            ]
        );
        assert_eq!(report.outflow[0].pct.to_string(), "100.0");
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
                .outflow
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

        assert_eq!(report.outflow_total, money("500"));
        assert_eq!(
            rows(&report.outflow),
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
        assert_eq!(report.outflow[2].parent_id, Some(Uuid::from_u128(1)));
        assert_eq!(report.outflow[1].parent_id, None);
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
}
