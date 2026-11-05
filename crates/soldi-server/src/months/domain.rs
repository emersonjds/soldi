use std::collections::BTreeMap;

use chrono::{Datelike, NaiveDate};
use rust_decimal::Decimal;
use soldi_types::categories::CategoryKind;
use soldi_types::months::{BillOfMonth, Day, MonthSavings, MonthView, Tier, Totals};
use soldi_types::settings::Settings;
use uuid::Uuid;

use crate::bills::domain::due_date;
use crate::error::AppError;
use crate::reports::domain::percent;

/// What the ledger holds for one kind on one date; `withdrawn` marks the resgates' sum.
pub struct DaySum {
    pub date: NaiveDate,
    pub kind: CategoryKind,
    pub withdrawn: bool,
    pub amount: Decimal,
}

/// An active bill with its category's icon and color.
pub struct MonthBill {
    pub id: Uuid,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub amount: Decimal,
    pub due_day: i16,
}

/// A bill's entry dated in the month.
pub struct Payment {
    pub bill_id: Uuid,
    pub transaction_id: Uuid,
    pub amount: Decimal,
}

/// `month` is its first day; `sums` cover `opening_date` to the month's end; `saved` is the
/// month's bills under `Economia` minus its resgates.
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
    let mut flows: BTreeMap<NaiveDate, Flows> = BTreeMap::new();
    for sum in sums {
        let flow = flows.entry(sum.date).or_default();
        match sum.kind {
            CategoryKind::Income if sum.withdrawn => flow.withdrawn += sum.amount,
            CategoryKind::Income => flow.income += sum.amount,
            CategoryKind::Bill => flow.bills += sum.amount,
            CategoryKind::Daily => flow.daily += sum.amount,
        }
    }
    let end = month_end(month);
    let today_or_end = today.min(end);
    let balance_today = settings.opening_balance
        + flows
            .range(..=today_or_end)
            .map(|(_, flow)| flow.net())
            .sum::<Decimal>();
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
                is_today: date == today,
                is_future: date > today,
            }
        })
        .collect();
    let bills_of_month: Vec<BillOfMonth> = bills
        .into_iter()
        .map(|bill| {
            let payment = payments.iter().find(|payment| payment.bill_id == bill.id);
            let due_date = due_date(month, bill.due_day);
            BillOfMonth {
                bill_id: bill.id,
                name: bill.name,
                icon: bill.icon,
                color: bill.color,
                amount: payment.map_or(bill.amount, |payment| payment.amount),
                due_date,
                paid: payment.is_some(),
                transaction_id: payment.map(|payment| payment.transaction_id),
                overdue: payment.is_none() && due_date < today,
            }
        })
        .collect();
    let projected = balance
        - bills_of_month
            .iter()
            .filter(|bill| !bill.paid)
            .map(|bill| bill.amount)
            .sum::<Decimal>();
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
            amount: money(amount),
            due_day,
        }
    }

    fn payment(bill: u128, transaction: u128, amount: &str) -> Payment {
        Payment {
            bill_id: uuid::Uuid::from_u128(bill),
            transaction_id: uuid::Uuid::from_u128(transaction),
            amount: money(amount),
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
            vec![payment(1, 9, "2300")],
            "2026-11-20",
        );

        assert_eq!(view.projected_balance, money("-1300"));
        assert_eq!(view.projected_balance, view.days.last().unwrap().balance);
        let paid = &view.bills_of_month[0];
        assert!(paid.paid && !paid.overdue);
        assert_eq!(paid.transaction_id, Some(uuid::Uuid::from_u128(9)));
        assert_eq!(paid.amount, money("2300"));
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
            vec![payment(2, 9, "50")],
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
}
