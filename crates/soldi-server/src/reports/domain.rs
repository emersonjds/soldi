use std::collections::HashMap;

use chrono::NaiveDate;
use rust_decimal::{Decimal, RoundingStrategy};
use soldi_types::categories::CategoryKind;
use soldi_types::reports::{CategoryReport, CategoryShare};
use uuid::Uuid;

/// A category's total in one month; `month` is its first day.
pub struct CategorySum {
    pub category_id: Uuid,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub kind: CategoryKind,
    pub month: NaiveDate,
    pub amount: Decimal,
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
    let previous: HashMap<Uuid, Decimal> = previous
        .into_iter()
        .map(|sum| (sum.category_id, sum.amount))
        .collect();
    current.sort_by(|a, b| b.amount.cmp(&a.amount).then_with(|| a.name.cmp(&b.name)));
    let (income, outflow): (Vec<CategorySum>, Vec<CategorySum>) = current
        .into_iter()
        .partition(|sum| sum.kind == CategoryKind::Income);
    let shares = |group: Vec<CategorySum>| {
        let total: Decimal = group.iter().map(|sum| sum.amount).sum();
        let shares = group
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
