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
