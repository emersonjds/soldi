use chrono::{Datelike, Months, NaiveDate};
use soldi_types::bills::CreateBill;

use crate::error::{AppError, reject_nul};
use crate::months::domain::first_of;
use crate::settings::domain::check_money;

/// The bill with its name trimmed; error fields start with `prefix` (`"bills[2]."`). D28: a
/// conta fixa has an amount and no closing day, a card the reverse.
pub fn check(bill: CreateBill, prefix: &str) -> Result<CreateBill, AppError> {
    let field = |name: &str| format!("{prefix}{name}");
    reject_nul(&field("name"), &bill.name)?;
    let name = bill.name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(AppError::invalid(
            &field("name"),
            "must have 1 to 100 characters",
        ));
    }
    let amount = match (bill.closing_day, bill.amount) {
        (None, None) => return Err(AppError::invalid(&field("amount"), "is required")),
        (Some(_), Some(_)) => {
            return Err(AppError::invalid(&field("amount"), "a card has no amount"));
        }
        (Some(day), None) if !(1..=31).contains(&day) => {
            return Err(AppError::invalid(&field("closing_day"), "must be 1 to 31"));
        }
        (Some(_), None) => None,
        (None, Some(amount)) if amount <= rust_decimal::Decimal::ZERO => {
            return Err(AppError::invalid(
                &field("amount"),
                "must be greater than zero",
            ));
        }
        (None, Some(amount)) => Some(check_money(&field("amount"), amount)?),
    };
    if !(1..=31).contains(&bill.due_day) {
        return Err(AppError::invalid(&field("due_day"), "must be 1 to 31"));
    }
    Ok(CreateBill {
        name: name.to_string(),
        amount,
        ..bill
    })
}

/// The bill's due date in the month starting `month`; a late due day falls on its last day.
pub fn due_date(month: NaiveDate, due_day: i16) -> NaiveDate {
    let last = crate::months::domain::month_end(month);
    let day = u32::try_from(due_day).unwrap_or(1).clamp(1, last.day());
    last.with_day(day).unwrap_or(last)
}

/// D28: the due date of the fatura a spend dated `on` joins. A spend before the month's
/// clamped closing day closes this month, on or after it the next; the fatura is due in the
/// closing month when `due_day` is after `closing_day`, else in the month after.
pub fn fatura_due(on: NaiveDate, closing_day: i16, due_day: i16) -> NaiveDate {
    let next = |month: NaiveDate| month.checked_add_months(Months::new(1)).unwrap_or(month);
    let month = first_of(on);
    let closes = if on < due_date(month, closing_day) {
        month
    } else {
        next(month)
    };
    due_date(
        if due_day > closing_day {
            closes
        } else {
            next(closes)
        },
        due_day,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn bill(name: &str, amount: &str, due_day: i16) -> CreateBill {
        CreateBill {
            name: name.into(),
            amount: Some(amount.parse().unwrap()),
            due_day,
            category_id: Uuid::nil(),
            closing_day: None,
        }
    }

    fn card(amount: Option<&str>, closing_day: i16) -> CreateBill {
        CreateBill {
            amount: amount.map(|amount| amount.parse().unwrap()),
            closing_day: Some(closing_day),
            ..bill("Porto", "1", 10)
        }
    }

    fn field(result: Result<CreateBill, AppError>) -> String {
        match result {
            Err(AppError::Validation(errors)) => errors[0].field.clone(),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn rule_6_a_late_due_day_falls_on_the_months_last_day() {
        let month = |text: &str| text.parse::<chrono::NaiveDate>().unwrap();

        assert_eq!(due_date(month("2026-11-01"), 31), month("2026-11-30"));
        assert_eq!(due_date(month("2027-02-01"), 29), month("2027-02-28"));
        assert_eq!(due_date(month("2028-02-01"), 29), month("2028-02-29"));
        assert_eq!(due_date(month("2026-12-01"), 31), month("2026-12-31"));
        assert_eq!(due_date(month("2026-11-01"), 5), month("2026-11-05"));
    }

    #[test]
    fn a_valid_bill_comes_back_trimmed() {
        let checked = check(bill("  Aluguel ", "1500.00", 31), "").unwrap();

        assert_eq!(checked, bill("Aluguel", "1500.00", 31));
        assert!(check(bill(&"x".repeat(100), "0.01", 1), "").is_ok());
    }

    #[test]
    fn each_rule_names_its_field_with_the_prefix() {
        for (input, expected) in [
            (bill(" ", "10", 5), "bills[1].name"),
            (bill(&"x".repeat(101), "10", 5), "bills[1].name"),
            (bill("a\0b", "10", 5), "bills[1].name"),
            (bill("Luz", "0", 5), "bills[1].amount"),
            (bill("Luz", "-1", 5), "bills[1].amount"),
            (bill("Luz", "10.555", 5), "bills[1].amount"),
            (bill("Luz", "10000000000", 5), "bills[1].amount"),
            (bill("Luz", "10", 0), "bills[1].due_day"),
            (bill("Luz", "10", 32), "bills[1].due_day"),
        ] {
            assert_eq!(field(check(input, "bills[1].")), expected);
        }
    }

    #[test]
    fn a_card_has_a_closing_day_and_no_amount_a_conta_fixa_the_reverse() {
        assert_eq!(check(card(None, 31), "").unwrap(), card(None, 31));
        for (input, expected) in [
            (
                CreateBill {
                    amount: None,
                    ..bill("Luz", "1", 5)
                },
                "amount",
            ),
            (card(Some("10"), 3), "amount"),
            (card(None, 0), "closing_day"),
            (card(None, 32), "closing_day"),
        ] {
            assert_eq!(field(check(input, "")), expected);
        }
    }

    #[test]
    fn a_spend_joins_the_fatura_that_closes_after_it() {
        let day = |text: &str| text.parse::<NaiveDate>().unwrap();
        for (on, closing, due, expected) in [
            ("2026-11-02", 3, 10, "2026-11-10"),
            ("2026-11-03", 3, 10, "2026-12-10"),
            ("2026-12-05", 3, 10, "2027-01-10"),
            ("2026-11-27", 28, 5, "2026-12-05"),
            ("2026-11-28", 28, 5, "2027-01-05"),
            ("2026-02-27", 31, 10, "2026-03-10"),
            ("2026-02-28", 31, 10, "2026-04-10"),
            ("2026-02-10", 20, 31, "2026-02-28"),
            ("2026-11-02", 10, 10, "2026-12-10"),
            ("2028-02-28", 31, 10, "2028-03-10"),
            ("2028-02-29", 31, 10, "2028-04-10"),
        ] {
            assert_eq!(
                fatura_due(day(on), closing, due),
                day(expected),
                "{on} {closing} {due}"
            );
        }
    }
}
