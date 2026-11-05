use chrono::{Datelike, NaiveDate};
use rust_decimal::Decimal;
use soldi_types::months::MonthSavings;
use soldi_types::savings::{SavingsMonth, SavingsYear};

use crate::error::AppError;
use crate::reports::domain::percent;
use crate::settings::domain::check_money;

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct MonthAmount {
    pub month: i16,
    pub amount: Decimal,
}

/// `income` and `saved` hold at most one row per month of `year`.
pub struct YearInput {
    pub year: i16,
    pub opening_date: NaiveDate,
    pub goal_pct: Option<i16>,
    pub income: Vec<MonthAmount>,
    pub saved: Vec<MonthAmount>,
}

pub fn check_amount(amount: Decimal) -> Result<Decimal, AppError> {
    if amount.is_sign_negative() && !amount.is_zero() {
        return Err(AppError::invalid("amount", "must be zero or more"));
    }
    check_money("amount", amount)
}

pub fn check_period(year: i32, month: i32) -> Result<(i16, i16), AppError> {
    check_year(year)?;
    if !(1..=12).contains(&month) {
        return Err(AppError::invalid("month", "must be 1 to 12"));
    }
    Ok((year as i16, month as i16))
}

pub fn check_year(year: i32) -> Result<i16, AppError> {
    if !(2000..=2100).contains(&year) {
        return Err(AppError::invalid("year", "must be 2000 to 2100"));
    }
    Ok(year as i16)
}

pub fn before_opening(year: i16, month: i16, opening_date: NaiveDate) -> bool {
    (i32::from(year), month as u32) < (opening_date.year(), opening_date.month())
}

pub fn year(input: YearInput) -> SavingsYear {
    let amount = |rows: &[MonthAmount], month| {
        rows.iter()
            .find(|row| row.month == month)
            .map_or(Decimal::ZERO, |row| row.amount)
    };
    let months: Vec<SavingsMonth> = (1..=12)
        .map(|month| {
            if before_opening(input.year, month, input.opening_date) {
                return SavingsMonth {
                    month,
                    income: None,
                    saved: None,
                    pct: None,
                };
            }
            let income = amount(&input.income, month);
            let saved = amount(&input.saved, month);
            SavingsMonth {
                month,
                income: Some(income),
                saved: Some(saved),
                pct: percent(saved, income),
            }
        })
        .collect();
    let total_income: Decimal = months.iter().filter_map(|month| month.income).sum();
    let total_saved: Decimal = months.iter().filter_map(|month| month.saved).sum();
    let pct = percent(total_saved, total_income);
    let goal_progress_pct = pct
        .zip(input.goal_pct)
        .and_then(|(pct, goal)| percent(pct, Decimal::from(goal)))
        .map(|progress| progress.min(Decimal::new(1000, 1)));
    SavingsYear {
        year: input.year,
        months,
        total_income,
        total_saved,
        pct,
        goal_pct: input.goal_pct,
        goal_progress_pct,
    }
}

