use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// ISO 4217 code of the currency every amount is shown in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[cfg_attr(
    feature = "sqlx",
    derive(sqlx::Encode, sqlx::Decode),
    sqlx(rename_all = "UPPERCASE")
)]
#[serde(rename_all = "UPPERCASE")]
pub enum Currency {
    Brl,
    Usd,
    Gbp,
    Eur,
}

impl Currency {
    pub fn as_str(self) -> &'static str {
        match self {
            Currency::Brl => "BRL",
            Currency::Usd => "USD",
            Currency::Gbp => "GBP",
            Currency::Eur => "EUR",
        }
    }
}

/// Money is a decimal string with up to two places (`"-500.00"`). The tiers are the lower
/// bounds of the thermometer colors and are strictly increasing:
/// `tier_red < tier_zero < tier_yellow < tier_green`. `savings_target_pct` is the yearly savings
/// target as a percent of the year's income, above 0 and at most 100; null when unset.
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
    pub currency: Currency,
    #[serde(serialize_with = "crate::optional_money")]
    #[schema(value_type = Option<String>, example = "20.00")]
    pub savings_target_pct: Option<Decimal>,
}

/// Absent fields stay as they are; `"savings_target_pct": null` clears the target.
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
    #[serde(default)]
    pub currency: Option<Currency>,
    /// Above 0 and at most 100, up to two decimal places.
    #[serde(default, deserialize_with = "crate::nullable_money")]
    #[schema(value_type = Option<String>, nullable, example = "20")]
    pub savings_target_pct: Option<Option<Decimal>>,
}
