use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::categories::CategoryKind;

/// A category's spending or income in the month. `pct` is its share of the group's total and
/// `delta_pct` its change against the previous month, both percentages with one decimal;
/// `delta_pct` is null when the previous month had nothing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct CategoryShare {
    pub category_id: Uuid,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub kind: CategoryKind,
    #[serde(serialize_with = "crate::money")]
    pub amount: Decimal,
    #[schema(value_type = String, example = "26.0")]
    pub pct: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub previous_amount: Decimal,
    #[schema(value_type = Option<String>, example = "18.4")]
    pub delta_pct: Option<Decimal>,
}

/// `outflow` (bills and daily) and `income`, each by amount, largest first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct CategoryReport {
    pub month: String,
    #[serde(serialize_with = "crate::money")]
    pub outflow_total: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub income_total: Decimal,
    pub outflow: Vec<CategoryShare>,
    pub income: Vec<CategoryShare>,
}
