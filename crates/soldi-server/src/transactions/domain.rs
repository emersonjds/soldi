use chrono::{Datelike, Months, NaiveDate};
use rust_decimal::{Decimal, RoundingStrategy};
use soldi_types::categories::{Category, CategoryKind};
use soldi_types::transactions::{CreateTransaction, Transaction};
use uuid::Uuid;

use crate::error::{AppError, reject_nul};
use crate::settings::domain::check_money;

/// The entry with its note trimmed (blank means none); the amount is never rounded.
pub fn check(input: CreateTransaction) -> Result<CreateTransaction, AppError> {
    if input.amount <= Decimal::ZERO {
        return Err(AppError::invalid("amount", "must be greater than zero"));
    }
    if !(2000..=2100).contains(&input.date.year()) {
        return Err(AppError::invalid("date", "must be from 2000 to 2100"));
    }
    let amount = check_money("amount", input.amount)?;
    let note = input.note.as_deref().map(check_note).transpose()?.flatten();
    input.repeat_months.map(check_repeat).transpose()?;
    check_installments(&input, amount)?;
    Ok(CreateTransaction {
        amount,
        note,
        ..input
    })
}

fn check_note(note: &str) -> Result<Option<String>, AppError> {
    reject_nul("note", note)?;
    let note = note.trim();
    if note.chars().count() > 500 {
        return Err(AppError::invalid(
            "note",
            "must have at most 500 characters",
        ));
    }
    Ok((!note.is_empty()).then(|| note.to_string()))
}

/// R2: the entries in a repeat, the original included.
pub fn check_repeat(months: i16) -> Result<i16, AppError> {
    if !(2..=60).contains(&months) {
        return Err(AppError::invalid("repeat_months", "must be 2 to 60"));
    }
    Ok(months)
}

/// R9 (D16 rule 3): `total` in `count` parcelas, each truncated to cents; the last takes the rest.
pub fn installment_amounts(total: Decimal, count: i16) -> Vec<Decimal> {
    let rest = count.saturating_sub(1);
    let each = (total / Decimal::from(count)).round_dp_with_strategy(2, RoundingStrategy::ToZero);
    let mut amounts = vec![each; usize::try_from(rest).unwrap_or(0)];
    amounts.push(total - each * Decimal::from(rest));
    amounts
}

fn check_installments(input: &CreateTransaction, amount: Decimal) -> Result<(), AppError> {
    let Some(count) = input.installments else {
        return Ok(());
    };
    if input.repeat_months.is_some() {
        return Err(AppError::invalid(
            "installments",
            "cannot be combined with repeat_months",
        ));
    }
    if !(2..=60).contains(&count) {
        return Err(AppError::invalid("installments", "must be 2 to 60"));
    }
    if installment_amounts(amount, count)[0] <= Decimal::ZERO {
        return Err(AppError::invalid(
            "installments",
            "must leave every installment above zero",
        ));
    }
    Ok(())
}

/// R1: the dates of the `months - 1` copies, each the original's day in its own month.
pub fn repeat_dates(date: NaiveDate, months: i16) -> Result<Vec<NaiveDate>, AppError> {
    following_dates(date, date, u32::try_from(months - 1).unwrap_or(0))
}

/// L1, L4: `count` dates in the months after `last`'s, each on `first`'s day clamped to its
/// month; refused when one passes 2100.
pub fn following_dates(
    first: NaiveDate,
    last: NaiveDate,
    count: u32,
) -> Result<Vec<NaiveDate>, AppError> {
    let month = last.with_day(1).unwrap_or(last);
    let day = i16::try_from(first.day()).unwrap_or(1);
    (1..=count)
        .map(|k| {
            month
                .checked_add_months(Months::new(k))
                .map(|month| crate::bills::domain::due_date(month, day))
                .filter(|date| date.year() <= 2100)
        })
        .collect::<Option<Vec<_>>>()
        .ok_or_else(|| AppError::invalid("date", "must leave room for every month"))
}

/// L3, L4: a series resized to `months` keeps the member at `position` and those before it.
pub fn check_series_length(months: i16, position: i64) -> Result<i16, AppError> {
    let months = check_repeat(months)?;
    if i64::from(months) < position {
        return Err(AppError::invalid(
            "repeat_months",
            "must keep this entry and the ones before it",
        ));
    }
    Ok(months)
}

