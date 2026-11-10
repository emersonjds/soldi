# Forecast sprint 3 (SOL-55, SOL-51, SOL-52) Implementation Plan

> **Override (orchestrator, 2026-11-10) — split rounding.** Each parcela is `total / n` **truncated toward zero** to cents (`RoundingStrategy::ToZero` in Rust, integer division of cents in TS), parcelas 1..n−1 = that value, the last = `total − each × (n − 1)`, so the last is always ≥ the others and never negative. Refuse only when `each` would be 0.00 (total under n cents). Vectors: 1000.01 in 10 → 9 × 100.00 + 100.01; 10.00 in 60 → 59 × 0.16 + 0.56; 0.05 in 2 → 0.02 + 0.03; 100.00 in 3 → 33.33 + 33.33 + 33.34; 0.05 in 6 → refused. Where the text and code below say half-even, this override wins.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Invoke the `tdd` skill before the first line; report red and green per task.

**Goal:** an unpaid conta fixa of an earlier month keeps counting today (SOL-55); the Mês screen shows the next 6/12 months by their lowest tier and red days (SOL-51); Lançar simulates a purchase, with parcelas, before writing anything (SOL-52).

**Architecture:** one forecast engine in `months::domain`: `unpaid()` lists every unpaid month of every bill (from the opening date and the bill's creation), `landing()` drops them on `max(due_date, today)`; `month_view` (SOL-55) and the new `forecast` (SOL-51) walk days with it, so a month view and the 12-month forecast agree day by day. The web summarizes forecast days (`monthsAhead`) and, in SOL-52, adds a draft's cents (`withDraft`) before summarizing again. Parcelas are `CreateTransaction.installments`, a D14 series whose amounts are split on the server.

**Tech Stack:** Rust (axum 0.8, sqlx 0.9, rust_decimal, chrono 0.4.45, utoipa), Next.js 16 static export, React Query, openapi-fetch, Vitest + Testing Library, Playwright, Biome.

Briefs (read first): `docs/specs/cards/SOL-55.md`, `SOL-51.md`, `SOL-52.md`. Rules: D7, D8, D13, D14, D16, D17 in `docs/specs/decisions.md`; `docs/specs/forecast/02-finance.md` rules 2, 3, 4, 7; `03-ux.md` §3, §4, §5, §6. Format model: `docs/plans/2026-11-10-forecast-sprint-2.md`.

## Global Constraints

- Money: `rust_decimal::Decimal` on the server, string in JSON, never a float. The web compares through `cents()` and only SOL-52's `withDraft`/`installmentCents` add integers of cents; nothing else adds money in the web.
- Every query filters by `user_id`. Queries changed: `months::repo::bills` (+ `created_on`), `months::repo::payments` (+ `date`), `transactions::repo::insert_copies` (+ amounts). Regenerate `.sqlx/` with `scripts/sqlx-prepare.sh`; `scripts/sqlx-prepare.sh --check` must pass. No migration.
- `GET /api/forecast` runs exactly 4 queries (settings, `day_sums`, `bills`, `payments`) whatever the horizon; never one per month.
- `main.rs` untouched. OpenAPI: `UPDATE_OPENAPI=1 cargo test -p soldi-server --test openapi`, then `pnpm gen:api` in `web/`; both files committed.
- FSD: `app → widgets → features → entities → shared`; an entity never imports another entity; widgets never import widgets.
- Copy exactly as in the briefs (pt-BR, `formatMoney`, `R$ 2.400,00` with cents).
- Mobile first: 375 px with no horizontal scroll, targets ≥ 44 px, form fields ≥ 16 px; color never alone (D9).
- Conventional Commits in English, no co-author trailer, no AI mention. Commit on each green step; never merge or push.
- One card per worktree, each from `developer` after the previous card merged:
  - SOL-55: `/Users/emerson/Documents/workspace/open-source/soldi-55`, `feat/SOL-55-carry-overdue-bills`, `DATABASE_URL=postgres://soldi:soldi@localhost:5441/soldi_55`
  - SOL-51: `/Users/emerson/Documents/workspace/open-source/soldi-51`, `feat/SOL-51-months-ahead`, `…/soldi_51`
  - SOL-52: `/Users/emerson/Documents/workspace/open-source/soldi-52`, `feat/SOL-52-posso-comprar`, `…/soldi_52`
- Test output through context-mode; one test file at a time in the cycle, full suites once at the gate.

## Files

| File | Card | Change |
|---|---|---|
| `crates/soldi-server/src/months/domain.rs` | 55, 51 | `MonthBill.created_on`, `Payment.date`, `Unpaid`, `unpaid`, `landing`, `flows_by_day`, `month_view` carry; then `ForecastInput`, `horizon_end`, `forecast`; tests |
| `crates/soldi-server/src/months/repo.rs` | 55 | `bills` + `created_on`, `payments` + `date` |
| `crates/soldi-server/src/months/service.rs` | 55, 51 | payments from `opening`; `forecast` |
| `crates/soldi-server/src/months/handler.rs` | 51 | `GET /api/forecast` |
| `crates/soldi-types/src/months.rs` | 55, 51 | docs; `Forecast`, `ForecastDay` |
| `crates/soldi-server/tests/months.rs` | 55, 51 | one updated, two new tests |
| `crates/soldi-types/src/transactions.rs` | 52 | `CreateTransaction.installments` |
| `crates/soldi-server/src/transactions/{domain,repo,service,handler}.rs` | 52 | split, insert amounts, 422 docs |
| `crates/soldi-server/src/{bills,cofrinhos}/service.rs`, `transactions/{domain,repo}.rs` | 52 | `installments: None` in `CreateTransaction` literals |
| `crates/soldi-server/tests/transactions.rs` | 52 | two new tests |
| `.sqlx/`, `web/openapi.json`, `web/src/shared/api/schema.d.ts` | 55, 51, 52 | regenerated |
| `web/src/shared/lib/date.ts` (+ test) | 55, 51, 52 | `monthName`; `addMonths`; `repeatDates` |
| `web/src/shared/lib/tier.ts` (+ test) | 52 | `fromCents` |
| `web/src/shared/lib/installments.ts` (+ test) | 52 | `installmentCents` |
| `web/src/entities/month/forecast-alert.ts` (+ test) | 55 | `billKey`; `causeOf` returns it for bills |
| `web/src/entities/bill/bill-queries.ts` (+ test) | 55 | `patchRow` matches the month too |
| `web/src/widgets/bills-of-month/bills-of-month.tsx` (+ test) | 55 | carried rows |
| `web/src/features/pay-bill/pay-bill-sheet.tsx` | 55 | description for another month |
| `web/src/widgets/ledger/ledger.tsx` | 55 | carried caption, `billKey` |
| `web/src/entities/forecast/forecast-query.ts`, `months-ahead.ts` (+ test), `month-chips.tsx` (+ test) | 51, 52 | new |
| `web/src/widgets/months-ahead/months-ahead.tsx` (+ test) | 51 | new |
| `web/src/app/(app)/(shell)/mes/page.tsx` (+ test) | 51 | card + drill-down |
| `web/src/entities/transaction/transaction-queries.ts` (+ test) | 52 | optimistic parcela 1 |
| `web/src/features/add-transaction/{draft-rows.ts,simulation.tsx}` (+ tests), `transaction-sheet.tsx` (+ test) | 52 | Simular, Parcelar |
| `web/src/test/stub-api.ts` | 55, 51 | `CARRIED_ALUGUEL`; `forecastFixture`, `FORECAST`, `FORECAST_FLAT`, `FORECAST_LATE_OPENING`, default `GET /api/forecast` |
| `web/e2e/forecast.spec.ts`, `months-ahead.spec.ts`, `simulate.spec.ts` | 55, 51, 52 | updated, new, new |

---

# SOL-55 — `/Users/emerson/Documents/workspace/open-source/soldi-55`, `feat/SOL-55-carry-overdue-bills`

### Task 1: `unpaid` months and the carry in `month_view` (domain)

**Files:**
- Modify: `crates/soldi-server/src/months/domain.rs` (structs at 14–49, `month_view` at 83–203, test helpers at 320–338, test `forecast_a_late_due_day_lands_on_the_last_day_of_a_coming_month`), `crates/soldi-server/src/months/repo.rs` (`bills`, `payments`: the `query_as!` macros check `MonthBill`/`Payment` at compile time, so the SQL of Task 2 Step 3 lands here)
- Model: the existing tests `forecast_rule_2_a_past_due_bill_lands_once_on_today` and `bill_rule_8_a_past_month_keeps_its_unpaid_bills_overdue_and_projected` (helpers `settings`, `sum`, `bill`, `payment`, `with_bills`, `money`, `date`).

**Interfaces:**
- Produces (Rust, `months::domain`):
  - `MonthBill { id, name, icon, color, amount, due_day, created_on: NaiveDate }`
  - `Payment { bill_id, transaction_id, amount, date: NaiveDate }`
  - `pub struct Unpaid<'a> { pub bill: &'a MonthBill, pub due_date: NaiveDate, pub lands_on: NaiveDate }`
  - `pub fn unpaid<'a>(bills: &'a [MonthBill], payments: &[Payment], opening: NaiveDate, today: NaiveDate, to: NaiveDate) -> Vec<Unpaid<'a>>`
  - private `fn landing(unpaid: &[Unpaid], from: NaiveDate, to: NaiveDate) -> (Decimal, BTreeMap<NaiveDate, Decimal>)`, `fn flows_by_day(sums: Vec<DaySum>) -> BTreeMap<NaiveDate, Flows>`, `fn first_of(date: NaiveDate) -> NaiveDate`
  - `MonthInput.payments` now covers `opening_date` to the month's end.

- [ ] **Step 1: Write the failing tests**

Helpers (test module):

```rust
    fn bill(id: u128, name: &str, amount: &str, due_day: i16) -> MonthBill {
        MonthBill {
            id: uuid::Uuid::from_u128(id),
            name: name.into(),
            icon: "home".into(),
            color: "cat-6".into(),
            amount: money(amount),
            due_day,
            created_on: date("2026-01-01"),
        }
    }

    fn payment(bill: u128, transaction: u128, amount: &str, on: &str) -> Payment {
        Payment {
            bill_id: uuid::Uuid::from_u128(bill),
            transaction_id: uuid::Uuid::from_u128(transaction),
            amount: money(amount),
            date: date(on),
        }
    }
```

Call sites: `bill_rules_2_and_3_a_paid_bill_is_in_the_ledger_only` → `payment(1, 9, "2300", "2026-11-05")`; `bill_rule_8_…` → `payment(2, 9, "50", "2026-12-10")`.

`forecast_a_late_due_day_lands_on_the_last_day_of_a_coming_month` (Nov 29, Dec 29 and Jan 29 are unpaid and land before February now):

```rust
        assert_eq!(view.days[26].projected_balance, money("100"));
        assert_eq!(
            (view.days[27].projected_balance, view.days[27].projected_tier),
            (money("-200"), Tier::LightRed)
        );
```

New tests, after `forecast_a_late_due_day_…`:

```rust
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
            created_on: date(on),
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
            view.bills_of_month.iter().map(|bill| bill.due_date).collect::<Vec<_>>(),
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
        let november = with_bills("2026-11", settings("1000", "2026-09-01"), vec![], bills(), vec![], "2026-11-03");
        let october = with_bills("2026-10", settings("1000", "2026-09-01"), vec![], bills(), vec![], "2026-11-03");

        assert_eq!(
            november.bills_of_month.iter().map(|bill| bill.due_date).collect::<Vec<_>>(),
            [date("2026-09-05"), date("2026-10-05"), date("2026-11-05")]
        );
        assert_eq!(november.days[1].projected_balance, money("1000"));
        assert_eq!(november.days[2].projected_balance, money("800"));
        assert_eq!(november.days[4].projected_balance, money("700"));
        assert_eq!(october.bills_of_month.len(), 1);
        assert!(october.days.iter().all(|day| day.projected_balance == day.balance));
    }
```

(Run `cargo fmt` after pasting; the one-line `with_bills` calls get wrapped.)

- [ ] **Step 2: Run to see red**

Run: `DATABASE_URL=postgres://soldi:soldi@localhost:5441/soldi_55 cargo test -p soldi-server --lib months::domain` (database migrated: `sqlx migrate run --source crates/soldi-server/migrations`)
Expected: compile errors `struct `MonthBill` has no field named `created_on`` and `struct `Payment` has no field named `date``.

- [ ] **Step 3: Minimal implementation**

Imports: `use std::collections::{BTreeMap, HashSet};` and `use chrono::{Datelike, Months, NaiveDate};`.

Structs:

```rust
/// An active bill with its category's icon and color, and the São Paulo day it was registered.
pub struct MonthBill {
    pub id: Uuid,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub amount: Decimal,
    pub due_day: i16,
    pub created_on: NaiveDate,
}

/// A bill's entry and its date.
pub struct Payment {
    pub bill_id: Uuid,
    pub transaction_id: Uuid,
    pub amount: Decimal,
    pub date: NaiveDate,
}
```

`MonthInput` doc: ``/// `month` is its first day; `sums` and `payments` cover `opening_date` to the month's end; `saved` is the month's bills under `Economia` minus its resgates.``

New functions, above `month_view`:

```rust
/// One month of a bill with no payment dated in it (D17).
pub struct Unpaid<'a> {
    pub bill: &'a MonthBill,
    pub due_date: NaiveDate,
    pub lands_on: NaiveDate,
}

fn first_of(date: NaiveDate) -> NaiveDate {
    date.with_day(1).unwrap_or(date)
}

/// D17: each unpaid month of `bills` from the opening date's month to `to`'s, oldest first. Its
/// due date must be on or after the opening date and, before today's month, on or after the day
/// the bill was registered. It lands on `max(due_date, today)`.
pub fn unpaid<'a>(
    bills: &'a [MonthBill],
    payments: &[Payment],
    opening: NaiveDate,
    today: NaiveDate,
    to: NaiveDate,
) -> Vec<Unpaid<'a>> {
    let paid: HashSet<(Uuid, NaiveDate)> = payments
        .iter()
        .map(|payment| (payment.bill_id, first_of(payment.date)))
        .collect();
    let current = first_of(today);
    let months = std::iter::successors(Some(first_of(opening)), |month| {
        month.checked_add_months(Months::new(1))
    })
    .take_while(|month| *month <= to);
    let mut found = Vec::new();
    for month in months {
        for bill in bills {
            let due = due_date(month, bill.due_day);
            let registered = month >= current || due >= bill.created_on;
            if due >= opening && registered && !paid.contains(&(bill.id, month)) {
                found.push(Unpaid {
                    bill,
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
            before += late.bill.amount;
        } else if late.lands_on <= to {
            *on.entry(late.lands_on).or_default() += late.bill.amount;
        }
    }
    (before, on)
}

fn flows_by_day(sums: Vec<DaySum>) -> BTreeMap<NaiveDate, Flows> {
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
    flows
}
```

`month_view` — replace the body from the `flows` loop down to `let projected = …;` (the day loop's inner body stays as is except `landing` → `lands`):

```rust
    let flows = flows_by_day(sums);
    let end = month_end(month);
    let today_or_end = today.min(end);
    let balance_today = settings.opening_balance
        + flows
            .range(..=today_or_end)
            .map(|(_, flow)| flow.net())
            .sum::<Decimal>();
    let unpaid_months = unpaid(&bills, &payments, settings.opening_date, today, end);
    let current = (month..=end).contains(&today);
    let carried = unpaid_months
        .iter()
        .filter(|late| current && late.due_date < month)
        .map(|late| BillOfMonth {
            bill_id: late.bill.id,
            name: late.bill.name.clone(),
            icon: late.bill.icon.clone(),
            color: late.bill.color.clone(),
            amount: late.bill.amount,
            due_date: late.due_date,
            paid: false,
            transaction_id: None,
            overdue: true,
            lands_on: Some(late.lands_on),
        });
    let own = bills.iter().map(|bill| {
        let payment = payments
            .iter()
            .find(|payment| payment.bill_id == bill.id && (month..=end).contains(&payment.date));
        let due_date = due_date(month, bill.due_day);
        // Due before the opening date: already inside the opening balance.
        let open = payment.is_none() && due_date >= settings.opening_date;
        BillOfMonth {
            bill_id: bill.id,
            name: bill.name.clone(),
            icon: bill.icon.clone(),
            color: bill.color.clone(),
            amount: payment.map_or(bill.amount, |payment| payment.amount),
            due_date,
            paid: payment.is_some(),
            transaction_id: payment.map(|payment| payment.transaction_id),
            overdue: open && due_date < today,
            lands_on: open
                .then_some(due_date.max(today))
                .filter(|day| *day <= end),
        }
    });
    let bills_of_month: Vec<BillOfMonth> = carried.chain(own).collect();
    let (mut pending, lands) = landing(&unpaid_months, month, end);
    let mut balance = settings.opening_balance
        + flows
            .range(..month)
            .map(|(_, flow)| flow.net())
            .sum::<Decimal>();
```

In the day loop: `pending += lands.get(&date).copied().unwrap_or_default();`. After it:

```rust
    let projected = if today <= end {
        balance - pending
    } else {
        balance
            - bills_of_month
                .iter()
                .filter(|bill| !bill.paid && bill.due_date >= settings.opening_date)
                .map(|bill| bill.amount)
                .sum::<Decimal>()
    };
```

- [ ] **Step 4: Run to see green**

Run: `DATABASE_URL=…/soldi_55 cargo test -p soldi-server --lib months::domain && cargo clippy -p soldi-server --all-targets -- -D warnings`
Expected: all `months::domain` tests pass. Do the `repo.rs` edit of Task 2 Step 3 in this step (same commit); Task 2 then only adds the service change, docs and the integration test.

- [ ] **Step 5: Commit**

```bash
git add crates/soldi-server/src/months/domain.rs crates/soldi-server/src/months/repo.rs
git commit -m "feat(server): SOL-55 carry unpaid bills of earlier months into today"
```

### Task 2: Queries, service, integration test, `.sqlx`, OpenAPI

**Files:**
- Modify: `crates/soldi-server/src/months/repo.rs` (`bills`, `payments`), `crates/soldi-server/src/months/service.rs` (`payments` from `opening`), `crates/soldi-types/src/months.rs` (docs of `BillOfMonth`, `MonthView`)
- Modify: `crates/soldi-server/tests/months.rs` (`forecast_an_unpaid_bill_dips_its_clamped_due_day_two_months_ahead`; new test)
- Regenerate: `.sqlx/`, `web/openapi.json`, `web/src/shared/api/schema.d.ts`
- Model: `rule_1_end_to_end_unpaid_then_paid_then_unpaid` (same file).

**Interfaces:**
- Consumes: Task 1's `MonthBill.created_on`, `Payment.date`.
- Produces: no new JSON field; `bills_of_month` may hold rows whose `due_date` is before `MonthView.month`.

- [ ] **Step 1: Write the failing test**

`forecast_an_unpaid_bill_dips_its_clamped_due_day_two_months_ahead`: the two months before also hold Aluguel, unpaid:

```rust
    assert_eq!(
        (&before["projected_balance"], &before["projected_tier"]),
        (&json!("-2200.00"), &json!("red"))
    );
    assert_eq!(
        (
            &last["projected_balance"],
            &last["projected_tier"],
            &last["balance"]
        ),
        (&json!("-3800.00"), &json!("red"), &json!("1000.00"))
    );
    assert_eq!(view["bills_of_month"][0]["lands_on"], last["date"]);
    assert_eq!(view["projected_balance"], "-3800.00");
```

New test at the end:

```rust
#[sqlx::test]
async fn sol55_last_months_unpaid_bill_lands_today_until_paid_in_its_own_month(pool: PgPool) {
    use chrono::{Datelike, Months};
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bia = user.another_user("bia@example.com").await;
    let today = soldi_server::today_sao_paulo();
    let this_month = today.with_day(1).unwrap();
    let last_month = this_month.checked_sub_months(Months::new(1)).unwrap();
    open_at(&user, "1000", &last_month.to_string()).await;
    open_at(&bia, "1000", &last_month.to_string()).await;
    let aluguel = add_bill(&user, "Aluguel", "1800", 1, "Aluguel").await;
    add_bill(&bia, "Aluguel", "999", 1, "Aluguel").await;
    sqlx::query("UPDATE recurring_bills SET created_at = $1::timestamptz")
        .bind(format!("{last_month}T12:00:00-03:00"))
        .execute(&pool)
        .await
        .unwrap();
    let path = format!("/api/months/{}", this_month.format("%Y-%m"));

    let (status, view) = user.get(&path).await;

    assert_eq!(status, StatusCode::OK, "{view}");
    let rows: Vec<(String, bool)> = view["bills_of_month"]
        .as_array()
        .unwrap()
        .iter()
        .map(|bill| (bill["due_date"].as_str().unwrap().into(), bill["overdue"] == true))
        .collect();
    assert_eq!(
        rows,
        [
            (last_month.to_string(), true),
            (this_month.to_string(), today > this_month)
        ]
    );
    assert_eq!(view["bills_of_month"][0]["bill_id"], aluguel["id"]);
    assert_eq!(view["bills_of_month"][0]["lands_on"], today.to_string());
    let index = usize::try_from(today.day() - 1).unwrap();
    assert_eq!(view["days"][index]["projected_balance"], "-2600.00");
    assert_eq!(view["projected_balance"], "-2600.00");

    let pay = format!(
        "/api/bills/{}/pay?month={}",
        aluguel["id"].as_str().unwrap(),
        last_month.format("%Y-%m")
    );
    let (status, entry) = user.post(&pay, json!({ "date": last_month.to_string() })).await;
    assert_eq!(status, StatusCode::CREATED, "{entry}");
    let (_, paid) = user.get(&path).await;
    assert_eq!(paid["bills_of_month"].as_array().unwrap().len(), 1);
    assert_eq!(paid["balance_today"], "-800.00");
    assert_eq!(paid["projected_balance"], "-2600.00");
}
```

- [ ] **Step 2: Run to see red**

Run: `DATABASE_URL=postgres://soldi:soldi@localhost:5441/soldi_55 cargo test -p soldi-server --test months`
Expected: the new test fails on `rows` (only this month's row: `payments` still reads the month only and `created_on` is not selected) — or compile errors from `repo.rs` if Task 1 left it untouched.

- [ ] **Step 3: Minimal implementation**

`months/repo.rs`:

```rust
/// Active, unarchived bills by due day, then name, with the São Paulo day each was registered.
pub async fn bills(conn: &mut PgConnection, user_id: Uuid) -> Result<Vec<MonthBill>, sqlx::Error> {
    sqlx::query_as!(
        MonthBill,
        r#"SELECT b.id, b.name, c.icon, c.color, b.amount, b.due_day,
                  (b.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS "created_on!"
           FROM recurring_bills b JOIN categories c ON c.user_id = b.user_id AND c.id = b.category_id
           WHERE b.user_id = $1 AND b.active AND b.archived_at IS NULL
           ORDER BY b.due_day, lower(b.name), b.id"#,
        user_id
    )
    .fetch_all(&mut *conn)
    .await
}
```

`payments`: select `… amount, date` (struct field order matches `Payment`), doc `/// Every bill entry dated `from` to `to`.`

`months/service.rs`: `let payments = repo::payments(&mut conn, user.id, opening, end).await?;`

`soldi-types/src/months.rs` docs:

```rust
/// An active recurring bill in the month. `amount` is what was paid, or the bill's amount while
/// unpaid; `due_date` clamps a late due day to the month's last day; `overdue` is unpaid with
/// `due_date` before today in São Paulo. In the current month, a bill still unpaid in an earlier
/// month is listed again first, with that month's `due_date`, `overdue` and `lands_on` today (D17).
```

```rust
/// `month` is `YYYY-MM`. `balance_today` is the balance at today, or at the month's last day
/// when the month is past. `projected_balance` is, for the current and a future month, the last
/// day's `projected_balance` (every unpaid bill landed, earlier months' included); for a past
/// month, the balance at its end minus its unpaid `bills_of_month`.
```

Then:

```bash
scripts/sqlx-prepare.sh
UPDATE_OPENAPI=1 cargo test -p soldi-server --test openapi
cd web && pnpm gen:api
```

- [ ] **Step 4: Run to see green**

Run: `DATABASE_URL=…/soldi_55 cargo test --workspace && scripts/sqlx-prepare.sh --check && cargo clippy --workspace --all-targets -- -D warnings`
Expected: green; `git status` shows `.sqlx/` query files changed for `bills` and `payments`.

- [ ] **Step 5: Commit**

```bash
git add crates/soldi-server/src/months crates/soldi-types/src/months.rs crates/soldi-server/tests/months.rs .sqlx web/openapi.json web/src/shared/api/schema.d.ts
git commit -m "feat(server): SOL-55 read payments since the opening and bills' creation day"
```

### Task 3: Web — carried rows in Contas do Mês and the ledger

**Files:**
- Modify: `web/src/shared/lib/date.ts` (+ `date.test.ts`), `web/src/entities/month/forecast-alert.ts` (+ test), `web/src/entities/bill/bill-queries.ts` (+ test), `web/src/widgets/bills-of-month/bills-of-month.tsx` (+ test), `web/src/features/pay-bill/pay-bill-sheet.tsx`, `web/src/widgets/ledger/ledger.tsx`, `web/src/app/(app)/(shell)/mes/page.test.tsx`, `web/src/test/stub-api.ts`
- Model: `bills-of-month.test.tsx` "dates a payment in another month on its due date"; `bill-queries.test.tsx` "unpays at once…"; the overdue `Row` branch in `bills-of-month.tsx`.

**Interfaces:**
- Produces: `monthName(date: string, viewing: string): string` (`shared/lib/date`); `billKey(bill: BillOfMonth): string` = `` `${bill.bill_id}@${bill.due_date}` `` (`entities/month/forecast-alert`); `causeOf` returns `billKey(bill)` for bill causes (transactions still return `transaction.id`).
- Produces (fixture): `CARRIED_ALUGUEL: Schemas["BillOfMonth"]` = `{ ...BILLS_OF_MONTH[1], due_date: "2026-10-10", overdue: true, lands_on: "2026-11-05" }`.

- [ ] **Step 1: Write the failing tests**

`date.test.ts`:

```ts
  it("names a month, with its year when it is not the viewed one's", () => {
    expect(monthName("2026-10-10", "2026-11")).toBe("outubro");
    expect(monthName("2025-12-05", "2026-01")).toBe("dezembro de 2025");
    expect(monthName("2026-03", "2026-03")).toBe("março");
  });
```

`forecast-alert.test.ts`: every `causeOf(…)` expectation that names a bill now expects `billKey(CARTAO)` / `billKey(FINANCIAMENTO)` instead of `.bill_id`; add:

```ts
  it("tells two rows of one bill apart: the carried one is the cause", () => {
    const today = day("2026-11-20", "-2400.00", "red", "today");
    const carried = { ...CARTAO, due_date: "2026-10-23", overdue: true, lands_on: "2026-11-20", amount: "1800.00" };
    const own = { ...CARTAO, lands_on: "2026-11-23" };
    expect(causeOf("2026-11-20", [today], [], [carried, own])).toBe(`${CARTAO.bill_id}@2026-10-23`);
  });
```

`stub-api.ts`, after `BILLS_OF_MONTH`:

```ts
/** October's rent still unpaid, carried into November and landed today (the 5th), D17. */
export const CARRIED_ALUGUEL: Schemas["BillOfMonth"] = {
  ...BILLS_OF_MONTH[1],
  due_date: "2026-10-10",
  overdue: true,
  lands_on: "2026-11-05",
};
```

`bills-of-month.test.tsx`:

```ts
  it("lists October's unpaid rent first, says so, and pays it in October on its due date", async () => {
    const { requests } = show([CARRIED_ALUGUEL, ...BILLS_OF_MONTH], {
      [`POST /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 201, body: PAYMENT },
    });
    await loaded();

    expect(card()).toHaveTextContent("2 obrigações cadastradas");
    const october = rowOf("Aluguel Residencial de outubro");
    expect(october).toHaveTextContent("Venceu em outubro");
    await userEvent.click(within(october).getByRole("button", { name: "Pagar Aluguel Residencial de outubro, vencida" }));

    await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
    const post = requests.find((request) => request.method === "POST");
    expect(new URL(post?.url ?? "").searchParams.get("month")).toBe("2026-10");
    expect(await post?.json()).toEqual({ date: "2026-10-10" });
    expect(within(rowOf("Aluguel Residencial")).getByRole("button", { name: "Pagar Aluguel Residencial" })).toBeInTheDocument();
  });

  it("names the year of a carried month from another year", async () => {
    show([{ ...CARRIED_ALUGUEL, due_date: "2025-12-10" }, ...BILLS_OF_MONTH]);
    await loaded();
    expect(rowOf("Aluguel Residencial de dezembro de 2025")).toHaveTextContent("Venceu em dezembro de 2025");
  });
