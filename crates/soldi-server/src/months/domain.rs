use std::collections::{BTreeMap, HashMap, HashSet};
use std::ops::Bound;

use chrono::{Datelike, Months, NaiveDate};
use rust_decimal::Decimal;
use soldi_types::categories::CategoryKind;
use soldi_types::months::{
    BillOfMonth, Day, Forecast, ForecastDay, MonthSavings, MonthView, Tier, Totals,
};
use soldi_types::settings::Settings;
use uuid::Uuid;

use crate::bills::domain::{due_date, fatura_due};
use crate::error::AppError;
use crate::reports::domain::percent;

/// What the ledger holds for one kind on one date; `withdrawn` marks the resgates' sum and
/// `card_id` the spends on a card (D28).
pub struct DaySum {
    pub date: NaiveDate,
    pub kind: CategoryKind,
    pub withdrawn: bool,
    pub card_id: Option<Uuid>,
    pub amount: Decimal,
}

/// An active bill with its category's icon and color, and the São Paulo day it started owing.
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
}

/// A bill's entry and its date.
pub struct Payment {
    pub bill_id: Uuid,
    pub transaction_id: Uuid,
    pub amount: Decimal,
    pub date: NaiveDate,
}

/// `month` is its first day; `sums` cover `opening_date` to the month's end (a card's spends
/// from `cards_from(opening_date)`), `payments` the
/// opening date's month to the month's end;
/// `saved` is the month's bills under `Economia` minus its resgates.
pub struct MonthInput {
    pub month: NaiveDate,
    pub settings: Settings,
    pub sums: Vec<DaySum>,
    pub bills: Vec<MonthBill>,
    pub payments: Vec<Payment>,
    pub saved: Decimal,
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

/// What `bill` owes in `month`: its amount, or a card's fatura.
fn amount_in(bill: &MonthBill, faturas: &Faturas, month: NaiveDate) -> Decimal {
    bill.amount
        .unwrap_or_else(|| faturas.get(&(bill.id, month)).copied().unwrap_or_default())
}

/// D17: a month of `bill` is owed when its due date is on or after the opening date and the
/// bill's `active_since`; a card's (D28) when its fatura is above zero, whenever it was registered.
fn owed(bill: &MonthBill, amount: Decimal, due: NaiveDate, opening: NaiveDate) -> bool {
    due >= opening
        && match bill.closing_day {
            Some(_) => amount > Decimal::ZERO,
            None => due >= bill.active_since,
        }
}

/// D17: each owed, unpaid month of `bills` from the opening date's month to `to`'s, oldest
/// first. It lands on `max(due_date, today)`.
pub fn unpaid<'a>(
    bills: &'a [MonthBill],
    faturas: &Faturas,
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
            let amount = amount_in(bill, faturas, month);
            if owed(bill, amount, due, opening) && !paid.contains(&(bill.id, month)) {
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
        payments,
        saved,
        today,
    } = input;
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
        });
    let own = bills.iter().filter_map(|bill| {
        let payment = payments
            .iter()
            .find(|payment| payment.bill_id == bill.id && (month..=end).contains(&payment.date));
        let due_date = due_date(month, bill.due_day);
        let amount = amount_in(bill, &faturas, month);
        let is_card = bill.closing_day.is_some();
        if is_card && payment.is_none() && amount == Decimal::ZERO {
            return None;
        }
        let open = payment.is_none() && owed(bill, amount, due_date, settings.opening_date);
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
        })
    });
    let bills_of_month: Vec<BillOfMonth> = carried.chain(own).collect();
    let (mut pending, lands) = landing(&unpaid_months, month, end);
    let mut balance = settings.opening_balance
        + flows
            .range(..month)
            .map(|(_, flow)| flow.net())
            .sum::<Decimal>();
    let mut totals = Flows::default();
    let days = month
        .iter_days()
        .take_while(|date| *date <= end)
        .map(|date| {
            let flow = flows.get(&date).copied().unwrap_or_default();
            balance += flow.net();
            pending += lands.get(&date).copied().unwrap_or_default();
            let projected_balance = balance - pending;
            totals.income += flow.income;
            totals.withdrawn += flow.withdrawn;
            totals.bills += flow.bills;
            totals.daily += flow.daily;
            Day {
                date,
                income: flow.income,
                withdrawn: flow.withdrawn,
                bills: flow.bills,
                daily: flow.daily,
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
        balance - pending
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
        totals: Totals {
            income: totals.income,
            bills: totals.bills,
            daily: totals.daily,
            outflow: totals.bills + totals.daily,
            performance: totals.performance(),
            saved,
            withdrawn: totals.withdrawn,
        },
        projected_balance: projected,
        projected_tier: tier(projected, &settings),
        bills_of_month,
        savings: MonthSavings {
            saved,
            rate_pct: percent(saved, totals.income),
        },
    }
}

/// `sums` cover `opening_date` (a card's spends `cards_from` it) to `horizon_end(today)`, `payments` the opening date's month to it.
pub struct ForecastInput {
    pub settings: Settings,
    pub sums: Vec<DaySum>,
    pub bills: Vec<MonthBill>,
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
        payments,
        today,
    } = input;
    let faturas = faturas(&bills, &sums, &payments);
    let flows = flows_by_day(sums, &bills, settings.opening_date);
    let from = today.max(settings.opening_date);
    let to = horizon_end(today);
    let unpaid_months = unpaid(
        &bills,
        &faturas,
        &payments,
        settings.opening_date,
        today,
        to,
    );
    let (mut pending, lands) = landing(&unpaid_months, from, to);
    let mut balance = settings.opening_balance
        + flows
            .range(..from)
            .map(|(_, flow)| flow.net())
            .sum::<Decimal>();
    let days = from
        .iter_days()
        .take_while(|date| *date <= to)
        .map(|date| {
            balance += flows.get(&date).map_or(Decimal::ZERO, Flows::net);
            pending += lands.get(&date).copied().unwrap_or_default();
            let projected_balance = balance - pending;
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
            payments,
            saved: Decimal::ZERO,
            today: date(today),
        })
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
        assert_eq!(november.totals.daily, money("0"));
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
        assert_eq!(november.totals.bills, money("52"));
        assert_eq!(november.totals.daily, money("0"));
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
        assert_eq!(
            view.totals,
            Totals {
                income: money("500"),
                bills: money("300"),
                daily: money("50"),
                outflow: money("350"),
                performance: money("150"),
                saved: money("0"),
                withdrawn: money("0"),
            }
        );
        assert!(view.bills_of_month.is_empty());
        assert_eq!(
            view.savings,
            MonthSavings {
                saved: money("0"),
                rate_pct: Some(money("0.0"))
            }
        );
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
                sums: vec![
                    sum("2026-11-02", Income, income),
                    sum("2026-11-03", Bill, "400.55"),
                ],
                bills: vec![],
                payments: vec![],
                saved: money(saved),
                today: date("2026-11-05"),
            })
        };

        let view = at("400.55", "3000");

        assert_eq!(view.totals.saved, money("400.55"));
        assert_eq!(view.totals.outflow, money("400.55"));
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
            payments: vec![],
            saved: money("4370"),
            today: date("2026-11-20"),
        });

        assert_eq!(view.totals.income, money("1000"));
        assert_eq!(view.totals.withdrawn, money("50"));
        assert_eq!(view.totals.saved, money("4370"));
        assert_eq!(view.totals.performance, money("-3420"));
        assert_eq!(view.savings.rate_pct.unwrap().to_string(), "437.0");
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
        assert_eq!(
            (view.totals.income, view.totals.bills),
            (money("715"), money("715"))
        );
        assert_eq!(view.totals.performance, money("0"));
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
        assert_eq!(december.totals.daily, money("20"));
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
        assert_eq!(january.totals.income, money("5000"));
        assert_eq!(january.totals.bills, money("0"));
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
        assert_eq!(march.totals.outflow, money("0"));
        assert_eq!(march.totals.performance, money("0"));
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
    fn rule_15_a_month_without_income_performs_at_minus_outflow() {
        let sums = vec![
            sum("2026-11-02", Bill, "100"),
            sum("2026-11-03", Daily, "50"),
        ];

        let view = view(
            "2026-11",
            settings("1000", "2026-11-01"),
            sums,
            "2026-11-05",
        );

        assert_eq!(view.totals.income, money("0"));
        assert_eq!(view.totals.outflow, money("150"));
        assert_eq!(view.totals.performance, money("-150"));
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
        for scenario in [owners, carried, later, cards] {
            let (settings, sums, bills, payments, today) = scenario();
            let from = date(today).max(settings.opening_date);
            let year = forecast(ForecastInput {
                settings,
                sums,
                bills,
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
                let view = with_bills(&month, settings, sums, bills, payments, today);
                for day in view.days.iter().filter(|day| day.date >= from) {
                    assert_eq!(
                        at(&year, &day.date.to_string()),
                        (day.projected_balance, day.projected_tier),
                        "{today} {}",
                        day.date
                    );
                    checked += 1;
                }
            }
            assert_eq!(checked, year.days.len(), "{today}");
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
}
