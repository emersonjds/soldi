use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

/// The thermometer color of a balance; each lower bound is inclusive.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Tier {
    Red,
    LightRed,
    Yellow,
    LightGreen,
    Green,
}

/// One calendar day: what came in and went out, and the balance at its end. `income` leaves
/// resgates out; `withdrawn` holds them, and the balance adds both.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Day {
    pub date: NaiveDate,
    #[serde(serialize_with = "crate::money")]
    pub income: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub withdrawn: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub bills: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub daily: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub balance: Decimal,
    pub tier: Tier,
    /// `balance` minus the unpaid bills landed on or before this day (`BillOfMonth::lands_on`);
    /// equal to `balance` before today and in a past month.
    #[serde(serialize_with = "crate::money")]
    pub projected_balance: Decimal,
    pub projected_tier: Tier,
    pub is_today: bool,
    pub is_future: bool,
}

/// `income` leaves the month's resgates out, `withdrawn` sums them (SOL-28); `outflow` is bills
/// plus daily; `performance` is income minus outflow; `saved` is the bills under `Economia`
/// minus `withdrawn`, already inside `bills`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Totals {
    #[serde(serialize_with = "crate::money")]
    pub income: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub bills: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub daily: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub outflow: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub performance: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub saved: Decimal,
    #[serde(serialize_with = "crate::money")]
    pub withdrawn: Decimal,
}

/// An active recurring bill in the month. `amount` is what was paid, or the bill's amount while
/// unpaid; `due_date` clamps a late due day to the month's last day; `overdue` is unpaid with
/// `due_date` before today in São Paulo.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct BillOfMonth {
    pub bill_id: Uuid,
    pub name: String,
    /// The category's lucide icon.
    pub icon: String,
    /// The category's palette token.
    pub color: String,
    #[serde(serialize_with = "crate::money")]
    pub amount: Decimal,
    pub due_date: NaiveDate,
    pub paid: bool,
    pub transaction_id: Option<Uuid>,
    pub overdue: bool,
    /// The day an unpaid bill enters the projection: its due date, or today once due; null when
    /// paid or when that day falls after the month.
    pub lands_on: Option<NaiveDate>,
}

/// The month's savings (SOL-20): `saved` is `totals.saved`; `rate_pct` is `saved / income` as a
/// percentage with one decimal, null when income is 0.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct MonthSavings {
    #[serde(serialize_with = "crate::money")]
    pub saved: Decimal,
    #[schema(value_type = Option<String>, example = "13.4")]
    pub rate_pct: Option<Decimal>,
}

/// `month` is `YYYY-MM`. `balance_today` is the balance at today, or at the month's last day
/// when the month is past. `projected_balance` is the balance at the month's end minus the
/// unpaid `bills_of_month`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct MonthView {
    pub month: String,
    pub days: Vec<Day>,
    #[serde(serialize_with = "crate::money")]
    pub balance_today: Decimal,
    pub balance_today_tier: Tier,
    pub totals: Totals,
    #[serde(serialize_with = "crate::money")]
    pub projected_balance: Decimal,
    pub projected_tier: Tier,
    pub bills_of_month: Vec<BillOfMonth>,
    pub savings: MonthSavings,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use serde_json::json;

    #[test]
    fn a_day_serializes_money_as_strings_and_tiers_in_snake_case() {
        let day = Day {
            date: NaiveDate::from_ymd_opt(2026, 11, 3).unwrap(),
            income: "0".parse().unwrap(),
            withdrawn: "0".parse().unwrap(),
            bills: "300".parse().unwrap(),
            daily: "50.5".parse().unwrap(),
            balance: "-1150".parse().unwrap(),
            tier: Tier::LightRed,
            projected_balance: "-1650".parse().unwrap(),
            projected_tier: Tier::Red,
            is_today: true,
            is_future: false,
        };

        assert_eq!(
            serde_json::to_value(&day).unwrap(),
            json!({
                "date": "2026-11-03", "income": "0.00", "withdrawn": "0.00", "bills": "300.00", "daily": "50.50",
                "balance": "-1150.00", "tier": "light_red", "projected_balance": "-1650.00", "projected_tier": "red", "is_today": true, "is_future": false
            })
        );
        assert_eq!(
            serde_json::to_value(Tier::LightGreen).unwrap(),
            "light_green"
        );
    }
}
