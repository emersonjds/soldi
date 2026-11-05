use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

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
    pub bills: Vec<OnboardingBill>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct OnboardingBill {
    pub name: String,
    /// Greater than zero, up to two decimal places.
    #[serde(with = "rust_decimal::serde::str")]
    #[schema(value_type = String)]
    pub amount: Decimal,
    /// 1 to 31.
    pub due_day: i16,
    /// One of the caller's `bill` categories.
    pub category_id: Uuid,
}