/// The month view's savings (SOL-5 rule 8).
pub fn month_savings(saved: Option<Decimal>, income: Decimal) -> Option<MonthSavings> {
    saved.map(|amount| MonthSavings {
        amount,
        pct: percent(amount, income),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn money(text: &str) -> Decimal {
        text.parse().unwrap()
    }

    fn field(result: Result<impl std::fmt::Debug, AppError>) -> String {
        match result {
            Err(AppError::Validation(errors)) => errors[0].field.clone(),
            other => panic!("{other:?}"),
        }
    }

    fn at(month: i16, amount: &str) -> MonthAmount {
        MonthAmount {
            month,
            amount: money(amount),
        }
    }

    fn year_of(
        opening: &str,
        goal_pct: Option<i16>,
        income: Vec<MonthAmount>,
        saved: Vec<MonthAmount>,
    ) -> SavingsYear {
        year(YearInput {
            year: 2026,
            opening_date: opening.parse().unwrap(),
            goal_pct,
            income,
            saved,
        })
    }

    fn text(value: Option<Decimal>) -> Option<String> {
        value.map(|value| value.to_string())
    }

    #[test]
    fn rule_4_an_amount_is_zero_or_more_with_two_places() {
        assert_eq!(check_amount(money("0")).unwrap(), money("0"));
        assert_eq!(check_amount(money("420.5")).unwrap(), money("420.5"));
        assert_eq!(field(check_amount(money("-0.01"))), "amount");
        assert_eq!(field(check_amount(money("1.001"))), "amount");
        assert_eq!(field(check_amount(money("10000000000"))), "amount");
        assert!(check_period(2000, 1).is_ok() && check_period(2100, 12).is_ok());
        assert_eq!(field(check_period(1999, 12)), "year");
        assert_eq!(field(check_period(2101, 1)), "year");
        assert_eq!(field(check_period(2026, 0)), "month");
        assert_eq!(field(check_period(2026, 13)), "month");
    }

    #[test]
    fn rule_5_a_months_pct_is_of_its_income_and_null_without_income() {
        let savings = year_of(
            "2026-03-15",
            None,
            vec![at(3, "5000"), at(11, "5000")],
            vec![at(3, "420"), at(4, "100"), at(11, "1260")],
        );

        assert_eq!(savings.year, 2026);
        assert_eq!(savings.months.len(), 12);
        let row = |month: usize| {
            let row = &savings.months[month - 1];
            (row.month, text(row.income), text(row.saved), text(row.pct))
        };
        assert_eq!(row(1), (1, None, None, None));
        assert_eq!(row(2), (2, None, None, None));
        assert_eq!(
            row(3),
            (
                3,
                Some("5000".into()),
                Some("420".into()),
                Some("8.4".into())
            )
        );
        assert_eq!(row(4), (4, Some("0".into()), Some("100".into()), None));
        assert_eq!(
            row(11),
            (
                11,
                Some("5000".into()),
                Some("1260".into()),
                Some("25.2".into())
            )
        );
        assert_eq!(row(12), (12, Some("0".into()), Some("0".into()), None));
    }

    #[test]
    fn rule_6_year_totals_sum_income_and_savings() {
        let savings = year_of(
            "2026-01-01",
            None,
            vec![at(3, "5000"), at(11, "5000")],
            vec![at(3, "420"), at(11, "1260")],
        );

        assert_eq!(savings.total_income, money("10000"));
        assert_eq!(savings.total_saved, money("1680"));
        assert_eq!(text(savings.pct), Some("16.8".into()));
        assert_eq!((savings.goal_pct, savings.goal_progress_pct), (None, None));
        let empty = year_of("2027-01-01", None, vec![], vec![]);
        assert_eq!((empty.total_income, empty.pct), (money("0"), None));
        assert!(empty.months.iter().all(|month| month.income.is_none()));
    }

    #[test]
    fn rule_7_goal_progress_is_the_year_pct_over_the_goal_capped_at_100() {
        let progress = |goal: Option<i16>, income: &str| {
            text(
                year_of("2026-01-01", goal, vec![at(3, income)], vec![at(3, "840")])
                    .goal_progress_pct,
            )
        };

        assert_eq!(progress(Some(20), "10000"), Some("42.0".into()));
        assert_eq!(progress(Some(5), "10000"), Some("100.0".into()));
        assert_eq!(progress(None, "10000"), None);
        assert_eq!(progress(Some(20), "0"), None);
        assert_eq!(
            year_of("2026-01-01", Some(20), vec![], vec![]).goal_pct,
            Some(20)
        );
    }

    #[test]
    fn rule_8_a_month_view_shows_its_savings_against_its_income() {
        let filled = month_savings(Some(money("420")), money("5000")).unwrap();
        assert_eq!(filled.amount, money("420"));
        assert_eq!(text(filled.pct), Some("8.4".into()));
        assert_eq!(
            month_savings(Some(money("10")), money("0")).unwrap().pct,
            None
        );
        assert_eq!(month_savings(None, money("5000")), None);
    }
}
