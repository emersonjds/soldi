use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// One month of the year. `income` and `saved` are null before the opening month; `pct` is
/// `saved / income` as a percentage with one decimal, null when income is 0.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SavingsMonth {
    /// 1 to 12.
    pub month: i16,
    #[serde(serialize_with = "crate::optional_money")]
    #[schema(value_type = Option<String>)]
    pub income: Option<Decimal>,
    #[serde(serialize_with = "crate::optional_money")]
    #[schema(value_type = Option<String>)]
    pub saved: Option<Decimal>,
    #[schema(value_type = Option<String>, example = "8.4")]
    pub pct: Option<Decimal>,
}

/// `pct` is `total_saved / total_income`; `goal_progress_pct` is `pct / goal_pct`, capped at
/// 100, null without a goal or without income.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SavingsYear {
    pub year: i16,
    pub months: Vec<SavingsMonth>,
    #[serde(serialize_with = "crate::money")]
    pub total_income: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub total_saved: Decimal,
    #[schema(value_type = Option<String>)]
    pub pct: Option<Decimal>,
    pub goal_pct: Option<i16>,
    #[schema(value_type = Option<String>)]
    pub goal_progress_pct: Option<Decimal>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SetSavings {
    /// Zero or more, up to two decimal places.
    #[serde(with = "rust_decimal::serde::str")]
    #[schema(value_type = String)]
    pub amount: Decimal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Savings {
    pub year: i16,
    pub month: i16,
    #[serde(serialize_with = "crate::money")]
    pub amount: Decimal,
}
