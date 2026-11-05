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
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(amount: &str, note: Option<&str>) -> CreateTransaction {
        CreateTransaction {
            date: "2026-11-05".parse().unwrap(),
            amount: amount.parse().unwrap(),
            kind: CategoryKind::Daily,
            category_id: Uuid::nil(),
            note: note.map(String::from),
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
        let market = Category {
            id: Uuid::nil(),
            name: "Mercado".into(),
            kind: CategoryKind::Daily,
            icon: "shopping-cart".into(),
            color: "cat-1".into(),
            parent_id: None,
            is_savings: false,
            target: None,
            deadline: None,
        };

        assert!(check_kind(CategoryKind::Daily, &market).is_ok());
        assert_eq!(
            field(check_kind(CategoryKind::Bill, &market)),
            "category_id"
        );
    }
}
