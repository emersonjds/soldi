use rust_decimal::Decimal;
use soldi_types::settings::{Settings, UpdateSettings};

use crate::error::AppError;

/// Fits `NUMERIC(12,2)` without rounding: at most two decimal places, under ten billion.
pub fn check_money(field: &str, value: Decimal) -> Result<Decimal, AppError> {
    let limit = Decimal::from(10_000_000_000_i64);
    if value.normalize().scale() > 2 || value.abs() >= limit {
        return Err(AppError::invalid(
            field,
            "must have at most two decimal places and be under 10000000000",
        ));
    }
    Ok(value)
}

/// The thermometer's lower bounds, strictly increasing; the error names the upper of the
/// first pair out of order.
pub fn check_tiers(
    red: Decimal,
    zero: Decimal,
    yellow: Decimal,
    green: Decimal,
) -> Result<(), AppError> {
    for (lower, upper, field) in [
        (red, zero, "tier_zero"),
        (zero, yellow, "tier_yellow"),
        (yellow, green, "tier_green"),
    ] {
        if lower >= upper {
            return Err(AppError::invalid(
                field,
                "must be greater than the tier below it",
            ));
        }
    }
    Ok(())
}

/// The settings after `patch`, checked as a whole.
pub fn apply(current: Settings, patch: UpdateSettings) -> Result<Settings, AppError> {
    let money = |field, value: Option<Decimal>, current| match value {
        Some(value) => check_money(field, value),
        None => Ok(current),
    };
    let next = Settings {
        opening_balance: money(
            "opening_balance",
            patch.opening_balance,
            current.opening_balance,
        )?,
        opening_date: patch.opening_date.unwrap_or(current.opening_date),
        tier_red: money("tier_red", patch.tier_red, current.tier_red)?,
        tier_zero: money("tier_zero", patch.tier_zero, current.tier_zero)?,
        tier_yellow: money("tier_yellow", patch.tier_yellow, current.tier_yellow)?,
        tier_green: money("tier_green", patch.tier_green, current.tier_green)?,
        savings_goal_pct: patch.savings_goal_pct.unwrap_or(current.savings_goal_pct),
    };
    check_tiers(
        next.tier_red,
        next.tier_zero,
        next.tier_yellow,
        next.tier_green,
    )?;
    if next
        .savings_goal_pct
        .is_some_and(|pct| !(0..=100).contains(&pct))
    {
        return Err(AppError::invalid("savings_goal_pct", "must be 0 to 100"));
    }
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use rust_decimal::Decimal;
    use soldi_types::settings::{Settings, UpdateSettings};

    fn money(text: &str) -> Decimal {
        text.parse().unwrap()
    }

    fn field(result: Result<impl std::fmt::Debug, AppError>) -> String {
        match result {
            Err(AppError::Validation(errors)) => errors[0].field.clone(),
            other => panic!("{other:?}"),
        }
    }

    fn defaults() -> Settings {
        Settings {
            opening_balance: money("0.00"),
            opening_date: NaiveDate::from_ymd_opt(2026, 11, 5).unwrap(),
            tier_red: money("-500.00"),
            tier_zero: money("0.00"),
            tier_yellow: money("1000.00"),
            tier_green: money("2000.00"),
            savings_goal_pct: None,
        }
    }

    #[test]
    fn money_has_at_most_two_places_and_fits_numeric_12_2() {
        assert_eq!(check_money("x", money("10.5")).unwrap(), money("10.5"));
        assert_eq!(check_money("x", money("-10.50")).unwrap(), money("-10.50"));
        assert!(check_money("x", money("10.500")).is_ok());
        assert_eq!(field(check_money("x", money("10.555"))), "x");
        assert!(check_money("x", money("9999999999.99")).is_ok());
        assert!(check_money("x", money("10000000000")).is_err());
        assert!(check_money("x", money("-10000000000")).is_err());
    }

    #[test]
    fn tiers_must_strictly_increase() {
        let ok = |red, zero, yellow, green| {
            check_tiers(money(red), money(zero), money(yellow), money(green))
        };
        assert!(ok("-500", "0", "1000", "2000").is_ok());
        assert_eq!(field(ok("0", "0", "1000", "2000")), "tier_zero");
        assert_eq!(field(ok("-500", "0", "-1", "2000")), "tier_yellow");
        assert_eq!(field(ok("-500", "0", "1000", "1000")), "tier_green");
    }

    #[test]
    fn a_patch_changes_only_what_it_names_and_is_checked_whole() {
        let patch = UpdateSettings {
            opening_balance: Some(money("1234.56")),
            tier_green: Some(money("3000")),
            savings_goal_pct: Some(Some(20)),
            ..UpdateSettings::default()
        };

        let next = apply(defaults(), patch).unwrap();

        assert_eq!(next.opening_balance, money("1234.56"));
        assert_eq!(next.tier_green, money("3000"));
        assert_eq!(next.tier_yellow, money("1000.00"));
        assert_eq!(next.savings_goal_pct, Some(20));
        assert_eq!(next.opening_date, defaults().opening_date);

        let cleared = apply(
            next,
            UpdateSettings {
                savings_goal_pct: Some(None),
                opening_date: NaiveDate::from_ymd_opt(2026, 1, 1),
                ..UpdateSettings::default()
            },
        )
        .unwrap();
        assert_eq!(cleared.savings_goal_pct, None);
        assert_eq!(
            cleared.opening_date,
            NaiveDate::from_ymd_opt(2026, 1, 1).unwrap()
        );
    }

    #[test]
    fn a_patch_breaking_a_rule_names_the_field() {
        let below_red = UpdateSettings {
            tier_zero: Some(money("-600")),
            ..UpdateSettings::default()
        };
        assert_eq!(field(apply(defaults(), below_red)), "tier_zero");
        let goal = UpdateSettings {
            savings_goal_pct: Some(Some(101)),
            ..UpdateSettings::default()
        };
        assert_eq!(field(apply(defaults(), goal)), "savings_goal_pct");
        let negative_goal = UpdateSettings {
            savings_goal_pct: Some(Some(-1)),
            ..UpdateSettings::default()
        };
        assert!(apply(defaults(), negative_goal).is_err());
        let cents = UpdateSettings {
            tier_red: Some(money("-500.001")),
            ..UpdateSettings::default()
        };
        assert_eq!(field(apply(defaults(), cents)), "tier_red");
    }
}
