use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::bills::CreateBill;

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Onboarding {
    /// What the user has today; may be negative.
    #[serde(with = "rust_decimal::serde::str")]
    #[schema(value_type = String)]
    pub opening_balance: Decimal,
    pub opening_date: NaiveDate,
    /// Up to 50 recurring bills.
    #[serde(default)]
    #[schema(max_items = 50)]
    pub bills: Vec<CreateBill>,
}
