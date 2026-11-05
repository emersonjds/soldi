use std::collections::HashMap;

use chrono::NaiveDate;
use rust_decimal::{Decimal, RoundingStrategy};
use soldi_types::categories::CategoryKind;
use soldi_types::reports::{CategoryGroup, CategoryReport, CategoryShare};
use uuid::Uuid;

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
                        kind: sum.kind,
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
}
