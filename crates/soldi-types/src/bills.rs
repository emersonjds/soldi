use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

/// A recurring bill, or with `closing_day` a credit card (D28). `due_day` 29 to 31 falls on the
/// last day of a shorter month.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Bill {
    pub id: Uuid,
    pub category_id: Uuid,
    pub name: String,
    /// Always set on a conta fixa, never on a card.
    #[serde(serialize_with = "crate::optional_money")]
    #[schema(value_type = Option<String>)]
    pub amount: Option<Decimal>,
    pub due_day: i16,
    pub active: bool,
    /// Set only on a card: a spend dated before it (clamped) closes this month's fatura.
    pub closing_day: Option<i16>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateBill {
    /// 1 to 100 characters.
    pub name: String,
    /// A conta fixa's: greater than zero, up to two decimal places. Absent on a card.
    #[serde(default, with = "rust_decimal::serde::str_option")]
    #[schema(value_type = Option<String>)]
    pub amount: Option<Decimal>,
    /// 1 to 31.
    #[schema(minimum = 1, maximum = 31)]
    pub due_day: i16,
    /// One of the caller's active `bill` categories.
    pub category_id: Uuid,
    /// 1 to 31; makes the bill a card, which then has no `amount`.
    #[serde(default)]
    #[schema(minimum = 1, maximum = 31)]
    pub closing_day: Option<i16>,
}

/// Absent fields stay as they are. `active: false` keeps the bill out of the month; a card has
/// no pause. `closing_day` changes only on a card.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateBill {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, with = "rust_decimal::serde::str_option")]
    #[schema(value_type = Option<String>)]
    pub amount: Option<Decimal>,
    #[serde(default)]
    #[schema(minimum = 1, maximum = 31)]
    pub due_day: Option<i16>,
    #[serde(default)]
    pub category_id: Option<Uuid>,
    #[serde(default)]
    pub active: Option<bool>,
    #[serde(default)]
    #[schema(minimum = 1, maximum = 31)]
    pub closing_day: Option<i16>,
}

/// `amount` defaults to the bill's amount and is required for a card; the bill never changes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct PayBill {
    pub date: chrono::NaiveDate,
    #[serde(default, with = "rust_decimal::serde::str_option")]
    #[schema(value_type = Option<String>)]
    pub amount: Option<Decimal>,
}
