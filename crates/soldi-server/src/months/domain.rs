use chrono::{Datelike, NaiveDate};

use crate::error::AppError;

/// The first day of a `YYYY-MM` month.
pub fn parse_month(text: &str) -> Result<NaiveDate, AppError> {
    let shaped = text.len() == 7
        && text.bytes().enumerate().all(|(index, byte)| match index {
            4 => byte == b'-',
            _ => byte.is_ascii_digit(),
        });
    let first = shaped
        .then(|| NaiveDate::parse_from_str(&format!("{text}-01"), "%Y-%m-%d").ok())
        .flatten();
    first.ok_or_else(|| AppError::invalid("month", "must be a month as YYYY-MM"))
}

pub fn month_end(first: NaiveDate) -> NaiveDate {
    first
        .iter_days()
        .take_while(|day| day.month() == first.month())
        .last()
        .unwrap_or(first)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(text: &str) -> NaiveDate {
        text.parse().unwrap()
    }

    #[test]
    fn months_are_exactly_yyyy_mm() {
        assert_eq!(parse_month("2026-11").unwrap(), date("2026-11-01"));
        assert_eq!(parse_month("0001-01").unwrap(), date("0001-01-01"));
        for text in [
            "2026-13",
            "2026-00",
            "2026-1",
            "26-11",
            "2026/11",
            "+202-11",
            "2026-11-01",
            "２０２６-11",
            "",
        ] {
            assert!(parse_month(text).is_err(), "{text}");
        }
    }

    #[test]
    fn a_month_ends_on_its_last_calendar_day() {
        assert_eq!(month_end(date("2026-11-01")), date("2026-11-30"));
        assert_eq!(month_end(date("2028-02-01")), date("2028-02-29"));
        assert_eq!(month_end(date("2026-12-01")), date("2026-12-31"));
        assert_eq!(month_end(date("9999-12-01")), date("9999-12-31"));
    }
}
