use std::collections::{BTreeMap, HashMap, HashSet};
use std::ops::Bound;

use chrono::{Datelike, Months, NaiveDate};
use rust_decimal::Decimal;
use soldi_types::categories::CategoryKind;
use soldi_types::months::{
    BillOfMonth, CardFatura, Day, FaturaAhead, Forecast, ForecastDay, MonthSavings, MonthView, Tier,
};
use soldi_types::settings::Settings;
use soldi_types::transactions::Transaction;
use uuid::Uuid;

use crate::bills::domain::{due_date, fatura_due, installment_of};
use crate::error::AppError;
use crate::reports::domain::{Spending, percent};

/// What the ledger holds for one kind on one date; `withdrawn` marks the resgates' sum and
/// `card_id` the spends on a card (D28).
pub struct DaySum {
    pub date: NaiveDate,
    pub kind: CategoryKind,
    pub withdrawn: bool,
    pub card_id: Option<Uuid>,
    pub amount: Decimal,
}

/// A bill with its category's icon and color, and the São Paulo day it started owing.
/// A card has a `closing_day` and no `amount` (D28).
pub struct MonthBill {
    pub id: Uuid,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub amount: Option<Decimal>,
    pub due_day: i16,
    pub closing_day: Option<i16>,
    pub active_since: NaiveDate,
    pub last_month: Option<NaiveDate>,
    pub installments: Option<i16>,
    pub variable: bool,
}

/// A bill's entry and its date.
pub struct Payment {
    pub bill_id: Uuid,
    pub transaction_id: Uuid,
    pub amount: Decimal,
    pub date: NaiveDate,
}

/// D56: one month of a conta fixa or parcelada set apart: its own amount, or skipped.
pub struct BillMonth {
    pub bill_id: Uuid,
    pub month: NaiveDate,
    pub amount: Option<Decimal>,
    pub skipped: bool,
}

/// (bill id, first day of the month) → that month's override (D56).
pub type BillMonths = HashMap<(Uuid, NaiveDate), BillMonth>;

pub fn bill_months(rows: Vec<BillMonth>) -> BillMonths {
    rows.into_iter()
        .map(|row| ((row.bill_id, row.month), row))
        .collect()
}

/// `month` is its first day; `sums` cover `opening_date` to the month's end (a card's spends
/// from `cards_from(opening_date)`), `payments` the
/// opening date's month to the month's end;
/// `spending` is the month's Entradas, Gastos and Guardado (D54).
pub struct MonthInput {
    pub month: NaiveDate,
    pub settings: Settings,
    pub sums: Vec<DaySum>,
    pub bills: Vec<MonthBill>,
    /// The overrides from the opening date's month to the end (D56).
    pub bill_months: Vec<BillMonth>,
    pub payments: Vec<Payment>,
    pub spending: Spending,
    pub today: NaiveDate,
}

#[derive(Default, Clone, Copy)]
struct Flows {
    income: Decimal,
    withdrawn: Decimal,
    bills: Decimal,
    daily: Decimal,
}

impl Flows {
    fn performance(&self) -> Decimal {
        self.income - self.bills - self.daily
    }

    fn net(&self) -> Decimal {
        self.performance() + self.withdrawn
    }
}

pub fn tier(balance: Decimal, thresholds: &Settings) -> Tier {
    if balance < thresholds.tier_red {
        Tier::Red
    } else if balance < thresholds.tier_zero {
        Tier::LightRed
    } else if balance < thresholds.tier_yellow {
        Tier::Yellow
    } else if balance < thresholds.tier_green {
        Tier::LightGreen
    } else {
        Tier::Green
    }
}

/// One month of a bill with no payment dated in it (D17).
pub struct Unpaid<'a> {
    pub bill: &'a MonthBill,
    pub amount: Decimal,
    pub due_date: NaiveDate,
    pub lands_on: NaiveDate,
}

pub fn first_of(date: NaiveDate) -> NaiveDate {
    date.with_day(1).unwrap_or(date)
}

/// Months since year 0; two of them subtract to their distance.
pub fn month_index(date: NaiveDate) -> i32 {
    date.year() * 12 + i32::try_from(date.month0()).unwrap_or(0)
}

/// (card id, first day of the due month) → the fatura's sum (D28).
pub type Faturas = HashMap<(Uuid, NaiveDate), Decimal>;

/// The earliest spend a fatura due on or after `opening` can hold (D28).
pub fn cards_from(opening: NaiveDate) -> NaiveDate {
    let first = first_of(opening);
    first.checked_sub_months(Months::new(2)).unwrap_or(first)
}

/// D28: each card's fatura, keyed by (card id, first day of its due month). D30a: a fatura paid
/// below its sum carries the rest into the card's next one.
pub fn faturas(bills: &[MonthBill], sums: &[DaySum], payments: &[Payment]) -> Faturas {
    let mut found: BTreeMap<(Uuid, NaiveDate), Decimal> = BTreeMap::new();
    for sum in sums {
        let card = bills.iter().find(|bill| Some(bill.id) == sum.card_id);
        if let Some((card, closing_day)) = card.and_then(|card| Some((card, card.closing_day?))) {
            let due = fatura_due(sum.date, closing_day, card.due_day);
            *found.entry((card.id, first_of(due))).or_default() += sum.amount;
        }
    }
    let mut paid: HashMap<(Uuid, NaiveDate), Decimal> = HashMap::new();
    for payment in payments {
        *paid
            .entry((payment.bill_id, first_of(payment.date)))
            .or_default() += payment.amount;
    }
    let mut next = found.keys().next().copied();
    while let Some(key @ (card, month)) = next {
        let rest = paid.get(&key).map_or(Decimal::ZERO, |paid| {
            (found[&key] - paid).max(Decimal::ZERO)
        });
        if let Some(following) = month.checked_add_months(Months::new(1))
            && rest > Decimal::ZERO
        {
            *found.entry((card, following)).or_default() += rest;
        }
        next = found
            .range((Bound::Excluded(key), Bound::Unbounded))
            .next()
            .map(|(key, _)| *key);
    }
    found.into_iter().collect()
}

/// How many faturas after the viewed one the card panel lists (SOL-119).
pub const FATURAS_AHEAD: u32 = 6;

pub fn check_opening(month: NaiveDate, opening: NaiveDate) -> Result<(), AppError> {
    if month < first_of(opening) {
        return Err(AppError::rule(
            "month-before-opening",
            "The month is before the opening date.",
        ));
    }
    Ok(())
}

/// SOL-119: `card`'s fatura due in `month` (its first day), from the shared `faturas` map.
pub fn card_fatura(
    card: &MonthBill,
    month: NaiveDate,
    faturas: &Faturas,
    payments: &[Payment],
    entries: Vec<Transaction>,
) -> CardFatura {
    let total_in = |month: NaiveDate| faturas.get(&(card.id, month)).copied().unwrap_or_default();
    let paid_in = |month: NaiveDate| -> Decimal {
        payments
            .iter()
            .filter(|payment| payment.bill_id == card.id && first_of(payment.date) == month)
            .map(|payment| payment.amount)
            .sum()
    };
    // D30a, as `faturas` does: only a partial payment carries; an unpaid month is its own D17 row.
    let carried = month
        .checked_sub_months(Months::new(1))
        .map_or(Decimal::ZERO, |last| match paid_in(last) {
            paid if paid > Decimal::ZERO => (total_in(last) - paid).max(Decimal::ZERO),
            _ => Decimal::ZERO,
        });
    CardFatura {
        month: month.format("%Y-%m").to_string(),
        total: total_in(month),
        carried,
        paid: paid_in(month),
        entries: entries
            .into_iter()
            .filter(|entry| {
                card.closing_day.is_some_and(|closing| {
                    first_of(fatura_due(entry.date, closing, card.due_day)) == month
                })
            })
            .collect(),
        ahead: (1..=FATURAS_AHEAD)
            .filter_map(|n| month.checked_add_months(Months::new(n)))
            .map(|ahead| FaturaAhead {
                month: ahead.format("%Y-%m").to_string(),
                total: total_in(ahead),
            })
            .collect(),
    }
}

/// What `bill` owes in `month`: its own amount that month (D56), its amount, or a card's fatura.
fn amount_in(
    bill: &MonthBill,
    faturas: &Faturas,
    overrides: &BillMonths,
    month: NaiveDate,
) -> Decimal {
    overrides
        .get(&(bill.id, month))
        .and_then(|set| set.amount)
        .or(bill.amount)
        .unwrap_or_else(|| faturas.get(&(bill.id, month)).copied().unwrap_or_default())
}

fn skipped(overrides: &BillMonths, bill: &MonthBill, month: NaiveDate) -> bool {
    overrides
        .get(&(bill.id, month))
        .is_some_and(|set| set.skipped)
}

/// D35: whether `month` (its first day) is inside the bill's run: up to `last_month`, from parcela 1.
pub fn runs_in(bill: &MonthBill, month: NaiveDate) -> bool {
    match (bill.last_month, bill.installments) {
        (None, _) => true,
        (Some(last), None) => month <= last,
        (Some(last), Some(n)) => installment_of(month, last, n).is_some(),
    }
}

/// D35: the parcela a parcelado `bill` holds in the month of `due`.
fn installment_in(bill: &MonthBill, due: NaiveDate) -> Option<i16> {
    bill.last_month
        .zip(bill.installments)
        .and_then(|(last, n)| installment_of(first_of(due), last, n))
}

/// D17: a month of `bill` is owed when its due date is on or after the opening date and the
/// bill's `active_since`, inside its run (D35); a card's (D28) when its fatura is above zero,
/// whenever it was registered; never a skipped month (D56).
fn owed(
    bill: &MonthBill,
    amount: Decimal,
    due: NaiveDate,
    opening: NaiveDate,
    overrides: &BillMonths,
) -> bool {
    due >= opening
        && match bill.closing_day {
            Some(_) => amount > Decimal::ZERO,
            None => due >= bill.active_since,
        }
        && runs_in(bill, first_of(due))
        && !skipped(overrides, bill, first_of(due))
}

/// D17: each owed, unpaid month of `bills` from the opening date's month to `to`'s, oldest
/// first. It lands on `max(due_date, today)`.
pub fn unpaid<'a>(
    bills: &'a [MonthBill],
    faturas: &Faturas,
    overrides: &BillMonths,
    payments: &[Payment],
    opening: NaiveDate,
    today: NaiveDate,
    to: NaiveDate,
) -> Vec<Unpaid<'a>> {
    let paid: HashSet<(Uuid, NaiveDate)> = payments
        .iter()
        .map(|payment| (payment.bill_id, first_of(payment.date)))
        .collect();
    let months = std::iter::successors(Some(first_of(opening)), |month| {
        month.checked_add_months(Months::new(1))
    })
    .take_while(|month| *month <= to);
    let mut found = Vec::new();
    for month in months {
        for bill in bills {
            let due = due_date(month, bill.due_day);
            let amount = amount_in(bill, faturas, overrides, month);
            if owed(bill, amount, due, opening, overrides) && !paid.contains(&(bill.id, month)) {
                found.push(Unpaid {
                    bill,
                    amount,
                    due_date: due,
                    lands_on: due.max(today),
                });
            }
        }
    }
    found
}

