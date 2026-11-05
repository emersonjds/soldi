use std::collections::BTreeMap;
use std::io::Cursor;

use calamine::{Data, DataType, Range, Reader, Xlsx, XlsxError, open_workbook_from_rs};
use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use soldi_types::categories::CategoryKind;
use soldi_types::imports::{ImportError, ImportPreview, ImportYear};
use uuid::Uuid;

use crate::savings::domain::MonthAmount;
use crate::settings::domain::check_money;

pub const MAX_FILE_BYTES: usize = 5 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Row {
    pub date: NaiveDate,
    pub kind: CategoryKind,
    pub amount: Decimal,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Year {
    pub year: i16,
    pub rows: Vec<Row>,
    pub savings: Vec<MonthAmount>,
}

/// Years in ascending order.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ParsedWorkbook {
    pub years: Vec<Year>,
    pub errors: Vec<ImportError>,
}

/// `Err` when the bytes are not an xlsx workbook.
pub fn parse(bytes: Vec<u8>) -> Result<ParsedWorkbook, XlsxError> {
    let mut workbook: Xlsx<_> = open_workbook_from_rs(Cursor::new(bytes))?;
    let mut years: BTreeMap<i16, Year> = BTreeMap::new();
    let mut errors = Vec::new();
    for name in workbook.sheet_names() {
        let year = name
            .trim()
            .parse::<i16>()
            .ok()
            .filter(|year| (2000..=2100).contains(year));
        if year.is_none() && name != "Economia" {
            continue;
        }
        let sheet = Sheet {
            values: workbook.worksheet_range(&name)?,
            formulas: workbook.worksheet_formula(&name)?,
            name,
        };
        match year {
            Some(year) => {
                let rows = sheet.days(year, &mut errors);
                entry(&mut years, year).rows = rows;
            }
            None => {
                for (year, saved) in sheet.savings(&mut errors) {
                    entry(&mut years, year).savings.push(saved);
                }
            }
        }
    }
    Ok(ParsedWorkbook {
        years: years.into_values().collect(),
        errors,
    })
}

fn entry(years: &mut BTreeMap<i16, Year>, year: i16) -> &mut Year {
    years.entry(year).or_insert_with(|| Year {
        year,
        rows: Vec::new(),
        savings: Vec::new(),
    })
}

/// Counts and totals per year, for the user to check before confirming.
pub fn preview(parsed: &ParsedWorkbook, token: Uuid) -> ImportPreview {
    let total = |year: &Year, kind| {
        year.rows
            .iter()
            .filter(|row| row.kind == kind)
            .map(|row| row.amount)
            .sum()
    };
    ImportPreview {
        years: parsed
            .years
            .iter()
            .map(|year| ImportYear {
                year: year.year,
                transactions: year.rows.len() as u32,
                income_total: total(year, CategoryKind::Income),
                bills_total: total(year, CategoryKind::Bill),
                daily_total: total(year, CategoryKind::Daily),
                savings_months: year.savings.len() as u32,
            })
            .collect(),
        errors: parsed.errors.clone(),
        token,
    }
}

/// Cell positions are 0-based `(row, column)`.
struct Sheet {
    name: String,
    values: Range<Data>,
    formulas: Range<String>,
}

const DAY_COLUMNS: [(u32, CategoryKind); 3] = [
    (1, CategoryKind::Income),
    (2, CategoryKind::Bill),
    (3, CategoryKind::Daily),
];

impl Sheet {
    /// Twelve blocks of six columns from A; rows 3..33 are days 1..31.
    fn days(&self, year: i16, errors: &mut Vec<ImportError>) -> Vec<Row> {
        let mut rows = Vec::new();
        for month in 1..=12 {
            for day in 1..=31 {
                for (offset, kind) in DAY_COLUMNS {
                    let (row, column) = (day + 1, (month - 1) * 6 + offset);
                    let amounts = match self.amounts(row, column) {
                        Ok(amounts) if amounts.is_empty() => continue,
                        Ok(amounts) => amounts,
                        Err(message) => {
                            errors.push(self.error(row, column, message));
                            continue;
                        }
                    };
                    let Some(date) = NaiveDate::from_ymd_opt(year.into(), month, day) else {
                        let message = format!("{year}-{month:02} has no day {day}");
                        errors.push(self.error(row, column, message));
                        continue;
                    };
                    rows.extend(amounts.into_iter().map(|amount| Row { date, kind, amount }));
                }
            }
        }
        rows
    }

