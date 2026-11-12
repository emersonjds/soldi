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
/// `children` are the subcategories with entries in the month, largest first; `kind` is the
/// top-level category's own, whatever its subcategories' kinds.
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

/// A month of the savings year: `income` without resgates, `deposited` (bills under Economia and
/// its cofrinhos), `withdrawn` (resgates) and `saved`, `deposited` minus `withdrawn`, as the month
/// view's `totals.income` and `savings.saved`.
/// `rate_pct` is `saved` over `income` with one decimal, null when `income` is 0. `forecast`
/// marks a month after today's: only the entries already dated there, out of the year's totals.
/// `note` is the month's note (`PUT /api/months/{month}/note`), null without one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SavingsMonth {
    #[schema(example = "2026-11")]
    pub month: String,
    #[serde(serialize_with = "crate::money")]
    pub income: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub deposited: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub withdrawn: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub saved: Decimal,
    #[schema(value_type = Option<String>, example = "11.9")]
    pub rate_pct: Option<Decimal>,
    #[schema(example = false)]
    pub forecast: bool,
    pub note: Option<String>,
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
    pub deposited_total: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub withdrawn_total: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub saved_total: Decimal,
    #[schema(value_type = Option<String>, example = "8.4")]
    pub rate_pct: Option<Decimal>,
    /// Null without `Settings.savings_target_pct` or for a year before the opening or after this one.
    pub target: Option<SavingsTarget>,
    pub months: Vec<SavingsMonth>,
}

/// The yearly savings target over the year's totals so far: `amount` is `pct` of `income_total`,
/// `remaining` what `saved_total` still lacks (never below 0) and `progress_pct` how far it got
/// with one decimal, floored at 0, never capped, null when `amount` is 0; `done` is an `amount`
/// above 0 reached.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SavingsTarget {
    #[serde(serialize_with = "crate::money")]
    #[schema(value_type = String, example = "20.00")]
    pub pct: Decimal,
    #[serde(serialize_with = "crate::money")]
    #[schema(value_type = String)]
    pub amount: Decimal,
    #[serde(serialize_with = "crate::money")]
    #[schema(value_type = String)]
    pub remaining: Decimal,
    #[schema(value_type = Option<String>, example = "42.5")]
    pub progress_pct: Option<Decimal>,
    pub done: bool,
}

/// A month of the year and its `Gastos` (D31).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct YearMonth {
    #[schema(example = "2026-03")]
    pub month: String,
    #[serde(serialize_with = "crate::money")]
    pub spent: Decimal,
}

/// A top-level category's total in the year, its subcategories rolled in; `pct` is its share of
/// `spent` (outflow) or `totals.income` (income) with one decimal.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct YearGroup {
    pub category_id: Uuid,
    pub name: String,
    pub icon: String,
    pub color: String,
    #[serde(serialize_with = "crate::money")]
    pub amount: Decimal,
    #[schema(value_type = String, example = "26.0")]
    pub pct: Decimal,
}

/// A credit card's spends in the year by purchase date (D28, D31).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct YearCard {
    pub card_id: Uuid,
    pub name: String,
    #[serde(serialize_with = "crate::money")]
    pub amount: Decimal,
}

/// The year's Entradas and Gastos by purchase date (D31), over whole months from the opening month
/// or January to today's month or December. `totals` has the month view's shape, Economia deposits
/// inside `bills`, but follows D31: `bills` leaves fatura payments out and `daily` holds card
/// purchases, so it does not equal the sum of the month views. `spent` (Gastos) leaves deposits and
/// fatura payments out. `first_month` and `last_month` are null when nothing is counted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct YearReport {
    #[schema(example = 2026)]
    pub year: i32,
    #[schema(example = "2026-01")]
    pub first_month: Option<String>,
    #[schema(example = "2026-11")]
    pub last_month: Option<String>,
    pub totals: crate::months::Totals,
    #[serde(serialize_with = "crate::money")]
    pub spent: Decimal,
    pub top_months: Vec<YearMonth>,
    pub spending: Vec<YearGroup>,
    pub income: Vec<YearGroup>,
    #[serde(serialize_with = "crate::money")]
    pub card_spent: Decimal,
    #[schema(value_type = Option<String>, example = "15.0")]
    pub card_pct: Option<Decimal>,
    pub cards: Vec<YearCard>,
}