/// D55: the due dates in `(after, today]` of a fixed-amount conta fixa; never a card or a variable one.
pub fn auto_paid(
    bill: &MonthBill,
    overrides: &BillMonths,
    after: NaiveDate,
    opening: NaiveDate,
    today: NaiveDate,
) -> Vec<NaiveDate> {
    let Some(amount) = bill
        .amount
        .filter(|_| bill.closing_day.is_none() && !bill.variable)
    else {
        return Vec::new();
    };
    std::iter::successors(Some(first_of(after)), |month| {
        month.checked_add_months(Months::new(1))
    })
    .take_while(|month| *month <= today)
    .map(|month| due_date(month, bill.due_day))
    .filter(|due| after < *due && *due <= today && owed(bill, amount, *due, opening, overrides))
    .collect()
}

/// What `unpaid` took before `from`, and what it takes on each day `from..=to`.
fn landing(
    unpaid: &[Unpaid],
    from: NaiveDate,
    to: NaiveDate,
) -> (Decimal, BTreeMap<NaiveDate, Decimal>) {
    let mut before = Decimal::ZERO;
    let mut on = BTreeMap::new();
    for late in unpaid {
        if late.lands_on < from {
            before += late.amount;
        } else if late.lands_on <= to {
            *on.entry(late.lands_on).or_default() += late.amount;
        }
    }
    (before, on)
}

/// SOL-164 R1: what the Diário previsto adds on `date`, on top of the cash `daily` typed for it.
pub fn previsto_on(
    settings: &Settings,
    today: NaiveDate,
    date: NaiveDate,
    daily: Decimal,
) -> Decimal {
    match settings.daily_estimate {
        Some(estimate)
            if settings.daily_estimate_on && date > today && date >= settings.opening_date =>
        {
            (estimate - daily).max(Decimal::ZERO)
        }
        _ => Decimal::ZERO,
    }
}

/// R2: the previstos of the days before `from`.
fn estimated_before(
    settings: &Settings,
    today: NaiveDate,
    flows: &BTreeMap<NaiveDate, Flows>,
    from: NaiveDate,
) -> Decimal {
    if !settings.daily_estimate_on {
        return Decimal::ZERO;
    }
    let start = today.succ_opt().unwrap_or(today).max(settings.opening_date);
    start
        .iter_days()
        .take_while(|date| *date < from)
        .map(|date| {
            previsto_on(
                settings,
                today,
                date,
                flows.get(&date).map_or(Decimal::ZERO, |flow| flow.daily),
            )
        })
        .sum()
}

/// The entries on or after `opening`, a card's spends left to its faturas.
fn flows_by_day(
    sums: Vec<DaySum>,
    bills: &[MonthBill],
    opening: NaiveDate,
) -> BTreeMap<NaiveDate, Flows> {
    let cards: HashSet<Uuid> = bills
        .iter()
        .filter(|bill| bill.closing_day.is_some())
        .map(|bill| bill.id)
        .collect();
    let mut flows: BTreeMap<NaiveDate, Flows> = BTreeMap::new();
    for sum in sums
        .into_iter()
        .filter(|sum| sum.date >= opening && !sum.card_id.is_some_and(|id| cards.contains(&id)))
    {
        let flow = flows.entry(sum.date).or_default();
        match sum.kind {
            CategoryKind::Income if sum.withdrawn => flow.withdrawn += sum.amount,
            CategoryKind::Income => flow.income += sum.amount,
            CategoryKind::Bill => flow.bills += sum.amount,
            CategoryKind::Daily => flow.daily += sum.amount,
        }
    }
    flows
}

/// The opening balance stands before the opening date's entries, and on the days before it.
pub fn month_view(input: MonthInput) -> MonthView {
    let MonthInput {
        month,
        settings,
        sums,
        bills,
        bill_months: rows,
        payments,
        spending,
        today,
    } = input;
    let overrides = bill_months(rows);
    let faturas = faturas(&bills, &sums, &payments);
    let flows = flows_by_day(sums, &bills, settings.opening_date);
    let end = month_end(month);
    let today_or_end = today.min(end);
    let balance_today = settings.opening_balance
        + flows
            .range(..=today_or_end)
            .map(|(_, flow)| flow.net())
            .sum::<Decimal>();
    let unpaid_months = unpaid(
        &bills,
        &faturas,
        &overrides,
        &payments,
        settings.opening_date,
        today,
        end,
    );
    let current = (month..=end).contains(&today);
    let carried = unpaid_months
        .iter()
        .filter(|late| current && late.due_date < month)
        .map(|late| BillOfMonth {
            bill_id: late.bill.id,
            name: late.bill.name.clone(),
            icon: late.bill.icon.clone(),
            color: late.bill.color.clone(),
            amount: late.amount,
            due_date: late.due_date,
            paid: false,
            transaction_id: None,
            overdue: true,
            lands_on: Some(late.lands_on),
            is_card: late.bill.closing_day.is_some(),
            installment: installment_in(late.bill, late.due_date),
            installments: late.bill.installments,
            variable: late.bill.variable,
            adjusted: overrides
                .get(&(late.bill.id, first_of(late.due_date)))
                .is_some_and(|set| set.amount.is_some()),
            skipped: false,
        });
    let own = bills.iter().filter_map(|bill| {
        let payment = payments
            .iter()
            .find(|payment| payment.bill_id == bill.id && (month..=end).contains(&payment.date));
        if payment.is_none() && !runs_in(bill, month) {
            return None;
        }
        let due_date = due_date(month, bill.due_day);
        let amount = amount_in(bill, &faturas, &overrides, month);
        let is_card = bill.closing_day.is_some();
        if is_card && payment.is_none() && amount == Decimal::ZERO {
            return None;
        }
        let open =
            payment.is_none() && owed(bill, amount, due_date, settings.opening_date, &overrides);
        let set = overrides
            .get(&(bill.id, month))
            .filter(|_| payment.is_none());
        Some(BillOfMonth {
            bill_id: bill.id,
            name: bill.name.clone(),
            icon: bill.icon.clone(),
            color: bill.color.clone(),
            amount: payment.map_or(amount, |payment| payment.amount),
            due_date,
            paid: payment.is_some(),
            transaction_id: payment.map(|payment| payment.transaction_id),
            overdue: open && due_date < today,
            lands_on: open
                .then_some(due_date.max(today))
                .filter(|day| *day <= end),
            is_card,
            installment: installment_in(bill, due_date),
            installments: bill.installments,
            variable: bill.variable,
            adjusted: set.is_some_and(|set| set.amount.is_some()),
            skipped: set.is_some_and(|set| set.skipped),
        })
    });
    let bills_of_month: Vec<BillOfMonth> = carried.chain(own).collect();
    let (mut pending, lands) = landing(&unpaid_months, month, end);
    let mut estimated = estimated_before(&settings, today, &flows, month);
    let mut balance = settings.opening_balance
        + flows
            .range(..month)
            .map(|(_, flow)| flow.net())
            .sum::<Decimal>();
    let days = month
        .iter_days()
        .take_while(|date| *date <= end)
        .map(|date| {
            let flow = flows.get(&date).copied().unwrap_or_default();
            balance += flow.net();
            pending += lands.get(&date).copied().unwrap_or_default();
            let previsto = previsto_on(&settings, today, date, flow.daily);
            estimated += previsto;
            let projected_balance = balance - pending - estimated;
            Day {
                date,
                income: flow.income,
                withdrawn: flow.withdrawn,
                bills: flow.bills,
                daily: flow.daily,
                previsto,
                balance,
                tier: tier(balance, &settings),
                projected_balance,
                projected_tier: tier(projected_balance, &settings),
                is_today: date == today,
                is_future: date > today,
            }
        })
        .collect();
    let projected = if today <= end {
        balance - pending - estimated
    } else {
        balance
            - bills_of_month
                .iter()
                .filter(|bill| bill.overdue)
                .map(|bill| bill.amount)
                .sum::<Decimal>()
    };
    MonthView {
        month: month.format("%Y-%m").to_string(),
        days,
        balance_today,
        balance_today_tier: tier(balance_today, &settings),
        totals: spending.totals(),
        projected_balance: projected,
        projected_tier: tier(projected, &settings),
        bills_of_month,
        savings: MonthSavings {
            saved: spending.saved,
            rate_pct: percent(spending.saved, spending.income),
        },
    }
}

/// `sums` cover `opening_date` (a card's spends `cards_from` it) to `horizon_end(today)`, `payments` the opening date's month to it.
pub struct ForecastInput {
    pub settings: Settings,
    pub sums: Vec<DaySum>,
    pub bills: Vec<MonthBill>,
    /// The overrides from the opening date's month to the end (D56).
    pub bill_months: Vec<BillMonth>,
    pub payments: Vec<Payment>,
    pub today: NaiveDate,
}

/// D16: the last day of the 11th month after today's.
pub fn horizon_end(today: NaiveDate) -> NaiveDate {
    let first = first_of(today);
    month_end(first.checked_add_months(Months::new(11)).unwrap_or(first))
}

/// D16, D17: each day from today (the opening date, when later) to `horizon_end`, walked like
/// `month_view` with every unpaid month landed.
pub fn forecast(input: ForecastInput) -> Forecast {
    let ForecastInput {
        settings,
        sums,
        bills,
        bill_months: rows,
        payments,
        today,
    } = input;
    let overrides = bill_months(rows);
    let faturas = faturas(&bills, &sums, &payments);
    let flows = flows_by_day(sums, &bills, settings.opening_date);
    let from = today.max(settings.opening_date);
    let to = horizon_end(today);
    let unpaid_months = unpaid(
        &bills,
        &faturas,
        &overrides,
        &payments,
        settings.opening_date,
        today,
        to,
    );
    let (mut pending, lands) = landing(&unpaid_months, from, to);
    let mut estimated = estimated_before(&settings, today, &flows, from);
    let mut balance = settings.opening_balance
        + flows
            .range(..from)
            .map(|(_, flow)| flow.net())
            .sum::<Decimal>();
    let days = from
        .iter_days()
        .take_while(|date| *date <= to)
        .map(|date| {
            let flow = flows.get(&date).copied().unwrap_or_default();
            balance += flow.net();
            pending += lands.get(&date).copied().unwrap_or_default();
            estimated += previsto_on(&settings, today, date, flow.daily);
            let projected_balance = balance - pending - estimated;
            ForecastDay {
                date,
                projected_balance,
                projected_tier: tier(projected_balance, &settings),
            }
        })
        .collect();
    Forecast { today, days }
}