    /// Tables at B and H: the year in row 4, months in rows 5..16, the amount two columns right.
    fn savings(&self, errors: &mut Vec<ImportError>) -> Vec<(i16, MonthAmount)> {
        let mut saved = Vec::new();
        for column in [1, 7] {
            let Some(cell) = self
                .values
                .get_value((3, column))
                .filter(|cell| !is_blank(cell))
            else {
                continue;
            };
            let Some(year) = cell
                .as_f64()
                .filter(|year| year.fract() == 0.0 && (2000.0..=2100.0).contains(year))
            else {
                errors.push(self.error(3, column, "must be a year from 2000 to 2100".into()));
                continue;
            };
            for month in 1..=12 {
                let (row, column) = (3 + month, column + 2);
                let total = self
                    .amounts(row, column)
                    .and_then(|amounts| checked(amounts.iter().sum()));
                match total {
                    Ok(amount) if amount.is_zero() => {}
                    Ok(amount) => saved.push((
                        year as i16,
                        MonthAmount {
                            month: month as i16,
                            amount,
                        },
                    )),
                    Err(message) => errors.push(self.error(row, column, message)),
                }
            }
        }
        saved
    }

    /// The cell's non-zero amounts: a number, or one per literal of a sum formula.
    fn amounts(&self, row: u32, column: u32) -> Result<Vec<Decimal>, String> {
        let formula = self
            .formulas
            .get_value((row, column))
            .map_or("", |formula| formula.trim());
        let amounts = if !formula.is_empty() {
            sum_of_literals(formula)?
        } else {
            match self
                .values
                .get_value((row, column))
                .filter(|cell| !is_blank(cell))
            {
                None => Vec::new(),
                Some(Data::Float(number)) => vec![literal(&number.to_string())?],
                Some(Data::Int(number)) => vec![literal(&number.to_string())?],
                Some(other) => return Err(format!("`{other}` is not a number")),
            }
        };
        Ok(amounts
            .into_iter()
            .filter(|amount| !amount.is_zero())
            .collect())
    }

    fn error(&self, row: u32, column: u32, message: String) -> ImportError {
        ImportError {
            sheet: self.name.clone(),
            cell: cell_name(row, column),
            message,
        }
    }
}

fn is_blank(cell: &Data) -> bool {
    match cell {
        Data::Empty => true,
        Data::String(text) => text.trim().is_empty(),
        _ => false,
    }
}

/// `=a + b + …` of decimal literals, with or without the `=` calamine drops.
fn sum_of_literals(formula: &str) -> Result<Vec<Decimal>, String> {
    let formula = formula.trim();
    let body = formula.strip_prefix('=').unwrap_or(formula);
    let parts: Vec<&str> = body.split('+').map(str::trim).collect();
    let is_literal = |part: &&str| {
        !part.is_empty()
            && part
                .chars()
                .all(|char| char.is_ascii_digit() || char == '.')
    };
    if !parts.iter().all(is_literal) {
        return Err(format!(
            "only sums of numbers like `=10 + 5.50` are imported, not `={body}`"
        ));
    }
    parts.into_iter().map(literal).collect()
}

fn literal(text: &str) -> Result<Decimal, String> {
    let is_positive = !text.is_empty()
        && text
            .chars()
            .all(|char| char.is_ascii_digit() || char == '.');
    let amount = text
        .parse::<Decimal>()
        .ok()
        .filter(|_| is_positive)
        .ok_or_else(|| format!("`{text}` is not a positive number"))?;
    checked(amount)
}

fn checked(amount: Decimal) -> Result<Decimal, String> {
    check_money("amount", amount)
        .map_err(|_| "must have at most two decimal places and be under 10000000000".into())
}