/// R3, R4: bill payments and resgates do not repeat.
pub fn check_repeatable(entry: &Transaction) -> Result<(), AppError> {
    if entry.recurring_bill_id.is_some() {
        return Err(AppError::rule(
            "repeat-not-allowed-on-bill-payment",
            "A bill payment cannot repeat; the bill already recurs.",
        ));
    }
    if entry.cofrinho_id.is_some() {
        return Err(AppError::rule(
            "repeat-not-allowed-on-cofrinho-withdrawal",
            "A resgate cannot repeat.",
        ));
    }
    Ok(())
}

pub fn already_repeated() -> AppError {
    AppError::rule("already-repeated", "This entry already repeats.")
}

/// R8: only a `bill` entry outside any series, not yet a bill's payment, becomes a bill.
pub fn check_convertible(entry: &Transaction) -> Result<(), AppError> {
    let standalone =
        entry.recurring_bill_id.is_none() && entry.cofrinho_id.is_none() && entry.series.is_none();
    if entry.kind != CategoryKind::Bill || !standalone {
        return Err(cannot_become_bill());
    }
    Ok(())
}

pub fn cannot_become_bill() -> AppError {
    AppError::rule(
        "cannot-become-bill",
        "Only a standalone Saída entry can become a recurring bill.",
    )
}

pub fn check_kind(kind: CategoryKind, category: &Category) -> Result<(), AppError> {
    if kind != category.kind {
        return Err(AppError::invalid(
            "category_id",
            "must be a category of the entry's kind",
        ));
    }
    Ok(())
}

/// SOL-30: the inclusive dates of a `YYYY-MM` or a `YYYY` (years 2000 to 2100) or `all` (none).
pub fn period(text: &str) -> Result<Option<(NaiveDate, NaiveDate)>, AppError> {
    if text == "all" {
        return Ok(None);
    }
    let range = match crate::months::domain::parse_month(text) {
        Ok(first) => Some((first, crate::months::domain::month_end(first))),
        Err(_) => (text.len() == 4 && text.bytes().all(|byte| byte.is_ascii_digit()))
            .then(|| text.parse::<i32>().ok())
            .flatten()
            .and_then(|year| {
                Some((
                    NaiveDate::from_ymd_opt(year, 1, 1)?,
                    NaiveDate::from_ymd_opt(year, 12, 31)?,
                ))
            }),
    };
    range
        .filter(|(first, _)| (2000..=2100).contains(&first.year()))
        .map(Some)
        .ok_or_else(|| AppError::BadRequest("period must be YYYY-MM, YYYY or all".into()))
}

