use chrono::{Datelike, Months, NaiveDate};
use rust_decimal::Decimal;
use soldi_types::categories::{Category, CategoryKind};
use soldi_types::transactions::{CreateTransaction, Transaction};
use uuid::Uuid;

use crate::error::{AppError, reject_nul};
use crate::settings::domain::check_money;

/// The entry with its note trimmed (blank means none); the amount is never rounded.
pub fn check(input: CreateTransaction) -> Result<CreateTransaction, AppError> {
    if input.amount <= Decimal::ZERO {
        return Err(AppError::invalid("amount", "must be greater than zero"));
    }
    let amount = check_money("amount", input.amount)?;
    let note = input.note.as_deref().map(check_note).transpose()?.flatten();
    input.repeat_months.map(check_repeat).transpose()?;
    Ok(CreateTransaction {
        amount,
        note,
        ..input
    })
}

fn check_note(note: &str) -> Result<Option<String>, AppError> {
    reject_nul("note", note)?;
    let note = note.trim();
    if note.chars().count() > 500 {
        return Err(AppError::invalid(
            "note",
            "must have at most 500 characters",
        ));
    }
    Ok((!note.is_empty()).then(|| note.to_string()))
}

/// R2: the entries in a repeat, the original included.
pub fn check_repeat(months: i16) -> Result<i16, AppError> {
    if !(2..=60).contains(&months) {
        return Err(AppError::invalid("repeat_months", "must be 2 to 60"));
    }
    Ok(months)
}

/// R1: the dates of the `months - 1` copies, each the original's day in its own month.
pub fn repeat_dates(date: NaiveDate, months: i16) -> Vec<NaiveDate> {
    let first = date.with_day(1).unwrap_or(date);
    let day = i16::try_from(date.day()).unwrap_or(1);
    (1..months)
        .filter_map(|k| first.checked_add_months(Months::new(k.unsigned_abs().into())))
        .map(|month| crate::bills::domain::due_date(month, day))
        .collect()
}

/// R3, R4: bill payments, resgates and series members do not repeat.
pub fn check_repeatable(entry: &Transaction) -> Result<(), AppError> {
    if entry.recurring_bill_id.is_some() {
        return Err(AppError::rule(
            "repeat-not-allowed-on-bill-payment",
            "A bill payment cannot repeat; the bill already recurs.",
        ));
    }
    if entry.cofrinho_id.is_some() {
        return Err(AppError::rule(
            "repeat-not-allowed-on-cofrinho-withdrawal",
            "A resgate cannot repeat.",
        ));
    }
    if entry.series.is_some() {
        return Err(AppError::rule(
            "already-repeated",
            "This entry already repeats.",
        ));
    }
    Ok(())
}

/// R8: only a `bill` entry outside any series, not yet a bill's payment, becomes a bill.
pub fn check_convertible(entry: &Transaction) -> Result<(), AppError> {
    let standalone =
        entry.recurring_bill_id.is_none() && entry.cofrinho_id.is_none() && entry.series.is_none();
    if entry.kind != CategoryKind::Bill || !standalone {
        return Err(AppError::rule(
            "cannot-become-bill",
            "Only a standalone Saída entry can become a recurring bill.",
        ));
    }
    Ok(())
}

pub fn check_kind(kind: CategoryKind, category: &Category) -> Result<(), AppError> {
    if kind != category.kind {
        return Err(AppError::invalid(
            "category_id",
            "must be a category of the entry's kind",
        ));
    }
    Ok(())
}