fn cell_name(row: u32, column: u32) -> String {
    let mut letters = Vec::new();
    let mut rest = column + 1;
    while rest > 0 {
        rest -= 1;
        letters.push(char::from(b'A' + (rest % 26) as u8));
        rest /= 26;
    }
    letters.iter().rev().collect::<String>() + &(row + 1).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &[u8] = include_bytes!("../../tests/fixtures/termometro-sample.xlsx");
    const BAD: &[u8] = include_bytes!("../../tests/fixtures/termometro-bad.xlsx");

    fn money(text: &str) -> Decimal {
        text.parse().unwrap()
    }

    fn row(date: &str, kind: CategoryKind, amount: &str) -> Row {
        Row {
            date: date.parse().unwrap(),
            kind,
            amount: money(amount),
        }
    }

    fn saved(month: i16, amount: &str) -> MonthAmount {
        MonthAmount {
            month,
            amount: money(amount),
        }
    }

    fn sheet(name: &str) -> Sheet {
        Sheet {
            name: name.into(),
            values: Range::new((0, 0), (40, 80)),
            formulas: Range::new((0, 0), (40, 80)),
        }
    }

    use CategoryKind::{Bill, Daily, Income};

    #[test]
    fn the_sample_yields_one_row_per_literal_and_the_saved_months() {
        let parsed = parse(SAMPLE.to_vec()).unwrap();

        assert_eq!(parsed.errors, vec![]);
        assert_eq!(
            parsed.years,
            vec![
                Year {
                    year: 2025,
                    rows: vec![
                        row("2025-02-28", Income, "5668"),
                        row("2025-02-28", Income, "715"),
                        row("2025-02-28", Bill, "368"),
                        row("2025-02-28", Daily, "40.94"),
                        row("2025-02-28", Daily, "80"),
                        row("2025-12-31", Daily, "12.5"),
                    ],
                    savings: vec![saved(1, "100"), saved(2, "300")],
                },
                Year {
                    year: 2026,
                    rows: vec![
                        row("2026-01-01", Bill, "59.17"),
                        row("2026-01-01", Bill, "35.71"),
                        row("2026-01-01", Daily, "150"),
                        row("2026-01-01", Daily, "60"),
                        row("2026-01-02", Income, "715"),
                        row("2026-03-10", Bill, "2259.56"),
                    ],
                    savings: vec![],
                },
            ]
        );
    }

    #[test]
    fn a_formula_other_than_a_sum_is_reported_with_its_cell() {
        let parsed = parse(BAD.to_vec()).unwrap();

        assert_eq!(parsed.errors.len(), 1, "{:?}", parsed.errors);
        let error = &parsed.errors[0];
        assert_eq!((error.sheet.as_str(), error.cell.as_str()), ("2026", "C5"));
        assert!(error.message.contains("=SUM(B3:B5)"), "{}", error.message);
        assert_eq!(parsed.years[0].rows, vec![row("2026-01-01", Income, "100")]);
        assert_eq!(parsed.years[0].savings, vec![saved(1, "50")]);
    }

    #[test]
    fn bytes_that_are_not_a_workbook_are_refused() {
        assert!(parse(b"date,amount\n".to_vec()).is_err());
    }

    #[test]
    fn a_formula_is_read_only_as_a_sum_of_literals() {
        let sum = |formula| sum_of_literals(formula).map(|amounts| amounts.len());

        assert_eq!(
            sum_of_literals("= 59.17 + 35.71").unwrap(),
            vec![money("59.17"), money("35.71")]
        );
        assert_eq!(
            sum_of_literals("150+60").unwrap(),
            vec![money("150"), money("60")]
        );
        assert_eq!(sum("=368 + 2259.56 + 950 "), Ok(3));
        for formula in [
            "=SUM(B3:B5)",
            "=5 - 2",
            "=1++2",
            "=",
            "=1 2",
            "=1.2.3",
            "=-5",
        ] {
            assert!(sum_of_literals(formula).is_err(), "{formula}");
        }
        assert!(
            sum_of_literals("=1.005")
                .unwrap_err()
                .contains("two decimal")
        );
    }

    #[test]
    fn cells_are_named_in_a1_notation() {
        assert_eq!(cell_name(0, 0), "A1");
        assert_eq!(cell_name(32, 25), "Z33");
        assert_eq!(cell_name(2, 26), "AA3");
        assert_eq!(cell_name(32, 70), "BS33");
    }

    #[test]
    fn a_day_past_the_months_end_with_a_value_is_an_error() {
        let mut february = sheet("2025");
        february.values.set_value((30, 7), Data::Float(10.0)); // H31: day 29
        february.values.set_value((31, 8), Data::Float(0.0)); // I32: day 30, zero
        let mut errors = Vec::new();

        assert_eq!(february.days(2025, &mut errors), vec![]);
        assert_eq!(errors.len(), 1, "{errors:?}");
        assert_eq!(errors[0].cell, "H31");
        assert!(
            errors[0].message.contains("2025-02"),
            "{}",
            errors[0].message
        );
    }

    #[test]
    fn only_positive_numbers_with_two_places_are_amounts() {
        let mut odd = sheet("2026");
        odd.values.set_value((2, 1), Data::Int(7)); // B3
        odd.values.set_value((2, 2), Data::String("  ".into())); // C3
        odd.values.set_value((3, 1), Data::String("pix".into())); // B4
        odd.values.set_value((3, 2), Data::Float(-5.0)); // C4
        odd.values.set_value((3, 3), Data::Float(1.234)); // D4
        odd.values.set_value((4, 1), Data::Bool(true)); // B5
        odd.formulas.set_value((4, 2), " ".into()); // C5: blank formula, empty value
        let mut errors = Vec::new();

        assert_eq!(
            odd.days(2026, &mut errors),
            vec![row("2026-01-01", Income, "7")]
        );
        let cells: Vec<&str> = errors.iter().map(|error| error.cell.as_str()).collect();
        assert_eq!(cells, vec!["B4", "C4", "D4", "B5"]);
        assert!(errors.iter().all(|error| error.sheet == "2026"));
    }

    #[test]
    fn economia_tables_without_a_year_are_skipped_and_a_bad_year_is_an_error() {
        let mut economia = sheet("Economia");
        economia
            .values
            .set_value((3, 1), Data::String("ano".into())); // B4
        economia.values.set_value((4, 3), Data::Float(10.0)); // D5
        economia.values.set_value((3, 7), Data::Int(2027)); // H4
        economia.formulas.set_value((15, 9), "=20 + 0.5".into()); // J16: dez
        economia.values.set_value((14, 9), Data::Float(0.0)); // J15: nov
        let mut errors = Vec::new();

        assert_eq!(
            economia.savings(&mut errors),
            vec![(2027, saved(12, "20.5"))]
        );
        assert_eq!(errors.len(), 1, "{errors:?}");
        assert_eq!(errors[0].cell, "B4");
    }
}