pub fn transaction(
    id: Uuid,
    input: CreateTransaction,
    category: Category,
    recurring_bill_id: Option<Uuid>,
) -> Transaction {
    Transaction {
        id,
        date: input.date,
        amount: input.amount,
        kind: input.kind,
        category,
        note: input.note,
        recurring_bill_id,
        cofrinho_id: None,
        series: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soldi_types::transactions::TransactionSeries;

    fn entry(amount: &str, note: Option<&str>) -> CreateTransaction {
        CreateTransaction {
            date: "2026-11-05".parse().unwrap(),
            amount: amount.parse().unwrap(),
            kind: CategoryKind::Daily,
            category_id: Uuid::nil(),
            note: note.map(String::from),
            repeat_months: None,
            installments: None,
        }
    }

    fn date(text: &str) -> NaiveDate {
        text.parse().unwrap()
    }

    fn slug(result: Result<(), AppError>) -> &'static str {
        match result {
            Err(AppError::Rule { slug, .. }) => slug,
            other => panic!("{other:?}"),
        }
    }

    fn saved(kind: CategoryKind) -> Transaction {
        transaction(
            Uuid::nil(),
            CreateTransaction {
                kind,
                ..entry("10", None)
            },
            market(),
            None,
        )
    }

    fn market() -> Category {
        Category {
            id: Uuid::nil(),
            name: "Mercado".into(),
            kind: CategoryKind::Daily,
            icon: "shopping-cart".into(),
            color: "cat-1".into(),
            parent_id: None,
            is_savings: false,
            target: None,
            deadline: None,
        }
    }

    fn series() -> Option<TransactionSeries> {
        Some(TransactionSeries {
            id: Uuid::nil(),
            position: 1,
            total: 2,
            last_date: date("2026-12-05"),
        })
    }

    #[test]
    fn r2_a_repeat_counts_2_to_60_entries() {
        assert_eq!(check_repeat(2).unwrap(), 2);
        assert_eq!(check_repeat(60).unwrap(), 60);
        for months in [1, 61, 0, -1] {
            assert_eq!(field(check_repeat(months)), "repeat_months", "{months}");
        }
        let once = CreateTransaction {
            repeat_months: Some(1),
            ..entry("10", None)
        };
        assert_eq!(field(check(once)), "repeat_months");
    }

    fn amounts(total: &str, count: i16) -> Vec<String> {
        installment_amounts(total.parse().unwrap(), count)
            .iter()
            .map(|amount| amount.to_string())
            .collect()
    }

    #[test]
    fn r9_installments_truncate_each_to_cents_with_the_remainder_on_the_last() {
        let ten = amounts("1000.01", 10);
        assert_eq!(ten[..9], ["100.00"; 9]);
        assert_eq!(ten[9], "100.01");
        let sixty = amounts("10.00", 60);
        assert_eq!(sixty[..59], ["0.16"; 59]);
        assert_eq!(sixty[59], "0.56");
        assert_eq!(amounts("100.00", 3), ["33.33", "33.33", "33.34"]);
        assert_eq!(amounts("1000.00", 12)[11], "83.37");
        assert_eq!(amounts("0.05", 2), ["0.02", "0.03"]);
        let sum: Decimal = installment_amounts("1000.01".parse().unwrap(), 10)
            .iter()
            .sum();
        assert_eq!(sum, "1000.01".parse::<Decimal>().unwrap());
    }

    #[test]
    fn r9_installments_are_2_to_60_alone_and_never_leave_a_parcela_at_zero() {
        let split =
            |amount: &str, installments: i16, repeat_months: Option<i16>| CreateTransaction {
                installments: Some(installments),
                repeat_months,
                ..entry(amount, None)
            };
        assert!(check(split("1000.01", 10, None)).is_ok());
        assert!(check(split("10.00", 60, None)).is_ok());
        assert!(check(split("0.06", 4, None)).is_ok());
        assert!(check(split("0.02", 2, None)).is_ok());
        for input in [
            split("10", 1, None),
            split("10", 61, None),
            split("10", 3, Some(3)),
            split("0.05", 6, None),
            split("0.01", 2, None),
        ] {
            assert_eq!(field(check(input)), "installments");
        }
    }

    #[test]
    fn r1_each_copy_clamps_the_original_day_to_its_own_month() {
        assert_eq!(
            repeat_dates(date("2027-01-31"), 4).unwrap(),
            [date("2027-02-28"), date("2027-03-31"), date("2027-04-30")]
        );
        assert_eq!(
            repeat_dates(date("2028-01-31"), 2).unwrap(),
            [date("2028-02-29")]
        );
        assert_eq!(
            repeat_dates(date("2026-11-30"), 3).unwrap(),
            [date("2026-12-30"), date("2027-01-30")]
        );
    }

    #[test]
    fn r2_twelve_entries_are_the_original_and_eleven_copies() {
        let copies = repeat_dates(date("2026-11-05"), 12).unwrap();

        assert_eq!(copies.len(), 11);
        assert_eq!(copies[0], date("2026-12-05"));
        assert_eq!(copies[10], date("2027-10-05"));
    }

    #[test]
    fn r3_r4_bill_payments_and_resgates_do_not_repeat_but_members_may_resize() {
        assert!(check_repeatable(&saved(CategoryKind::Daily)).is_ok());
        let deposit = saved(CategoryKind::Bill);
        assert!(check_repeatable(&deposit).is_ok());
        let payment = Transaction {
            recurring_bill_id: Some(Uuid::nil()),
            ..deposit.clone()
        };
        assert_eq!(
            slug(check_repeatable(&payment)),
            "repeat-not-allowed-on-bill-payment"
        );
        let resgate = Transaction {
            cofrinho_id: Some(Uuid::nil()),
            ..saved(CategoryKind::Income)
        };
        assert_eq!(
            slug(check_repeatable(&resgate)),
            "repeat-not-allowed-on-cofrinho-withdrawal"
        );
        let member = Transaction {
            series: series(),
            ..deposit
        };
        assert!(check_repeatable(&member).is_ok());
    }

    #[test]
    fn l3_l4_a_series_keeps_the_edited_member_and_2_to_60_entries() {
        assert_eq!(check_series_length(6, 3).unwrap(), 6);
        assert_eq!(check_series_length(5, 5).unwrap(), 5);
        assert_eq!(check_series_length(2, 1).unwrap(), 2);
        assert_eq!(check_series_length(60, 60).unwrap(), 60);
        for (months, position) in [(4, 5), (1, 1), (61, 3), (0, 1)] {
            assert_eq!(
                field(check_series_length(months, position)),
                "repeat_months",
                "{months} from {position}"
            );
        }
    }

    #[test]
    fn l1_growth_takes_the_first_members_day_in_the_months_after_the_last_ones() {
        assert_eq!(
            following_dates(date("2027-01-31"), date("2027-04-30"), 2).unwrap(),
            [date("2027-05-31"), date("2027-06-30")]
        );
        assert_eq!(
            following_dates(date("2026-11-05"), date("2027-10-20"), 3).unwrap(),
            [date("2027-11-05"), date("2027-12-05"), date("2028-01-05")]
        );
        assert_eq!(
            following_dates(date("2026-10-05"), date("2027-10-05"), 1).unwrap(),
            [date("2027-11-05")]
        );
    }

    #[test]
    fn l4_r2_every_date_of_a_series_stays_up_to_2100() {
        assert_eq!(
            following_dates(date("2100-06-05"), date("2100-11-05"), 1).unwrap(),
            [date("2100-12-05")]
        );
        assert_eq!(repeat_dates(date("2100-01-31"), 12).unwrap().len(), 11);
        assert_eq!(
            field(following_dates(date("2100-06-05"), date("2100-08-05"), 5)),
            "date"
        );
        assert_eq!(field(repeat_dates(date("2100-06-05"), 12)), "date");
    }

    #[test]
    fn r8_only_a_standalone_unlinked_bill_entry_becomes_a_bill() {
        let entry = saved(CategoryKind::Bill);
        assert!(check_convertible(&entry).is_ok());
        for other in [
            saved(CategoryKind::Daily),
            Transaction {
                recurring_bill_id: Some(Uuid::nil()),
                ..entry.clone()
            },
            Transaction {
                cofrinho_id: Some(Uuid::nil()),
                ..saved(CategoryKind::Income)
            },
            Transaction {
                series: series(),
                ..entry
            },
        ] {
            assert_eq!(slug(check_convertible(&other)), "cannot-become-bill");
        }
    }

    fn field(result: Result<impl std::fmt::Debug, AppError>) -> String {
        match result {
            Err(AppError::Validation(errors)) => errors[0].field.clone(),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn amounts_are_positive_with_at_most_two_places() {
        assert_eq!(check(entry("10.50", None)).unwrap(), entry("10.50", None));
        assert!(check(entry("0.01", None)).is_ok());
        for amount in ["10.005", "0", "-1", "10000000000"] {
            assert_eq!(field(check(entry(amount, None))), "amount", "{amount}");
        }
    }

    #[test]
    fn notes_are_trimmed_bounded_and_blank_means_none() {
        assert_eq!(
            check(entry("1", Some("  feira "))).unwrap().note.as_deref(),
            Some("feira")
        );
        assert_eq!(check(entry("1", Some("   "))).unwrap().note, None);
        assert!(check(entry("1", Some(&"é".repeat(500)))).is_ok());
        assert_eq!(field(check(entry("1", Some(&"x".repeat(501))))), "note");
        assert_eq!(field(check(entry("1", Some("a\0b")))), "note");
    }

    #[test]
    fn sol30_a_period_is_a_month_a_year_or_all() {
        assert_eq!(
            period("2026-02").unwrap(),
            Some((date("2026-02-01"), date("2026-02-28")))
        );
        assert_eq!(
            period("2100").unwrap(),
            Some((date("2100-01-01"), date("2100-12-31")))
        );
        assert_eq!(
            period("2100-12").unwrap(),
            Some((date("2100-12-01"), date("2100-12-31")))
        );
        assert_eq!(period("all").unwrap(), None);
        for text in [
            "1999", "2101", "1999-12", "2101-01", "+202", "2026-13", "", "All",
        ] {
            assert!(
                matches!(period(text), Err(AppError::BadRequest(_))),
                "{text}"
            );
        }
    }

    #[test]
    fn the_kind_must_be_the_categorys() {
        let market = market();

        assert!(check_kind(CategoryKind::Daily, &market).is_ok());
        assert_eq!(
            field(check_kind(CategoryKind::Bill, &market)),
            "category_id"
        );
    }
}