```

`bill-queries.test.tsx` (seed `["month", "2026-11"]` with `{ ...WITH_BILLS, bills_of_month: [CARRIED_ALUGUEL, ...BILLS_OF_MONTH] }` inside the test, using `gated()`):

```ts
  it("ticks only the paid month's row when one bill has two", async () => {
    const view = seeded();
    view.client.setQueryData(["month", "2026-11"], { ...WITH_BILLS, bills_of_month: [CARRIED_ALUGUEL, ...BILLS_OF_MONTH] });
    const release = gated();

    act(() => view.result.current.pay.mutate({ billId: BILL_ALUGUEL.id, month: "2026-11", date: "2026-11-05" }));

    await waitFor(() => {
      const rows = view.client.getQueryData<typeof WITH_BILLS>(["month", "2026-11"])?.bills_of_month ?? [];
      expect(rows.map((row) => [row.due_date, row.paid])).toEqual([
        ["2026-10-10", false],
        ["2026-11-02", false],
        ["2026-11-10", true],
      ]);
    });
    release();
  });
```

(`gated()` returns its `release`; if the existing helper returns something else, follow its use in "unpays at once…".)

`mes/page.test.tsx`:

```ts
  it("lands October's unpaid rent today in the ledger, named by its month", async () => {
    open({ "GET /api/months/2026-11": { status: 200, body: { ...MONTH, bills_of_month: [CARRIED_ALUGUEL] } } });
    const rent = await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("listitem", {
      name: "Aluguel Residencial",
    });
    expect(rent).toHaveTextContent("Conta fixa · venceu em outubro");
  });
