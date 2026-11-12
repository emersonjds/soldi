use chrono::{Datelike, Days, Months, NaiveDate};
use rust_decimal::{Decimal, RoundingStrategy};
use soldi_types::categories::{Category, CategoryKind};
use soldi_types::transactions::{CreateTransaction, RepeatEvery, Transaction};
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
    check_open_ended(&input)?;
    match (input.repeat_every, input.repeat_months, input.installments) {
        (Some(_), None, None) if !input.open_ended => {
            return Err(AppError::invalid("repeat_every", "needs repeat_months"));
        }
        (Some(every), None, Some(_)) if every != RepeatEvery::Month => {
            return Err(AppError::invalid(
                "repeat_every",
                "installments are monthly",
            ));
        }
        _ => {}
    }
    check_card(input.kind, input.card_id)?;
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
        return match input.first_installment {
            Some(_) => Err(AppError::invalid("first_installment", "needs installments")),
            None => Ok(()),
        };
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
    if input
        .first_installment
        .is_some_and(|first| !(1..=count).contains(&first))
    {
        return Err(AppError::invalid(
            "first_installment",
            "must be 1 to installments",
        ));
    }
    if installment_amounts(amount, count)[0] <= Decimal::ZERO {
        return Err(AppError::invalid(
            "installments",
            "must leave every installment above zero",
        ));
    }
    Ok(())
}

/// D36: a Fixo with no end is an Entrada or a Diário off a card; a Saída with no end is a conta fixa.
fn check_open_ended(input: &CreateTransaction) -> Result<(), AppError> {
    if !input.open_ended {
        return Ok(());
    }
    if input.repeat_months.is_some() || input.installments.is_some() {
        return Err(AppError::invalid(
            "open_ended",
            "cannot be combined with repeat_months or installments",
        ));
    }
    if input.kind == CategoryKind::Bill {
        return Err(AppError::invalid(
            "open_ended",
            "a Saída with no end is a conta fixa",
        ));
    }
    if input.card_id.is_some() {
        return Err(AppError::invalid("open_ended", "not on a card yet"));
    }
    Ok(())
}

/// R1 (D32): the dates of the `count - 1` copies after `date`, by step. A yearly copy counts from
/// the original, so 29 February comes back in leap years.
pub fn repeat_dates(
    date: NaiveDate,
    count: i16,
    every: RepeatEvery,
) -> Result<Vec<NaiveDate>, AppError> {
    let copies = u32::try_from(count - 1).unwrap_or(0);
    match every {
        RepeatEvery::Month => following_dates(date.day(), date, copies),
        RepeatEvery::Week => weeks_after(date, copies),
        RepeatEvery::Year => {
            within_2100((1..=copies).map(|k| date.checked_add_months(Months::new(12 * k))))
        }
    }
}

/// L1 (D19, D32): `count` members after the series' end; `end` holds its last members, last first.
pub fn growth_dates(
    every: RepeatEvery,
    end: &[NaiveDate],
    count: u32,
) -> Result<Vec<NaiveDate>, AppError> {
    let Some((&last, earlier)) = end.split_first() else {
        return Ok(Vec::new());
    };
    match every {
        RepeatEvery::Month => {
            following_dates(series_day(last, earlier.first().copied()), last, count)
        }
        RepeatEvery::Week => weeks_after(last, count),
        RepeatEvery::Year => {
            let day = i16::try_from(yearly_day(last, earlier)).unwrap_or(1);
            let month = last.with_day(1).unwrap_or(last);
            within_2100((1..=count).map(|k| {
                month
                    .checked_add_months(Months::new(12 * k))
                    .map(|month| crate::bills::domain::due_date(month, day))
            }))
        }
    }
}

/// D36: open series are written through the forecast horizon, or `viewed` when later, never past
/// 60 months from today nor 2100.
pub fn open_until(today: NaiveDate, viewed: NaiveDate) -> NaiveDate {
    use crate::months::domain::horizon_end;
    let cap = horizon_end(today.checked_add_months(Months::new(48)).unwrap_or(today));
    let until = horizon_end(today).max(viewed).min(cap);
    NaiveDate::from_ymd_opt(2100, 12, 31).map_or(until, |end| until.min(end))
}

