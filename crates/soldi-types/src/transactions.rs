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
    /// The recurring bill this entry pays, if any.
    pub recurring_bill_id: Option<Uuid>,
    /// The cofrinho a resgate took money from.
    pub cofrinho_id: Option<Uuid>,
    /// The repeated run this entry belongs to, if any.
    pub series: Option<TransactionSeries>,
}

/// Entries sharing `id` were launched together by `repeat_months`; counted at read time.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct TransactionSeries {
    pub id: Uuid,
    /// 1-based, by date.
    pub position: i64,
    pub total: i64,
}

/// Which entries of a series a change or a deletion reaches; `this` when absent.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    /// Only this entry; it stays in its series.
    #[default]
    This,
    /// This entry and the series' entries dated on or after it.
    Following,
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
    /// 2 to 60 entries, this one included, on the same day of the following months (the
    /// month's last day when shorter); absent means just this one.
    #[serde(default)]
    #[schema(minimum = 2, maximum = 60)]
    pub repeat_months: Option<i16>,
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
    /// Turns an entry outside any series into the first of a run of 2 to 60.
    #[serde(default)]
    #[schema(minimum = 2, maximum = 60)]
    pub repeat_months: Option<i16>,
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