```

- [ ] **Step 2: Run to see red**

Run (from `web/`): `pnpm vitest run src/shared/lib/date.test.ts src/entities/month/forecast-alert.test.ts src/entities/bill/bill-queries.test.tsx src/widgets/bills-of-month/bills-of-month.test.tsx "src/app/(app)/(shell)/mes/page.test.tsx"`
Expected: `monthName is not a function`, `billKey` expectations fail, `Unable to find … "Aluguel Residencial de outubro"`, the optimistic test sees both Aluguel rows `paid: true`, the ledger row reads `venceu dia 10/10`.

- [ ] **Step 3: Minimal implementation**

`shared/lib/date.ts`:

```ts
const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** `2026-10-10` seen from `2026-11` → `outubro`; from `2027-01` → `outubro de 2026`. */
export const monthName = (date: string, viewing: string) => {
  const name = MONTH_NAMES[Number(date.slice(5, 7)) - 1];
  return date.slice(0, 4) === viewing.slice(0, 4) ? name : `${name} de ${date.slice(0, 4)}`;
};
```

`entities/month/forecast-alert.ts`:

```ts
/** A bill row's identity: one bill can be listed twice, carried from an earlier month (D17). */
export const billKey = (bill: Schemas["BillOfMonth"]) => `${bill.bill_id}@${bill.due_date}`;
```

and in `causeOf` the bill outflows use `id: billKey(bill)`.

`entities/bill/bill-queries.ts`, `patchRow`: `row.bill_id === billId && row.due_date.startsWith(month)`.

`widgets/bills-of-month/bills-of-month.tsx`:
- `const carriedFrom = (bill: BillOfMonth, month: string) => (bill.due_date.startsWith(month) ? null : monthName(bill.due_date, month));`
- `Row` gets `month: string`; `const late = carriedFrom(bill, month);` `li aria-label={late ? `${bill.name} de ${late}` : bill.name}`; caption: `late ? `Venceu em ${late}` : `Venceu dia ${dayMonth(bill.due_date)}`` inside the existing overdue `span` (same `Clock`).
- `Pill` gets `label: string` (the row's aria name) and uses `` `Pagar ${label}, vencida` `` / `` `Pagar ${label}` `` / `` `Pago: desfazer ${label}` ``.
- `payNow`: `const month = bill.due_date.slice(0, 7); pay.mutate({ billId: bill.bill_id, month, date: payDateFor(month, bill.due_date) }, …)`; `undo` keeps `view.month`.
- `adjust` stores the bill; `<PayBillSheet month={adjusting?.due_date.slice(0, 7) ?? view.month} …/>`.
- `const count = bills.filter((bill) => bill.due_date.startsWith(view.month)).length;`
- `key={billKey(bill)}` (import from `@/entities/month/forecast-alert`).

`features/pay-bill/pay-bill-sheet.tsx`: `description={month === todayISO().slice(0, 7) ? "Valor e data do pagamento desta conta." : `Conta de ${monthName(month, month)}: a data do pagamento fica em ${monthName(month, month)}.`}`.

`widgets/ledger/ledger.tsx`: `DueRow` gets `month: string` (`view.month`) and, when `!bill.due_date.startsWith(month)`, the caption `` `Conta fixa · venceu em ${monthName(bill.due_date, month)}` ``; ids `due-${billKey(bill)}`; `key={billKey(bill)}`; `cause={causes.has(billKey(bill))}`; the `causes` prop doc: ``/** Ids (`transaction.id` or `billKey(bill)`) captioned `Motivo da queda`. */``.

- [ ] **Step 4: Run to see green**

Run: the five files of Step 2, then `pnpm typecheck && pnpm lint`.
Expected: green, 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/shared/lib/date.ts web/src/shared/lib/date.test.ts web/src/entities/month web/src/entities/bill web/src/widgets/bills-of-month web/src/features/pay-bill/pay-bill-sheet.tsx web/src/widgets/ledger/ledger.tsx "web/src/app/(app)/(shell)/mes/page.test.tsx" web/src/test/stub-api.ts
git commit -m "feat(web): SOL-55 show and pay last month's unpaid conta fixa"
```

### Task 4: E2E — next month opens already lower

**Files:**
- Modify: `web/e2e/forecast.spec.ts` (expectations after `Próximo mês`)

- [ ] **Step 1: Update the spec**

```ts
  await page.getByRole("button", { name: "Próximo mês" }).click();
  const ledger = page.getByRole("region", { name: "Lançamentos" });
  await expect(ledger.getByRole("heading", { level: 3 }).first()).toContainText(
    /Agendado · 28 .*-R\$\s2\.200,00.*Previsto · Crítico/,
  );
  await expect(ledger.getByRole("listitem", { name: "Aluguel" })).toContainText("Conta fixa · a pagar");

  const hero = page.getByRole("region", { name: "Saldo hoje" });
  await expect(hero.getByRole("button", { name: /Dia 1 fica no vermelho: -R\$\s600,00/ })).toBeVisible();
  await hero.getByRole("button", { name: /Pior dia: 28\/\d\d, -R\$\s2\.200,00/ }).click();
  await expect(page.locator(`#dia-${nextMonthDay(28)}`)).toHaveClass(/ring-2/);
  await expect(ledger.getByRole("listitem", { name: "Aluguel" })).toContainText("Motivo da queda");
```

Title: `"next month opens with this month's unpaid conta fixa and the worst-day line jumps to its due day"`.

- [ ] **Step 2: Run**

Run: server on 8080 against `soldi_55` + `pnpm e2e e2e/forecast.spec.ts`
Expected: pass (skips when the server is down — start it; a skip is not a pass).

- [ ] **Step 3: Commit**

```bash
git add web/e2e/forecast.spec.ts
git commit -m "test(web): SOL-55 next month opens below zero with this month's unpaid bill"
```

### SOL-55 gate and review

- Gate (CLAUDE.md): fmt, clippy, `cargo test --workspace`, `scripts/sqlx-prepare.sh --check`, `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` (> 90 % × 4), `pnpm build`, server coverage ≥ 90 %.
- `qa` (money + contract + user isolation). Checklist: carry bounded by `opening_date` and `created_on`; paused/archived bills never carry; a past month never changes; no double count after paying a carried row (`balance_today` unchanged, row gone); Bia's bill never in Ana's month; `projected_balance` for past months unchanged (`bill_rule_8` 830.00); `MonthView.projected_balance == days.last().projected_balance` for current and future months; both queries keep `user_id = $1`; two rows of one bill: keys, ids, `causeOf`, optimistic pay.
- `pixel` not needed (no new token or component).

---

# SOL-51 — `/Users/emerson/Documents/workspace/open-source/soldi-51`, `feat/SOL-51-months-ahead`

### Task 5: `Forecast` contract and `forecast()` (domain)

**Files:**
- Modify: `crates/soldi-types/src/months.rs` (after `MonthView`), `crates/soldi-server/src/months/domain.rs` (after `month_view`; tests)
- Model: `month_view`'s day loop; tests `forecast_rule_1_the_owners_november_…` (data) and `rule_1_the_balance_walks_the_ledger_day_by_day`.

**Interfaces:**
- Produces (Rust, `soldi_types::months`):

```rust
/// One day ahead (D16): the balance with every unpaid bill landed, and its tier.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct ForecastDay {
    pub date: NaiveDate,
    #[serde(serialize_with = "crate::money")]
    pub projected_balance: Decimal,
    pub projected_tier: Tier,
}

/// `days` run from today (the opening date, when later) through the last day of the 11th month
/// after today's, São Paulo (D13); empty when the opening date is past that.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct Forecast {
    pub today: NaiveDate,
    pub days: Vec<ForecastDay>,
}
```

- Produces (Rust, `months::domain`): `pub struct ForecastInput { pub settings: Settings, pub sums: Vec<DaySum>, pub bills: Vec<MonthBill>, pub payments: Vec<Payment>, pub today: NaiveDate }`, `pub fn horizon_end(today: NaiveDate) -> NaiveDate`, `pub fn forecast(input: ForecastInput) -> Forecast`.

- [ ] **Step 1: Write the failing tests**

`soldi-types/src/months.rs` test module:

```rust
    #[test]
    fn a_forecast_day_serializes_its_balance_as_a_string() {
        let day = ForecastDay {
            date: NaiveDate::from_ymd_opt(2026, 11, 23).unwrap(),
            projected_balance: "-675".parse().unwrap(),
            projected_tier: Tier::Red,
        };
        assert_eq!(
            serde_json::to_value(&day).unwrap(),
            json!({ "date": "2026-11-23", "projected_balance": "-675.00", "projected_tier": "red" })
        );
    }