/// The first day of a `YYYY-MM` month, years 2000 to 2100 (SOL-30's bound).
pub fn parse_month(text: &str) -> Result<NaiveDate, AppError> {
    let shaped = text.len() == 7
        && text.bytes().enumerate().all(|(index, byte)| match index {
            4 => byte == b'-',
            _ => byte.is_ascii_digit(),
        });
    let first = shaped
        .then(|| NaiveDate::parse_from_str(&format!("{text}-01"), "%Y-%m-%d").ok())
        .flatten();
    first
        .filter(|first| (2000..=2100).contains(&first.year()))
        .ok_or_else(|| AppError::invalid("month", "must be a month as YYYY-MM from 2000 to 2100"))
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
    use soldi_types::months::Totals;

    fn date(text: &str) -> NaiveDate {
        text.parse().unwrap()
    }

    #[test]
    fn months_are_exactly_yyyy_mm() {
        assert_eq!(parse_month("2026-11").unwrap(), date("2026-11-01"));
        assert_eq!(parse_month("2000-01").unwrap(), date("2000-01-01"));
        assert_eq!(parse_month("2100-12").unwrap(), date("2100-12-01"));
        for text in [
            "1999-12",
            "2101-01",
            "9999-12",
            "0001-01",
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

    use rust_decimal::Decimal;
    use soldi_types::categories::CategoryKind::{Bill, Daily, Income};
    use soldi_types::months::Tier;
    use soldi_types::settings::Settings;

    fn money(text: &str) -> Decimal {
        text.parse().unwrap()
    }

    fn settings(opening_balance: &str, opening_date: &str) -> Settings {
        Settings {
            opening_balance: money(opening_balance),
            opening_date: date(opening_date),
            tier_red: money("-500"),
            tier_zero: money("0"),
            tier_yellow: money("1000"),
            tier_green: money("2000"),
            currency: soldi_types::settings::Currency::Brl,
            savings_target_pct: None,
            daily_estimate: None,
            daily_estimate_on: false,
        }
    }

    fn estimate(settings: Settings, amount: &str) -> Settings {
        Settings {
            daily_estimate: Some(money(amount)),
            daily_estimate_on: true,
            ..settings
        }
    }

    fn sum(on: &str, kind: CategoryKind, amount: &str) -> DaySum {
        DaySum {
            date: date(on),
            kind,
            withdrawn: false,
            card_id: None,
            amount: money(amount),
        }
    }

    fn resgate(on: &str, amount: &str) -> DaySum {
        DaySum {
            withdrawn: true,
            ..sum(on, Income, amount)
        }
    }

    fn view(month: &str, settings: Settings, sums: Vec<DaySum>, today: &str) -> MonthView {
        with_bills(month, settings, sums, vec![], vec![], today)
    }

    fn with_bills(
        month: &str,
        settings: Settings,
        sums: Vec<DaySum>,
        bills: Vec<MonthBill>,
        payments: Vec<Payment>,
        today: &str,
    ) -> MonthView {
        month_view(MonthInput {
            month: date(&format!("{month}-01")),
            settings,
            sums,
            bills,
            bill_months: vec![],
            payments,
            spending: Spending::default(),
            today: date(today),
        })
    }

    fn with_months(
        month: &str,
        settings: Settings,
        bills: Vec<MonthBill>,
        bill_months: Vec<BillMonth>,
        payments: Vec<Payment>,
        today: &str,
    ) -> MonthView {
        month_view(MonthInput {
            month: date(&format!("{month}-01")),
            settings,
            sums: vec![],
            bills,
            bill_months,
            payments,
            spending: Spending::default(),
            today: date(today),
        })
    }

    fn adjusted(bill: u128, month: &str, amount: &str) -> BillMonth {
        BillMonth {
            bill_id: uuid::Uuid::from_u128(bill),
            month: date(month),
            amount: Some(money(amount)),
            skipped: false,
        }
    }

    fn skipped(bill: u128, month: &str) -> BillMonth {
        BillMonth {
            bill_id: uuid::Uuid::from_u128(bill),
            month: date(month),
            amount: None,
            skipped: true,
        }
    }

    fn bill(id: u128, name: &str, amount: &str, due_day: i16) -> MonthBill {
        MonthBill {
            id: uuid::Uuid::from_u128(id),
            name: name.into(),
            icon: "home".into(),
            color: "cat-6".into(),
            amount: Some(money(amount)),
            due_day,
            closing_day: None,
            active_since: date("2026-01-01"),
            last_month: None,
            installments: None,
            variable: false,
        }
    }

    fn card(id: u128, name: &str, closing_day: i16, due_day: i16) -> MonthBill {
        MonthBill {
            amount: None,
            closing_day: Some(closing_day),
            ..bill(id, name, "0", due_day)
        }
    }

    fn spend(on: &str, card: u128, amount: &str) -> DaySum {
        DaySum {
            card_id: Some(uuid::Uuid::from_u128(card)),
            ..sum(on, Daily, amount)
        }
    }

    fn fatura_rows(view: &MonthView) -> Vec<(String, Decimal, NaiveDate, bool, bool, bool)> {
        view.bills_of_month
            .iter()
            .map(|bill| {
                (
                    bill.name.clone(),
                    bill.amount,
                    bill.due_date,
                    bill.is_card,
                    bill.paid,
                    bill.overdue,
                )
            })
            .collect()
    }

    #[test]
    fn d28_card_spends_leave_the_balance_until_their_fatura_is_due() {
        let spends = || vec![spend("2026-11-02", 1, "50"), spend("2026-11-04", 1, "30")];
        let porto = || vec![card(1, "Porto", 3, 10)];
        let opening = || settings("1000", "2026-11-01");
        let november = with_bills(
            "2026-11",
            opening(),
            spends(),
            porto(),
            vec![],
            "2026-11-05",
        );
        let december = with_bills(
            "2026-12",
            opening(),
            spends(),
            porto(),
            vec![],
            "2026-11-05",
        );
        let year = ahead(opening(), spends(), porto(), "2026-11-05");

        assert!(
            november.days[..5]
                .iter()
                .all(|day| day.balance == money("1000") && day.daily == money("0"))
        );
        assert_eq!(
            fatura_rows(&november),
            [(
                "Porto".into(),
                money("50"),
                date("2026-11-10"),
                true,
                false,
                false
            )]
        );
        assert_eq!(
            november.bills_of_month[0].lands_on,
            Some(date("2026-11-10"))
        );
        assert_eq!(november.days[8].projected_balance, money("1000"));
        assert_eq!(november.days[9].projected_balance, money("950"));
        assert_eq!(november.projected_balance, money("950"));
        assert_eq!(
            fatura_rows(&december),
            [(
                "Porto".into(),
                money("30"),
                date("2026-12-10"),
                true,
                false,
                false
            )]
        );
        assert_eq!(december.days[0].projected_balance, money("950"));
        assert_eq!(december.projected_balance, money("920"));
        assert_eq!(at(&year, "2026-11-09").0, money("1000"));
        assert_eq!(at(&year, "2026-11-10").0, money("950"));
        assert_eq!(at(&year, "2026-12-10").0, money("920"));
        assert_eq!(at(&year, "2027-10-31").0, money("920"));
    }

    #[test]
    fn d28_a_paid_fatura_shows_its_paid_amount_and_a_card_month_without_spends_is_not_listed() {
        let sums = || vec![spend("2026-11-02", 1, "50"), sum("2026-11-10", Bill, "52")];
        let opening = || settings("1000", "2026-10-01");
        let paid = || vec![payment(1, 9, "52", "2026-11-10")];
        let porto = || vec![card(1, "Porto", 3, 10)];
        let november = with_bills("2026-11", opening(), sums(), porto(), paid(), "2026-11-20");
        let october = with_bills("2026-10", opening(), sums(), porto(), paid(), "2026-11-20");

        assert_eq!(
            fatura_rows(&november),
            [(
                "Porto".into(),
                money("52"),
                date("2026-11-10"),
                true,
                true,
                false
            )]
        );
        assert_eq!(november.bills_of_month[0].lands_on, None);
        assert_eq!(november.days[8].balance, money("1000"));
        assert_eq!(november.days[9].balance, money("948"));
        assert_eq!(november.projected_balance, money("948"));
        assert!(october.bills_of_month.is_empty());
        assert_eq!(october.projected_balance, money("1000"));
    }

    #[test]
    fn d28_an_unpaid_fatura_of_last_month_lands_today_and_ignores_active_since() {
        let late = MonthBill {
            active_since: date("2026-11-20"),
            ..card(1, "Porto", 3, 10)
        };
        let view = with_bills(
            "2026-11",
            settings("1000", "2026-09-01"),
            vec![spend("2026-09-15", 1, "40"), spend("2026-10-20", 1, "60")],
            vec![late],
            vec![],
            "2026-11-21",
        );

        assert_eq!(
            fatura_rows(&view),
            [
                (
                    "Porto".into(),
                    money("40"),
                    date("2026-10-10"),
                    true,
                    false,
                    true
                ),
                (
                    "Porto".into(),
                    money("60"),
                    date("2026-11-10"),
                    true,
                    false,
                    true
                )
            ]
        );
        assert!(
            view.bills_of_month
                .iter()
                .all(|bill| bill.lands_on == Some(date("2026-11-21")))
        );
        assert!(view.days.iter().all(|day| day.balance == money("1000")));
        assert_eq!(view.days[19].projected_balance, money("1000"));
        assert_eq!(view.days[20].projected_balance, money("900"));
        assert_eq!(view.projected_balance, money("900"));
    }

    #[test]
    fn d30a_an_underpaid_fatura_carries_its_rest_into_the_next_one_and_an_overpaid_carries_nothing()
    {
        let spends = || vec![spend("2026-10-05", 1, "50"), spend("2026-11-05", 1, "40")];
        let paying = |amount: &str| {
            let mut sums = spends();
            sums.push(sum("2026-11-10", Bill, amount));
            (sums, vec![payment(1, 9, amount, "2026-11-10")])
        };
        let opening = || settings("1000", "2026-10-01");
        let porto = || vec![card(1, "Porto", 3, 10)];
        let month = |month: &str, (sums, paid): (Vec<DaySum>, Vec<Payment>)| {
            with_bills(month, opening(), sums, porto(), paid, "2026-11-20")
        };

        let november = month("2026-11", paying("30"));
        let december = month("2026-12", paying("30"));
        let mut both_paid = paying("30");
        both_paid.0.push(sum("2026-12-10", Bill, "60"));
        both_paid.1.push(payment(1, 10, "60", "2026-12-10"));
        let settled = month("2026-12", both_paid);
        let overpaid = month("2026-12", paying("70"));

        assert_eq!(
            fatura_rows(&november),
            [(
                "Porto".into(),
                money("30"),
                date("2026-11-10"),
                true,
                true,
                false
            )]
        );
        assert_eq!(
            fatura_rows(&december),
            [(
                "Porto".into(),
                money("60"),
                date("2026-12-10"),
                true,
                false,
                false
            )]
        );
        assert_eq!(december.projected_balance, money("910"));
        assert_eq!(settled.days[30].balance, money("910"));
        assert_eq!(settled.projected_balance, money("910"));
        assert_eq!(overpaid.bills_of_month[0].amount, money("40"));
        assert_eq!(overpaid.projected_balance, money("890"));
    }

    #[test]
    fn d28_a_card_id_without_a_card_counts_on_its_date() {
        let view = with_bills(
            "2026-11",
            settings("1000", "2026-11-01"),
            vec![spend("2026-11-02", 7, "20"), spend("2026-10-30", 7, "5")],
            vec![card(1, "Porto", 3, 10)],
            vec![],
            "2026-11-05",
        );

        assert_eq!(view.days[1].daily, money("20"));
        assert_eq!(view.days[1].balance, money("980"));
        assert_eq!(view.days[0].balance, money("1000"));
        assert!(view.bills_of_month.is_empty());
    }

    fn payment(bill: u128, transaction: u128, amount: &str, on: &str) -> Payment {
        Payment {
            bill_id: uuid::Uuid::from_u128(bill),
            transaction_id: uuid::Uuid::from_u128(transaction),
            amount: money(amount),
            date: date(on),
        }
    }

    #[test]
    fn bill_rule_1_an_unpaid_bill_lowers_the_projection() {
        let view = with_bills(
            "2026-11",
            settings("1000", "2026-11-01"),
            vec![],
            vec![bill(1, "Aluguel", "2259.56", 5)],
            vec![],
            "2026-11-05",
        );

        assert_eq!(view.days.last().unwrap().balance, money("1000"));
        assert_eq!(view.projected_balance, money("-1259.56"));
        assert_eq!(view.projected_tier, Tier::Red);
        assert_eq!(
            view.bills_of_month,
            [BillOfMonth {
                bill_id: uuid::Uuid::from_u128(1),
                name: "Aluguel".into(),
                icon: "home".into(),
                color: "cat-6".into(),
                amount: money("2259.56"),
                due_date: date("2026-11-05"),
                paid: false,
                transaction_id: None,
                overdue: false,
                lands_on: Some(date("2026-11-05")),
                is_card: false,
                installment: None,
                installments: None,
                variable: false,
                adjusted: false,
                skipped: false,
            }]
        );
    }

    #[test]
    fn bill_rules_2_and_3_a_paid_bill_is_in_the_ledger_only() {
        let view = with_bills(
            "2026-11",
            settings("1000", "2026-11-01"),
            vec![sum("2026-11-05", Bill, "2300")],
            vec![bill(1, "Aluguel", "2259.56", 5)],
            vec![payment(1, 9, "2300", "2026-11-05")],
            "2026-11-20",
        );

        assert_eq!(view.projected_balance, money("-1300"));
        assert_eq!(view.projected_balance, view.days.last().unwrap().balance);
        let paid = &view.bills_of_month[0];
        assert!(paid.paid && !paid.overdue);
        assert_eq!(paid.transaction_id, Some(uuid::Uuid::from_u128(9)));
        assert_eq!(paid.amount, money("2300"));
        assert_eq!(paid.lands_on, None);
        assert!(
            view.days
                .iter()
                .all(|day| day.projected_balance == day.balance)
        );
    }

    #[test]
    fn bill_rule_7_overdue_starts_the_day_after_the_due_date() {
        let bills = || vec![bill(1, "Luz", "100", 5), bill(2, "Internet", "100", 6)];
        let on = |today: &str| {
            with_bills(
                "2026-11",
                settings("0", "2026-11-01"),
                vec![],
                bills(),
                vec![],
                today,
            )
            .bills_of_month
            .iter()
            .map(|bill| bill.overdue)
            .collect::<Vec<_>>()
        };

        assert_eq!(on("2026-11-05"), [false, false]);
        assert_eq!(on("2026-11-06"), [true, false]);
        assert_eq!(on("2026-11-07"), [true, true]);
    }

    fn auto(bill: &MonthBill, after: &str, today: &str) -> Vec<NaiveDate> {
        auto_paid(
            bill,
            &BillMonths::new(),
            date(after),
            date("2026-01-01"),
            date(today),
        )
    }

    #[test]
    fn d56_a_months_own_amount_is_what_it_owes_and_other_months_keep_the_bills() {
        let rent = || bill(1, "Aluguel", "1045.26", 24);
        let december = with_months(
            "2026-12",
            settings("1000", "2026-11-01"),
            vec![rent()],
            vec![adjusted(1, "2026-12-01", "1100.00")],
            vec![],
            "2026-11-27",
        );
        let row = &december.bills_of_month[0];
        assert_eq!(
            (row.amount, row.adjusted, row.skipped),
            (money("1100.00"), true, false)
        );
        assert_eq!(
            december.projected_balance,
            money("-100.00") - money("1045.26")
        );

        let january = with_months(
            "2027-01",
            settings("1000", "2026-11-01"),
            vec![rent()],
            vec![adjusted(1, "2026-12-01", "1100.00")],
            vec![],
            "2026-11-27",
        );
        assert_eq!(
            (
                january.bills_of_month[0].amount,
                january.bills_of_month[0].adjusted
            ),
            (money("1045.26"), false)
        );
    }

    #[test]
    fn d56_a_skipped_month_stays_listed_and_counts_nowhere() {
        let view = with_months(
            "2026-11",
            settings("1000", "2026-11-01"),
            vec![bill(1, "Aluguel", "1045.26", 24)],
            vec![skipped(1, "2026-11-01")],
            vec![],
            "2026-11-27",
        );
        let row = &view.bills_of_month[0];
        assert_eq!(
            (row.skipped, row.overdue, row.lands_on, row.paid),
            (true, false, None, false)
        );
        assert_eq!(row.amount, money("1045.26"));
        assert_eq!(view.projected_balance, money("1000"));
        assert!(
            view.days
                .iter()
                .all(|day| day.projected_balance == money("1000"))
        );

        let next = with_months(
            "2026-12",
            settings("1000", "2026-11-01"),
            vec![bill(1, "Aluguel", "1045.26", 24)],
            vec![skipped(1, "2026-11-01")],
            vec![],
            "2026-12-02",
        );
        assert!(
            next.bills_of_month
                .iter()
                .all(|row| row.due_date != date("2026-11-24")),
            "never carried"
        );
    }

    #[test]
    fn d56_a_payment_wins_over_the_override() {
        let view = with_months(
            "2026-11",
            settings("1000", "2026-11-01"),
            vec![bill(1, "Aluguel", "1045.26", 24)],
            vec![BillMonth {
                amount: Some(money("1100.00")),
                ..skipped(1, "2026-11-01")
            }],
            vec![payment(1, 9, "1050.00", "2026-11-24")],
            "2026-11-27",
        );
        let row = &view.bills_of_month[0];
        assert_eq!(
            (row.paid, row.amount, row.adjusted, row.skipped),
            (true, money("1050.00"), false, false)
        );
    }

    #[test]
    fn d56_skipping_a_parcela_keeps_the_other_numbers() {
        // Parcela 10 in July 2027: December is 3/10, January 4/10.
        let fies = MonthBill {
            last_month: Some(date("2027-07-01")),
            installments: Some(10),
            ..bill(1, "FIES", "300", 10)
        };
        let january = with_months(
            "2027-01",
            settings("1000", "2026-11-01"),
            vec![fies],
            vec![skipped(1, "2026-12-01")],
            vec![],
            "2026-11-27",
        );
        assert_eq!(january.bills_of_month[0].installment, Some(4));
    }

    #[test]
    fn d56_the_forecast_lands_the_override_and_never_a_skipped_month() {
        // Due on the 28th: November lands on 28 Nov (after today), December on 28 Dec.
        let run = |bill_months| {
            forecast(ForecastInput {
                settings: settings("1000", "2026-11-01"),
                sums: vec![],
                bills: vec![bill(1, "Aluguel", "1000", 28)],
                bill_months,
                payments: vec![],
                today: date("2026-11-27"),
            })
        };
        let on = |forecast: &Forecast, day: &str| {
            forecast
                .days
                .iter()
                .find(|each| each.date == date(day))
                .unwrap()
                .projected_balance
        };
        let adjusted_run = run(vec![adjusted(1, "2026-12-01", "400")]);
        assert_eq!(on(&adjusted_run, "2026-12-28"), money("-400"));
        let skipped_run = run(vec![skipped(1, "2026-12-01")]);
        assert_eq!(on(&skipped_run, "2026-12-28"), money("0"));
        assert_eq!(on(&skipped_run, "2027-01-28"), money("-1000"));
    }

    #[test]
    fn d56_auto_pay_never_pays_a_skipped_month() {
        let rent = bill(1, "Aluguel", "1500", 10);
        let overrides = bill_months(vec![skipped(1, "2026-10-01")]);
        assert_eq!(
            auto_paid(
                &rent,
                &overrides,
                date("2026-09-20"),
                date("2026-01-01"),
                date("2026-11-25")
            ),
            [date("2026-11-10")]
        );
    }

    #[test]
    fn d55_a_fixed_conta_pays_on_each_due_day_after_the_watermark() {
        let on = |due_day| {
            auto(
                &bill(1, "Aluguel", "1500", due_day),
                "2026-09-20",
                "2026-11-25",
            )
        };

        assert_eq!(on(10), [date("2026-10-10"), date("2026-11-10")]);
        assert_eq!(on(20), [date("2026-10-20"), date("2026-11-20")]);
        assert_eq!(
            on(25),
            [date("2026-09-25"), date("2026-10-25"), date("2026-11-25")]
        );
        assert_eq!(on(26), [date("2026-09-26"), date("2026-10-26")]);
    }

    #[test]
    fn d55_variable_and_cards_never_pay_themselves() {
        let variable = MonthBill {
            variable: true,
            ..bill(1, "Luz", "200", 10)
        };

        assert!(auto(&variable, "2026-09-20", "2026-11-25").is_empty());
        assert!(auto(&card(2, "Nubank", 3, 10), "2026-09-20", "2026-11-25").is_empty());
    }

    #[test]
    fn d55_auto_pay_keeps_the_owed_gates() {
        let rent = || bill(1, "Aluguel", "1500", 10);
        let opened = auto_paid(
            &rent(),
            &BillMonths::new(),
            date("2026-08-01"),
            date("2026-10-01"),
            date("2026-11-25"),
        );
        let started = MonthBill {
            active_since: date("2026-10-11"),
            ..rent()
        };
        let stopped = MonthBill {
            last_month: Some(date("2026-09-01")),
            ..rent()
        };
        let parcelas = MonthBill {
            last_month: Some(date("2027-01-01")),
            installments: Some(3),
            ..rent()
        };
        let february = MonthBill {
            due_day: 31,
            ..rent()
        };

        assert_eq!(opened, [date("2026-10-10"), date("2026-11-10")]);
        assert_eq!(
            auto(&started, "2026-08-01", "2026-11-25"),
            [date("2026-11-10")]
        );
        assert_eq!(
            auto(&stopped, "2026-08-01", "2026-11-25"),
            [date("2026-08-10"), date("2026-09-10")]
        );
        assert_eq!(
            auto(&parcelas, "2026-08-01", "2026-11-25"),
            [date("2026-11-10")]
        );
        assert_eq!(
            auto(&february, "2027-02-01", "2027-03-01"),
            [date("2027-02-28")]
        );
        assert_eq!(
            auto(&february, "2028-02-01", "2028-03-01"),
            [date("2028-02-29")]
        );
    }

    #[test]
    fn d55_the_watermark_day_itself_is_never_paid_again() {
        let rent = bill(1, "Aluguel", "1500", 10);

        assert_eq!(
            auto(&rent, "2026-10-10", "2026-11-25"),
            [date("2026-11-10")]
        );
        assert!(auto(&rent, "2026-11-10", "2026-11-25").is_empty());
    }

    #[test]
    fn bill_rule_8_a_past_month_keeps_its_unpaid_bills_overdue_and_projected() {
        let view = with_bills(
            "2026-12",
            settings("1000", "2026-11-01"),
            vec![sum("2026-12-10", Bill, "50")],
            vec![bill(1, "Luz", "120", 31), bill(2, "Internet", "50", 10)],
            vec![payment(2, 9, "50", "2026-12-10")],
            "2027-01-15",
        );

        assert_eq!(
            view.bills_of_month
                .iter()
                .map(|bill| (bill.due_date, bill.paid, bill.overdue))
                .collect::<Vec<_>>(),
            [
                (date("2026-12-31"), false, true),
                (date("2026-12-10"), true, false)
            ]
        );
        assert_eq!(view.projected_balance, money("830"));
        assert_eq!(view.projected_tier, Tier::Yellow);
        assert!(
            view.bills_of_month
                .iter()
                .all(|bill| bill.lands_on.is_none())
        );
        assert!(
            view.days
                .iter()
                .all(|day| day.projected_balance == day.balance && day.projected_tier == day.tier)
        );
    }

    #[test]
    fn bill_rule_13_the_projected_tier_uses_the_daily_thresholds() {
        let tiers: Vec<Tier> = ["500.01", "500", "1500.01"]
            .iter()
            .map(|amount| {
                with_bills(
                    "2026-11",
                    settings("1500", "2026-11-01"),
                    vec![],
                    vec![bill(1, "Luz", amount, 5)],
                    vec![],
                    "2026-11-01",
                )
                .projected_tier
            })
            .collect();

        assert_eq!(tiers, [Tier::Yellow, Tier::LightGreen, Tier::LightRed]);
    }

    #[test]
    fn forecast_rule_1_the_owners_november_turns_red_on_the_23rd_and_back_on_the_30th() {
        let view = with_bills(
            "2026-11",
            settings("6150", "2026-11-01"),
            vec![
                sum("2026-11-23", Bill, "1925"),
                sum("2026-11-25", Daily, "241"),
                sum("2026-11-30", Income, "4575"),
            ],
            vec![
                bill(1, "Cartão", "4900", 23),
                bill(2, "Financiamento", "2000", 28),
                bill(3, "Condomínio", "1168", 30),
            ],
            vec![],
            "2026-11-10",
        );
        let projected = |day: usize| {
            let day = &view.days[day - 1];
            (day.projected_balance, day.projected_tier)
        };

        assert!(
            view.days[..22]
                .iter()
                .all(|day| day.projected_balance == day.balance)
        );
        assert_eq!(projected(22), (money("6150"), Tier::Green));
        assert_eq!(projected(23), (money("-675"), Tier::Red));
        assert_eq!(projected(25), (money("-916"), Tier::Red));
        assert_eq!(projected(28), (money("-2916"), Tier::Red));
        assert_eq!(projected(30), (money("491"), Tier::Yellow));
        assert_eq!(view.days[22].balance, money("4225"));
        assert_eq!(view.days[29].balance, money("8559"));
        assert_eq!(view.projected_balance, view.days[29].projected_balance);
        assert_eq!(
            view.bills_of_month
                .iter()
                .map(|bill| bill.lands_on)
                .collect::<Vec<_>>(),
            [
                Some(date("2026-11-23")),
                Some(date("2026-11-28")),
                Some(date("2026-11-30"))
            ]
        );
    }

    #[test]
    fn forecast_rule_2_a_past_due_bill_lands_once_on_today() {
        let view = with_bills(
            "2026-11",
            settings("1200", "2026-11-01"),
            vec![],
            vec![bill(1, "Aluguel", "1800", 10)],
            vec![],
            "2026-11-20",
        );
        let aluguel = &view.bills_of_month[0];

        assert_eq!(
            (aluguel.overdue, aluguel.lands_on),
            (true, Some(date("2026-11-20")))
        );
        assert_eq!(view.days[9].projected_balance, money("1200"));
        assert_eq!(view.days[18].projected_balance, money("1200"));
        assert_eq!(
            (
                view.days[19].projected_balance,
                view.days[19].projected_tier,
                view.days[19].balance
            ),
            (money("-600"), Tier::Red, money("1200"))
        );
        assert_eq!(view.days[29].projected_balance, money("-600"));
        assert_eq!(view.projected_balance, money("-600"));
    }

    #[test]
    fn forecast_rule_7_a_bill_due_before_the_opening_date_is_already_in_the_opening_balance() {
        let view = with_bills(
            "2026-11",
            settings("1000", "2026-11-20"),
            vec![],
            vec![bill(1, "Aluguel", "1600", 5)],
            vec![],
            "2026-11-20",
        );
        let aluguel = &view.bills_of_month[0];

        assert_eq!(
            (aluguel.paid, aluguel.overdue, aluguel.lands_on),
            (false, false, None)
        );
        assert_eq!(view.days[19].projected_balance, money("1000"));
        assert_eq!(view.days[29].projected_balance, money("1000"));
        assert_eq!(view.projected_balance, money("1000"));
    }

    #[test]
    fn forecast_rule_2_a_bill_due_today_lands_today_without_being_overdue() {
        let view = with_bills(
            "2026-11",
            settings("0", "2026-11-01"),
            vec![],
            vec![bill(1, "Luz", "100", 10)],
            vec![],
            "2026-11-10",
        );
        let luz = &view.bills_of_month[0];

        assert_eq!(
            (luz.overdue, luz.lands_on),
            (false, Some(date("2026-11-10")))
        );
        assert_eq!(view.days[8].projected_balance, money("0"));
        assert_eq!(view.days[9].projected_balance, money("-100"));
    }

    #[test]
    fn forecast_a_late_due_day_lands_on_the_last_day_of_a_coming_month() {
        let view = with_bills(
            "2027-02",
            settings("1000", "2026-11-01"),
            vec![],
            vec![bill(1, "Cartão", "300", 29)],
            vec![],
            "2026-11-10",
        );

        assert_eq!(view.days.len(), 28);
        assert_eq!(view.bills_of_month[0].lands_on, Some(date("2027-02-28")));
        assert_eq!(view.days[26].projected_balance, money("100"));
        assert_eq!(
            (
                view.days[27].projected_balance,
                view.days[27].projected_tier
            ),
            (money("-200"), Tier::LightRed)
        );
        assert_eq!(view.projected_balance, view.days[27].projected_balance);
    }

    #[test]
    fn sol55_last_months_unpaid_bill_lands_today_beside_this_months() {
        let view = with_bills(
            "2026-11",
            settings("1200", "2026-10-01"),
            vec![sum("2026-11-10", Bill, "1800")],
            vec![bill(1, "Aluguel", "1800", 10)],
            vec![payment(1, 9, "1800", "2026-11-10")],
            "2026-11-20",
        );

        assert_eq!(
            view.bills_of_month
                .iter()
                .map(|bill| (bill.due_date, bill.paid, bill.overdue, bill.lands_on))
                .collect::<Vec<_>>(),
            [
                (date("2026-10-10"), false, true, Some(date("2026-11-20"))),
                (date("2026-11-10"), true, false, None)
            ]
        );
        assert_eq!(view.bills_of_month[0].transaction_id, None);
        assert_eq!(view.bills_of_month[0].amount, money("1800"));
        assert_eq!(view.days[18].projected_balance, money("-600"));
        assert_eq!(
            (
                view.days[19].projected_balance,
                view.days[19].projected_tier,
                view.days[19].balance
            ),
            (money("-2400"), Tier::Red, money("-600"))
        );
        assert_eq!(view.days[29].projected_balance, money("-2400"));
        assert_eq!(view.projected_balance, money("-2400"));
    }

    #[test]
    fn sol55_a_month_carries_from_the_opening_date_and_the_bills_creation_on() {
        let made = |id, name, due_day, on: &str| MonthBill {
            active_since: date(on),
            ..bill(id, name, "100", due_day)
        };
        let view = with_bills(
            "2026-11",
            settings("1000", "2026-10-15"),
            vec![],
            vec![
                made(1, "Luz", 10, "2026-01-01"),
                made(2, "Internet", 20, "2026-10-25"),
                made(3, "Gás", 25, "2026-10-01"),
            ],
            vec![],
            "2026-11-05",
        );

        assert_eq!(
            view.bills_of_month
                .iter()
                .map(|bill| bill.due_date)
                .collect::<Vec<_>>(),
            [
                date("2026-10-25"),
                date("2026-11-10"),
                date("2026-11-20"),
                date("2026-11-25")
            ]
        );
        assert_eq!(view.days[4].projected_balance, money("900"));
        assert_eq!(view.projected_balance, money("600"));
    }

    #[test]
    fn sol55_two_unpaid_months_land_today_and_a_past_month_never_moves() {
        let bills = || vec![bill(1, "Luz", "100", 5)];
        let november = with_bills(
            "2026-11",
            settings("1000", "2026-09-01"),
            vec![],
            bills(),
            vec![],
            "2026-11-03",
        );
        let october = with_bills(
            "2026-10",
            settings("1000", "2026-09-01"),
            vec![],
            bills(),
            vec![],
            "2026-11-03",
        );

        assert_eq!(
            november
                .bills_of_month
                .iter()
                .map(|bill| bill.due_date)
                .collect::<Vec<_>>(),
            [date("2026-09-05"), date("2026-10-05"), date("2026-11-05")]
        );
        assert_eq!(november.days[1].projected_balance, money("1000"));
        assert_eq!(november.days[2].projected_balance, money("800"));
        assert_eq!(november.days[4].projected_balance, money("700"));
        assert_eq!(october.bills_of_month.len(), 1);
        assert!(
            october
                .days
                .iter()
                .all(|day| day.projected_balance == day.balance)
        );
    }

    fn since(id: u128, name: &str, due_day: i16, on: &str) -> MonthBill {
        MonthBill {
            active_since: date(on),
            ..bill(id, name, "100", due_day)
        }
    }

    fn rows(view: &MonthView) -> Vec<(NaiveDate, bool, Option<NaiveDate>)> {
        view.bills_of_month
            .iter()
            .map(|bill| (bill.due_date, bill.overdue, bill.lands_on))
            .collect()
    }

    #[test]
    fn sol55_a_resumed_bill_owes_nothing_from_its_pause() {
        let resumed = || {
            vec![
                since(1, "Luz", 5, "2026-11-10"),
                since(2, "Aluguel", 10, "2026-11-10"),
            ]
        };
        let opening = || settings("1000", "2026-01-01");
        let november = with_bills(
            "2026-11",
            opening(),
            vec![],
            resumed(),
            vec![],
            "2026-11-12",
        );
        let october = with_bills(
            "2026-10",
            opening(),
            vec![],
            resumed(),
            vec![],
            "2026-11-12",
        );

        assert_eq!(
            rows(&november),
            [
                (date("2026-11-05"), false, None),
                (date("2026-11-10"), true, Some(date("2026-11-12")))
            ]
        );
        assert_eq!(november.projected_balance, money("900"));
        assert!(october.bills_of_month.iter().all(|bill| !bill.overdue));
        assert_eq!(october.projected_balance, money("1000"));
    }

    #[test]
    fn sol55_a_bill_owes_only_from_a_due_date_on_or_after_active_since() {
        let bills = || {
            vec![
                since(1, "Luz", 10, "2026-11-20"),
                since(2, "Gás", 20, "2026-11-20"),
            ]
        };
        let opening = || settings("1000", "2026-11-01");
        let november = with_bills("2026-11", opening(), vec![], bills(), vec![], "2026-11-20");
        let december = with_bills("2026-12", opening(), vec![], bills(), vec![], "2026-11-20");

        assert_eq!(
            rows(&november),
            [
                (date("2026-11-10"), false, None),
                (date("2026-11-20"), false, Some(date("2026-11-20")))
            ]
        );
        assert_eq!(november.days[19].projected_balance, money("900"));
        assert_eq!(november.projected_balance, money("900"));
        assert_eq!(december.days[0].projected_balance, money("900"));
        assert_eq!(december.projected_balance, money("700"));
    }

    #[test]
    fn d35_a_bill_owes_up_to_its_last_month_and_lists_nothing_after() {
        let stopped = || MonthBill {
            last_month: Some(date("2026-11-01")),
            ..since(1, "Inglês", 20, "2026-01-01")
        };
        let opening = || settings("1000", "2026-11-01");
        let november = with_bills(
            "2026-11",
            opening(),
            vec![],
            vec![stopped()],
            vec![],
            "2026-11-12",
        );
        let december = with_bills(
            "2026-12",
            opening(),
            vec![],
            vec![stopped()],
            vec![],
            "2026-11-12",
        );

        assert_eq!(
            rows(&november),
            [(date("2026-11-20"), false, Some(date("2026-11-20")))]
        );
        assert!(december.bills_of_month.is_empty());
        assert_eq!(december.projected_balance, money("900"));
    }

    #[test]
    fn d35_the_carry_and_the_forecast_stop_at_the_last_month() {
        let stopped = || MonthBill {
            last_month: Some(date("2026-10-01")),
            ..since(1, "Inglês", 20, "2026-01-01")
        };
        let november = with_bills(
            "2026-11",
            settings("1000", "2026-09-01"),
            vec![],
            vec![stopped()],
            vec![],
            "2026-11-12",
        );
        let coming = ahead(
            settings("1000", "2026-09-01"),
            vec![],
            vec![stopped()],
            "2026-11-12",
        );

        assert_eq!(
            rows(&november),
            [
                (date("2026-09-20"), true, Some(date("2026-11-12"))),
                (date("2026-10-20"), true, Some(date("2026-11-12")))
            ]
        );
        assert_eq!(november.projected_balance, money("800"));
        assert_eq!(coming.days.last().unwrap().projected_balance, money("800"));
    }

    #[test]
    fn d35_each_row_holds_the_parcela_of_its_own_month() {
        let fies = MonthBill {
            last_month: Some(date("2026-11-01")),
            installments: Some(6),
            ..since(1, "Fies", 20, "2026-01-01")
        };
        let view = with_bills(
            "2026-11",
            settings("1000", "2026-10-01"),
            vec![],
            vec![fies],
            vec![],
            "2026-11-12",
        );

        let parcelas: Vec<_> = view
            .bills_of_month
            .iter()
            .map(|bill| (bill.due_date, bill.installment, bill.installments))
            .collect();
        assert_eq!(
            parcelas,
            [
                (date("2026-10-20"), Some(5), Some(6)),
                (date("2026-11-20"), Some(6), Some(6))
            ]
        );
    }

    #[test]
    fn sol55_a_payment_in_an_earlier_month_stops_its_carry() {
        let view = with_bills(
            "2026-11",
            settings("1000", "2026-09-01"),
            vec![sum("2026-10-12", Bill, "100")],
            vec![bill(1, "Luz", "100", 10)],
            vec![payment(1, 9, "100", "2026-10-12")],
            "2026-11-20",
        );

        assert_eq!(
            rows(&view),
            [
                (date("2026-09-10"), true, Some(date("2026-11-20"))),
                (date("2026-11-10"), true, Some(date("2026-11-20")))
            ]
        );
        assert_eq!(view.projected_balance, money("700"));
    }

    #[test]
    fn sol55_a_due_day_31_carries_on_each_months_last_day() {
        let view = with_bills(
            "2027-03",
            settings("1000", "2026-11-01"),
            vec![],
            vec![bill(1, "Cartão", "100", 31)],
            vec![],
            "2027-03-05",
        );

        assert_eq!(
            view.bills_of_month
                .iter()
                .map(|bill| (bill.due_date, bill.lands_on))
                .collect::<Vec<_>>(),
            [
                (date("2026-11-30"), Some(date("2027-03-05"))),
                (date("2026-12-31"), Some(date("2027-03-05"))),
                (date("2027-01-31"), Some(date("2027-03-05"))),
                (date("2027-02-28"), Some(date("2027-03-05"))),
                (date("2027-03-31"), Some(date("2027-03-31")))
            ]
        );
        assert_eq!(view.days[4].projected_balance, money("600"));
        assert_eq!(view.projected_balance, money("500"));
    }

    fn balances(view: &MonthView) -> Vec<Decimal> {
        view.days.iter().map(|day| day.balance).collect()
    }

    #[test]
    fn rule_1_the_balance_walks_the_ledger_day_by_day() {
        let sums = vec![
            sum("2026-11-02", Income, "500"),
            sum("2026-11-03", Bill, "300"),
            sum("2026-11-03", Daily, "50"),
        ];

        let view = view(
            "2026-11",
            settings("1000", "2026-11-01"),
            sums,
            "2026-11-05",
        );

        assert_eq!(view.month, "2026-11");
        assert_eq!(view.days.len(), 30);
        assert_eq!(
            &balances(&view)[..4],
            [money("1000"), money("1500"), money("1150"), money("1150")]
        );
        assert_eq!(
            (view.days[2].income, view.days[2].bills, view.days[2].daily),
            (money("0"), money("300"), money("50"))
        );
        assert_eq!(view.days[1].income, money("500"));
        assert!(view.bills_of_month.is_empty());
        assert!(
            view.days
                .iter()
                .all(|day| day.projected_balance == day.balance)
        );
    }

    #[test]
    fn the_saving_rate_is_saved_over_income_with_one_decimal() {
        let at = |saved: &str, income: &str| {
            month_view(MonthInput {
                month: date("2026-11-01"),
                settings: settings("0", "2026-11-01"),
                sums: vec![],
                bills: vec![],
                bill_months: vec![],
                payments: vec![],
                spending: Spending {
                    income: money(income),
                    spent: money("1000"),
                    saved: money(saved),
                },
                today: date("2026-11-05"),
            })
        };

        let view = at("400.55", "3000");

        assert_eq!(
            view.totals,
            Totals {
                income: money("3000"),
                spent: money("1000"),
                saved: money("400.55"),
                performance: money("1599.45"),
            }
        );
        assert_eq!(view.savings.saved, money("400.55"));
        assert_eq!(view.savings.rate_pct.unwrap().to_string(), "13.4");
        assert_eq!(at("1", "8").savings.rate_pct.unwrap().to_string(), "12.5");
        assert_eq!(
            at("-50", "1000").savings.rate_pct.unwrap().to_string(),
            "-5.0"
        );
    }

    #[test]
    fn a_resgate_is_withdrawn_not_income_and_still_returns_to_the_balance() {
        let view = month_view(MonthInput {
            month: date("2026-11-01"),
            settings: settings("100", "2026-11-01"),
            sums: vec![
                sum("2026-11-02", Income, "1000"),
                sum("2026-11-03", Bill, "4420"),
                resgate("2026-11-10", "50"),
            ],
            bills: vec![],
            bill_months: vec![],
            payments: vec![],
            spending: Spending::default(),
            today: date("2026-11-20"),
        });

        let day_10 = &view.days[9];
        assert_eq!(
            (day_10.income, day_10.withdrawn, day_10.balance),
            (money("0"), money("50"), money("-3270"))
        );
        assert_eq!(view.days[2].withdrawn, money("0"));
        assert_eq!(view.balance_today, money("-3270"));
    }

    #[test]
    fn rule_2_income_and_bill_of_the_same_amount_cancel_on_the_day() {
        let sums = vec![
            sum("2026-11-02", Income, "715"),
            sum("2026-11-02", Bill, "715"),
        ];

        let view = view(
            "2026-11",
            settings("1000", "2026-11-01"),
            sums,
            "2026-11-05",
        );

        assert_eq!(view.days[1].balance, money("1000"));
        assert_eq!(
            (view.days[1].income, view.days[1].bills),
            (money("715"), money("715"))
        );
    }

    #[test]
    fn rules_3_and_4_lower_bounds_are_inclusive() {
        let thresholds = settings("0", "2026-11-01");
        for (balance, expected) in [
            ("-500.01", Tier::Red),
            ("-500", Tier::LightRed),
            ("-0.01", Tier::LightRed),
            ("0", Tier::Yellow),
            ("999.99", Tier::Yellow),
            ("1000", Tier::LightGreen),
            ("1999.99", Tier::LightGreen),
            ("2000", Tier::Green),
        ] {
            assert_eq!(tier(money(balance), &thresholds), expected, "{balance}");
        }
    }

    #[test]
    fn rule_5_the_balance_carries_into_the_next_month() {
        let sums = || {
            vec![
                sum("2026-11-10", Daily, "680"),
                sum("2026-12-01", Daily, "20"),
            ]
        };
        let opening = settings("1000", "2026-11-01");

        let november = view("2026-11", opening.clone(), sums(), "2026-12-05");
        let december = view("2026-12", opening, sums(), "2026-12-05");

        assert_eq!(november.projected_balance, money("320"));
        assert_eq!(december.days[0].balance, money("300"));
        assert_eq!(december.days[0].daily, money("20"));
    }

    #[test]
    fn rule_6_the_balance_carries_into_the_next_year() {
        let sums = vec![
            sum("2026-12-31", Bill, "80"),
            sum("2027-01-01", Income, "5000"),
        ];

        let january = view("2027-01", settings("0", "2026-12-01"), sums, "2027-01-15");

        assert_eq!(january.days[0].balance, money("4920"));
        assert_eq!(january.days[0].tier, Tier::Green);
        assert_eq!(january.days[0].income, money("5000"));
    }

    #[test]
    fn rule_8_a_future_month_repeats_the_last_known_balance() {
        let sums = vec![sum("2026-11-03", Daily, "50")];

        let march = view(
            "2027-03",
            settings("1000", "2026-11-01"),
            sums,
            "2026-11-05",
        );

        assert_eq!(march.days.len(), 31);
        assert!(
            march
                .days
                .iter()
                .all(|day| day.balance == money("950") && day.is_future && !day.is_today)
        );
        assert_eq!(march.balance_today, money("950"));
    }

    #[test]
    fn rule_9_a_negative_opening_without_entries_stays_red() {
        let view = view(
            "2026-11",
            settings("-1200", "2026-11-01"),
            vec![],
            "2026-11-05",
        );

        assert!(
            view.days
                .iter()
                .all(|day| day.balance == money("-1200") && day.tier == Tier::Red)
        );
        assert_eq!(
            (view.balance_today_tier, view.projected_tier),
            (Tier::Red, Tier::Red)
        );
    }

    #[test]
    fn rule_14_balance_today_depends_on_where_the_month_sits() {
        let sums = || {
            vec![
                sum("2026-11-02", Income, "500"),
                sum("2026-11-10", Daily, "100"),
            ]
        };
        let opening = || settings("1000", "2026-11-01");

        let current = view("2026-11", opening(), sums(), "2026-11-05");
        let past = view("2026-11", opening(), sums(), "2026-12-10");
        let future = view("2026-12", opening(), sums(), "2026-11-05");

        assert_eq!(current.balance_today, money("1500"));
        assert_eq!(current.balance_today_tier, Tier::LightGreen);
        assert_eq!(current.projected_balance, money("1400"));
        let today: Vec<u32> = current
            .days
            .iter()
            .filter(|day| day.is_today)
            .map(|day| day.date.day())
            .collect();
        assert_eq!(today, [5]);
        assert!(!current.days[4].is_future && current.days[5].is_future);
        assert_eq!(past.balance_today, money("1400"));
        assert!(past.days.iter().all(|day| !day.is_today && !day.is_future));
        assert_eq!(future.balance_today, money("1500"));
        assert_eq!(future.days[0].balance, money("1400"));
    }

    #[test]
    fn rule_15_a_month_without_income_performs_at_minus_spent_and_saved() {
        let view = month_view(MonthInput {
            month: date("2026-11-01"),
            settings: settings("1000", "2026-11-01"),
            sums: vec![],
            bills: vec![],
            bill_months: vec![],
            payments: vec![],
            spending: Spending {
                income: money("0"),
                spent: money("150"),
                saved: money("20"),
            },
            today: date("2026-11-05"),
        });

        assert_eq!(view.totals.performance, money("-170"));
        assert_eq!(view.savings.rate_pct, None);
    }

    #[test]
    fn days_before_the_opening_date_show_the_opening_balance() {
        let sums = vec![sum("2026-11-05", Income, "10")];

        let view = view(
            "2026-11",
            settings("1000", "2026-11-05"),
            sums,
            "2026-11-06",
        );

        assert_eq!(
            &balances(&view)[..6],
            [
                money("1000"),
                money("1000"),
                money("1000"),
                money("1000"),
                money("1010"),
                money("1010")
            ]
        );
    }
    fn owners_sums() -> Vec<DaySum> {
        vec![
            sum("2026-11-23", Bill, "1925"),
            sum("2026-11-25", Daily, "241"),
            sum("2026-11-30", Income, "4575"),
        ]
    }

    fn owners_bills() -> Vec<MonthBill> {
        vec![
            bill(1, "Cartão", "4900", 23),
            bill(2, "Financiamento", "2000", 28),
            bill(3, "Condomínio", "1168", 30),
        ]
    }

    fn ahead(
        settings: Settings,
        sums: Vec<DaySum>,
        bills: Vec<MonthBill>,
        today: &str,
    ) -> Forecast {
        forecast(ForecastInput {
            settings,
            sums,
            bills,
            bill_months: vec![],
            payments: vec![],
            today: date(today),
        })
    }

    fn at(forecast: &Forecast, on: &str) -> (Decimal, Tier) {
        let day = forecast
            .days
            .iter()
            .find(|day| day.date == date(on))
            .unwrap();
        (day.projected_balance, day.projected_tier)
    }

    #[test]
    fn sol51_the_horizon_runs_from_today_to_the_end_of_the_eleventh_month_after() {
        let flat = ahead(settings("1000", "2026-11-01"), vec![], vec![], "2026-11-10");

        assert_eq!(flat.today, date("2026-11-10"));
        assert_eq!(flat.days.len(), 356);
        assert_eq!(flat.days[0].date, date("2026-11-10"));
        assert_eq!(flat.days.last().unwrap().date, date("2027-10-31"));
        assert!(
            flat.days
                .iter()
                .all(|day| (day.projected_balance, day.projected_tier)
                    == (money("1000"), Tier::LightGreen))
        );
        assert_eq!(horizon_end(date("2027-03-31")), date("2028-02-29"));
    }

    #[test]
    fn sol51_the_owners_november_runs_into_a_red_december_without_a_salary() {
        let year = ahead(
            settings("6150", "2026-11-01"),
            owners_sums(),
            owners_bills(),
            "2026-11-10",
        );

        assert_eq!(at(&year, "2026-11-22"), (money("6150"), Tier::Green));
        assert_eq!(at(&year, "2026-11-23"), (money("-675"), Tier::Red));
        assert_eq!(at(&year, "2026-11-28"), (money("-2916"), Tier::Red));
        assert_eq!(at(&year, "2026-11-30"), (money("491"), Tier::Yellow));
        assert_eq!(at(&year, "2026-12-22"), (money("491"), Tier::Yellow));
        assert_eq!(at(&year, "2026-12-23"), (money("-4409"), Tier::Red));
        assert_eq!(at(&year, "2026-12-31"), (money("-7577"), Tier::Red));
    }

    #[test]
    fn sol51_every_forecast_day_equals_its_month_views_day() {
        let carried = || {
            (
                settings("1200", "2026-10-01"),
                vec![
                    sum("2026-10-25", Bill, "90"),
                    sum("2026-12-05", Income, "3000"),
                ],
                vec![bill(1, "Aluguel", "1800", 10), bill(2, "Luz", "100", 25)],
                vec![payment(2, 9, "90", "2026-10-25")],
                "2026-11-20",
            )
        };
        let owners = || {
            (
                settings("6150", "2026-11-01"),
                owners_sums(),
                owners_bills(),
                vec![],
                "2026-11-10",
            )
        };
        let later = || {
            (
                settings("800", "2027-01-15"),
                vec![
                    sum("2027-02-03", Bill, "450"),
                    sum("2027-02-05", Income, "3000"),
                    sum("2027-03-10", Daily, "200"),
                ],
                vec![
                    bill(1, "Internet", "450", 3),
                    bill(2, "Aluguel", "1800", 20),
                ],
                vec![
                    payment(1, 9, "450", "2026-12-03"),
                    payment(1, 10, "450", "2027-02-03"),
                ],
                "2026-11-10",
            )
        };
        let cards = || {
            (
                settings("1000", "2026-10-01"),
                vec![
                    spend("2026-10-20", 1, "40"),
                    spend("2026-11-02", 1, "50"),
                    spend("2026-11-15", 1, "30"),
                    sum("2026-11-10", Bill, "52"),
                ],
                vec![card(1, "Porto", 3, 10), bill(2, "Luz", "100", 25)],
                vec![payment(1, 9, "52", "2026-11-10")],
                "2026-11-20",
            )
        };
        for (scenario, on) in [owners, carried, later, cards]
            .into_iter()
            .flat_map(|scenario| [(scenario, false), (scenario, true)])
        {
            let declared = |settings: Settings| {
                if on {
                    estimate(settings, "50")
                } else {
                    settings
                }
            };
            let (settings, sums, bills, payments, today) = scenario();
            let from = date(today).max(settings.opening_date);
            let year = forecast(ForecastInput {
                settings: declared(settings),
                sums,
                bills,
                bill_months: vec![],
                payments,
                today: date(today),
            });
            let months = std::iter::successors(Some(first_of(date(today))), |month| {
                month.checked_add_months(Months::new(1))
            })
            .take_while(|month| *month <= horizon_end(date(today)));
            let mut checked = 0;
            for month in months {
                let (settings, sums, bills, payments, _) = scenario();
                let month = month.format("%Y-%m").to_string();
                let view = with_bills(&month, declared(settings), sums, bills, payments, today);
                for day in view.days.iter().filter(|day| day.date >= from) {
                    assert_eq!(
                        at(&year, &day.date.to_string()),
                        (day.projected_balance, day.projected_tier),
                        "{today} {on} {}",
                        day.date
                    );
                    checked += 1;
                }
            }
            assert_eq!(checked, year.days.len(), "{today} {on}");
        }
    }

    #[test]
    fn sol51_a_carried_bill_lands_today_and_the_next_months_on_their_due_day() {
        let year = ahead(
            settings("1200", "2026-10-01"),
            vec![],
            vec![bill(1, "Aluguel", "1800", 10)],
            "2026-11-20",
        );

        assert_eq!(at(&year, "2026-11-20"), (money("-2400"), Tier::Red));
        assert_eq!(at(&year, "2026-12-09").0, money("-2400"));
        assert_eq!(at(&year, "2026-12-10").0, money("-4200"));
    }

    #[test]
    fn sol51_a_later_opening_date_starts_the_horizon_and_one_past_it_leaves_none() {
        let later = ahead(settings("500", "2027-01-15"), vec![], vec![], "2026-11-10");
        let beyond = ahead(settings("500", "2028-01-01"), vec![], vec![], "2026-11-10");

        assert_eq!(later.days[0].date, date("2027-01-15"));
        assert_eq!(later.days[0].projected_balance, money("500"));
        assert!(beyond.days.is_empty());
    }

    #[test]
    fn sol119_a_card_fatura_carries_a_partial_payment_and_lists_six_months_ahead() {
        let bills = vec![card(1, "Porto", 3, 10)];
        let sums = vec![
            spend("2026-11-02", 1, "50"),
            spend("2026-11-04", 1, "30"),
            spend("2027-01-10", 1, "20"),
        ];
        let payments = vec![payment(1, 9, "20", "2026-11-10")];
        let all = faturas(&bills, &sums, &payments);

        let november = card_fatura(&bills[0], date("2026-11-01"), &all, &payments, vec![]);
        let december = card_fatura(&bills[0], date("2026-12-01"), &all, &payments, vec![]);

        assert_eq!(
            (november.total, november.carried, november.paid),
            (money("50"), money("0"), money("20"))
        );
        assert_eq!(
            (december.total, december.carried, december.paid),
            (money("60"), money("30"), money("0"))
        );
        assert_eq!(december.month, "2026-12");
        assert_eq!(
            december
                .ahead
                .iter()
                .map(|a| (a.month.as_str(), a.total))
                .collect::<Vec<_>>(),
            [
                ("2027-01", money("0")),
                ("2027-02", money("20")),
                ("2027-03", money("0")),
                ("2027-04", money("0")),
                ("2027-05", money("0")),
                ("2027-06", money("0")),
            ]
        );
    }

    #[test]
    fn sol119_a_month_before_the_opening_is_refused() {
        assert!(check_opening(date("2026-10-01"), date("2026-11-15")).is_err());
        assert!(check_opening(date("2026-11-01"), date("2026-11-15")).is_ok());
    }

    const T: &str = "2026-11-28";

    fn e1() -> Settings {
        estimate(settings("1000", "2026-10-01"), "50")
    }

    fn day<'a>(view: &'a MonthView, on: &str) -> &'a Day {
        view.days.iter().find(|day| day.date == date(on)).unwrap()
    }

    fn projected(view: &MonthView, on: &str) -> (Decimal, Tier) {
        let day = day(view, on);
        (day.projected_balance, day.projected_tier)
    }

    #[test]
    fn e1_every_day_after_today_takes_the_estimate_across_the_month_boundary() {
        let november = view("2026-11", e1(), vec![], T);
        let december = view("2026-12", e1(), vec![], T);

        let today = day(&november, T);
        assert_eq!(
            (today.balance, today.tier, today.previsto),
            (money("1000"), Tier::LightGreen, money("0"))
        );
        assert_eq!(projected(&november, T), (money("1000"), Tier::LightGreen));
        assert_eq!(day(&november, "2026-11-27").previsto, money("0"));
        assert_eq!(day(&november, "2026-11-29").previsto, money("50"));
        assert_eq!(
            projected(&november, "2026-11-29"),
            (money("950"), Tier::Yellow)
        );
        assert_eq!(projected(&november, "2026-11-30").0, money("900"));
        assert_eq!(
            (
                november.projected_balance,
                november.projected_tier,
                november.balance_today
            ),
            (money("900"), Tier::Yellow, money("1000"))
        );
        assert_eq!(
            projected(&december, "2026-12-01"),
            (money("850"), Tier::Yellow)
        );
        assert_eq!(
            projected(&december, "2026-12-20"),
            (money("-100"), Tier::LightRed)
        );
        assert_eq!(
            projected(&december, "2026-12-28"),
            (money("-500"), Tier::LightRed)
        );
        assert_eq!(
            projected(&december, "2026-12-29"),
            (money("-550"), Tier::Red)
        );
        assert_eq!(
            projected(&december, "2026-12-31"),
            (money("-650"), Tier::Red)
        );
        assert_eq!(
            (december.projected_balance, december.projected_tier),
            (money("-650"), Tier::Red)
        );
        assert!(
            december
                .days
                .iter()
                .all(|day| (day.balance, day.tier) == (money("1000"), Tier::LightGreen))
        );
    }

    #[test]
    fn e1_the_forecast_ends_337_previstos_down_like_its_last_month() {
        let year = ahead(e1(), vec![], vec![], T);
        let october = view("2027-10", e1(), vec![], T);

        assert_eq!(year.days[0].date, date(T));
        assert_eq!(at(&year, T), (money("1000"), Tier::LightGreen));
        assert_eq!(year.days.last().unwrap().date, date("2027-10-31"));
        assert_eq!(at(&year, "2027-10-31"), (money("-15850"), Tier::Red));
        assert_eq!(
            (october.projected_balance, october.projected_tier),
            (money("-15850"), Tier::Red)
        );
    }

    #[test]
    fn e2_r9_off_keeps_the_value_and_reads_exactly_the_d16_numbers() {
        let off = Settings {
            daily_estimate_on: false,
            ..estimate(settings("6150", "2026-11-01"), "50")
        };
        let year = ahead(off.clone(), owners_sums(), owners_bills(), "2026-11-10");

        assert_eq!(at(&year, "2026-11-22"), (money("6150"), Tier::Green));
        assert_eq!(at(&year, "2026-11-23"), (money("-675"), Tier::Red));
        assert_eq!(at(&year, "2026-11-28"), (money("-2916"), Tier::Red));
        assert_eq!(at(&year, "2026-11-30"), (money("491"), Tier::Yellow));
        assert_eq!(at(&year, "2026-12-22"), (money("491"), Tier::Yellow));
        assert_eq!(at(&year, "2026-12-23"), (money("-4409"), Tier::Red));
        assert_eq!(at(&year, "2026-12-31"), (money("-7577"), Tier::Red));
        let december = with_bills(
            "2026-12",
            off.clone(),
            owners_sums(),
            owners_bills(),
            vec![],
            "2026-11-10",
        );
        assert_eq!(december.projected_balance, money("-7577"));
        assert!(december.days.iter().all(|day| day.previsto == money("0")));

        let kept = Settings {
            daily_estimate_on: false,
            ..e1()
        };
        assert_eq!(
            view("2026-12", kept.clone(), vec![], T).projected_balance,
            money("1000")
        );
        let again = Settings {
            daily_estimate_on: true,
            ..kept
        };
        assert_eq!(again.daily_estimate, Some(money("50")));
        assert_eq!(
            view("2026-12", again, vec![], T),
            view("2026-12", e1(), vec![], T)
        );
    }

    #[test]
    fn e3_today_takes_no_previsto_on_top_of_what_was_typed() {
        let november = view("2026-11", e1(), vec![sum(T, Daily, "10")], T);

        let today = day(&november, T);
        assert_eq!(
            (today.balance, today.projected_balance, today.previsto),
            (money("990"), money("990"), money("0"))
        );
        assert_eq!(projected(&november, "2026-11-29").0, money("940"));
    }

    #[test]
    fn e4_e5_typed_cash_diario_fills_the_days_cap_and_never_goes_below_zero() {
        let below = view("2026-11", e1(), vec![sum("2026-11-30", Daily, "20")], T);
        let above = view("2026-11", e1(), vec![sum("2026-11-30", Daily, "80")], T);

        let below = day(&below, "2026-11-30");
        let above = day(&above, "2026-11-30");
        assert_eq!(
            (below.balance, below.previsto, below.projected_balance),
            (money("980"), money("30"), money("900"))
        );
        assert_eq!(
            (above.balance, above.previsto, above.projected_balance),
            (money("920"), money("0"), money("870"))
        );
    }

    #[test]
    fn e6_a_card_spend_fills_no_cap_and_lands_once_in_its_fatura() {
        let bills = || vec![card(1, "Porto", 5, 15)];
        let sums = || vec![spend("2026-11-30", 1, "80")];
        let november = with_bills("2026-11", e1(), sums(), bills(), vec![], T);
        let december = with_bills("2026-12", e1(), sums(), bills(), vec![], T);

        let spent = day(&november, "2026-11-30");
        assert_eq!(
            (spent.daily, spent.previsto, spent.projected_balance),
            (money("0"), money("50"), money("900"))
        );
        assert_eq!(projected(&december, "2026-12-14").0, money("200"));
        assert_eq!(
            projected(&december, "2026-12-15"),
            (money("70"), Tier::Yellow)
        );
    }

    #[test]
    fn e7_e8_saidas_and_income_move_the_balance_not_the_previsto() {
        let november = view("2026-11", e1(), vec![sum("2026-11-29", Bill, "30")], T);
        let december = view("2026-12", e1(), vec![sum("2026-12-05", Income, "3000")], T);

        let saida = day(&november, "2026-11-29");
        assert_eq!(
            (saida.previsto, saida.projected_balance),
            (money("50"), money("920"))
        );
        let salary = day(&december, "2026-12-05");
        assert_eq!(
            (salary.balance, salary.previsto),
            (money("4000"), money("50"))
        );
        assert_eq!(
            projected(&december, "2026-12-05"),
            (money("3650"), Tier::Green)
        );
    }

    #[test]
    fn e9_an_unpaid_conta_lands_on_top_of_the_previstos() {
        let aluguel = MonthBill {
            amount: Some(money("1800")),
            ..since(1, "Aluguel", 10, "2026-12-01")
        };
        let december = with_bills("2026-12", e1(), vec![], vec![aluguel], vec![], T);

        assert_eq!(
            projected(&december, "2026-12-09"),
            (money("450"), Tier::Yellow)
        );
        assert_eq!(
            projected(&december, "2026-12-10"),
            (money("-1400"), Tier::Red)
        );
    }

    #[test]
    fn e10_a_negative_opening_takes_the_same_previstos() {
        let negative = estimate(settings("-300", "2026-10-01"), "50");
        let november = view("2026-11", negative.clone(), vec![], T);
        let december = view("2026-12", negative, vec![], T);

        assert_eq!(projected(&november, T), (money("-300"), Tier::LightRed));
        assert_eq!(
            projected(&december, "2026-12-02"),
            (money("-500"), Tier::LightRed)
        );
        assert_eq!(
            projected(&december, "2026-12-03"),
            (money("-550"), Tier::Red)
        );
    }

    #[test]
    fn e11_today_on_the_last_day_leaves_its_month_without_estimate() {
        let november = view("2026-11", e1(), vec![], "2026-11-30");
        let december = view("2026-12", e1(), vec![], "2026-11-30");

        assert_eq!(
            (november.projected_balance, november.projected_tier),
            (money("1000"), Tier::LightGreen)
        );
        assert_eq!(projected(&december, "2026-12-01").0, money("950"));
    }

    #[test]
    fn e12_the_previstos_run_into_the_next_year() {
        let december = view("2026-12", e1(), vec![], "2026-12-30");
        let january = view("2027-01", e1(), vec![], "2026-12-30");

        assert_eq!(projected(&december, "2026-12-31").0, money("950"));
        assert_eq!(december.projected_balance, money("950"));
        assert_eq!(projected(&january, "2027-01-01").0, money("900"));
        assert_eq!(
            (january.projected_balance, january.projected_tier),
            (money("-600"), Tier::Red)
        );
    }

    #[test]
    fn e13_a_leap_february_takes_29_previstos_and_a_common_one_28() {
        let leap = estimate(settings("1000", "2028-01-01"), "10");
        let february = view("2028-02", leap.clone(), vec![], "2028-02-27");
        let march = view("2028-03", leap, vec![], "2028-02-27");

        assert_eq!(projected(&february, "2028-02-28").0, money("990"));
        assert_eq!(projected(&february, "2028-02-29").0, money("980"));
        assert_eq!(february.projected_balance, money("980"));
        assert_eq!(projected(&march, "2028-03-01").0, money("970"));

        let common = estimate(settings("1000", "2027-01-01"), "10");
        let february = view("2027-02", common.clone(), vec![], "2027-02-27");
        let march = view("2027-03", common, vec![], "2027-02-27");

        assert_eq!(projected(&february, "2027-02-28").0, money("990"));
        assert_eq!(february.projected_balance, money("990"));
        assert_eq!(projected(&march, "2027-03-01").0, money("980"));
    }

    #[test]
    fn e14_a_future_opening_date_takes_previstos_from_itself_on() {
        let later = estimate(settings("1000", "2026-12-15"), "50");
        let december = view("2026-12", later.clone(), vec![], T);
        let year = ahead(later, vec![], vec![], T);

        assert!(
            december
                .days
                .iter()
                .take(14)
                .all(|day| (day.projected_balance, day.previsto) == (money("1000"), money("0")))
        );
        assert_eq!(projected(&december, "2026-12-15").0, money("950"));
        assert_eq!(
            projected(&december, "2026-12-31"),
            (money("150"), Tier::Yellow)
        );
        assert_eq!(
            (year.days[0].date, year.days[0].projected_balance),
            (date("2026-12-15"), money("950"))
        );
    }

    #[test]
    fn e15_a_past_month_reads_the_same_on_and_off() {
        let sums = || vec![sum("2026-10-05", Daily, "20")];

        assert_eq!(
            view("2026-10", e1(), sums(), T),
            view("2026-10", settings("1000", "2026-10-01"), sums(), T)
        );
    }

    fn mixed() -> Vec<DaySum> {
        vec![
            sum(T, Daily, "10"),
            sum("2026-11-30", Daily, "20"),
            sum("2026-12-05", Income, "3000"),
            sum("2026-12-07", Bill, "100"),
            sum("2026-12-09", Daily, "70"),
            resgate("2026-12-08", "50"),
        ]
    }

    #[test]
    fn r4_r6_real_balances_totals_and_savings_never_take_the_estimate() {
        for month in ["2026-11", "2026-12"] {
            let on = view(month, e1(), mixed(), T);
            let off = view(month, settings("1000", "2026-10-01"), mixed(), T);

            assert_eq!(on.totals, off.totals, "{month}");
            assert_eq!(on.savings, off.savings, "{month}");
            assert_eq!(
                (on.balance_today, on.balance_today_tier),
                (off.balance_today, off.balance_today_tier),
                "{month}"
            );
            assert_eq!(on.bills_of_month, off.bills_of_month, "{month}");
            let real = |view: &MonthView| {
                view.days
                    .iter()
                    .map(|day| {
                        (
                            day.date,
                            day.income,
                            day.withdrawn,
                            day.bills,
                            day.daily,
                            day.balance,
                            day.tier,
                        )
                    })
                    .collect::<Vec<_>>()
            };
            assert_eq!(real(&on), real(&off), "{month}");
        }
    }

    #[test]
    fn r8_each_day_moves_by_its_entries_and_its_previsto() {
        let december = view("2026-12", e1(), mixed(), T);

        for pair in december.days.windows(2) {
            let (before, day) = (&pair[0], &pair[1]);
            assert_eq!(
                day.projected_balance,
                before.projected_balance + day.income + day.withdrawn
                    - day.bills
                    - day.daily
                    - day.previsto,
                "{}",
                day.date
            );
        }
        assert_eq!(day(&december, "2026-12-09").previsto, money("0"));
        assert_eq!(day(&december, "2026-12-10").previsto, money("50"));
    }
}
