use chrono::{Datelike, NaiveDate};
use soldi_types::bills::CreateBill;

use crate::error::{AppError, reject_nul};
use crate::settings::domain::check_money;

/// The bill with its name trimmed; error fields start with `prefix` (`"bills[2]."`).
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
    if bill.amount <= rust_decimal::Decimal::ZERO {
        return Err(AppError::invalid(
            &field("amount"),
            "must be greater than zero",
        ));
    }
    let amount = check_money(&field("amount"), bill.amount)?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn bill(name: &str, amount: &str, due_day: i16) -> CreateBill {
        CreateBill {
            name: name.into(),
            amount: amount.parse().unwrap(),
            due_day,
            category_id: Uuid::nil(),
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
}
