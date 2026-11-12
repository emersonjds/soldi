use chrono::{Datelike, NaiveDate};
use rust_decimal::{Decimal, RoundingStrategy};
use std::collections::HashMap;

use soldi_types::cofrinhos::{Cofrinho, Cofrinhos, NextContribution};
use uuid::Uuid;

use crate::error::AppError;
use crate::reports::domain::percent;

/// `Economia` itself (`parent`) or one of its active subcategories, with its balance.
pub struct Balance {
    pub category_id: Uuid,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub target: Option<Decimal>,
    pub deadline: Option<NaiveDate>,
    pub parent: bool,
    pub balance: Decimal,
}

/// The months from `today`'s to `deadline`'s, both included; at least one.
pub fn months_left(today: NaiveDate, deadline: NaiveDate) -> u32 {
    let months =
        (deadline.year() - today.year()) * 12 + deadline.month() as i32 - today.month() as i32 + 1;
    months.max(1) as u32
}

pub fn cofrinho(row: Balance, today: NaiveDate) -> Cofrinho {
    let done = row.target.is_some_and(|target| row.balance >= target);
    let progress_pct = row
        .target
        .and_then(|target| percent(row.balance, target))
        .map(|pct| pct.min(Decimal::new(1000, 1)));
    let monthly_suggestion =
        row.target
            .zip(row.deadline)
            .filter(|_| !done)
            .map(|(target, deadline)| {
                ((target - row.balance) / Decimal::from(months_left(today, deadline)))
                    .round_dp_with_strategy(2, RoundingStrategy::MidpointNearestEven)
            });
    Cofrinho {
        category_id: row.category_id,
        name: match row.parent {
            true => "Sem objetivo".into(),
            false => row.name,
        },
        icon: row.icon,
        color: row.color,
        target: row.target,
        deadline: row.deadline,
        balance: row.balance,
        progress_pct,
        done,
        monthly_suggestion,
        parent: row.parent,
        next_contribution: None,
    }
}

pub fn cofrinhos(
    rows: Vec<Balance>,
    saved_this_month: Decimal,
    mut next: HashMap<Uuid, NextContribution>,
    today: NaiveDate,
) -> Cofrinhos {
    let total_saved = rows.iter().map(|row| row.balance).sum();
    let mut items: Vec<Cofrinho> = rows
        .into_iter()
        .filter(|row| !row.parent || row.balance > Decimal::ZERO)
        .map(|row| Cofrinho {
            next_contribution: next.remove(&row.category_id),
            ..cofrinho(row, today)
        })
        .collect();
    items.sort_by_cached_key(|item| (item.done, item.name.to_lowercase()));
    Cofrinhos {
        total_saved,
        saved_this_month,
        items,
    }
}

pub fn check_withdraw(balance: Decimal, amount: Decimal) -> Result<(), AppError> {
    if amount > balance {
        return Err(AppError::rule(
            "insufficient-cofrinho",
            "The amount is more than the cofrinho holds.",
        ));
    }
    Ok(())
}

pub fn check_empty(balance: Decimal) -> Result<(), AppError> {
    if balance > Decimal::ZERO {
        return Err(AppError::rule(
            "cofrinho-not-empty",
            "Withdraw everything before archiving the cofrinho.",
        ));
    }
    Ok(())
}

