use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Money is a decimal string with up to two places (`"-500.00"`). The tiers are the lower
/// bounds of the thermometer colors and are strictly increasing:
/// `tier_red < tier_zero < tier_yellow < tier_green`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Settings {
    #[serde(serialize_with = "crate::money")]
    pub opening_balance: Decimal,
    pub opening_date: NaiveDate,
    #[serde(serialize_with = "crate::money")]
    pub tier_red: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub tier_zero: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub tier_yellow: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub tier_green: Decimal,
    /// 0 to 100.
    pub savings_goal_pct: Option<i16>,
}

/// Absent fields stay as they are; `"savings_goal_pct": null` clears the goal.
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateSettings {
    #[serde(default, with = "rust_decimal::serde::str_option")]
    #[schema(value_type = Option<String>)]
    pub opening_balance: Option<Decimal>,
    #[serde(default)]
    pub opening_date: Option<NaiveDate>,
    #[serde(default, with = "rust_decimal::serde::str_option")]
    #[schema(value_type = Option<String>)]
    pub tier_red: Option<Decimal>,
    #[serde(default, with = "rust_decimal::serde::str_option")]
    #[schema(value_type = Option<String>)]
    pub tier_zero: Option<Decimal>,
    #[serde(default, with = "rust_decimal::serde::str_option")]
    #[schema(value_type = Option<String>)]
    pub tier_yellow: Option<Decimal>,
    #[serde(default, with = "rust_decimal::serde::str_option")]
    #[schema(value_type = Option<String>)]
    pub tier_green: Option<Decimal>,
    #[serde(default, deserialize_with = "crate::nullable_field")]
    #[schema(value_type = Option<i16>, nullable)]
    pub savings_goal_pct: Option<Option<i16>>,
}
