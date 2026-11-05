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