/// D36: the members an open series still needs after `end` (its last members, last first) to reach `until`.
pub fn open_dates(
    every: RepeatEvery,
    end: &[NaiveDate],
    until: NaiveDate,
) -> Result<Vec<NaiveDate>, AppError> {
    use crate::months::domain::month_index;
    let Some(&last) = end.first() else {
        return Ok(Vec::new());
    };
    let steps = match every {
        RepeatEvery::Month => month_index(until) - month_index(last),
        RepeatEvery::Week => i32::try_from((until - last).num_days() / 7).unwrap_or(0),
        RepeatEvery::Year => until.year() - last.year(),
    };
    let dates = growth_dates(every, end, u32::try_from(steps).unwrap_or(0))?;
    Ok(dates.into_iter().filter(|date| *date <= until).collect())
}

/// M3 for a yearly series: a last member clamped on its month's last day takes the largest day of
/// the earlier members in that month, so 28 February returns to 29 in a leap year.
pub fn yearly_day(last: NaiveDate, earlier: &[NaiveDate]) -> u32 {
    if last != crate::months::domain::month_end(last) {
        return last.day();
    }
    earlier
        .iter()
        .filter(|date| date.month() == last.month())
        .map(|date| date.day())
        .fold(last.day(), u32::max)
}

/// M1 (D32): where a move fetches the reached members from: the Monday of the ISO week, or the
/// month's first day.
pub fn period_start(every: RepeatEvery, date: NaiveDate) -> NaiveDate {
    match every {
        RepeatEvery::Week => date
            .checked_sub_days(Days::new(date.weekday().num_days_from_monday().into()))
            .unwrap_or(date),
        RepeatEvery::Month | RepeatEvery::Year => crate::months::domain::first_of(date),
    }
}

/// M4 (D32): a weekly series moves inside the edited member's ISO week; the others inside its month.
pub fn check_move(every: RepeatEvery, from: NaiveDate, to: NaiveDate) -> Result<(), AppError> {
    match every {
        RepeatEvery::Week if from.iso_week() != to.iso_week() => Err(AppError::invalid(
            "date",
            "must stay in this entry's week when the series moves",
        )),
        RepeatEvery::Week => Ok(()),
        RepeatEvery::Month | RepeatEvery::Year => check_day_move(from, to),
    }
}

/// M2, M5 (D32): `dates` (by `date, id`) on `to`'s weekday in their own ISO week, or on its day in
/// their own month; refused when two share a period.
pub fn moved(
    every: RepeatEvery,
    dates: &[NaiveDate],
    to: NaiveDate,
) -> Result<Vec<NaiveDate>, AppError> {
    if every != RepeatEvery::Week {
        return moved_dates(dates, to.day());
    }
    if dates
        .windows(2)
        .any(|pair| pair[0].iso_week() == pair[1].iso_week())
    {
        return Err(AppError::invalid(
            "date",
            "must not move a series with two entries in one week",
        ));
    }
    let offset = Days::new(to.weekday().num_days_from_monday().into());
    within_2100(
        dates
            .iter()
            .map(|date| period_start(every, *date).checked_add_days(offset)),
    )
}

fn weeks_after(date: NaiveDate, count: u32) -> Result<Vec<NaiveDate>, AppError> {
    within_2100((1..=count).map(|k| date.checked_add_days(Days::new(7 * u64::from(k)))))
}

fn within_2100(dates: impl Iterator<Item = Option<NaiveDate>>) -> Result<Vec<NaiveDate>, AppError> {
    dates
        .map(|date| date.filter(|date| date.year() <= 2100))
        .collect::<Option<Vec<_>>>()
        .ok_or_else(|| AppError::invalid("date", "must keep every entry up to 2100"))
}

/// L1, L4: `count` dates in the months after `last`'s, each on `day` clamped to its month;
/// refused when one passes 2100.
pub fn following_dates(day: u32, last: NaiveDate, count: u32) -> Result<Vec<NaiveDate>, AppError> {
    let month = last.with_day(1).unwrap_or(last);
    let day = i16::try_from(day).unwrap_or(1);
    (1..=count)
        .map(|k| {
            month
                .checked_add_months(Months::new(k))
                .map(|month| crate::bills::domain::due_date(month, day))
                .filter(|date| date.year() <= 2100)
        })
        .collect::<Option<Vec<_>>>()
        .ok_or_else(|| AppError::invalid("date", "must keep every entry up to 2100"))
}

/// M3 (D20): growth takes the last member's day, or the larger day of the member `before` it
/// when the last sits clamped on its month's last day.
pub fn series_day(last: NaiveDate, before: Option<NaiveDate>) -> u32 {
    let clamped = last == crate::months::domain::month_end(last);
    match before {
        Some(before) if clamped => last.day().max(before.day()),
        _ => last.day(),
    }
}

