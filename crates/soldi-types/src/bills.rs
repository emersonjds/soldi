use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

/// A recurring bill. `due_day` 29 to 31 falls on the last day of a shorter month.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Bill {
    pub id: Uuid,
    pub category_id: Uuid,
    pub name: String,
    #[serde(serialize_with = "crate::money")]
    pub amount: Decimal,
    pub due_day: i16,
    pub active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateBill {
    /// 1 to 100 characters.
    pub name: String,
    /// Greater than zero, up to two decimal places.
    #[serde(with = "rust_decimal::serde::str")]
    #[schema(value_type = String)]
    pub amount: Decimal,
    /// 1 to 31.
    #[schema(minimum = 1, maximum = 31)]
    pub due_day: i16,
    /// One of the caller's active `bill` categories.
    pub category_id: Uuid,
}

/// Absent fields stay as they are. `active: false` keeps the bill out of the month.
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
}

/// `amount` defaults to the bill's amount; the bill itself never changes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct PayBill {
    pub date: chrono::NaiveDate,
    #[serde(default, with = "rust_decimal::serde::str_option")]
    #[schema(value_type = Option<String>)]
    pub amount: Option<Decimal>,
}