```

`months/domain.rs` tests:

```rust
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

    fn ahead(settings: Settings, sums: Vec<DaySum>, bills: Vec<MonthBill>, today: &str) -> Forecast {
        forecast(ForecastInput {
            settings,
            sums,
            bills,
            payments: vec![],
            today: date(today),
        })
    }

    fn at(forecast: &Forecast, on: &str) -> (Decimal, Tier) {
        let day = forecast.days.iter().find(|day| day.date == date(on)).unwrap();
        (day.projected_balance, day.projected_tier)
    }

    #[test]
    fn sol51_the_horizon_runs_from_today_to_the_end_of_the_eleventh_month_after() {
        let flat = ahead(settings("1000", "2026-11-01"), vec![], vec![], "2026-11-10");

        assert_eq!(flat.today, date("2026-11-10"));
        assert_eq!(flat.days.len(), 356);
        assert_eq!(flat.days[0].date, date("2026-11-10"));
        assert_eq!(flat.days.last().unwrap().date, date("2027-10-31"));
        assert!(flat.days.iter().all(|day| (day.projected_balance, day.projected_tier)
            == (money("1000"), Tier::LightGreen)));
        assert_eq!(horizon_end(date("2027-03-31")), date("2028-02-29"));
    }

    #[test]
    fn sol51_the_owners_november_runs_into_a_red_december_without_a_salary() {
        let year = ahead(settings("6150", "2026-11-01"), owners_sums(), owners_bills(), "2026-11-10");

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
        let year = ahead(settings("6150", "2026-11-01"), owners_sums(), owners_bills(), "2026-11-10");
        for month in ["2026-11", "2026-12", "2027-10"] {
            let view = with_bills(month, settings("6150", "2026-11-01"), owners_sums(), owners_bills(), vec![], "2026-11-10");
            for day in view.days.iter().filter(|day| day.date >= date("2026-11-10")) {
                assert_eq!(at(&year, &day.date.to_string()), (day.projected_balance, day.projected_tier), "{}", day.date);
            }
        }
    }

    #[test]
    fn sol51_a_carried_bill_lands_today_and_the_next_months_on_their_due_day() {
        let year = ahead(settings("1200", "2026-10-01"), vec![], vec![bill(1, "Aluguel", "1800", 10)], "2026-11-20");

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
```

- [ ] **Step 2: Run to see red**

Run: `cargo test -p soldi-types months && cargo test -p soldi-server --lib months::domain`
Expected: `cannot find struct ForecastDay`, `cannot find function forecast`.

- [ ] **Step 3: Minimal implementation**

`soldi-types/src/months.rs`: the two structs of **Interfaces**.

`months/domain.rs` (import `soldi_types::months::{…, Forecast, ForecastDay, …}`):

```rust
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
    let flows = flows_by_day(sums);
    let from = today.max(settings.opening_date);
    let to = horizon_end(today);
    let unpaid_months = unpaid(&bills, &payments, settings.opening_date, today, to);
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
```

- [ ] **Step 4: Run to see green**

Run: Step 2's commands + `cargo clippy -p soldi-server --all-targets -- -D warnings`.

- [ ] **Step 5: Commit**

```bash
git add crates/soldi-types/src/months.rs crates/soldi-server/src/months/domain.rs
git commit -m "feat(server): SOL-51 walk twelve months of projected days"
```

### Task 6: `GET /api/forecast` end to end, OpenAPI, web types

**Files:**
- Modify: `crates/soldi-server/src/months/service.rs`, `crates/soldi-server/src/months/handler.rs`, `crates/soldi-server/tests/months.rs`
- Regenerate: `web/openapi.json`, `web/src/shared/api/schema.d.ts` (`.sqlx/` unchanged)
- Model: `service::get` and `get_month` in the same files.

**Interfaces:**
- Produces: `GET /api/forecast` → 200 `Forecast` / 401; `Schemas["Forecast"]`, `Schemas["ForecastDay"]` in the web.

- [ ] **Step 1: Write the failing test** (`tests/months.rs`)

```rust
#[sqlx::test]
async fn sol51_the_forecast_walks_twelve_months_of_the_callers_bills(pool: PgPool) {
    use chrono::{Datelike, Months};
    let user = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bia = user.another_user("bia@example.com").await;
    let today = soldi_server::today_sao_paulo();
    open_at(&user, "1000", &today.to_string()).await;
    add_bill(&user, "Aluguel", "1600", 28, "Aluguel").await;
    add_bill(&bia, "Aluguel", "999", 1, "Aluguel").await;

    let (status, forecast) = user.get("/api/forecast").await;

    assert_eq!(status, StatusCode::OK, "{forecast}");
    assert_eq!(forecast["today"], today.to_string());
    let days = forecast["days"].as_array().unwrap();
    let first = today.with_day(1).unwrap();
    let last = first.checked_add_months(Months::new(12)).unwrap().pred_opt().unwrap();
    assert_eq!(days[0]["date"], today.to_string());
    assert_eq!(days.last().unwrap()["date"], last.to_string());
    let next_28 = first.checked_add_months(Months::new(1)).unwrap().with_day(28).unwrap().to_string();
    let day = days.iter().find(|day| day["date"] == next_28.as_str()).unwrap();
    assert_eq!(
        (&day["projected_balance"], &day["projected_tier"]),
        (&json!("-2200.00"), &json!("red"))
    );

    let (status, _) = TestApp::anonymous(pool).get("/api/forecast").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
```

- [ ] **Step 2: Run to see red**

Run: `DATABASE_URL=…/soldi_51 cargo test -p soldi-server --test months sol51`
Expected: status 404.

- [ ] **Step 3: Minimal implementation**

`months/service.rs`:

```rust
/// D16: 4 queries whatever the horizon.
pub async fn forecast(pool: &PgPool, user: &CurrentUser) -> Result<Forecast, AppError> {
    let today = crate::today_sao_paulo();
    let mut conn = pool.acquire().await?;
    let settings = settings::repo::find(&mut conn, user.id).await?;
    let to = domain::horizon_end(today);
    let sums = repo::day_sums(&mut conn, user.id, settings.opening_date, to).await?;
    let bills = repo::bills(&mut conn, user.id).await?;
    let payments = repo::payments(&mut conn, user.id, settings.opening_date, to).await?;
    Ok(domain::forecast(domain::ForecastInput {
        settings,
        sums,
        bills,
        payments,
        today,
    }))
}
```

`months/handler.rs`:

```rust
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(get_month))
        .routes(routes!(get_forecast))
}

#[utoipa::path(get, path = "/api/forecast", tag = "months",
    responses(
        (status = 200, body = Forecast, description = "Every day from today (the opening date, when later) to the end of the 11th month after today's, with every unpaid bill landed (D16, D17)"),
        (status = 401, body = Problem, content_type = "application/problem+json")))]
pub async fn get_forecast(
    State(state): State<AppState>,
    user: CurrentUser,
) -> Result<Json<Forecast>, AppError> {
    Ok(Json(service::forecast(&state.pool, &user).await?))
}
```

Then `UPDATE_OPENAPI=1 cargo test -p soldi-server --test openapi` and `cd web && pnpm gen:api`.

- [ ] **Step 4: Run to see green**

Run: `DATABASE_URL=…/soldi_51 cargo test --workspace && scripts/sqlx-prepare.sh --check`

- [ ] **Step 5: Commit**

```bash
git add crates/soldi-server/src/months crates/soldi-server/tests/months.rs web/openapi.json web/src/shared/api/schema.d.ts
git commit -m "feat(server): SOL-51 GET /api/forecast"
```

### Task 7: Web entities — query, `monthsAhead`, `MonthChips`, fixtures

**Files:**
- Modify: `web/src/shared/lib/date.ts` (+ test), `web/src/test/stub-api.ts`, `web/src/features/add-transaction/transaction-sheet.tsx` (`lastMonth` reuses `addMonths`)
- Create: `web/src/entities/forecast/forecast-query.ts`, `months-ahead.ts`, `months-ahead.test.ts`, `month-chips.tsx`, `month-chips.test.tsx`
- Model: `entities/month/month-query.ts`; `entities/month/forecast-alert.ts` (+ test); `shared/ui/thermometer-strip.tsx` (tier styles).

**Interfaces:**
- Produces: `addMonths(month: string, count: number): string`; `forecastQuery` (key `["month", "forecast"]`), `useForecast()`; `type Forecast`, `type ForecastDay`, `type MonthAhead = { month: string; lowest: Tier | null; redDays: number }`, `monthsAhead(forecast: Forecast, count: number): MonthAhead[]`, `isFlat(forecast: Forecast): boolean`; `MonthChips({ months, neutral?, current?, onOpen? })`.
- Produces (fixtures): `forecastFixture(today, from, to, steps: [string, string][])`, `FORECAST`, `FORECAST_FLAT`, `FORECAST_LATE_OPENING`; `signedIn()` answers `GET /api/forecast` with `FORECAST_FLAT` by default.

- [ ] **Step 1: Write the failing tests**

`stub-api.ts` (import `tierOf` from `@/shared/lib/tier`; add to `signedIn`'s defaults `"GET /api/forecast": { status: 200, body: FORECAST_FLAT },`):

```ts
const datesBetween = (from: string, to: string) => {
  const dates: string[] = [];
  for (let at = Date.parse(from); at <= Date.parse(to); at += 86_400_000) dates.push(new Date(at).toISOString().slice(0, 10));
  return dates;
};

/** Days `from` to `to`; each `[date, balance]` step holds until the next one. */
export const forecastFixture = (today: string, from: string, to: string, steps: [string, string][]): Schemas["Forecast"] => ({
  today,
  days: datesBetween(from, to).map((date) => {
    const balance = steps.filter(([on]) => on <= date).pop()?.[1] ?? steps[0][1];
    return { date, projected_balance: balance, projected_tier: tierOf(balance, SETTINGS) };
  }),
});

/** The owner's November and December from the 10th (SOL-49 data, no December salary typed); a fixture holds -R$ 7.577,00 from Dec 30 on. */
export const FORECAST = forecastFixture("2026-11-10", "2026-11-10", "2027-10-31", [
  ["2026-11-10", "6150.00"],
  ["2026-11-23", "-675.00"],
  ["2026-11-25", "-916.00"],
  ["2026-11-28", "-2916.00"],
  ["2026-11-30", "491.00"],
  ["2026-12-23", "-4409.00"],
  ["2026-12-28", "-6409.00"],
  ["2026-12-30", "-7577.00"],
]);

/** Nothing typed ahead. */
export const FORECAST_FLAT = forecastFixture("2026-11-10", "2026-11-10", "2027-10-31", [["2026-11-10", "1842.10"]]);

/** Opening on 15/01/2027: November and December have no day. */
export const FORECAST_LATE_OPENING = forecastFixture("2026-11-10", "2027-01-15", "2027-10-31", [
  ["2027-01-15", "1000.00"],
  ["2027-02-10", "2500.00"],
]);
```

`date.test.ts`:

```ts
  it("adds months across a year", () => {
    expect(addMonths("2026-11", 0)).toBe("2026-11");
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-12", 11)).toBe("2027-11");
  });
```

`entities/forecast/months-ahead.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { FORECAST, FORECAST_FLAT, FORECAST_LATE_OPENING, forecastFixture } from "@/test/stub-api";

import { isFlat, monthsAhead } from "./months-ahead";

describe("monthsAhead", () => {
  it("gives the owner's next six months by their lowest tier and red days", () => {
    expect(monthsAhead(FORECAST, 6)).toEqual([
      { month: "2026-11", lowest: "red", redDays: 7 },
      { month: "2026-12", lowest: "red", redDays: 9 },
      { month: "2027-01", lowest: "red", redDays: 31 },
      { month: "2027-02", lowest: "red", redDays: 28 },
      { month: "2027-03", lowest: "red", redDays: 31 },
      { month: "2027-04", lowest: "red", redDays: 30 },
    ]);
    expect(monthsAhead(FORECAST, 12).at(-1)?.month).toBe("2027-10");
  });

  it("takes the tier of the lowest day, not the last", () => {
    const rising = forecastFixture("2026-11-10", "2026-11-10", "2027-10-31", [
      ["2026-11-10", "1842.10"],
      ["2026-12-05", "2500.00"],
    ]);
    expect(monthsAhead(rising, 3)).toEqual([
      { month: "2026-11", lowest: "light_green", redDays: 0 },
      { month: "2026-12", lowest: "light_green", redDays: 0 },
      { month: "2027-01", lowest: "green", redDays: 0 },
    ]);
  });

  it("leaves the months before the opening date without a tier", () => {
    expect(monthsAhead(FORECAST_LATE_OPENING, 3).map((ahead) => ahead.lowest)).toEqual([null, null, "light_green"]);
  });
});

describe("isFlat", () => {
  it("is true when nothing lands ahead, false otherwise", () => {
    expect(isFlat(FORECAST_FLAT)).toBe(true);
    expect(isFlat(FORECAST)).toBe(false);
    expect(isFlat({ today: "2026-11-10", days: [] })).toBe(true);
  });
});
```

(`.at(-1)` is fine in tests if `lib` allows it; else `[11]`.)

`entities/forecast/month-chips.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MonthChips } from "./month-chips";

const MONTHS = [
  { month: "2026-11", lowest: "red", redDays: 7 },
  { month: "2026-12", lowest: "green", redDays: 0 },
  { month: "2027-01", lowest: null, redDays: 0 },
] as const;

describe("MonthChips", () => {
  it("names each month with its tier and red days, never color alone", async () => {
    const onOpen = vi.fn();
    render(<MonthChips months={[...MONTHS]} current="2026-12" onOpen={onOpen} />);

    const november = screen.getByRole("button", { name: "nov 2026: Crítico, 7 dias no vermelho" });
    expect(november).toHaveTextContent("nov 2026Crítico7");
    expect(screen.getByRole("button", { name: "dez 2026: Folga" })).toHaveAttribute("aria-current", "date");
    await userEvent.click(november);
    expect(onOpen).toHaveBeenCalledWith("2026-11");
  });

  it("disables a month before the opening date", async () => {
    const onOpen = vi.fn();
    render(<MonthChips months={[...MONTHS]} onOpen={onOpen} />);

    const january = screen.getByRole("button", { name: "jan 2027: antes do início" });
    expect(january).toHaveAttribute("aria-disabled", "true");
    expect(january).toHaveTextContent("Antes do início");
    await userEvent.click(january);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("goes neutral when nothing lands ahead and static without onOpen", () => {
    render(<MonthChips months={[...MONTHS]} neutral />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "nov 2026" })).not.toHaveTextContent("Crítico");
  });

  it("says one red day in the singular", () => {
    render(<MonthChips months={[{ month: "2026-11", lowest: "red", redDays: 1 }]} onOpen={vi.fn()} />);
    expect(screen.getByRole("button", { name: "nov 2026: Crítico, 1 dia no vermelho" })).toBeInTheDocument();
  });
});
```

(`as const` makes `lowest` literal types; if `MonthAhead[]` rejects the readonly tuple, type `MONTHS: MonthAhead[]` instead.)

- [ ] **Step 2: Run to see red**

Run: `pnpm vitest run src/shared/lib/date.test.ts src/entities/forecast`
Expected: `Failed to resolve import "./months-ahead"`, `addMonths is not a function`.

- [ ] **Step 3: Minimal implementation**

`shared/lib/date.ts`:

```ts
/** `2026-11` plus 2 → `2027-01`. */
export const addMonths = (month: string, count: number) => {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + count;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
};
```

`transaction-sheet.tsx` `lastMonth`: `monthYear(addMonths(date.slice(0, 7), months - 1))` (its existing tests stay green).

`entities/forecast/forecast-query.ts`:

```ts
import { queryOptions, useQuery } from "@tanstack/react-query";

