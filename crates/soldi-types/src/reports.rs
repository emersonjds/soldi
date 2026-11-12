use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::categories::CategoryKind;

/// A category's spending or income in the month. `pct` is its share of the group's total and
/// `delta_pct` its change against the previous month, both percentages with one decimal;
/// `delta_pct` is null when the previous month had nothing. `parent_id` is the parent of a subcategory.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct CategoryShare {
    pub category_id: Uuid,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub kind: CategoryKind,
    pub parent_id: Option<Uuid>,
    #[serde(serialize_with = "crate::money")]
    pub amount: Decimal,
    #[schema(value_type = String, example = "26.0")]
    pub pct: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub previous_amount: Decimal,
    #[schema(value_type = Option<String>, example = "18.4")]
    pub delta_pct: Option<Decimal>,
}

/// A top-level category with its subcategories' amounts rolled in: `amount` and `previous_amount`
/// add its own entries and its subcategories'; `pct` is its share of the outflow or income total.
/// `children` are the subcategories with entries in the month, largest first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct CategoryGroup {
    pub category_id: Uuid,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub kind: CategoryKind,
    #[serde(serialize_with = "crate::money")]
    pub amount: Decimal,
    #[schema(value_type = String, example = "40.0")]
    pub pct: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub previous_amount: Decimal,
    #[schema(value_type = Option<String>, example = "166.7")]
    pub delta_pct: Option<Decimal>,
    pub children: Vec<Uuid>,
}

/// `outflow` (bills and daily) and `income`, each by amount, largest first; `groups` the same
/// month by top-level category, outflow groups then income groups, each by amount.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct CategoryReport {
    pub month: String,
    #[serde(serialize_with = "crate::money")]
    pub outflow_total: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub income_total: Decimal,
    pub outflow: Vec<CategoryShare>,
    pub income: Vec<CategoryShare>,
    pub groups: Vec<CategoryGroup>,
}

/// A month of the savings year: `income` without resgates and `saved` (Economia and its
/// cofrinhos minus resgates), as the month view's `totals.income` and `savings.saved`.
/// `rate_pct` is `saved` over `income` with one decimal, null when `income` is 0. `forecast`
/// marks a month after today's: only the entries already dated there, out of the year's totals.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SavingsMonth {
    #[schema(example = "2026-11")]
    pub month: String,
    #[serde(serialize_with = "crate::money")]
    pub income: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub saved: Decimal,
    #[schema(value_type = Option<String>, example = "11.9")]
    pub rate_pct: Option<Decimal>,
    #[schema(example = false)]
    pub forecast: bool,
}

/// A year's savings month by month, newest first, from the opening month (or January) to
/// December; totals and `rate_pct` are over the months up to today's, not the forecast ones.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SavingsYear {
    #[schema(example = 2026)]
    pub year: i32,
    #[serde(serialize_with = "crate::money")]
    pub income_total: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub saved_total: Decimal,
    #[schema(value_type = Option<String>, example = "8.4")]
    pub rate_pct: Option<Decimal>,
    pub months: Vec<SavingsMonth>,
}