/// M4: `following` moves the day of a series only inside the edited member's month.
pub fn check_day_move(from: NaiveDate, to: NaiveDate) -> Result<(), AppError> {
    if (from.year(), from.month()) != (to.year(), to.month()) {
        return Err(AppError::invalid(
            "date",
            "must stay in this entry's month when the series moves",
        ));
    }
    Ok(())
}

/// M2, M5: `dates` (by `date, id`) each on `day` clamped to its own month; refused when two
/// share a month, so the order never changes.
pub fn moved_dates(dates: &[NaiveDate], day: u32) -> Result<Vec<NaiveDate>, AppError> {
    if dates
        .windows(2)
        .any(|pair| (pair[0].year(), pair[0].month()) == (pair[1].year(), pair[1].month()))
    {
        return Err(AppError::invalid(
            "date",
            "must not move a series with two entries in one month",
        ));
    }
    let day = i16::try_from(day).unwrap_or(1);
    Ok(dates
        .iter()
        .map(|date| crate::bills::domain::due_date(*date, day))
        .collect())
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

/// D28: only a Diário entry goes on a card.
pub fn check_card(kind: CategoryKind, card_id: Option<Uuid>) -> Result<(), AppError> {
    match card_id.is_some() && kind != CategoryKind::Daily {
        true => Err(AppError::invalid(
            "card_id",
            "only a Diário entry goes on a card",
        )),
        false => Ok(()),
    }
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
        card_id: input.card_id,
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
            repeat_every: None,
            installments: None,
            first_installment: None,
            open_ended: false,
            card_id: None,
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
            every: RepeatEvery::Month,
            open_ended: false,
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
            repeat_dates(date("2027-01-31"), 4, RepeatEvery::Month).unwrap(),
            [date("2027-02-28"), date("2027-03-31"), date("2027-04-30")]
        );
        assert_eq!(
            repeat_dates(date("2028-01-31"), 2, RepeatEvery::Month).unwrap(),
            [date("2028-02-29")]
        );
        assert_eq!(
            repeat_dates(date("2026-11-30"), 3, RepeatEvery::Month).unwrap(),
            [date("2026-12-30"), date("2027-01-30")]
        );
    }

    #[test]
    fn r2_twelve_entries_are_the_original_and_eleven_copies() {
        let copies = repeat_dates(date("2026-11-05"), 12, RepeatEvery::Month).unwrap();

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
    fn l1_m3_growth_takes_the_given_day_in_the_months_after_the_last_ones() {
        assert_eq!(
            following_dates(31, date("2027-04-30"), 2).unwrap(),
            [date("2027-05-31"), date("2027-06-30")]
        );
        assert_eq!(
            following_dates(5, date("2027-10-20"), 3).unwrap(),
            [date("2027-11-05"), date("2027-12-05"), date("2028-01-05")]
        );
        assert_eq!(
            following_dates(10, date("2027-10-10"), 3).unwrap(),
            [date("2027-11-10"), date("2027-12-10"), date("2028-01-10")]
        );
    }

    #[test]
    fn l4_r2_every_date_of_a_series_stays_up_to_2100() {
        assert_eq!(
            following_dates(5, date("2100-11-05"), 1).unwrap(),
            [date("2100-12-05")]
        );
        assert_eq!(
            repeat_dates(date("2100-01-31"), 12, RepeatEvery::Month)
                .unwrap()
                .len(),
            11
        );
        assert_eq!(field(following_dates(5, date("2100-08-05"), 5)), "date");
        assert_eq!(
            field(repeat_dates(date("2100-06-05"), 12, RepeatEvery::Month)),
            "date"
        );
    }

    #[test]
    fn m3_growth_day_is_the_last_members_raised_by_the_one_before_when_clamped() {
        assert_eq!(series_day(date("2029-04-30"), Some(date("2029-03-31"))), 31);
        assert_eq!(series_day(date("2026-11-30"), Some(date("2026-10-30"))), 30);
        assert_eq!(series_day(date("2027-02-10"), Some(date("2026-12-05"))), 10);
        assert_eq!(series_day(date("2027-02-28"), Some(date("2027-01-31"))), 31);
        assert_eq!(series_day(date("2027-02-28"), Some(date("2027-01-20"))), 28);
        assert_eq!(series_day(date("2027-04-30"), None), 30);
        assert_eq!(series_day(date("2027-10-10"), Some(date("2027-09-05"))), 10);
    }

    #[test]
    fn m4_a_series_moves_its_day_only_inside_the_edited_members_month() {
        assert!(check_day_move(date("2027-03-05"), date("2027-03-10")).is_ok());
        assert!(check_day_move(date("2027-03-05"), date("2027-03-01")).is_ok());
        for to in ["2027-04-05", "2028-03-05", "2027-02-28"] {
            assert_eq!(
                field(check_day_move(date("2027-03-05"), date(to))),
                "date",
                "{to}"
            );
        }
    }

    #[test]
    fn m2_m5_each_moved_member_takes_the_day_clamped_to_its_own_month() {
        let dates = [
            date("2027-01-10"),
            date("2027-02-10"),
            date("2027-03-10"),
            date("2027-04-10"),
        ];
        assert_eq!(
            moved_dates(&dates, 31).unwrap(),
            [
                date("2027-01-31"),
                date("2027-02-28"),
                date("2027-03-31"),
                date("2027-04-30")
            ]
        );
        assert_eq!(
            moved_dates(&[date("2027-02-28"), date("2027-03-31")], 27).unwrap(),
            [date("2027-02-27"), date("2027-03-27")]
        );
        assert_eq!(
            moved_dates(&[date("2028-01-31"), date("2028-02-29")], 30).unwrap(),
            [date("2028-01-30"), date("2028-02-29")]
        );
        let shared = [date("2027-01-05"), date("2027-02-05"), date("2027-02-20")];
        assert_eq!(field(moved_dates(&shared, 10)), "date");
        assert!(moved_dates(&[], 10).unwrap().is_empty());
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

    #[test]
    fn d32_weekly_and_yearly_dates_by_step() {
        let weekly = repeat_dates(date("2026-11-12"), 8, RepeatEvery::Week).unwrap();
        assert_eq!(weekly.first(), Some(&date("2026-11-19")));
        assert_eq!(weekly.last(), Some(&date("2026-12-31")));
        assert_eq!(weekly.len(), 7);
        let leap = repeat_dates(date("2024-02-29"), 5, RepeatEvery::Year).unwrap();
        assert_eq!(
            leap,
            ["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"].map(date)
        );
        assert_eq!(
            repeat_dates(date("2026-01-31"), 2, RepeatEvery::Month).unwrap(),
            [date("2026-02-28")]
        );
        assert_eq!(
            field(repeat_dates(date("2099-01-01"), 3, RepeatEvery::Year).map(|_| ())),
            "date"
        );
        assert_eq!(
            field(repeat_dates(date("2100-12-20"), 3, RepeatEvery::Week).map(|_| ())),
            "date"
        );
    }

    #[test]
    fn d32_growth_by_step() {
        let week = growth_dates(
            RepeatEvery::Week,
            &[date("2026-12-31"), date("2026-12-24")],
            2,
        )
        .unwrap();
        assert_eq!(week, ["2027-01-07", "2027-01-14"].map(date));
        let end = ["2027-02-28", "2026-02-28", "2025-02-28", "2024-02-29"].map(date);
        assert_eq!(
            growth_dates(RepeatEvery::Year, &end, 1).unwrap(),
            [date("2028-02-29")]
        );
        assert_eq!(
            growth_dates(RepeatEvery::Year, &[date("2026-11-12")], 2).unwrap(),
            ["2027-11-12", "2028-11-12"].map(date)
        );
        let month = growth_dates(
            RepeatEvery::Month,
            &[date("2026-02-28"), date("2026-01-31")],
            1,
        )
        .unwrap();
        assert_eq!(month, [date("2026-03-31")]);
        assert!(growth_dates(RepeatEvery::Week, &[], 2).unwrap().is_empty());
        assert_eq!(yearly_day(date("2027-02-28"), &[date("2026-03-31")]), 28);
    }

    #[test]
    fn d32_moves_stay_in_their_period() {
        assert!(check_move(RepeatEvery::Week, date("2026-11-12"), date("2026-11-09")).is_ok());
        assert_eq!(
            field(check_move(
                RepeatEvery::Week,
                date("2026-11-12"),
                date("2026-11-16")
            )),
            "date"
        );
        assert_eq!(
            field(check_move(
                RepeatEvery::Year,
                date("2026-11-12"),
                date("2026-12-01")
            )),
            "date"
        );
        assert!(check_move(RepeatEvery::Month, date("2026-11-12"), date("2026-11-30")).is_ok());
        let moved_week = moved(
            RepeatEvery::Week,
            &[date("2026-11-12"), date("2026-11-19")],
            date("2026-11-09"),
        )
        .unwrap();
        assert_eq!(moved_week, ["2026-11-09", "2026-11-16"].map(date));
        assert_eq!(
            field(
                moved(
                    RepeatEvery::Week,
                    &[date("2026-11-12"), date("2026-11-13")],
                    date("2026-11-09")
                )
                .map(|_| ())
            ),
            "date"
        );
        assert_eq!(
            moved(
                RepeatEvery::Year,
                &[date("2026-03-10"), date("2027-03-10")],
                date("2026-03-31")
            )
            .unwrap(),
            ["2026-03-31", "2027-03-31"].map(date)
        );
        assert_eq!(
            period_start(RepeatEvery::Week, date("2026-11-15")),
            date("2026-11-09")
        );
        assert_eq!(
            period_start(RepeatEvery::Year, date("2026-11-15")),
            date("2026-11-01")
        );
    }

    #[test]
    fn d32_a_weekly_move_keeps_the_iso_week_and_2100() {
        assert_eq!(
            field(check_move(
                RepeatEvery::Week,
                date("2026-11-15"),
                date("2026-11-16")
            )),
            "date"
        );
        assert!(check_move(RepeatEvery::Week, date("2026-11-15"), date("2026-11-09")).is_ok());
        assert!(check_move(RepeatEvery::Week, date("2027-01-01"), date("2026-12-28")).is_ok());
        let past = moved(
            RepeatEvery::Week,
            &[date("2100-12-24"), date("2100-12-31")],
            date("2100-12-26"),
        );
        assert_eq!(field(past.map(|_| ())), "date");
    }

    #[test]
    fn d32_the_2100_cap_names_no_step() {
        for capped in [
            repeat_dates(date("2100-12-20"), 3, RepeatEvery::Week),
            following_dates(5, date("2100-08-05"), 5),
        ] {
            match capped {
                Err(AppError::Validation(errors)) => {
                    assert_eq!(errors[0].message, "must keep every entry up to 2100");
                }
                other => panic!("{other:?}"),
            }
        }
    }

    #[test]
    fn d32_repeat_every_needs_repeat_months_and_parcelas_stay_monthly() {
        let alone = CreateTransaction {
            repeat_every: Some(RepeatEvery::Week),
            ..entry("10", None)
        };
        assert_eq!(field(check(alone).map(|_| ())), "repeat_every");
        let split = CreateTransaction {
            installments: Some(3),
            repeat_every: Some(RepeatEvery::Week),
            ..entry("30", None)
        };
        assert_eq!(field(check(split).map(|_| ())), "repeat_every");
        let monthly = CreateTransaction {
            installments: Some(3),
            repeat_every: Some(RepeatEvery::Month),
            ..entry("30", None)
        };
        assert!(check(monthly).is_ok());
        let weekly = CreateTransaction {
            repeat_months: Some(4),
            repeat_every: Some(RepeatEvery::Week),
            ..entry("10", None)
        };
        assert!(check(weekly).is_ok());
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

    #[test]
    fn d36_open_series_reach_the_horizon_or_the_viewed_month_within_60_months() {
        let today = date("2026-11-12");
        assert_eq!(open_until(today, date("2026-11-30")), date("2027-10-31"));
        assert_eq!(open_until(today, date("2028-03-31")), date("2028-03-31"));
        assert_eq!(open_until(today, date("2040-01-31")), date("2031-10-31"));
        assert_eq!(
            open_until(date("2099-06-01"), date("2099-06-30")),
            date("2100-05-31")
        );
    }

    #[test]
    fn d36_open_dates_fill_up_to_until_by_step() {
        let until = date("2027-10-31");
        let none: Vec<NaiveDate> = vec![];
        assert_eq!(
            open_dates(RepeatEvery::Month, &[date("2027-08-15")], until).unwrap(),
            [date("2027-09-15"), date("2027-10-15")]
        );
        assert_eq!(
            open_dates(RepeatEvery::Month, &[date("2027-10-15")], until).unwrap(),
            none
        );
        assert_eq!(
            open_dates(RepeatEvery::Week, &[date("2027-10-15")], until).unwrap(),
            [date("2027-10-22"), date("2027-10-29")]
        );
        assert_eq!(
            open_dates(RepeatEvery::Year, &[date("2026-12-01")], until).unwrap(),
            none
        );
    }
}