pub fn transaction(
    id: Uuid,
    input: CreateTransaction,
    category: Category,
    recurring_bill_id: Option<Uuid>,
) -> Transaction {
    Transaction {
        id,
        date: input.date,
        amount: input.amount,
        kind: input.kind,
        category,
        note: input.note,
        recurring_bill_id,
        cofrinho_id: None,
        series: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soldi_types::transactions::TransactionSeries;

    fn entry(amount: &str, note: Option<&str>) -> CreateTransaction {
        CreateTransaction {
            date: "2026-11-05".parse().unwrap(),
            amount: amount.parse().unwrap(),
            kind: CategoryKind::Daily,
            category_id: Uuid::nil(),
            note: note.map(String::from),
            repeat_months: None,
        }
    }

    fn date(text: &str) -> NaiveDate {
        text.parse().unwrap()
    }

    fn slug(result: Result<(), AppError>) -> &'static str {
        match result {
            Err(AppError::Rule { slug, .. }) => slug,
            other => panic!("{other:?}"),
        }
    }

    fn saved(kind: CategoryKind) -> Transaction {
        transaction(
            Uuid::nil(),
            CreateTransaction {
                kind,
                ..entry("10", None)
            },
            market(),
            None,
        )
    }

    fn market() -> Category {
        Category {
            id: Uuid::nil(),
            name: "Mercado".into(),
            kind: CategoryKind::Daily,
            icon: "shopping-cart".into(),
            color: "cat-1".into(),
            parent_id: None,
            is_savings: false,
            target: None,
            deadline: None,
        }
    }

    fn series() -> Option<TransactionSeries> {
        Some(TransactionSeries {
            id: Uuid::nil(),
            position: 1,
            total: 2,
        })
    }

    #[test]
    fn r2_a_repeat_counts_2_to_60_entries() {
        assert_eq!(check_repeat(2).unwrap(), 2);
        assert_eq!(check_repeat(60).unwrap(), 60);
        for months in [1, 61, 0, -1] {
            assert_eq!(field(check_repeat(months)), "repeat_months", "{months}");
        }
        let once = CreateTransaction {
            repeat_months: Some(1),
            ..entry("10", None)
        };
        assert_eq!(field(check(once)), "repeat_months");
    }

    #[test]
    fn r1_each_copy_clamps_the_original_day_to_its_own_month() {
        assert_eq!(
            repeat_dates(date("2027-01-31"), 4),
            [date("2027-02-28"), date("2027-03-31"), date("2027-04-30")]
        );
        assert_eq!(repeat_dates(date("2028-01-31"), 2), [date("2028-02-29")]);
        assert_eq!(
            repeat_dates(date("2026-11-30"), 3),
            [date("2026-12-30"), date("2027-01-30")]
        );
    }

    #[test]
    fn r2_twelve_entries_are_the_original_and_eleven_copies() {
        let copies = repeat_dates(date("2026-11-05"), 12);

        assert_eq!(copies.len(), 11);
        assert_eq!(copies[0], date("2026-12-05"));
        assert_eq!(copies[10], date("2027-10-05"));
    }

    #[test]
    fn r3_r4_bill_payments_resgates_and_members_do_not_repeat() {
        assert!(check_repeatable(&saved(CategoryKind::Daily)).is_ok());
        let deposit = saved(CategoryKind::Bill);
        assert!(check_repeatable(&deposit).is_ok());
        let payment = Transaction {
            recurring_bill_id: Some(Uuid::nil()),
            ..deposit.clone()
        };
        assert_eq!(
            slug(check_repeatable(&payment)),
            "repeat-not-allowed-on-bill-payment"
        );
        let resgate = Transaction {
            cofrinho_id: Some(Uuid::nil()),
            ..saved(CategoryKind::Income)
        };
        assert_eq!(
            slug(check_repeatable(&resgate)),
            "repeat-not-allowed-on-cofrinho-withdrawal"
        );
        let member = Transaction {
            series: series(),
            ..deposit
        };
        assert_eq!(slug(check_repeatable(&member)), "already-repeated");
    }

    #[test]
    fn r8_only_a_standalone_unlinked_bill_entry_becomes_a_bill() {
        let entry = saved(CategoryKind::Bill);
        assert!(check_convertible(&entry).is_ok());
        for other in [
            saved(CategoryKind::Daily),
            Transaction {
                recurring_bill_id: Some(Uuid::nil()),
                ..entry.clone()
            },
            Transaction {
                cofrinho_id: Some(Uuid::nil()),
                ..saved(CategoryKind::Income)
            },
            Transaction {
                series: series(),
                ..entry
            },
        ] {
            assert_eq!(slug(check_convertible(&other)), "cannot-become-bill");
        }
    }

    fn field(result: Result<impl std::fmt::Debug, AppError>) -> String {
        match result {
            Err(AppError::Validation(errors)) => errors[0].field.clone(),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn amounts_are_positive_with_at_most_two_places() {
        assert_eq!(check(entry("10.50", None)).unwrap(), entry("10.50", None));
        assert!(check(entry("0.01", None)).is_ok());
        for amount in ["10.005", "0", "-1", "10000000000"] {
            assert_eq!(field(check(entry(amount, None))), "amount", "{amount}");
        }
    }

    #[test]
    fn notes_are_trimmed_bounded_and_blank_means_none() {
        assert_eq!(
            check(entry("1", Some("  feira "))).unwrap().note.as_deref(),
            Some("feira")
        );
        assert_eq!(check(entry("1", Some("   "))).unwrap().note, None);
        assert!(check(entry("1", Some(&"é".repeat(500)))).is_ok());
        assert_eq!(field(check(entry("1", Some(&"x".repeat(501))))), "note");
        assert_eq!(field(check(entry("1", Some("a\0b")))), "note");
    }

    #[test]
    fn the_kind_must_be_the_categorys() {
        let market = market();

        assert!(check_kind(CategoryKind::Daily, &market).is_ok());
        assert_eq!(
            field(check_kind(CategoryKind::Bill, &market)),
            "category_id"
        );
    }
}
