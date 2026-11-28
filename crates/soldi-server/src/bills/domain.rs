use chrono::{Datelike, Months, NaiveDate};
use soldi_types::bills::{CreateBill, SetBillMonth};

use crate::error::{AppError, reject_nul};
use crate::months::domain::{MonthBill, first_of, month_index, runs_in};
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
    if bill.variable && bill.closing_day.is_some() {
        return Err(AppError::invalid(
            &field("variable"),
            "a card's fatura already varies",
        ));
    }
    if bill.closing_day.is_none() && bill.category_id.is_none() {
        return Err(AppError::invalid(&field("category_id"), "is required"));
    }
    if !(1..=31).contains(&bill.due_day) {
        return Err(AppError::invalid(&field("due_day"), "must be 1 to 31"));
    }
    match (bill.installments, bill.last_month) {
        (None, None) => {}
        (Some(_), _) | (_, Some(_)) if bill.closing_day.is_some() => {
            return Err(AppError::invalid(
                &field("installments"),
                "a card has no parcelas",
            ));
        }
        (Some(n), _) if !(2..=60).contains(&n) => {
            return Err(AppError::invalid(&field("installments"), "must be 2 to 60"));
        }
        (Some(_), None) => {
            return Err(AppError::invalid(
                &field("last_month"),
                "is required with installments",
            ));
        }
        (None, Some(_)) => {
            return Err(AppError::invalid(
                &field("installments"),
                "is required with last_month",
            ));
        }
        (Some(_), Some(_)) => {}
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

/// D30b: a paid fatura is frozen.
pub fn fatura_paid() -> AppError {
    AppError::rule("fatura-paid", "This fatura is already paid.")
}

/// D35: a parcelado bill ends on a month's first day, from `this_month` to `installments`
/// months ahead.
pub fn check_plan(
    installments: i16,
    last_month: NaiveDate,
    this_month: NaiveDate,
) -> Result<(), AppError> {
    let latest = this_month
        .checked_add_months(Months::new(u32::try_from(installments).unwrap_or(0)))
        .unwrap_or(this_month);
    if last_month != first_of(last_month) || !(this_month..=latest).contains(&last_month) {
        return Err(AppError::invalid(
            "last_month",
            "must be a month from now to the last parcela",
        ));
    }
    Ok(())
}

/// What a patch does to a bill's parcelas (D46).
#[derive(Debug, PartialEq, Eq)]
pub enum PlanPatch {
    Keep,
    Drop,
    Set {
        installments: i16,
        last_month: NaiveDate,
    },
}

/// D46: both absent keep the plan, both `null` drop it, both values set it.
pub fn plan_patch(
    installments: Option<Option<i16>>,
    last_month: Option<Option<NaiveDate>>,
) -> Result<PlanPatch, AppError> {
    match (installments, last_month) {
        (None, None) => Ok(PlanPatch::Keep),
        (Some(None), Some(None)) => Ok(PlanPatch::Drop),
        (Some(Some(installments)), Some(Some(last_month))) => Ok(PlanPatch::Set {
            installments,
            last_month,
        }),
        _ => Err(AppError::invalid(
            "last_month",
            "send installments and last_month together",
        )),
    }
}

/// D35: the parcela `month` holds when parcela `installments` falls in `last_month`.
pub fn installment_of(month: NaiveDate, last_month: NaiveDate, installments: i16) -> Option<i16> {
    let k = i32::from(installments) - (month_index(last_month) - month_index(month));
    i16::try_from(k)
        .ok()
        .filter(|k| (1..=installments).contains(k))
}

/// D35: Parar ends after this month, or after a month already paid ahead.
pub fn stop_month(today: NaiveDate, last_paid: Option<NaiveDate>) -> NaiveDate {
    let this = first_of(today);
    last_paid.map_or(this, |paid| this.max(first_of(paid)))
}

pub fn bill_ended() -> AppError {
    AppError::rule("bill-ended", "This bill ended before that month.")
}

/// D56: a month keeps its own amount, a skip, or both; neither is `DELETE`.
pub fn check_month(input: SetBillMonth) -> Result<SetBillMonth, AppError> {
    match input.amount {
        None if !input.skipped => Err(AppError::invalid(
            "amount",
            "is required unless the month is skipped",
        )),
        Some(amount) if amount <= rust_decimal::Decimal::ZERO => {
            Err(AppError::invalid("amount", "must be greater than zero"))
        }
        Some(amount) => Ok(SetBillMonth {
            amount: Some(check_money("amount", amount)?),
            ..input
        }),
        None => Ok(input),
    }
}

/// D56: a conta fixa or parcelada owes `month` from `active_since`'s month, inside its run (D35).
pub fn check_occurrence(bill: &MonthBill, month: NaiveDate) -> Result<(), AppError> {
    if bill.closing_day.is_some() {
        return Err(AppError::rule(
            "card-month",
            "A card's fatura has no amount of its own per month.",
        ));
    }
    if month < first_of(bill.active_since) || !runs_in(bill, month) {
        return Err(AppError::rule(
            "month-outside-bill",
            "This bill owes nothing that month.",
        ));
    }
    Ok(())
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
            category_id: Some(Uuid::nil()),
            closing_day: None,
            installments: None,
            last_month: None,
            variable: false,
        }
    }

    fn card(amount: Option<&str>, closing_day: i16) -> CreateBill {
        CreateBill {
            amount: amount.map(|amount| amount.parse().unwrap()),
            closing_day: Some(closing_day),
            ..bill("Porto", "1", 10)
        }
    }

    fn field<T: std::fmt::Debug>(result: Result<T, AppError>) -> String {
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
    fn only_a_card_comes_without_a_category() {
        let uncategorized = |bill: CreateBill| CreateBill {
            category_id: None,
            ..bill
        };
        assert_eq!(
            field(check(uncategorized(bill("Luz", "1", 5)), "bills[0].")),
            "bills[0].category_id"
        );
        let card = uncategorized(card(None, 3));
        assert_eq!(check(card.clone(), "").unwrap(), card);
    }

    #[test]
    fn d44_a_card_is_never_variable() {
        let variable = |bill: CreateBill| CreateBill {
            variable: true,
            ..bill
        };
        assert!(
            check(variable(bill("Luz", "180", 25)), "")
                .unwrap()
                .variable
        );
        assert_eq!(
            field(check(variable(card(None, 3)), "bills[0].")),
            "bills[0].variable"
        );
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

    fn d(text: &str) -> NaiveDate {
        text.parse().unwrap()
    }

    #[test]
    fn d35_a_parcela_counts_back_from_the_last_month() {
        let last = d("2027-01-01");
        assert_eq!(installment_of(d("2027-01-01"), last, 6), Some(6));
        assert_eq!(installment_of(d("2026-12-01"), last, 6), Some(5));
        assert_eq!(installment_of(d("2026-08-01"), last, 6), Some(1));
        assert_eq!(installment_of(d("2026-07-01"), last, 6), None);
        assert_eq!(installment_of(d("2027-02-01"), last, 6), None);
    }

    #[test]
    fn d35_parar_keeps_this_month_or_a_month_paid_ahead() {
        assert_eq!(stop_month(d("2026-11-12"), None), d("2026-11-01"));
        assert_eq!(
            stop_month(d("2026-11-12"), Some(d("2026-10-05"))),
            d("2026-11-01")
        );
        assert_eq!(
            stop_month(d("2026-11-12"), Some(d("2026-12-03"))),
            d("2026-12-01")
        );
    }

    #[test]
    fn d35_a_plan_needs_both_fields_2_to_60_parcelas_and_no_card() {
        let plan = |installments: Option<i16>, last_month: Option<&str>| CreateBill {
            installments,
            last_month: last_month.map(d),
            ..bill("Fies", "300", 10)
        };
        assert!(check(plan(Some(6), Some("2027-01-01")), "").is_ok());
        for (input, expected) in [
            (plan(Some(6), None), "last_month"),
            (plan(None, Some("2027-01-01")), "installments"),
            (plan(Some(1), Some("2027-01-01")), "installments"),
            (plan(Some(61), Some("2027-01-01")), "installments"),
            (
                CreateBill {
                    installments: Some(6),
                    last_month: Some(d("2027-01-01")),
                    ..card(None, 3)
                },
                "installments",
            ),
        ] {
            assert_eq!(field(check(input, "")), expected);
        }
        let november = d("2026-11-01");
        assert!(check_plan(6, d("2027-01-01"), november).is_ok());
        assert!(check_plan(6, november, november).is_ok());
        assert!(check_plan(6, d("2027-05-01"), november).is_ok());
        for last in ["2026-10-01", "2027-06-01", "2027-01-05"] {
            assert_eq!(
                field(check_plan(6, d(last), november)),
                "last_month",
                "{last}"
            );
        }
    }

    #[test]
    fn sol161_null_installments_and_last_month_drop_the_plan() {
        let last = d("2027-01-01");
        assert_eq!(plan_patch(None, None).unwrap(), PlanPatch::Keep);
        assert_eq!(
            plan_patch(Some(Some(6)), Some(Some(last))).unwrap(),
            PlanPatch::Set {
                installments: 6,
                last_month: last
            }
        );
        assert_eq!(plan_patch(Some(None), Some(None)).unwrap(), PlanPatch::Drop);
        for (installments, last_month) in [
            (Some(Some(6)), None),
            (None, Some(Some(last))),
            (Some(None), None),
            (None, Some(None)),
            (Some(Some(6)), Some(None)),
            (Some(None), Some(Some(last))),
        ] {
            assert_eq!(
                field(plan_patch(installments, last_month)),
                "last_month",
                "{installments:?} {last_month:?}"
            );
        }
    }

    fn month_bill(
        closing_day: Option<i16>,
        last_month: Option<NaiveDate>,
        installments: Option<i16>,
    ) -> MonthBill {
        MonthBill {
            id: Uuid::nil(),
            name: "Aluguel".into(),
            icon: "home".into(),
            color: "cat-6".into(),
            amount: closing_day
                .is_none()
                .then(|| rust_decimal::Decimal::new(150_000, 2)),
            due_day: 24,
            closing_day,
            active_since: "2026-11-27".parse().unwrap(),
            last_month,
            installments,
            variable: false,
        }
    }

    fn slug(result: Result<(), AppError>) -> &'static str {
        match result {
            Err(AppError::Rule { slug, .. }) => slug,
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn d56_a_month_override_needs_an_amount_above_zero_or_a_skip() {
        let set = |amount: Option<&str>, skipped| {
            check_month(SetBillMonth {
                amount: amount.map(|a| a.parse().unwrap()),
                skipped,
            })
        };
        assert!(set(Some("1100.00"), false).is_ok());
        assert!(set(None, true).is_ok());
        assert!(set(Some("1100.00"), true).is_ok());
        for (amount, skipped) in [
            (None, false),
            (Some("0"), false),
            (Some("-1"), true),
            (Some("1.001"), false),
            (Some("10000000000"), false),
        ] {
            assert!(
                matches!(set(amount, skipped), Err(AppError::Validation(_))),
                "{amount:?} {skipped}"
            );
        }
    }

    #[test]
    fn d56_only_a_conta_inside_its_run_takes_a_month_override() {
        let month = |text: &str| -> NaiveDate { text.parse().unwrap() };
        let fixa = month_bill(None, None, None);
        assert!(
            check_occurrence(&fixa, month("2026-11-01")).is_ok(),
            "active_since's month"
        );
        assert!(check_occurrence(&fixa, month("2027-06-01")).is_ok());
        assert_eq!(
            slug(check_occurrence(&fixa, month("2026-10-01"))),
            "month-outside-bill"
        );
        let stopped = month_bill(None, Some(month("2026-12-01")), None);
        assert_eq!(
            slug(check_occurrence(&stopped, month("2027-01-01"))),
            "month-outside-bill"
        );
        let parcelada = month_bill(None, Some(month("2027-02-01")), Some(4));
        assert!(check_occurrence(&parcelada, month("2027-02-01")).is_ok());
        assert_eq!(
            slug(check_occurrence(&parcelada, month("2027-03-01"))),
            "month-outside-bill"
        );
        assert_eq!(
            slug(check_occurrence(
                &month_bill(Some(3), None, None),
                month("2026-12-01")
            )),
            "card-month"
        );
    }
}