pub fn not_a_cofrinho() -> AppError {
    AppError::rule(
        "not-a-cofrinho",
        "The category is neither Economia nor one of its subcategories.",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn money(text: &str) -> Decimal {
        text.parse().unwrap()
    }

    fn date(text: &str) -> NaiveDate {
        text.parse().unwrap()
    }

    fn row(name: &str, target: Option<&str>, deadline: Option<&str>, balance: &str) -> Balance {
        Balance {
            category_id: Uuid::nil(),
            name: name.into(),
            icon: "plane".into(),
            color: "cat-3".into(),
            target: target.map(money),
            deadline: deadline.map(date),
            parent: false,
            balance: money(balance),
        }
    }

    fn slug(result: Result<(), AppError>) -> &'static str {
        match result {
            Err(AppError::Rule { slug, .. }) => slug,
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn deposits_500_and_a_resgate_of_200_leave_300_at_three_percent() {
        let balance = money("500") - money("200");
        assert!(check_withdraw(money("500"), money("200")).is_ok());

        let reserva = cofrinho(
            row(
                "Reserva",
                Some("10000"),
                Some("2027-06-30"),
                &balance.to_string(),
            ),
            date("2026-11-05"),
        );

        assert_eq!(reserva.balance, money("300"));
        assert_eq!(reserva.progress_pct.unwrap().to_string(), "3.0");
        assert!(!reserva.done);
        assert_eq!(reserva.monthly_suggestion.unwrap().to_string(), "1212.50");
    }

    #[test]
    fn a_suggestion_counts_this_month_and_the_deadlines_and_rounds_half_even() {
        assert_eq!(months_left(date("2026-11-05"), date("2027-06-30")), 8);
        assert_eq!(months_left(date("2026-11-05"), date("2026-11-30")), 1);
        assert_eq!(months_left(date("2026-11-05"), date("2025-01-01")), 1);
        let suggestion = |balance: &str| {
            cofrinho(
                row("Carro", Some("100.05"), Some("2027-01-31"), balance),
                date("2026-11-05"),
            )
            .monthly_suggestion
            .unwrap()
            .to_string()
        };
        assert_eq!(suggestion("0"), "33.35");
        assert_eq!(suggestion("100.04"), "0.00");
        let half = cofrinho(
            row("Casa", Some("0.25"), Some("2026-12-31"), "0"),
            date("2026-11-05"),
        );
        assert_eq!(half.monthly_suggestion.unwrap().to_string(), "0.12");
        assert_eq!(
            cofrinho(row("Casa", Some("10"), None, "0"), date("2026-11-05")).monthly_suggestion,
            None
        );
    }

    #[test]
    fn done_is_a_balance_at_the_target_and_progress_stops_at_100() {
        let today = date("2026-11-05");
        let at = cofrinho(row("Viagem", Some("100"), Some("2027-01-31"), "100"), today);
        let over = cofrinho(row("Viagem", Some("100"), None, "250"), today);
        let none = cofrinho(row("Estudos", None, None, "250"), today);

        assert!(at.done && over.done && !none.done);
        assert_eq!(at.monthly_suggestion, None);
        assert_eq!(over.progress_pct.unwrap().to_string(), "100.0");
        assert_eq!(none.progress_pct, None);
    }

    #[test]
    fn the_list_puts_done_last_then_names_and_economia_only_with_money() {
        let economia = |balance: &str| Balance {
            parent: true,
            ..row("Economia", None, None, balance)
        };
        let rows = |parent: &str| {
            vec![
                row("viagem", Some("10"), None, "10"),
                row("Reserva", None, None, "5"),
                economia(parent),
                row("Carro", None, None, "-2"),
            ]
        };

        let list = cofrinhos(rows("0"), money("7"), HashMap::new(), date("2026-11-05"));
        let with_money = cofrinhos(rows("3"), money("7"), HashMap::new(), date("2026-11-05"));

        let names = |list: &Cofrinhos| -> Vec<String> {
            list.items.iter().map(|item| item.name.clone()).collect()
        };
        assert_eq!(names(&list), ["Carro", "Reserva", "viagem"]);
        assert_eq!(list.total_saved, money("13"));
        assert_eq!(list.saved_this_month, money("7"));
        assert_eq!(
            names(&with_money),
            ["Carro", "Reserva", "Sem objetivo", "viagem"]
        );
        assert!(with_money.items[2].parent);
        assert_eq!(with_money.total_saved, money("16"));
    }

    #[test]
    fn a_resgate_above_the_balance_and_archiving_with_money_are_refused() {
        assert_eq!(
            slug(check_withdraw(money("300"), money("300.01"))),
            "insufficient-cofrinho"
        );
        assert!(check_withdraw(money("300"), money("300")).is_ok());
        assert_eq!(slug(check_empty(money("0.01"))), "cofrinho-not-empty");
        assert!(check_empty(money("0")).is_ok());
    }
}