import { api, dataOrThrow } from "@/shared/api/client";

/** Under `["month"]`: whatever invalidates the months invalidates the forecast too; fresh until then, so reopening Simular asks nothing. */
export const forecastQuery = queryOptions({
  queryKey: ["month", "forecast"],
  queryFn: async () => dataOrThrow(await api.GET("/api/forecast")),
  staleTime: 5 * 60_000,
});

export const useForecast = () => useQuery(forecastQuery);
```

`entities/forecast/months-ahead.ts`:

```ts
import type { Schemas } from "@/shared/api/client";
import { addMonths } from "@/shared/lib/date";
import { cents, type Tier } from "@/shared/lib/tier";

export type Forecast = Schemas["Forecast"];
export type ForecastDay = Schemas["ForecastDay"];
export type MonthAhead = { month: string; lowest: Tier | null; redDays: number };

/** The `count` months from today's: the tier of each one's lowest day and its red days; `lowest` null before the opening date. */
export const monthsAhead = ({ today, days }: Forecast, count: number): MonthAhead[] =>
  Array.from({ length: count }, (_, offset) => {
    const month = addMonths(today.slice(0, 7), offset);
    const inMonth = days.filter((day) => day.date.startsWith(month));
    if (inMonth.length === 0) return { month, lowest: null, redDays: 0 };
    const low = inMonth.reduce((lowest, day) =>
      cents(day.projected_balance) < cents(lowest.projected_balance) ? day : lowest,
    );
    return { month, lowest: low.projected_tier, redDays: inMonth.filter((day) => day.projected_tier === "red").length };
  });

/** Nothing lands ahead: every day holds the first day's balance. */
export const isFlat = ({ days }: Forecast) =>
  days.every((day) => cents(day.projected_balance) === cents(days[0].projected_balance));
```

`entities/forecast/month-chips.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { monthYear } from "@/shared/lib/date";
import { TIER_LABEL, TIER_STYLE } from "@/shared/lib/tier";

import type { MonthAhead } from "./months-ahead";

const reds = (count: number) => (count === 1 ? "1 dia no vermelho" : `${count} dias no vermelho`);

const nameOf = ({ month, lowest, redDays }: MonthAhead, neutral: boolean) => {
  const name = monthYear(month);
  if (lowest === null) return `${name}: antes do início`;
  if (neutral) return name;
  return redDays > 0 ? `${name}: ${TIER_LABEL[lowest]}, ${reds(redDays)}` : `${name}: ${TIER_LABEL[lowest]}`;
};

const chip = "relative flex min-h-16 w-full flex-col items-start justify-center gap-0.5 rounded-xl px-3 py-2 text-left";

type MonthChipsProps = {
  months: MonthAhead[];
  /** Nothing lands ahead: no tier, no badge. */
  neutral?: boolean;
  /** `YYYY-MM` on screen, ringed. */
  current?: string;
  /** Absent: static chips, as in the Simular preview. */
  onOpen?: (month: string) => void;
};

/** One chip per month, the tier's color with its label (D9) and a red-days badge. */
export const MonthChips = ({ months, neutral = false, current, onOpen }: MonthChipsProps) => (
  <ul className="grid grid-cols-3 gap-2">
    {months.map((ahead) => {
      const { month, lowest, redDays } = ahead;
      const style = cn(
        chip,
        lowest === null || neutral ? "bg-muted text-muted-foreground" : TIER_STYLE[lowest].pill,
        month === current && "ring-2 ring-primary",
      );
      const body = (
        <>
          <span className="font-semibold text-sm">{monthYear(month)}</span>
          {lowest === null && <span className="text-xs">Antes do início</span>}
          {lowest !== null && !neutral && <span className="text-xs">{TIER_LABEL[lowest]}</span>}
          {lowest !== null && !neutral && redDays > 0 && (
            <span
              aria-hidden
              className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-tier-red px-1 font-bold text-white text-xs"
            >
              {redDays}
            </span>
          )}
        </>
      );
      const name = nameOf(ahead, neutral);
      if (!onOpen)
        return (
          <li key={month} aria-label={name} className={style}>
            {body}
          </li>
        );
      return (
        <li key={month}>
          <button
            type="button"
            aria-label={name}
            aria-disabled={lowest === null || undefined}
            aria-current={month === current ? "date" : undefined}
            onClick={lowest === null ? undefined : () => onOpen(month)}
            className={cn(style, "focus-visible:outline-2 focus-visible:outline-ring")}
          >
            {body}
          </button>
        </li>
      );
    })}
  </ul>
);
```

- [ ] **Step 4: Run to see green**

Run: Step 2 + `pnpm vitest run src/features/add-transaction/transaction-sheet.test.tsx` + `pnpm typecheck && pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add web/src/shared/lib/date.ts web/src/shared/lib/date.test.ts web/src/entities/forecast web/src/test/stub-api.ts web/src/features/add-transaction/transaction-sheet.tsx
git commit -m "feat(web): SOL-51 forecast query, month summaries and chips"
```

### Task 8: `Próximos meses` card and drill-down

**Files:**
- Create: `web/src/widgets/months-ahead/months-ahead.tsx`, `months-ahead.test.tsx`
- Modify: `web/src/app/(app)/(shell)/mes/page.tsx` (+ `page.test.tsx`)
- Model: `ThermometerCard` in `widgets/month-overview/month-overview.tsx` (card frame, icon header); Lançar's kind `ToggleGroup` in `transaction-sheet.tsx`; `PageError` retry in `mes/page.tsx`.

**Interfaces:**
- Consumes: Task 7's `useForecast`, `monthsAhead`, `isFlat`, `MonthChips`.
- Produces: `MonthsAhead({ viewing: string; onOpen: (month: string) => void; className?: string })`.

- [ ] **Step 1: Write the failing tests**

`widgets/months-ahead/months-ahead.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/test/render";
import { FORECAST, FORECAST_FLAT, FORECAST_LATE_OPENING, problem, stubApi } from "@/test/stub-api";

import { MonthsAhead } from "./months-ahead";

const show = (reply: { status: number; body?: unknown }) => {
  const requests = stubApi({ "GET /api/forecast": reply });
  const onOpen = vi.fn();
  renderWithQuery(<MonthsAhead viewing="2026-11" onOpen={onOpen} />);
  return { requests, onOpen };
};

const card = () => screen.getByRole("region", { name: "Próximos meses" });
const chips = () => within(card()).getAllByRole("button", { name: /\d{4}/ });

