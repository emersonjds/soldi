use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::categories::{Category, CategoryKind};

/// `category` is the entry's category as it is now, archived or not.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Transaction {
    pub id: Uuid,
    pub date: NaiveDate,
    #[serde(serialize_with = "crate::money")]
    pub amount: Decimal,
    pub kind: CategoryKind,
    pub category: Category,
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateTransaction {
    pub date: NaiveDate,
    /// Greater than zero, up to two decimal places; never rounded.
    #[serde(with = "rust_decimal::serde::str")]
    #[schema(value_type = String)]
    pub amount: Decimal,
    /// Must equal the category's kind.
    pub kind: CategoryKind,
    /// One of the caller's active categories.
    pub category_id: Uuid,
    /// Up to 500 characters; blank means none.
    #[serde(default)]
    pub note: Option<String>,
}

/// Absent fields stay as they are; `"note": null` clears the note.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateTransaction {
    #[serde(default)]
    pub date: Option<NaiveDate>,
    #[serde(default, with = "rust_decimal::serde::str_option")]
    #[schema(value_type = Option<String>)]
    pub amount: Option<Decimal>,
    #[serde(default)]
    pub kind: Option<CategoryKind>,
    #[serde(default)]
    pub category_id: Option<Uuid>,
    #[serde(default, deserialize_with = "crate::nullable_field")]
    #[schema(value_type = Option<String>, nullable)]
    pub note: Option<Option<String>>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn amounts_are_strings_and_a_null_note_clears_it() {
        let create: CreateTransaction = serde_json::from_value(json!({
            "date": "2026-11-05", "amount": "10.005", "kind": "daily", "category_id": uuid::Uuid::nil()
        }))
        .unwrap();
        assert_eq!(create.amount.to_string(), "10.005");
        assert_eq!(create.note, None);

        let patch: UpdateTransaction = serde_json::from_value(json!({ "note": null })).unwrap();
        assert_eq!(patch.note, Some(None));
        assert_eq!(patch.amount, None);
        let untouched: UpdateTransaction = serde_json::from_value(json!({})).unwrap();
        assert_eq!(untouched.note, None);
    }
}
