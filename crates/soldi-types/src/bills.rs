use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

/// A recurring bill, or with `closing_day` a credit card (D28). `due_day` 29 to 31 falls on the
/// last day of a shorter month.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Bill {
    pub id: Uuid,
    pub category_id: Uuid,
    pub name: String,
    /// Always set on a conta fixa, never on a card.
    #[serde(serialize_with = "crate::optional_money")]
    #[schema(value_type = Option<String>)]
    pub amount: Option<Decimal>,
    pub due_day: i16,
    /// False once Parar ended a bill without `installments`.
    pub active: bool,
    /// Set only on a card: a spend dated before it (clamped) closes this month's fatura.
    pub closing_day: Option<i16>,
    /// The last month the bill owes (its first day); null: no end.
    pub last_month: Option<chrono::NaiveDate>,
    /// Set on a parcelado bill: `last_month` holds parcela `installments`.
    pub installments: Option<i16>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateBill {
    /// 1 to 100 characters.
    pub name: String,
    /// A conta fixa's: greater than zero, up to two decimal places. Absent on a card.
    #[serde(default, with = "rust_decimal::serde::str_option")]
    #[schema(value_type = Option<String>)]
    pub amount: Option<Decimal>,
    /// 1 to 31.
    #[schema(minimum = 1, maximum = 31)]
    pub due_day: i16,
    /// One of the caller's active `bill` categories.
    pub category_id: Uuid,
    /// 1 to 31; makes the bill a card, which then has no `amount`.
    #[serde(default)]
    #[schema(minimum = 1, maximum = 31)]
    pub closing_day: Option<i16>,
    /// 2 to 60; makes the bill parcelado. Needs `last_month`; not on a card.
    #[serde(default)]
    #[schema(minimum = 2, maximum = 60)]
    pub installments: Option<i16>,
    /// A month's first day, from this month to `installments` months ahead: the month of the
    /// last parcela. Only with `installments`.
    #[serde(default)]
    pub last_month: Option<chrono::NaiveDate>,
}

/// Absent fields stay as they are. `active: false` is Parar: the bill owes up to this month or its
/// latest paid month; `true` is Retomar. Refused on a card and on a parcelado bill. `closing_day`
/// changes only on a card.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateBill {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, with = "rust_decimal::serde::str_option")]
    #[schema(value_type = Option<String>)]
    pub amount: Option<Decimal>,
    #[serde(default)]
    #[schema(minimum = 1, maximum = 31)]
    pub due_day: Option<i16>,
    #[serde(default)]
    pub category_id: Option<Uuid>,
    #[serde(default)]
    pub active: Option<bool>,
    #[serde(default)]
    #[schema(minimum = 1, maximum = 31)]
    pub closing_day: Option<i16>,
    /// Only on a parcelado bill, sent with `last_month`.
    #[serde(default)]
    #[schema(minimum = 2, maximum = 60)]
    pub installments: Option<i16>,
    /// Only on a parcelado bill, sent with `installments`; not before the latest paid month.
    #[serde(default)]
    pub last_month: Option<chrono::NaiveDate>,
}

/// `amount` defaults to the bill's amount and is required for a card; the bill never changes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct PayBill {
    pub date: chrono::NaiveDate,
    #[serde(default, with = "rust_decimal::serde::str_option")]
    #[schema(value_type = Option<String>)]
    pub amount: Option<Decimal>,
}
