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

/// N3: above 0 and at most 100, two decimal places at most, never rounded.
fn check_target_pct(pct: Decimal) -> Result<Decimal, AppError> {
    if pct <= Decimal::ZERO || pct > Decimal::ONE_HUNDRED {
        return Err(AppError::invalid(
            "savings_target_pct",
            "must be greater than 0 and at most 100",
        ));
    }
    check_money("savings_target_pct", pct)
}

/// SOL-164 R-V: the Diário previsto per day, 0.01 to 10000.00, cents at most, never rounded.
pub fn check_estimate(value: Decimal) -> Result<Decimal, AppError> {
    if value < Decimal::new(1, 2)
        || value > Decimal::new(1_000_000, 2)
        || value.normalize().scale() > 2
    {
        return Err(AppError::invalid(
            "daily_estimate",
            "must be from 0.01 to 10000.00 with at most two decimal places",
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
    let daily_estimate = match patch.daily_estimate {
        Some(Some(value)) => Some(check_estimate(value)?),
        Some(None) => None,
        None => current.daily_estimate,
    };
    if patch.daily_estimate_on == Some(true) && daily_estimate.is_none() {
        return Err(AppError::invalid(
            "daily_estimate_on",
            "needs a daily_estimate",
        ));
    }
    let daily_estimate_on =
        daily_estimate.is_some() && patch.daily_estimate_on.unwrap_or(current.daily_estimate_on);
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
        currency: patch.currency.unwrap_or(current.currency),
        savings_target_pct: match patch.savings_target_pct {
            Some(pct) => pct.map(check_target_pct).transpose()?,
            None => current.savings_target_pct,
        },
        daily_estimate,
        daily_estimate_on,
    };
    check_tiers(
        next.tier_red,
        next.tier_zero,
        next.tier_yellow,
        next.tier_green,
    )?;
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use rust_decimal::Decimal;
    use soldi_types::settings::{Currency, Settings, UpdateSettings};

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
            currency: Currency::Brl,
            savings_target_pct: None,
            daily_estimate: None,
            daily_estimate_on: false,
        }
    }

    fn estimate(value: Option<&str>, on: Option<bool>) -> UpdateSettings {
        UpdateSettings {
            daily_estimate: value.map(|text| Some(money(text))),
            daily_estimate_on: on,
            ..UpdateSettings::default()
        }
    }

    #[test]
    fn r_v_a_daily_estimate_is_0_01_to_10000_00_with_cents() {
        for (text, stored) in [
            ("50", "50.00"),
            ("50.00", "50.00"),
            ("0.01", "0.01"),
            ("10000.00", "10000.00"),
        ] {
            let next = apply(defaults(), estimate(Some(text), None)).unwrap();
            assert_eq!(next.daily_estimate, Some(money(stored)), "{text}");
        }
        for text in ["0", "0.00", "-5.00", "0.001", "50.005", "10000.01"] {
            assert_eq!(
                field(apply(defaults(), estimate(Some(text), None))),
                "daily_estimate",
                "{text}"
            );
        }
    }

    #[test]
    fn r_v_on_needs_a_value() {
        assert_eq!(
            field(apply(defaults(), estimate(None, Some(true)))),
            "daily_estimate_on"
        );
        let both = apply(defaults(), estimate(Some("50.00"), Some(true))).unwrap();
        assert_eq!(both.daily_estimate, Some(money("50.00")));
        assert!(both.daily_estimate_on);
    }

    #[test]
    fn r_v_clearing_the_value_turns_it_off() {
        let on = apply(defaults(), estimate(Some("50.00"), Some(true))).unwrap();

        let cleared = apply(
            on,
            UpdateSettings {
                daily_estimate: Some(None),
                ..UpdateSettings::default()
            },
        )
        .unwrap();

        assert_eq!(cleared.daily_estimate, None);
        assert!(!cleared.daily_estimate_on);
    }

    #[test]
    fn toggling_keeps_the_value() {
        let on = apply(defaults(), estimate(Some("50.00"), Some(true))).unwrap();

        let off = apply(on, estimate(None, Some(false))).unwrap();
        assert_eq!(off.daily_estimate, Some(money("50.00")));
        assert!(!off.daily_estimate_on);

        let again = apply(off, estimate(None, Some(true))).unwrap();
        assert_eq!(again.daily_estimate, Some(money("50.00")));
        assert!(again.daily_estimate_on);
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
            ..UpdateSettings::default()
        };

        let next = apply(defaults(), patch).unwrap();

        assert_eq!(next.opening_balance, money("1234.56"));
        assert_eq!(next.tier_green, money("3000"));
        assert_eq!(next.tier_yellow, money("1000.00"));
        assert_eq!(next.opening_date, defaults().opening_date);
        assert_eq!(next.currency, Currency::Brl);

        let cleared = apply(
            next,
            UpdateSettings {
                opening_date: NaiveDate::from_ymd_opt(2026, 1, 1),
                ..UpdateSettings::default()
            },
        )
        .unwrap();
        assert_eq!(
            cleared.opening_date,
            NaiveDate::from_ymd_opt(2026, 1, 1).unwrap()
        );
    }

    #[test]
    fn a_patch_switches_the_currency() {
        let patch = UpdateSettings {
            currency: Some(Currency::Gbp),
            ..UpdateSettings::default()
        };

        let next = apply(defaults(), patch).unwrap();

        assert_eq!(next.currency, Currency::Gbp);
        assert_eq!(next.tier_red, money("-500.00"));
    }

    #[test]
    fn a_patch_breaking_a_rule_names_the_field() {
        let below_red = UpdateSettings {
            tier_zero: Some(money("-600")),
            ..UpdateSettings::default()
        };
        assert_eq!(field(apply(defaults(), below_red)), "tier_zero");
        let cents = UpdateSettings {
            tier_red: Some(money("-500.001")),
            ..UpdateSettings::default()
        };
        assert_eq!(field(apply(defaults(), cents)), "tier_red");
    }
}