describe("Próximos meses", () => {
  it("shows six months, twelve on the toggle without asking again, and opens one", async () => {
    const { requests, onOpen } = show({ status: 200, body: FORECAST });

    expect(await within(card()).findByRole("button", { name: "nov 2026: Crítico, 7 dias no vermelho" })).toHaveAttribute(
      "aria-current",
      "date",
    );
    expect(chips()).toHaveLength(6);
    await userEvent.click(within(card()).getByRole("radio", { name: "12 meses" }));
    expect(chips()).toHaveLength(12);
    expect(chips()[11]).toHaveAccessibleName(/^out 2027/);
    expect(requests.filter((request) => request.url.endsWith("/api/forecast"))).toHaveLength(1);

    await userEvent.click(within(card()).getByRole("button", { name: /^dez 2026/ }));
    expect(onOpen).toHaveBeenCalledWith("2026-12");
  });

  it("teaches when nothing is typed ahead", async () => {
    show({ status: 200, body: FORECAST_FLAT });
    expect(await within(card()).findByText("Lance seus próximos meses para ver a cor deles aqui.")).toBeInTheDocument();
    expect(card()).not.toHaveTextContent("Confortável");
  });

  it("disables the months before the opening date", async () => {
    show({ status: 200, body: FORECAST_LATE_OPENING });
    expect(await within(card()).findByRole("button", { name: "nov 2026: antes do início" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("says so when it fails and tries again", async () => {
    const { requests } = show({ status: 500, body: problem(500, "Erro") });
    await userEvent.click(await within(card()).findByRole("button", { name: "Tentar de novo" }));
    expect(card()).toHaveTextContent("Não foi possível carregar.");
    expect(requests.filter((request) => request.url.endsWith("/api/forecast")).length).toBeGreaterThan(1);
  });
});
```

(If the query client in `renderWithQuery` retries, the error test needs `retry: false` — check `src/test/render.tsx`; it already disables retries for the other error tests.)

`mes/page.test.tsx`:

```ts
  it("opens a month from Próximos meses at the top of the screen", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    open({ "GET /api/forecast": { status: 200, body: FORECAST } });

    const strip = await screen.findByRole("region", { name: "Próximos meses" });
    await userEvent.click(await within(strip).findByRole("button", { name: /^dez 2026/ }));

    expect(router.replace).toHaveBeenCalledWith("/mes?m=2026-12", { scroll: false });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });
```

- [ ] **Step 2: Run to see red**

Run: `pnpm vitest run src/widgets/months-ahead "src/app/(app)/(shell)/mes/page.test.tsx"`
Expected: `Failed to resolve import "./months-ahead"`; the page test finds no `Próximos meses` region.

- [ ] **Step 3: Minimal implementation**

`widgets/months-ahead/months-ahead.tsx`:

```tsx
"use client";

import { useState } from "react";

import { CalendarRange } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useForecast } from "@/entities/forecast/forecast-query";
import { MonthChips } from "@/entities/forecast/month-chips";
import { isFlat, monthsAhead } from "@/entities/forecast/months-ahead";
import { cn } from "@/lib/utils";

const HORIZONS = [
  { value: "6", label: "6 meses" },
  { value: "12", label: "12 meses" },
];

const SLOTS = Array.from({ length: 12 }, (_, index) => `slot-${index}`);

const toggle =
  "h-11 rounded-xl! font-semibold text-base text-muted-foreground data-[state=on]:bg-brand data-[state=on]:text-brand-foreground data-[state=on]:shadow-sm";

type Props = { viewing: string; onOpen: (month: string) => void };

const Body = ({ count, viewing, onOpen }: Props & { count: number }) => {
  const forecast = useForecast();
  if (forecast.isError)
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-sm">
        Não foi possível carregar.
        <button
          type="button"
          onClick={() => forecast.refetch()}
          className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Tentar de novo
        </button>
      </p>
    );
  if (!forecast.data)
    return (
      <div className="grid grid-cols-3 gap-2">
        {SLOTS.slice(0, count).map((slot) => (
          <Skeleton key={slot} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  const flat = isFlat(forecast.data);
  return (
    <>
      <MonthChips months={monthsAhead(forecast.data, count)} neutral={flat} current={viewing} onOpen={onOpen} />
      {flat && <p className="text-muted-foreground text-sm">Lance seus próximos meses para ver a cor deles aqui.</p>}
    </>
  );
};

/** `Próximos meses`: today's month and the next 5 or 11, each by its lowest tier (D16); the toggle asks nothing new. */
export const MonthsAhead = ({ viewing, onOpen, className }: Props & { className?: string }) => {
  const [count, setCount] = useState("6");
  return (
    <section
      aria-labelledby="months-ahead-title"
      className={cn("flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6", className)}
    >
      <h2 id="months-ahead-title" className="flex items-center gap-3 font-semibold text-lg leading-6">
        <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-primary">
          <CalendarRange className="size-5" aria-hidden />
        </span>
        Próximos meses
      </h2>
      <ToggleGroup
        type="single"
        spacing={0}
        value={count}
        onValueChange={(value: string) => value && setCount(value)}
        aria-label="Horizonte"
        className="grid w-full grid-cols-2 rounded-2xl bg-muted p-1"
      >
        {HORIZONS.map((horizon) => (
          <ToggleGroupItem key={horizon.value} value={horizon.value} className={toggle}>
            {horizon.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Body count={Number(count)} viewing={viewing} onOpen={onOpen} />
    </section>
  );
};
```

`mes/page.tsx`: the side column becomes one sticky wrapper holding both cards:

```tsx
        <div className="flex flex-col gap-6 lg:sticky lg:top-6 lg:col-start-3 lg:row-span-2 lg:row-start-1">
          <ThermometerCard view={view.data} />
          <MonthsAhead
            viewing={month}
            onOpen={(next) => {
              router.replace(`/mes?m=${next}`, { scroll: false });
              window.scrollTo({ top: 0 });
            }}
          />
        </div>
```

(`ThermometerCard` loses its placement classes; import `MonthsAhead` from `@/widgets/months-ahead/months-ahead`.)

- [ ] **Step 4: Run to see green**

Run: Step 2 + `pnpm typecheck && pnpm lint`; then the whole `src/app` folder once (`signedIn` now answers the forecast; no other page test may change).

- [ ] **Step 5: Commit**

```bash
git add web/src/widgets/months-ahead "web/src/app/(app)/(shell)/mes"
git commit -m "feat(web): SOL-51 Próximos meses card in Mês"
```

### Task 9: E2E — this and next month Crítico, chip opens next month

**Files:**
- Create: `web/e2e/months-ahead.spec.ts` (copy `web/e2e/forecast.spec.ts`: health skip, sign-up with Aluguel R$ 1.600,00 day 28, `nextMonthDay`)

- [ ] **Step 1: Write the spec**

After the onboarding lines of `forecast.spec.ts`:

```ts
  const strip = page.getByRole("region", { name: "Próximos meses" });
  const chips = strip.getByRole("button", { name: /\d{4}/ });
  await expect(chips).toHaveCount(6);
  await expect(chips.nth(0)).toHaveAccessibleName(/: Crítico, \d+ dias? no vermelho$/);
  await expect(chips.nth(1)).toHaveAccessibleName(/: Crítico, \d+ dias? no vermelho$/);
  await strip.getByRole("radio", { name: "12 meses" }).click();
  await expect(chips).toHaveCount(12);

  await chips.nth(1).click();
  await expect(page).toHaveURL(new RegExp(`m=${nextMonthDay(1).slice(0, 7)}`));
  const hero = page.getByRole("region", { name: "Saldo hoje" });
  await expect(hero.getByRole("button", { name: /Dia 1 fica no vermelho: -R\$\s600,00/ })).toBeVisible();
  await expect(hero.getByRole("button", { name: /Pior dia: 28\/\d\d, -R\$\s2\.200,00/ })).toBeVisible();
```

Title: `"Próximos meses paints this and next month Crítico and a chip opens next month"`.

- [ ] **Step 2: Run** — server on 8080 (`soldi_51`) + `pnpm e2e e2e/months-ahead.spec.ts` → pass, not skipped.

- [ ] **Step 3: Commit**

```bash
git add web/e2e/months-ahead.spec.ts
git commit -m "test(web): SOL-51 chips paint the coming months and open one"
```

### SOL-51 gate and review

- Gate as in SOL-55.
- `qa` (new endpoint, contract): 4 queries per request, all `user_id`-scoped; horizon exactly 12 months, leap Feb; opening in the future / past the horizon; forecast day == month-view day; 401 without session; OpenAPI snapshot and `schema.d.ts` in the commit; `["month", "forecast"]` refreshes after paying a bill, launching, editing thresholds.
- `pixel` (new component `MonthChips`, badge colors): 375 and 1440, light and dark — no horizontal scroll, `Confortável` fits, badge contrast (`text-white` on `bg-tier-red`; designer swaps for a token if it fails AA), ring of the viewed month, disabled and neutral chips.

---

# SOL-52 — `/Users/emerson/Documents/workspace/open-source/soldi-52`, `feat/SOL-52-posso-comprar`

### Task 10: `installments` contract and the split (domain)

**Files:**
- Modify: `crates/soldi-types/src/transactions.rs` (`CreateTransaction` after `repeat_months`; serde test), `crates/soldi-server/src/transactions/domain.rs` (`check`, new `installment_amounts`; tests)
- Modify (literals, `installments: None`): `crates/soldi-server/src/transactions/domain.rs:160`, `transactions/repo.rs:429`, `bills/service.rs:124`, `cofrinhos/service.rs:62`, and every `CreateTransaction {` in tests (`rg 'repeat_months: None' crates`)
- Model: `check_repeat`, `r2_a_repeat_counts_2_to_60_entries`, `r1_each_copy_clamps_…` in the same file.

**Interfaces:**
- Produces (Rust): `CreateTransaction.installments: Option<i16>`; `pub fn installment_amounts(total: Decimal, count: i16) -> Vec<Decimal>` (`count` entries, sum == `total`).

- [ ] **Step 1: Write the failing tests** (`transactions/domain.rs` tests)

```rust
    fn amounts(total: &str, count: i16) -> Vec<String> {
        installment_amounts(total.parse().unwrap(), count)
            .iter()
            .map(|amount| amount.to_string())
            .collect()
    }

    #[test]
    fn r9_installments_split_half_even_with_the_remainder_on_the_last() {
        let ten = amounts("1000.01", 10);
        assert_eq!(ten[..9], vec!["100.00"; 9]);
        assert_eq!(ten[9], "100.01");
        assert_eq!(amounts("100.00", 3), ["33.33", "33.33", "33.34"]);
        assert_eq!(amounts("1000.00", 12)[11], "83.37");
        assert_eq!(amounts("0.05", 2), ["0.02", "0.03"]);
        let sum: Decimal = installment_amounts("1000.01".parse().unwrap(), 10).iter().sum();
        assert_eq!(sum, "1000.01".parse::<Decimal>().unwrap());
    }

    #[test]
    fn r9_installments_are_2_to_60_alone_and_never_leave_a_parcela_at_zero() {
        let split = |amount: &str, installments: i16, repeat_months: Option<i16>| CreateTransaction {
            installments: Some(installments),
            repeat_months,
            ..entry(amount, None)
        };
        assert!(check(split("1000.01", 10, None)).is_ok());
        assert!(check(split("60", 60, None)).is_ok());
        for input in [
            split("10", 1, None),
            split("10", 61, None),
            split("10", 3, Some(3)),
            split("0.06", 4, None),
            split("0.01", 2, None),
        ] {
            assert_eq!(field(check(input)), "installments");
        }
    }
```

(`entry(amount, note)` is the module's existing `CreateTransaction` helper; it gains `installments: None`. Clippy may ask `ten[..9] == ["100.00"; 9]`; follow it.)

`soldi-types/src/transactions.rs` test `amounts_are_strings_and_a_null_note_clears_it`: append

```rust
        let split: CreateTransaction = serde_json::from_value(json!({
            "date": "2026-11-05", "amount": "1000.01", "kind": "bill", "category_id": uuid::Uuid::nil(), "installments": 10
        }))
        .unwrap();
        assert_eq!((split.installments, create.installments), (Some(10), None));
```

- [ ] **Step 2: Run to see red**

Run: `cargo test -p soldi-types transactions && cargo test -p soldi-server --lib transactions::domain`
Expected: `no field installments`, `cannot find function installment_amounts`.

- [ ] **Step 3: Minimal implementation**

`soldi-types/src/transactions.rs`, after `repeat_months` in `CreateTransaction`:

```rust
    /// 2 to 60 monthly parcelas splitting `amount`, the total: each `amount / n` half-even to
    /// cents, the last takes the remainder (D16); dated like `repeat_months`; not with it.
    #[serde(default)]
    #[schema(minimum = 2, maximum = 60)]
    pub installments: Option<i16>,
```

`transactions/domain.rs` (import `rust_decimal::RoundingStrategy`):

```rust
/// R9 (D16 rule 3): `total` in `count` parcelas, half-even to cents; the last takes the remainder.
pub fn installment_amounts(total: Decimal, count: i16) -> Vec<Decimal> {
    let rest = count.saturating_sub(1);
    let each = (total / Decimal::from(count))
        .round_dp_with_strategy(2, RoundingStrategy::MidpointNearestEven);
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
    if installment_amounts(amount, count)
        .iter()
        .any(|part| *part <= Decimal::ZERO)
    {
        return Err(AppError::invalid(
            "installments",
            "must leave every installment above zero",
        ));
    }
    Ok(())
}
```

In `check`, after `input.repeat_months.map(check_repeat).transpose()?;`: `check_installments(&input, amount)?;`.

Every other `CreateTransaction { … }` literal: `installments: None,`.

- [ ] **Step 4: Run to see green** — Step 2 + `cargo clippy --workspace --all-targets -- -D warnings`.

- [ ] **Step 5: Commit**

```bash
git add crates
git commit -m "feat(server): SOL-52 split a total into parcelas, half-even, remainder last"
```

### Task 11: Write parcelas as a series (repo, service, integration, OpenAPI)

**Files:**
- Modify: `crates/soldi-server/src/transactions/repo.rs:186-208` (`insert_copies` takes amounts), `transactions/service.rs:77-104` (`create`) and `:150-151` (update's repeat call), `transactions/handler.rs:97-101` (422 doc), `crates/soldi-server/tests/transactions.rs`
- Regenerate: `.sqlx/`, `web/openapi.json`, `web/src/shared/api/schema.d.ts`
- Model: `r1_r2_r7_twelve_months_write_twelve_exact_entries_on_clamped_dates` and `repeat_months_outside_2_to_60_is_refused` (helpers `opened`, `month`, `only`, `place`).

**Interfaces:**
- Produces: `repo::insert_copies(conn, user_id, entry: &CreateTransaction, series_id: Uuid, dates: &[NaiveDate], amounts: &[Decimal])`; `POST /api/transactions` with `installments` → 201 first parcela.

- [ ] **Step 1: Write the failing tests** (`tests/transactions.rs`)

```rust
#[sqlx::test]
async fn r9_ten_parcelas_of_1000_01_write_ten_entries_summing_the_total(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let market = user.category_id("Mercado").await;

    let (status, created) = user
        .post(
            "/api/transactions",
            json!({ "date": "2027-01-31", "amount": "1000.01", "kind": "daily", "category_id": market, "installments": 10 }),
        )
        .await;

    assert_eq!(status, StatusCode::CREATED, "{created}");
    assert_eq!((created["amount"].as_str(), place(&created)), (Some("100.00"), (1, 10)));
    let february = only(&user, "2027-02").await;
    assert_eq!((february["date"].as_str(), february["amount"].as_str()), (Some("2027-02-28"), Some("100.00")));
    let october = only(&user, "2027-10").await;
    assert_eq!((october["amount"].as_str(), place(&october)), (Some("100.01"), (10, 10)));
    let mut cents = 0;
    for of in 1..=10 {
        let entry = only(&user, &format!("2027-{of:02}")).await;
        cents += entry["amount"].as_str().unwrap().replace('.', "").parse::<i64>().unwrap();
    }
    assert_eq!(cents, 100_001);
    assert!(month(&user, "2027-11").await.is_empty());
}

#[sqlx::test]
async fn installments_out_of_range_with_repeat_or_too_small_are_refused(pool: PgPool) {
    let user = opened(pool, "ana@example.com").await;
    let market = user.category_id("Mercado").await;

    for (amount, extra) in [
        ("10", json!({ "installments": 1 })),
        ("10", json!({ "installments": 61 })),
        ("10", json!({ "installments": 3, "repeat_months": 3 })),
        ("0.06", json!({ "installments": 4 })),
    ] {
        let mut body = json!({ "date": "2026-11-05", "amount": amount, "kind": "daily", "category_id": market });
        body.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone());
        let (status, problem) = user.post("/api/transactions", body).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
        assert_eq!(problem["errors"][0]["field"], "installments");
    }
    assert!(month(&user, "2026-11").await.is_empty());
}
```

(`opened` sets the opening date; if it is after 2027-01-31's needs, keep it — the r1 test already writes 2027 dates.)

- [ ] **Step 2: Run to see red**

Run: `DATABASE_URL=…/soldi_52 cargo test -p soldi-server --test transactions r9 installments`
Expected: the first test sees `amount` 1000.01 and `series` null (installments ignored).

- [ ] **Step 3: Minimal implementation**

`transactions/repo.rs`:

```rust
/// Copies of `entry` on each of `dates`, in `series_id`, with `amounts[i]` on `dates[i]`.
pub async fn insert_copies(
    conn: &mut PgConnection,
    user_id: Uuid,
    entry: &CreateTransaction,
    series_id: Uuid,
    dates: &[NaiveDate],
    amounts: &[Decimal],
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO transactions (user_id, date, amount, kind, category_id, note, series_id)
         SELECT $1, c.d, c.a, $4, $5, $6, $7 FROM UNNEST($2::date[], $3::numeric[]) AS c(d, a)",
        user_id,
        dates,
        amounts,
        entry.kind.as_str(),
        entry.category_id,
        entry.note,
        series_id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}
```

`transactions/service.rs` `create`:

```rust
    let count = input.repeat_months.or(input.installments);
    let amounts = match input.installments {
        Some(parcelas) => domain::installment_amounts(input.amount, parcelas),
        None => vec![input.amount; usize::try_from(count.unwrap_or(1)).unwrap_or(1)],
    };
    let first = CreateTransaction {
        amount: amounts[0],
        ..input
    };
    let series_id = count.map(|_| Uuid::new_v4());
    let id = repo::insert(&mut tx, user.id, &first, None, None, series_id).await?;
    if let (Some(count), Some(series_id)) = (count, series_id) {
        let dates = domain::repeat_dates(first.date, count);
        repo::insert_copies(&mut tx, user.id, &first, series_id, &dates, &amounts[1..]).await?;
    }
    tx.commit().await?;
    let series = series_id.zip(count).map(|(id, total)| TransactionSeries {
        id,
        position: 1,
        total: total.into(),
    });
    Ok(Transaction {
        series,
        ..domain::transaction(id, first, category, None)
    })
```

Update path (`:150-151`): `repo::insert_copies(&mut tx, user.id, &next, series_id, &dates, &vec![next.amount; dates.len()]).await?;`

`handler.rs` 422 description: append `, `installments` not 2 to 60, with `repeat_months`, or leaving a parcela at zero`. 201 description: `The entry; with `repeat_months` or `installments`, the first of its series (parcela 1), the rest written in the same database transaction`.

Then `scripts/sqlx-prepare.sh`, `UPDATE_OPENAPI=1 cargo test -p soldi-server --test openapi`, `cd web && pnpm gen:api`.

- [ ] **Step 4: Run to see green** — `DATABASE_URL=…/soldi_52 cargo test --workspace && scripts/sqlx-prepare.sh --check`.

- [ ] **Step 5: Commit**

```bash
git add crates .sqlx web/openapi.json web/src/shared/api/schema.d.ts
git commit -m "feat(server): SOL-52 POST parcelas as one series with the remainder last"
```

### Task 12: Web shared math and the optimistic parcela

**Files:**
- Create: `web/src/shared/lib/installments.ts`, `installments.test.ts`
- Modify: `web/src/shared/lib/date.ts` (+ test: `repeatDates`), `web/src/shared/lib/tier.ts` (+ test: `fromCents`), `web/src/entities/transaction/transaction-queries.ts` (+ test)
- Model: `shared/lib/tier.test.ts`; `transaction-queries.test.tsx` optimistic create test.

**Interfaces:**
- Produces: `installmentCents(total: number, count: number): number[]`; `repeatDates(date: string, count: number): string[]` (the `count - 1` copies' dates); `fromCents(value: number): string`.

- [ ] **Step 1: Write the failing tests**

`installments.test.ts` (same vectors as the server):

```ts
import { describe, expect, it } from "vitest";

import { installmentCents } from "./installments";

describe("installmentCents", () => {
  it("splits half-even with the remainder on the last, like the server", () => {
    expect(installmentCents(100_001, 10)).toEqual([...Array(9).fill(10_000), 10_001]);
    expect(installmentCents(10_000, 3)).toEqual([3333, 3333, 3334]);
    expect(installmentCents(100_000, 12).at(-1)).toBe(8337);
    expect(installmentCents(5, 2)).toEqual([2, 3]);
    expect(installmentCents(6, 4)).toEqual([2, 2, 2, 0]);
    expect(installmentCents(1, 2)).toEqual([0, 1]);
  });
});
```

`date.test.ts`:

```ts
  it("dates the copies of a repeat like the server, clamped to short months", () => {
    expect(repeatDates("2027-01-31", 4)).toEqual(["2027-02-28", "2027-03-31", "2027-04-30"]);
    expect(repeatDates("2028-01-31", 2)).toEqual(["2028-02-29"]);
    expect(repeatDates("2026-11-05", 1)).toEqual([]);
  });
```

`tier.test.ts`:

```ts
  it("turns cents back into an API decimal", () => {
    expect([fromCents(-67_500), fromCents(5), fromCents(-5), fromCents(0), fromCents(615_000)]).toEqual([
      "-675.00", "0.05", "-0.05", "0.00", "6150.00",
    ]);
  });
```

`transaction-queries.test.tsx` (model: the existing optimistic create test):

```ts
  it("shows parcela 1 optimistically, never the total", async () => {
    // seed ["transactions", "2026-11"] as the existing test does, hold the POST with the gate
    act(() => view.result.current.create.mutate({ ...NEW_ROW, amount: "1000.01", installments: 10 }));
    await waitFor(() =>
      expect(view.client.getQueryData<Transaction[]>(["transactions", "2026-11"])?.[0].amount).toBe("100.00"),
    );
  });
```

(Use the file's existing `NEW_ROW`/seed/gate names; the point is the asserted `"100.00"`.)

- [ ] **Step 2: Run to see red**

Run: `pnpm vitest run src/shared/lib src/entities/transaction/transaction-queries.test.tsx`

- [ ] **Step 3: Minimal implementation**

`shared/lib/installments.ts`:

```ts
/** D16 rule 3 in whole cents, the server's `installment_amounts`: `total / count` half-even, the last takes the remainder. */
export const installmentCents = (total: number, count: number) => {
  const quotient = Math.floor(total / count);
  const remainder = total - quotient * count;
  const roundsUp = remainder * 2 > count || (remainder * 2 === count && quotient % 2 === 1);
  const each = quotient + (roundsUp ? 1 : 0);
  return [...Array.from({ length: count - 1 }, () => each), total - each * (count - 1)];
};
```

`shared/lib/date.ts`:

```ts
const lastDay = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

/** The server's `repeat_dates`: `date`'s day in each of the next `count - 1` months, clamped to the month's last day. */
export const repeatDates = (date: string, count: number) =>
  Array.from({ length: count - 1 }, (_, index) => {
    const month = addMonths(date.slice(0, 7), index + 1);
    return `${month}-${pad(Math.min(Number(date.slice(8, 10)), lastDay(month)))}`;
  });
```

`shared/lib/tier.ts`:

```ts
/** Whole cents back to an API decimal: `-67500` → `-675.00`. */
export const fromCents = (value: number) => {
  const digits = String(Math.abs(value)).padStart(3, "0");
  return `${value < 0 ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
};
```

`transaction-queries.ts` `useCreateTransaction.onMutate`:

```ts
      const { category_id: _id, installments, ...row } = input;
      const amount = installments ? fromCents(installmentCents(cents(row.amount), installments)[0]) : row.amount;
      client.setQueryData(queryKey, (list) => list && [{ ...row, amount, id: `optimistic-${Date.now()}` }, ...list]);
```

- [ ] **Step 4: Run to see green** — Step 2 + `pnpm typecheck && pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add web/src/shared/lib web/src/entities/transaction
git commit -m "feat(web): SOL-52 parcela split, repeat dates and cents in the web"
```

### Task 13: `withDraft` and `draftVerdict` (entities/forecast)

**Files:**
- Modify: `web/src/entities/forecast/months-ahead.ts` (+ test)
- Model: Task 7's `monthsAhead` tests.

**Interfaces:**
- Produces: `type DraftRow = { date: string; cents: number }` (signed, outflow negative); `withDraft(days: ForecastDay[], rows: DraftRow[], bounds: TierBounds): ForecastDay[]`; `type Verdict = { kind: "turns-red"; date: string } | { kind: "already-red" } | { kind: "clear" }`; `draftVerdict(before: ForecastDay[], after: ForecastDay[]): Verdict`.

- [ ] **Step 1: Write the failing tests** (append to `months-ahead.test.ts`; import `SETTINGS`)

```ts
describe("withDraft", () => {
  it("lowers every day on and after the draft and recolors it", () => {
    const after = withDraft(FORECAST.days, [{ date: "2026-11-12", cents: -100_000 }], SETTINGS);
    const on = (date: string) => after.find((day) => day.date === date);

    expect(on("2026-11-11")).toMatchObject({ projected_balance: "6150.00", projected_tier: "green" });
    expect(on("2026-11-12")).toMatchObject({ projected_balance: "5150.00", projected_tier: "green" });
    expect(on("2026-11-30")).toMatchObject({ projected_balance: "-509.00", projected_tier: "red" });
  });

  it("shifts every day for a draft dated before the forecast starts", () => {
    const after = withDraft(FORECAST_FLAT.days, [{ date: "2026-11-05", cents: -5_000 }], SETTINGS);
    expect(after.every((day) => day.projected_balance === "1792.10")).toBe(true);
  });
});

describe("draftVerdict", () => {
  const verdictOf = (rows: DraftRow[], forecast = FORECAST) =>
    draftVerdict(forecast.days, withDraft(forecast.days, rows, SETTINGS));

  it("names the first day the draft turns red", () => {
    expect(verdictOf([{ date: "2026-11-10", cents: -670_000 }])).toEqual({ kind: "turns-red", date: "2026-11-10" });
  });

  it("says when red days were already there", () => {
    expect(verdictOf([{ date: "2026-11-24", cents: -10_000 }])).toEqual({ kind: "already-red" });
  });

  it("is clear when no day is red", () => {
    expect(verdictOf([{ date: "2026-11-10", cents: -5_000 }], FORECAST_FLAT)).toEqual({ kind: "clear" });
  });
});
```

- [ ] **Step 2: Run to see red** — `pnpm vitest run src/entities/forecast/months-ahead.test.ts`.

- [ ] **Step 3: Minimal implementation** (append; import `fromCents`, `type TierBounds`, `tierOf`)

```ts
/** A draft entry in signed cents: an outflow is negative. */
export type DraftRow = { date: string; cents: number };

/** `days` with every draft row dated on or before each one added, recolored with the user's bounds. */
export const withDraft = (days: ForecastDay[], rows: DraftRow[], bounds: TierBounds): ForecastDay[] =>
  days.map((day) => {
    const shift = rows.reduce((sum, row) => (row.date <= day.date ? sum + row.cents : sum), 0);
    const balance = fromCents(cents(day.projected_balance) + shift);
    return { ...day, projected_balance: balance, projected_tier: tierOf(balance, bounds) };
  });

export type Verdict = { kind: "turns-red"; date: string } | { kind: "already-red" } | { kind: "clear" };

/** The first day the draft turns red; `already-red` when red days exist but the draft adds none. */
export const draftVerdict = (before: ForecastDay[], after: ForecastDay[]): Verdict => {
  const turned = after.find((day, index) => day.projected_tier === "red" && before[index].projected_tier !== "red");
  if (turned) return { kind: "turns-red", date: turned.date };
  return after.some((day) => day.projected_tier === "red") ? { kind: "already-red" } : { kind: "clear" };
};
```

- [ ] **Step 4: Run to see green**; **Step 5: Commit**

```bash
git add web/src/entities/forecast
git commit -m "feat(web): SOL-52 apply a draft to the forecast and judge it"
```

### Task 14: Lançar — `Simular`, `Parcelar`, preview, `Lançar de verdade` / `Descartar`

**Files:**
- Create: `web/src/features/add-transaction/draft-rows.ts` (+ `draft-rows.test.ts`), `simulation.tsx`
- Modify: `web/src/features/add-transaction/transaction-sheet.tsx` (+ `transaction-sheet.test.tsx`)
- Model: the `Repetir` block (switch row, presets, custom input, summary) in `transaction-sheet.tsx`; the "repeats a launch…" test.

**Interfaces:**
- Consumes: `withDraft`, `draftVerdict`, `monthsAhead`, `MonthChips`, `useForecast` (entities/forecast); `settingsQuery` (entities/settings); `installmentCents`, `repeatDates`, `fromCents`, `cents`.
- Produces: `draftRows({ kind, amount, date, plan, count }): DraftRow[]` with `plan: "once" | "repeat" | "installments"`; `Simulation({ rows: DraftRow[] | null })`; `TransactionForm` gains `onDiscard: () => void`; `NewTransaction` carries `installments`.

- [ ] **Step 1: Write the failing tests**

`draft-rows.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { draftRows } from "./draft-rows";

describe("draftRows", () => {
  it("is one negative row for a purchase and positive for an Entrada", () => {
    expect(draftRows({ kind: "bill", amount: "6700.00", date: "2026-11-10", plan: "once", count: 12 })).toEqual([
      { date: "2026-11-10", cents: -670_000 },
    ]);
    expect(draftRows({ kind: "income", amount: "10.00", date: "2026-11-10", plan: "once", count: 12 })[0].cents).toBe(1000);
  });

  it("copies the amount on each repeat and splits it on each parcela", () => {
    expect(draftRows({ kind: "daily", amount: "50.00", date: "2027-01-31", plan: "repeat", count: 2 })).toEqual([
      { date: "2027-01-31", cents: -5000 },
      { date: "2027-02-28", cents: -5000 },
    ]);
    const parcelas = draftRows({ kind: "bill", amount: "1000.01", date: "2026-11-10", plan: "installments", count: 10 });
    expect(parcelas.map((row) => row.cents)).toEqual([...Array(9).fill(-10_000), -10_001]);
    expect(parcelas[9].date).toBe("2027-08-10");
  });
});
```

`transaction-sheet.test.tsx` (setup replies add `"GET /api/forecast": { status: 200, body: FORECAST }` and `"GET /api/settings": { status: 200, body: SETTINGS }`; import `FORECAST`, `FORECAST_FLAT`, `SETTINGS`):

```ts
  it("simulates without writing: the verdict follows each keystroke, Descartar closes", async () => {
    const { requests, onOpenChange } = setup({}, { "GET /api/forecast": { status: 200, body: FORECAST }, "GET /api/settings": { status: 200, body: SETTINGS } });

    await userEvent.click(await screen.findByRole("switch", { name: "Simular" }));
    expect(screen.getByText("Digite um valor para simular.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Saída" }));
    await userEvent.click(screen.getByLabelText("Valor"));
    await userEvent.keyboard("6700,00");

    const simulation = await screen.findByRole("region", { name: "Simulação" });
    expect(within(simulation).getByRole("status")).toHaveTextContent("Com essa compra, hoje vira Crítico");
    const week = within(simulation).getByRole("list", { name: "Próximos 7 dias" });
    expect(within(week).getAllByRole("listitem")).toHaveLength(7);
    expect(within(week).getAllByRole("listitem")[0]).toHaveTextContent("10/11Crítico");

    await userEvent.click(screen.getByRole("switch", { name: "Simular" }));
    await userEvent.click(screen.getByRole("switch", { name: "Simular" }));
    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);
    expect(requests.filter((request) => request.url.endsWith("/api/forecast"))).toHaveLength(1);
  });

  it("says when red days were already there and when none come", async () => {
    setup({}, { "GET /api/forecast": { status: 200, body: FORECAST }, "GET /api/settings": { status: 200, body: SETTINGS } });
    await userEvent.click(await screen.findByRole("switch", { name: "Simular" }));
    await userEvent.click(screen.getByLabelText("Valor"));
    await userEvent.keyboard("100,00");
    fireEvent.change(screen.getByLabelText("Outra data"), { target: { value: "2026-11-24" } });
    expect(await screen.findByRole("status")).toHaveTextContent("Essa compra não cria dia vermelho novo.");
  });

  it("is clear on a flat forecast", async () => {
    setup({}, { "GET /api/forecast": { status: 200, body: FORECAST_FLAT }, "GET /api/settings": { status: 200, body: SETTINGS } });
    await userEvent.click(await screen.findByRole("switch", { name: "Simular" }));
    await userEvent.click(screen.getByLabelText("Valor"));
    await userEvent.keyboard("50,00");
    expect(await screen.findByRole("status")).toHaveTextContent("Nenhum dia vermelho com essa compra.");
  });

  it("parcela 1.000,01 em 10x: summary, the months strip, and Lançar de verdade posts the total once", async () => {
    const { sent } = setup({}, { "GET /api/forecast": { status: 200, body: FORECAST }, "GET /api/settings": { status: 200, body: SETTINGS } });
    await userEvent.click(await screen.findByRole("switch", { name: "Simular" }));
    await userEvent.click(screen.getByLabelText("Valor"));
    await userEvent.keyboard("1000,01");
    await userEvent.click(screen.getByRole("switch", { name: "Parcelar" }));
    expect(screen.getByRole("switch", { name: "Repetir" })).not.toBeChecked();
    await userEvent.click(within(screen.getByRole("group", { name: "Quantas parcelas" })).getByRole("radio", { name: "Outro" }));
    await userEvent.type(screen.getByLabelText("Parcelas"), "10");

    expect(screen.getByText("9× R$ 100,00 + R$ 100,01 na última · até ago 2027")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Meses com essa compra" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Lançar de verdade" }));

    const body = await sent("POST");
    expect(body).toMatchObject({ amount: "1000.01", installments: 10 });
    expect(body).not.toHaveProperty("repeat_months");
    expect(await screen.findByText("10 parcelas lançadas")).toBeInTheDocument();
  });

  it("refuses a parcela at zero and offers Parcelar only on Saída and Diário, never when editing", async () => {
    setup();
    await userEvent.click(screen.getByLabelText("Valor"));
    await userEvent.keyboard("0,06");
    await userEvent.click(await screen.findByRole("switch", { name: "Parcelar" }));
    await userEvent.click(within(screen.getByRole("group", { name: "Quantas parcelas" })).getByRole("radio", { name: "Outro" }));
    await userEvent.type(screen.getByLabelText("Parcelas"), "4");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Valor pequeno demais para 4 parcelas.");

    await userEvent.click(screen.getByRole("radio", { name: "Entrada" }));
    expect(screen.queryByRole("switch", { name: "Parcelar" })).not.toBeInTheDocument();
  });

  it("offers no Simular nor Parcelar when editing", async () => {
    setup({ transaction: MERCADO_ROW });
    await screen.findByRole("dialog", { name: "Editar lançamento" });
    expect(screen.queryByRole("switch", { name: "Simular" })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Parcelar" })).not.toBeInTheDocument();
  });
```

(`group` is the role the `ToggleGroup` root renders with `aria-label`; if it renders `radiogroup`, use that, as the existing repeat test does for `Quantas vezes`. The sheet test clock is 05/11; the forecast fixture starts on 10/11, so a draft dated 05/11 shifts every day and the 7 days start on 10/11.)

- [ ] **Step 2: Run to see red** — `pnpm vitest run src/features/add-transaction`.

- [ ] **Step 3: Minimal implementation**

`draft-rows.ts`:

```ts
import type { DraftRow } from "@/entities/forecast/months-ahead";
import type { Schemas } from "@/shared/api/client";
import { repeatDates } from "@/shared/lib/date";
import { installmentCents } from "@/shared/lib/installments";
import { cents } from "@/shared/lib/tier";

export type Plan = "once" | "repeat" | "installments";

type Draft = { kind: Schemas["CategoryKind"]; amount: string; date: string; plan: Plan; count: number };

/** What Lançar would write, in signed cents: one row, `count` copies (Repetir) or `count` parcelas (Parcelar). */
export const draftRows = ({ kind, amount, date, plan, count }: Draft): DraftRow[] => {
  const sign = kind === "income" ? 1 : -1;
  if (plan === "once") return [{ date, cents: sign * cents(amount) }];
  const dates = [date, ...repeatDates(date, count)];
  const parts = plan === "installments" ? installmentCents(cents(amount), count) : dates.map(() => cents(amount));
  return dates.map((on, index) => ({ date: on, cents: sign * parts[index] }));
};
```

`simulation.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/skeleton";
import { useForecast } from "@/entities/forecast/forecast-query";
import { MonthChips } from "@/entities/forecast/month-chips";
import { type DraftRow, draftVerdict, monthsAhead, type Verdict, withDraft } from "@/entities/forecast/months-ahead";
import { settingsQuery } from "@/entities/settings/settings-query";
import { dayMonth } from "@/shared/lib/date";
import { TIER_LABEL } from "@/shared/lib/tier";
import { TierPill } from "@/shared/ui/tier-pill";

const SLOTS = ["d1", "d2", "d3", "d4", "d5", "d6", "d7"];

const dayName = (date: string, today: string) => {
  if (date === today) return "hoje";
  if (date.startsWith(today.slice(0, 7))) return `dia ${Number(date.slice(8))}`;
  return `dia ${dayMonth(date)}`;
};

const verdictLine = (verdict: Verdict, today: string) => {
  if (verdict.kind === "clear") return "Nenhum dia vermelho com essa compra.";
  if (verdict.kind === "already-red") return "Essa compra não cria dia vermelho novo.";
  return `Com essa compra, ${dayName(verdict.date, today)} vira ${TIER_LABEL.red}`;
};

/** Posso comprar isso? The forecast with the draft applied, nothing written (D16); `rows` null: no valid amount yet. */
export const Simulation = ({ rows }: { rows: DraftRow[] | null }) => {
  const forecast = useForecast();
  const settings = useQuery(settingsQuery);
  if (forecast.isError)
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-sm">
        Não foi possível carregar.
        <button
          type="button"
          onClick={() => forecast.refetch()}
          className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Tentar de novo
        </button>
      </p>
    );
  if (!forecast.data || !settings.data)
    return (
      <div className="flex flex-wrap gap-2">
        {SLOTS.map((slot) => (
          <Skeleton key={slot} className="h-6 w-20 rounded-full" />
        ))}
      </div>
    );
  if (!rows) return <p className="text-muted-foreground text-sm">Digite um valor para simular.</p>;
  const { today, days } = forecast.data;
  const after = withDraft(days, rows, settings.data);
  const start = rows[0].date > today ? rows[0].date : today;
  const week = after.filter((day) => day.date >= start).slice(0, 7);
  const spans = new Set(rows.map((row) => row.date.slice(0, 7))).size > 1;
  return (
    <section aria-label="Simulação" className="flex flex-col gap-3 rounded-2xl bg-muted p-4">
      {week.length > 0 && (
        <ol aria-label="Próximos 7 dias" className="flex flex-wrap gap-2">
          {week.map((day) => (
            <li key={day.date} className="flex items-center gap-1.5 text-sm">
              <span className="font-medium tabular-nums">{dayMonth(day.date)}</span>
              <TierPill tier={day.projected_tier} size="sm" />
            </li>
          ))}
        </ol>
      )}
      <p role="status" className="font-medium text-sm">
        {verdictLine(draftVerdict(days, after), today)}
      </p>
      {spans && (
        <>
          <h3 className="font-semibold text-sm">Meses com essa compra</h3>
          <MonthChips months={monthsAhead({ today, days: after }, 12)} />
        </>
      )}
    </section>
  );
};
```

`transaction-sheet.tsx`:
- `Draft` gains `simulate: boolean; installments: boolean`; the shared `repeat` initial object gains `simulate: false, installments: false`.
- In `TransactionForm`: `onDiscard: () => void` prop.

```ts
  const canSplit = !transaction && draft.kind !== "income";
  const installments = draft.installments && canSplit;
  const counted = draft.repeat || installments;
  const split = installments && amount && monthsValid ? installmentCents(cents(amount), months) : null;
  const splitValid = !split || split.every((part) => part > 0);
  const plan: Plan = installments ? "installments" : draft.repeat ? "repeat" : "once";
  const rows = amount && (plan === "once" || monthsValid) ? draftRows({ kind: draft.kind, amount, date: draft.date, plan, count: months }) : null;
  const money = (value: number) => formatMoney(fromCents(value), currency);
```

(Biome may warn on the nested ternary in `plan`; write it as `const plan: Plan = installments ? "installments" : draft.repeat ? …` only if the lint is a warning — otherwise a two-line `if`.)

- `fields()`: guard `if (!amount || !category || (counted && !monthsValid) || !splitValid) return;` and set `repeat_months: draft.repeat ? months : undefined, installments: installments ? months : undefined`.
- `convertible` adds `&& !installments`.
- Above the kind `ToggleGroup`, when `!transaction`:

```tsx
        <label
          htmlFor="transaction-simulate-switch"
          className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl bg-muted px-4 py-2"
        >
          <span className="flex flex-col">
            <span id="transaction-simulate" className="font-medium text-base">
              Simular
            </span>
            <span className="text-muted-foreground text-xs">Veja o efeito antes de lançar.</span>
          </span>
          <Switch
            id="transaction-simulate-switch"
            aria-labelledby="transaction-simulate"
            checked={draft.simulate}
            onCheckedChange={(simulate) => set({ simulate })}
          />
        </label>
```

- The Repetir switch: `onCheckedChange={(repeat) => set({ repeat, installments: false })}`. Below it, when `canSplit`, a copy of that row with ids `transaction-split`, label `Parcelar`, `checked={installments}`, `onCheckedChange={(on) => set({ installments: on, repeat: false })}`.
- Presets block shows when `counted`; `aria-label={installments ? "Quantas parcelas" : "Quantas vezes"}`; custom input `aria-label={installments ? "Parcelas" : "Meses"}`; error `installments ? "Escolha de 2 a 60 parcelas." : "Escolha de 2 a 60 meses."`; the existing repeat summary only when `draft.repeat`; then:

```tsx
              {split && splitValid && (
                <p className="text-muted-foreground text-sm">
                  {split[0] === split[months - 1]
                    ? `${months}× ${money(split[0])}`
                    : `${months - 1}× ${money(split[0])} + ${money(split[months - 1])} na última`}{" "}
                  · até {lastMonth(draft.date, months)}
                </p>
              )}
              {submitted && !splitValid && (
                <p role="alert" className="text-destructive text-sm">
                  Valor pequeno demais para {months} parcelas.
                </p>
              )}
```

- After Observação: `{draft.simulate && <Simulation rows={rows} />}`; the submit area:

```tsx
      {draft.simulate ? (
        <div className="flex flex-col gap-2">
          <BrandButton type="submit">Lançar de verdade</BrandButton>
          <Button type="button" variant="ghost" className="h-12 w-full text-base" onClick={onDiscard}>
            Descartar
          </Button>
        </div>
      ) : (
        <BrandButton type="submit">Salvar</BrandButton>
      )}
```

- `TransactionSheet`: `onDiscard={() => onOpenChange(false)}`; `save`'s `done`:

```ts
    const done = (fallback: string) => {
      if (fields.installments) return toast.success(`${fields.installments} parcelas lançadas`);
      toast.success(fields.repeat_months ? `${fields.repeat_months} lançamentos criados` : fallback);
    };
```

- [ ] **Step 4: Run to see green** — `pnpm vitest run src/features/add-transaction` + `pnpm typecheck && pnpm lint`; every existing sheet test passes untouched.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/add-transaction
git commit -m "feat(web): SOL-52 Simular and Parcelar in Lançar"
```

### Task 15: E2E — simulate, discard, parcel

**Files:**
- Create: `web/e2e/simulate.spec.ts` (copy `web/e2e/repeat.spec.ts`'s sign-up without bills and its `monthFrom`)

- [ ] **Step 1: Write the spec**

```ts
  const tabs = page.getByRole("navigation", { name: "Navegação principal" });
  await tabs.getByRole("button", { name: "Lançar" }).click();
  const launch = page.getByRole("dialog", { name: "Lançar" });
  await launch.getByRole("switch", { name: "Simular" }).click();
  await launch.getByRole("radio", { name: "Saída" }).click();
  await launch.getByLabel("Valor").fill("1.600,00");
  await expect(launch.getByRole("status")).toHaveText("Com essa compra, hoje vira Crítico");
  await launch.getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByRole("region", { name: "Lançamentos" })).toContainText("Nenhum lançamento ainda");

  await tabs.getByRole("button", { name: "Lançar" }).click();
  await launch.getByRole("radio", { name: "Saída" }).click();
  await launch.getByLabel("Valor").fill("300,00");
  await launch.getByRole("switch", { name: "Parcelar" }).click();
  await launch.getByRole("radio", { name: "3x" }).click();
  await expect(launch).toContainText("3× R$ 100,00 · até");
  await launch.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("3 parcelas lançadas")).toBeVisible();
  await page.goto(`/mes?m=${monthFrom(1)}`);
  await expect(page.getByRole("region", { name: "Lançamentos" })).toContainText("R$ 100,00");
```

Title: `"Simular previews a purchase without writing it; Parcelar 3x writes three parcelas"`.

- [ ] **Step 2: Run** — server on 8080 (`soldi_52`) + `pnpm e2e e2e/simulate.spec.ts` → pass, not skipped.

- [ ] **Step 3: Commit**

```bash
git add web/e2e/simulate.spec.ts
git commit -m "test(web): SOL-52 simulate, discard and parcel a purchase"
```

### SOL-52 gate and review

- Gate as in SOL-55.
- `qa` (money, contract): split vectors equal on both sides; parcelas sum to the total; 422s write nothing; `repeat_months` path unchanged (r1/r6 tests green); Simular never posts; optimistic row shows parcela 1; no float anywhere (`cents` integers only, `Number.MAX_SAFE_INTEGER` > `NUMERIC(12,2)` in cents).
- `pixel` (new Simular block and buttons): 375 and 1440, light and dark — 7 pills wrap without horizontal scroll, buttons stacked full width ≥ 44 px, `Descartar` ghost legible in dark.

---

## Self-review

- Coverage: SOL-55 rule, bounds, carried rows, future-month pending, pay in own month, keys/causes/optimistic → Tasks 1–4. SOL-51 contract, horizon, invariant, 4 queries, chips, toggle, states, drill-down → Tasks 5–9. SOL-52 contract, split, 422s, series write, optimistic, `withDraft`, verdict, sheet states, buttons → Tasks 10–15.
- Names used across tasks: `unpaid`/`Unpaid`/`landing`/`flows_by_day`/`first_of` (1, 5); `ForecastInput`/`horizon_end`/`forecast` (5, 6); `billKey` (3); `addMonths` (7, 12); `forecastQuery`/`useForecast` (7, 8, 14); `monthsAhead`/`isFlat`/`MonthAhead`/`MonthChips` (7, 8, 14); `DraftRow`/`withDraft`/`draftVerdict`/`Verdict` (13, 14); `installmentCents`/`repeatDates`/`fromCents` (12, 14); `draftRows`/`Plan`/`Simulation` (14).
- Known deviations from `03-ux.md`, recorded in the briefs: 3-column chips with visible labels (no long-press), no back-button return to the strip, verdict via `draftVerdict` instead of `forecastAlert`.
