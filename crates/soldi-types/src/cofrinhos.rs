use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

/// A subcategory of `Economia`, or `Economia` itself as `Sem objetivo` (`parent`). `balance` is
/// its entries minus its resgates since the opening date; `progress_pct` is `balance / target`
/// with one decimal, capped at 100, null without a target; `done` is a balance at or above the
/// target; `monthly_suggestion` is what is left over the months to the deadline, this one
/// included, null without a deadline or when done; `next_contribution` is the earliest member
/// dated after today of a repeated entry into it, null without one; `note` is its description,
/// null without one and on `Sem objetivo`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Cofrinho {
    pub category_id: Uuid,
    pub name: String,
    pub icon: String,
    pub color: String,
    #[serde(serialize_with = "crate::optional_money")]
    #[schema(value_type = Option<String>)]
    pub target: Option<Decimal>,
    pub deadline: Option<NaiveDate>,
    pub note: Option<String>,
    #[serde(serialize_with = "crate::money")]
    #[schema(value_type = String)]
    pub balance: Decimal,
    #[schema(value_type = Option<String>, example = "3.0")]
    pub progress_pct: Option<Decimal>,
    pub done: bool,
    #[serde(serialize_with = "crate::optional_money")]
    #[schema(value_type = Option<String>)]
    pub monthly_suggestion: Option<Decimal>,
    pub parent: bool,
    pub next_contribution: Option<NextContribution>,
}

/// A repeated entry's next deposit: its amount, the day of the month it falls on and its series'
/// step (D32).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct NextContribution {
    #[serde(serialize_with = "crate::money")]
    #[schema(value_type = String)]
    pub amount: Decimal,
    #[schema(minimum = 1, maximum = 31)]
    pub day: i16,
    pub every: crate::transactions::RepeatEvery,
    /// The next member's date; names the weekday or the day and month the chip shows.
    pub date: NaiveDate,
}

/// `total_saved` sums every balance; `saved_this_month` is the requested month view's `totals.saved`.
/// Items go done last, then by name; `Sem objetivo` only while its balance is above zero.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Cofrinhos {
    #[serde(serialize_with = "crate::money")]
    #[schema(value_type = String)]
    pub total_saved: Decimal,
    #[serde(serialize_with = "crate::money")]
    #[schema(value_type = String)]
    pub saved_this_month: Decimal,
    pub items: Vec<Cofrinho>,
}

/// Takes money out of a cofrinho as an income entry in `Resgate`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Withdraw {
    pub date: NaiveDate,
    /// Greater than zero, up to two decimal places, at most the balance.
    #[serde(with = "rust_decimal::serde::str")]
    #[schema(value_type = String)]
    pub amount: Decimal,
    /// Up to 500 characters; blank means none.
    #[serde(default)]
    pub note: Option<String>,
}
