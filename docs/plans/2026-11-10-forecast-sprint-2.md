# Forecast sprint 2 (SOL-49, SOL-50) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Invoke the `tdd` skill before the first line; report red and green per task.

**Goal:** future days of the Mês screen show a projected balance and tier with unpaid contas fixas on their landing day (SOL-49), and the hero names the first red day, the lowest point and the recovery, jumping to the day and its cause (SOL-50).

**Architecture:** SOL-49 is additive server work in the existing `months` slice: `month_view` lands each unpaid bill on `max(due_date, today)` and walks a `projected_balance` beside `balance`; two fields on `Day`, one on `BillOfMonth`, no query change. SOL-50 is web only: pure functions in `entities/month` over `MonthView.days` and the month's transactions, a hero widget and a scroll/highlight in the page.

**Tech Stack:** Rust (axum, sqlx 0.9, rust_decimal, chrono 0.4.45, utoipa), Next.js 16 static export, React Query, openapi-fetch, Vitest + Testing Library, Playwright, Biome.

Briefs (read first): `docs/specs/cards/SOL-49.md`, `docs/specs/cards/SOL-50.md`. Rules: D7, D8, D13, D14, D16 in `docs/specs/decisions.md`; `docs/specs/forecast/02-finance.md` rules 1, 2, 5, 7; `03-ux.md` §2, §5, §6.

## Global Constraints

- Money: `rust_decimal::Decimal` on the server, string in JSON, never a float; the web compares amounts only through `cents()` (integer), never adds them.
- Every query filters by `user_id`; this sprint adds no query.
- `main.rs` untouched. `scripts/sqlx-prepare.sh --check` must pass unchanged.
- FSD: `app → widgets → features → entities → shared`, imports only downward; widgets never import widgets.
- Copy exactly: `Previsto · <tier>`, `Conta fixa · a pagar`, `Conta fixa · venceu dia DD/MM`, `Dia 23 fica no vermelho: -R$ 675,00`, `Hoje está no vermelho: -R$ 675,00`, `Pior dia: 28/11, -R$ 2.916,00 · recupera em 30/11`, `Motivo da queda`.
- Tap targets ≥ 44 px; color never alone (tier label always in the pill).
- Conventional Commits in English, no co-author trailer, no AI mention. Commit on each green step; never merge or push.
- DB for integration tests: `DATABASE_URL=postgres://soldi:soldi@localhost:5441/soldi_49` (`soldi_50` in SOL-50's worktree).

## Files

| File | Card | Change |
|---|---|---|
| `crates/soldi-types/src/months.rs` | 49 | `Day.projected_balance`, `Day.projected_tier`, `BillOfMonth.lands_on` |
| `crates/soldi-server/src/months/domain.rs` | 49 | landing map + projected walk; tests |
| `crates/soldi-server/tests/months.rs` | 49 | two exact-JSON assertions gain the fields; one new test |
| `web/openapi.json`, `web/src/shared/api/schema.d.ts` | 49 | regenerated |
| `web/src/test/stub-api.ts` | 49, 50 | `day()` defaults; `FORECAST_MONTH`, `FORECAST_TRANSACTIONS` |
| `web/src/shared/lib/date.ts` (+ test) | 49 | `dayMonth` moved here from `bills-of-month.tsx` |
| `web/src/shared/ui/tier-pill.tsx` (+ new test) | 49 | `forecast` prop |
| `web/src/widgets/ledger/ledger.tsx` | 49, 50 | every day pill, landed bill rows; then ids, highlight, cause caption |
| `web/src/app/(app)/(shell)/mes/page.tsx` (+ test) | 49, 50 | tests; then alert, jump, highlight |
| `web/src/shared/lib/tier.ts` | 50 | export `cents` |
| `web/src/entities/month/forecast-alert.ts` (+ test) | 50 | `forecastAlert`, `causeOf` |
| `web/src/widgets/red-day-alert/red-day-alert.tsx` (+ test) | 50 | hero lines |
| `web/src/widgets/month-header/month-header.tsx` (+ test) | 50 | `children` under the balance |
| `web/e2e/forecast.spec.ts` | 49, 50 | new, copy of `web/e2e/mes.spec.ts` second test |

---

# SOL-49 — worktree `/Users/emerson/Documents/workspace/open-source/soldi-49`, branch `feat/SOL-49-projected-days`

### Task 1: Contract fields and the projected walk (domain)

**Files:**
- Modify: `crates/soldi-types/src/months.rs` (`Day` after `tier`; `BillOfMonth` after `overdue`; the serialization test)
- Modify: `crates/soldi-server/src/months/domain.rs:84-186` (`month_view`) and its test module
- Model: the existing tests `bill_rule_1_an_unpaid_bill_lowers_the_projection` and `bill_rule_8_a_past_month_keeps_its_unpaid_bills_overdue_and_projected` in the same file (helpers `settings`, `sum`, `bill`, `payment`, `with_bills`, `money`, `date`).

**Interfaces:**
- Produces (Rust, `soldi_types::months`):
  - `Day { …, tier: Tier, projected_balance: Decimal /* serialize_with crate::money */, projected_tier: Tier, is_today, is_future }`
  - `BillOfMonth { …, overdue: bool, lands_on: Option<NaiveDate> }`
- Produces (JSON): `Day.projected_balance: "-675.00"`, `Day.projected_tier: "red"`, `BillOfMonth.lands_on: "2026-11-23" | null`.

- [ ] **Step 1: Write the failing tests**

In `crates/soldi-types/src/months.rs`, test `a_day_serializes_money_as_strings_and_tiers_in_snake_case`: add to the `Day` literal

```rust
            projected_balance: "-1650".parse().unwrap(),
            projected_tier: Tier::Red,
```

and to the expected JSON `"projected_balance": "-1650.00", "projected_tier": "red",`.

In `crates/soldi-server/src/months/domain.rs` tests:

`bill_rule_1_an_unpaid_bill_lowers_the_projection`: the `BillOfMonth` literal gains `lands_on: Some(date("2026-11-05")),`.

`bill_rules_2_and_3_a_paid_bill_is_in_the_ledger_only`: append

```rust
        assert_eq!(paid.lands_on, None);
        assert!(view.days.iter().all(|day| day.projected_balance == day.balance));
```

`bill_rule_8_a_past_month_keeps_its_unpaid_bills_overdue_and_projected`: append

```rust
        assert!(view.bills_of_month.iter().all(|bill| bill.lands_on.is_none()));
        assert!(
            view.days
                .iter()
                .all(|day| day.projected_balance == day.balance && day.projected_tier == day.tier)
        );
```

`rule_1_the_balance_walks_the_ledger_day_by_day`: append

```rust
        assert!(view.days.iter().all(|day| day.projected_balance == day.balance));
```

New tests (same module, after `bill_rule_13_…`):

```rust
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

        assert!(view.days[..22].iter().all(|day| day.projected_balance == day.balance));
        assert_eq!(projected(22), (money("6150"), Tier::Green));
        assert_eq!(projected(23), (money("-675"), Tier::Red));
        assert_eq!(projected(25), (money("-916"), Tier::Red));
        assert_eq!(projected(28), (money("-2916"), Tier::Red));
        assert_eq!(projected(30), (money("491"), Tier::Yellow));
        assert_eq!(view.days[22].balance, money("4225"));
        assert_eq!(view.days[29].balance, money("8559"));
        assert_eq!(view.projected_balance, view.days[29].projected_balance);
        assert_eq!(
            view.bills_of_month.iter().map(|bill| bill.lands_on).collect::<Vec<_>>(),
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

        assert_eq!((aluguel.overdue, aluguel.lands_on), (true, Some(date("2026-11-20"))));
        assert_eq!(view.days[9].projected_balance, money("1200"));
        assert_eq!(view.days[18].projected_balance, money("1200"));
        assert_eq!(
            (view.days[19].projected_balance, view.days[19].projected_tier, view.days[19].balance),
            (money("-600"), Tier::Red, money("1200"))
        );
        assert_eq!(view.days[29].projected_balance, money("-600"));
        assert_eq!(view.projected_balance, money("-600"));
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

        assert_eq!((luz.overdue, luz.lands_on), (false, Some(date("2026-11-10"))));
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
        assert_eq!(view.days[26].projected_balance, money("1000"));
        assert_eq!(
            (view.days[27].projected_balance, view.days[27].projected_tier),
            (money("700"), Tier::Yellow)
        );
        assert_eq!(view.projected_balance, view.days[27].projected_balance);
    }
```

- [ ] **Step 2: Run to see red**

Run: `cargo test -p soldi-types months && cargo test -p soldi-server --lib months::domain`
Expected: compile errors `struct `Day` has no field named `projected_balance`` and `no field `lands_on``.

- [ ] **Step 3: Minimal implementation**

`crates/soldi-types/src/months.rs`, in `Day` after `pub tier: Tier,`:

```rust
    /// `balance` minus the unpaid bills landed on or before this day (`BillOfMonth::lands_on`);
    /// equal to `balance` before today and in a past month.
    #[serde(serialize_with = "crate::money")]
    pub projected_balance: Decimal,
    pub projected_tier: Tier,
```

In `BillOfMonth` after `pub overdue: bool,`:

```rust
    /// The day an unpaid bill enters the projection: its due date, or today once due; null when
    /// paid or when that day falls after the month.
    pub lands_on: Option<NaiveDate>,
```

`crates/soldi-server/src/months/domain.rs`, `month_view`: move the `bills_of_month` block above `let mut balance = …`, add `lands_on` to its literal, build the landing map, and walk `pending` in the day loop:

```rust
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
                lands_on: payment
                    .is_none()
                    .then_some(due_date.max(today))
                    .filter(|day| *day <= end),
            }
        })
        .collect();
    let mut landing: BTreeMap<NaiveDate, Decimal> = BTreeMap::new();
    for bill in &bills_of_month {
        if let Some(day) = bill.lands_on {
            *landing.entry(day).or_default() += bill.amount;
        }
    }
    let mut pending = Decimal::ZERO;
```

Inside the `.map(|date| { … })` of `days`, after `balance += flow.net();`:

```rust
            pending += landing.get(&date).copied().unwrap_or_default();
            let projected_balance = balance - pending;
```

and in the `Day` literal after `tier: tier(balance, &settings),`:

```rust
                projected_balance,
                projected_tier: tier(projected_balance, &settings),
```

Leave the `projected` computation after the loop exactly as it is (it reads `bills_of_month`, now defined earlier).

- [ ] **Step 4: Run to see green**

Run: `cargo test -p soldi-types months && cargo test -p soldi-server --lib months:: && cargo clippy -p soldi-server --all-targets -- -D warnings`
Expected: all pass, no warning.

- [ ] **Step 5: Commit**

```bash
git add crates/soldi-types/src/months.rs crates/soldi-server/src/months/domain.rs
git commit -m "feat(server): SOL-49 land unpaid bills on their due day or today and walk a projected balance per day"
```

### Task 2: Integration test, OpenAPI snapshot, web types and fixtures

**Files:**
- Modify: `crates/soldi-server/tests/months.rs` (tests `the_sheets_first_days_come_back_with_balances_tiers_and_totals`, `rule_1_end_to_end_unpaid_then_paid_then_unpaid`; new test at the end)
- Modify: `web/openapi.json`, `web/src/shared/api/schema.d.ts` (generated)
- Modify: `web/src/test/stub-api.ts:115-126` (`day()` helper)
- Model: `rules_6_8_and_9_due_dates_clamp_and_past_months_stay_overdue` in the same file (relative-to-today months).

**Interfaces:**
- Consumes: Task 1 JSON fields.
- Produces (TS): `Schemas["Day"]["projected_balance"]: string`, `Schemas["Day"]["projected_tier"]: Tier`, `Schemas["BillOfMonth"]["lands_on"]?: string | null`.

- [ ] **Step 1: Write the failing tests**

`the_sheets_first_days_come_back_with_balances_tiers_and_totals`: the `view["days"][2]` JSON gains `"projected_balance": "1150.00", "projected_tier": "light_green",`.

`rule_1_end_to_end_unpaid_then_paid_then_unpaid`: after `let overdue = …;` add

```rust
    let today = soldi_server::today_sao_paulo();
    let lands_on = (today <= "2026-11-30".parse::<chrono::NaiveDate>().unwrap())
        .then(|| today.max("2026-11-05".parse().unwrap()).to_string());
```

and the expected `bills_of_month` JSON gains `"lands_on": lands_on`.

New test:

```rust
#[sqlx::test]
async fn forecast_an_unpaid_bill_dips_its_clamped_due_day_two_months_ahead(pool: PgPool) {
    use chrono::Datelike;
    let user = TestApp::signed_in(pool, "ana@example.com").await;
    let today = soldi_server::today_sao_paulo();
    open_at(&user, "1000", &today.to_string()).await;
    add_bill(&user, "Aluguel", "1600", 31, "Aluguel").await;
    let month = today
        .with_day(1)
        .unwrap()
        .checked_add_months(chrono::Months::new(2))
        .unwrap();

    let (status, view) = user
        .get(&format!("/api/months/{}", month.format("%Y-%m")))
        .await;

    assert_eq!(status, StatusCode::OK, "{view}");
    let days = view["days"].as_array().unwrap();
    let (before, last) = (&days[days.len() - 2], days.last().unwrap());
    assert_eq!(
        (&before["projected_balance"], &before["projected_tier"]),
        (&json!("1000.00"), &json!("light_green"))
    );
    assert_eq!(
        (&last["projected_balance"], &last["projected_tier"], &last["balance"]),
        (&json!("-600.00"), &json!("red"), &json!("1000.00"))
    );
    assert_eq!(view["bills_of_month"][0]["lands_on"], last["date"]);
    assert_eq!(view["projected_balance"], "-600.00");
}
```

- [ ] **Step 2: Run to see red**

Run: `DATABASE_URL=postgres://soldi:soldi@localhost:5441/soldi_49 cargo test -p soldi-server --test months --test openapi`
Expected: `months` passes only if Task 1 is in (it is) — the red here is `committed_openapi_snapshot_matches_the_server` failing with `web/openapi.json is stale`. If any `months` test fails, fix the expectation typo, not the domain.

- [ ] **Step 3: Regenerate the contract and the web types; give the fixtures the new fields**

```bash
UPDATE_OPENAPI=1 cargo test -p soldi-server --test openapi
cd web && pnpm gen:api
```

`web/src/test/stub-api.ts`, `day()` helper: add the defaults so every fixture day projects its own balance:

```ts
const day = (date: string, balance: string, tier: Schemas["Tier"], rest: Partial<Schemas["Day"]> = {}) => ({
  date,
  income: "0.00",
  withdrawn: "0.00",
  bills: "0.00",
  daily: "0.00",
  balance,
  tier,
  projected_balance: balance,
  projected_tier: tier,
  is_today: false,
  is_future: false,
  ...rest,
});
```

Leave `BILLS_OF_MONTH` without `lands_on` (existing page tests keep their ledger unchanged).

- [ ] **Step 4: Run to see green**

Run: `DATABASE_URL=postgres://soldi:soldi@localhost:5441/soldi_49 cargo test -p soldi-server --test months --test openapi && cd web && pnpm typecheck`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add crates/soldi-server/tests/months.rs web/openapi.json web/src/shared/api/schema.d.ts web/src/test/stub-api.ts
git commit -m "feat(api): SOL-49 expose each day's projected balance and the day an unpaid bill lands"
```

### Task 3: Ledger — a pill on every day, `Previsto`, landed bill rows

**Files:**
- Modify: `web/src/shared/lib/date.ts`, `web/src/shared/lib/date.test.ts` (`dayMonth`)
- Modify: `web/src/widgets/bills-of-month/bills-of-month.tsx:29` (delete local `dayMonth`, import it)
- Modify: `web/src/shared/ui/tier-pill.tsx`; Create: `web/src/shared/ui/tier-pill.test.tsx`
- Modify: `web/src/widgets/ledger/ledger.tsx` (`groupByDay`, day header, new `DueRow`)
- Modify: `web/src/app/(app)/(shell)/mes/page.test.tsx` (test at line 130 rewritten; one new test)
- Model: `Row` in `ledger.tsx` for `DueRow`; `month-header.test.tsx` for the pill test.

**Interfaces:**
- Produces: `dayMonth(date: string): string` in `@/shared/lib/date` (`"2026-11-02"` → `"02/11"`); `TierPill` prop `forecast?: boolean`.

- [ ] **Step 1: Write the failing tests**

`web/src/shared/lib/date.test.ts`, add (import `dayMonth`):

```ts
  it("writes a date as DD/MM", () => {
    expect(dayMonth("2026-11-02")).toBe("02/11");
  });
```

`web/src/shared/ui/tier-pill.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TierPill } from "./tier-pill";

describe("TierPill", () => {
  it("says Previsto before the tier label of a forecast", () => {
    const { container } = render(<TierPill tier="red" amount="-675.00" forecast />);

    expect(container).toHaveTextContent("-R$ 675,00Previsto · Crítico");
  });

  it("keeps the plain label for a closed day", () => {
    render(<TierPill tier="yellow" />);

    expect(screen.getByText("Apertado")).toBeInTheDocument();
  });
});
```

`web/src/app/(app)/(shell)/mes/page.test.tsx`: import `type { Schemas } from "@/shared/api/client"`. Replace the test `lists a future day first as Agendado, without a balance, and its entry opens Editar / Excluir` by:

```tsx
  it("lists a future day first as Agendado with its Previsto balance, and its entry opens Editar / Excluir", async () => {
    const later = { ...TRANSACTIONS[0], id: "later", date: "2026-11-20", note: "Show" };
    open({ "GET /api/transactions": { status: 200, body: [later, ...TRANSACTIONS] } });

    const days = await within(await screen.findByRole("region", { name: "Lançamentos" })).findAllByRole("heading", {
      level: 3,
    });
    expect(days.map((day) => day.textContent?.replace(/\s/g, " "))).toEqual([
      "Agendado · 20 novR$ 957,79Previsto · Apertado",
      "Hoje, 5 novR$ 957,79Apertado",
      "Ontem, 4 novR$ 1.142,10Confortável",
      "3 novR$ 2.342,10Folga",
    ]);
    await userEvent.click(within(ledger()).getByRole("button", { name: /Show/ }));
    const actions = await screen.findByRole("dialog", { name: "Show" });
    expect(within(actions).getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "Excluir" })).toBeInTheDocument();
  });

  it("lists an unpaid conta fixa on the day it lands, with the Previsto balance", async () => {
    const landed = (day: Schemas["Day"]): Schemas["Day"] => {
      if (day.date < "2026-11-05") return day;
      if (day.date < "2026-11-10") return { ...day, projected_balance: "673.69", projected_tier: "yellow" };
      return { ...day, projected_balance: "-1585.87", projected_tier: "red" };
    };
    const bills = [
      { ...BILLS_OF_MONTH[0], lands_on: "2026-11-05" },
      { ...BILLS_OF_MONTH[1], lands_on: "2026-11-10" },
    ];
    open({
      "GET /api/months/2026-11": {
        status: 200,
        body: { ...MONTH, days: MONTH.days.map(landed), bills_of_month: bills },
      },
    });

    const days = await within(await screen.findByRole("region", { name: "Lançamentos" })).findAllByRole("heading", {
      level: 3,
    });
    expect(days.map((day) => day.textContent?.replace(/\s/g, " "))).toEqual([
      "Agendado · 10 nov-R$ 1.585,87Previsto · Crítico",
      "Hoje, 5 novR$ 673,69Previsto · Apertado",
      "Ontem, 4 novR$ 1.142,10Confortável",
      "3 novR$ 2.342,10Folga",
    ]);
    expect(within(ledger()).getByRole("listitem", { name: "Aluguel" })).toHaveTextContent(
      "AluguelConta fixa · a pagarR$ 2.259,56",
    );
    expect(within(ledger()).getByRole("listitem", { name: "Luz" })).toHaveTextContent(
      "LuzConta fixa · venceu dia 02/11R$ 284,10",
    );
  });
```

- [ ] **Step 2: Run to see red**

Run: `cd web && pnpm vitest run src/shared/lib/date.test.ts src/shared/ui/tier-pill.test.tsx "src/app/(app)/(shell)/mes/page.test.tsx"`
Expected: FAIL — `dayMonth is not a function`, missing `Previsto`, headings without the future pill, no `Aluguel` listitem.

- [ ] **Step 3: Minimal implementation**

`web/src/shared/lib/date.ts`, append:

```ts
/** `2026-11-02` → `02/11`. */
export const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
```

`bills-of-month.tsx`: delete line 29 (`const dayMonth = …`) and add `dayMonth` to its `@/shared/lib/date` import.

`tier-pill.tsx`:

```tsx
type TierPillProps = {
  tier: Tier;
  /** A balance shown before the label, as on the day headers. */
  amount?: string;
  /** A day ahead: the label reads `Previsto · <tier>`. */
  forecast?: boolean;
  size?: keyof typeof SIZE;
  className?: string;
};

/** Color never travels alone: the label always goes with it. */
export const TierPill = ({ tier, amount, forecast = false, size = "md", className }: TierPillProps) => {
  const label = forecast ? `Previsto · ${TIER_LABEL[tier]}` : TIER_LABEL[tier];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full font-semibold leading-5",
        SIZE[size],
        TIER_STYLE[tier].pill,
        className,
      )}
    >
      <span aria-hidden className={cn("size-2 rounded-full", TIER_STYLE[tier].dot)} />
      {amount === undefined ? (
        label
      ) : (
        <>
          <Money amount={amount} className="font-bold text-current" />
          <span className="font-medium">{label}</span>
        </>
      )}
    </span>
  );
};
```

`ledger.tsx`: import `dayMonth` from `@/shared/lib/date`. Replace `groupByDay` by:

```tsx
type Day = Schemas["Day"];
type Due = Schemas["BillOfMonth"];

/** Days with entries or an unpaid bill landed on them, newest first. */
// ponytail: days × entries scan, 31 days a month.
const groupByDay = (days: Day[], transactions: Transaction[], bills: Due[]) =>
  days
    .map((day) => ({
      day,
      entries: transactions.filter((transaction) => transaction.date === day.date),
      due: bills.filter((bill) => bill.lands_on === day.date),
    }))
    .filter(({ entries, due }) => entries.length > 0 || due.length > 0)
    .reverse();

/** A day ahead, or today once an unpaid bill landed on it. */
const isForecast = (day: Day) => day.is_future || day.projected_balance !== day.balance;

const DueRow = ({ bill }: { bill: Due }) => (
  <li aria-label={bill.name} className="flex min-h-16 items-center gap-3 px-2 py-2">
    <CategoryIcon icon={bill.icon} color={bill.color} />
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate font-medium text-base">{bill.name}</span>
      <span className={cn("text-xs", bill.overdue ? "text-expense" : "text-muted-foreground")}>
        {bill.overdue ? `Conta fixa · venceu dia ${dayMonth(bill.due_date)}` : "Conta fixa · a pagar"}
      </span>
    </span>
    <Money amount={bill.amount} className="font-bold text-base" />
  </li>
);
```

In `Ledger`: `const groups = groupByDay(view.days, transactions, view.bills_of_month);` and the group render becomes:

```tsx
        groups.map(({ day, entries, due }) => (
          <div key={day.date}>
            <h3 className="sticky top-14 z-10 -mx-2 flex items-center justify-between gap-2 bg-card/95 px-2 py-2 font-semibold text-muted-foreground text-sm backdrop-blur lg:top-0">
              {dayLabel(day)}
              <TierPill tier={day.projected_tier} amount={day.projected_balance} forecast={isForecast(day)} size="sm" />
            </h3>
            <ul className="flex flex-col">
              {entries.map((transaction) => (
                <Row
                  key={transaction.id}
                  entry={describe(transaction)}
                  transaction={transaction}
                  onOpen={() => open(transaction)}
                />
              ))}
              {due.map((bill) => (
                <DueRow key={bill.bill_id} bill={bill} />
              ))}
            </ul>
          </div>
        ))
```

- [ ] **Step 4: Run to see green**

Run: `cd web && pnpm vitest run src/shared src/widgets "src/app/(app)/(shell)/mes" && pnpm typecheck && pnpm lint`
Expected: pass (bills-of-month tests still green after the `dayMonth` move).

- [ ] **Step 5: Commit**

```bash
git add web/src/shared/lib/date.ts web/src/shared/lib/date.test.ts web/src/shared/ui/tier-pill.tsx web/src/shared/ui/tier-pill.test.tsx web/src/widgets/bills-of-month/bills-of-month.tsx web/src/widgets/ledger/ledger.tsx "web/src/app/(app)/(shell)/mes/page.test.tsx"
git commit -m "feat(web): SOL-49 every ledger day shows its Previsto tier and the unpaid bills landing on it"
```

### Task 4: E2E — next month's due day turns Crítico

**Files:**
- Create: `web/e2e/forecast.spec.ts`
- Model: `web/e2e/mes.spec.ts` test `a bill from onboarding shows under Contas do Mês…` (sign-up + onboarding bill).

- [ ] **Step 1: Write the test**

```ts
import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://localhost:8080";

test("an unpaid conta fixa paints its due day next month as Previsto · Crítico", async ({ page, request }) => {
  const health = await request.get(`${API}/api/health`).catch(() => null);
  test.skip(!health?.ok(), `Soldi server unreachable at ${API}/api/health; start it to run this flow.`);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-forecast-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nome").fill("Aluguel");
  await page.getByLabel("Valor").fill("1.600,00");
  await page.getByLabel("Dia").fill("28");
  await page.getByRole("radio", { name: "Aluguel" }).check({ force: true });
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await page.getByRole("button", { name: "Pular" }).click();
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

  await page.getByRole("button", { name: "Próximo mês" }).click();
  const ledger = page.getByRole("region", { name: "Lançamentos" });
  await expect(ledger.getByRole("heading", { level: 3 }).first()).toContainText(
    /Agendado · 28 .*-R\$\s600,00.*Previsto · Crítico/,
  );
  await expect(ledger.getByRole("listitem", { name: "Aluguel" })).toContainText("Conta fixa · a pagar");
});
```

- [ ] **Step 2: Run**

Run (server up via `scripts/dev.sh` with `DATABASE_URL=…/soldi_49`): `cd web && pnpm e2e e2e/forecast.spec.ts`
Expected: PASS (it skips without a server; report a skip as not run).

- [ ] **Step 3: Commit**

```bash
git add web/e2e/forecast.spec.ts
git commit -m "test(web): SOL-49 e2e for a conta fixa painting next month's due day red"
```

### SOL-49 gate and review

- [ ] `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `scripts/sqlx-prepare.sh --check`, `cd web && pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build`; Rust coverage with the `cargo llvm-cov` line of `.claude/CLAUDE.md`, ≥ 90 % on all four metrics.
- [ ] `qa` (adversarial, `opus`): contract change + money. Checklist: a bill landing twice (overdue + due today, paid then unpaid); `paid` bill never lands; past month `projected == balance` on every day; `lands_on` ≤ month end; `MonthView.projected_balance` unchanged on every existing test; no float or `Number()` on an amount in the web diff; no query added; `user_id` scope untouched; OpenAPI snapshot matches.
- [ ] No `pixel` (no new token or component; `TierPill` variant only).

---

# SOL-50 — worktree `/Users/emerson/Documents/workspace/open-source/soldi-50`, branch `feat/SOL-50-red-day-alert` from `developer` after SOL-49 is merged

### Task 5: `forecastAlert` and `causeOf` (pure, entities)

**Files:**
- Modify: `web/src/shared/lib/tier.ts` (`const cents` → `export const cents`)
- Modify: `web/src/test/stub-api.ts` (append `FORECAST_MONTH`, `FORECAST_TRANSACTIONS` after `BILLS_OF_MONTH`)
- Create: `web/src/entities/month/forecast-alert.ts`, `web/src/entities/month/forecast-alert.test.ts`
- Model: `web/src/shared/lib/tier.test.ts` (pure-function test style).

**Interfaces:**
- Consumes: `Schemas["Day"].projected_balance/projected_tier/is_today/is_future`, `Schemas["BillOfMonth"].lands_on`, `cents(amount: string): number`.
- Produces:
  - `type ForecastAlert = { firstRed: { date: string; balance: string; today: boolean }; lowest: { date: string; balance: string }; recoversOn: string | null }`
  - `forecastAlert(days: Schemas["Day"][]): ForecastAlert | null`
  - `causeOf(date: string, transactions: Schemas["Transaction"][], bills: Schemas["BillOfMonth"][]): string | null` (a `transaction.id` or a `bill.bill_id`)
  - fixtures `FORECAST_MONTH: Schemas["MonthView"]`, `FORECAST_TRANSACTIONS: Schemas["Transaction"][]`

- [ ] **Step 1: Fixtures and failing tests**

`web/src/test/stub-api.ts`, after `BILLS_OF_MONTH`:

```ts
/** The owner's November (SOL-49/50), today the 5th: R$ 6.150,00 until the 22nd, red on the 23rd, worst on the 28th, back on the 30th. */
const forecastProjection = (index: number): [string, Schemas["Tier"]] => {
  if (index < 22) return ["6150.00", "green"];
  if (index < 24) return ["-675.00", "red"];
  if (index < 27) return ["-916.00", "red"];
  if (index < 29) return ["-2916.00", "red"];
  return ["491.00", "yellow"];
};

const forecastDay = (index: number): Schemas["Day"] => {
  const date = `2026-11-${String(index + 1).padStart(2, "0")}`;
  const [projected, tier] = forecastProjection(index);
  return day(date, "6150.00", "green", {
    projected_balance: projected,
    projected_tier: tier,
    is_today: index === 4,
    is_future: index > 4,
  });
};

const forecastBill = (id: number, name: string, amount: string, due: string): Schemas["BillOfMonth"] => ({
  bill_id: `b2000000-0000-4000-8000-00000000000${id}`,
  name,
  icon: ALUGUEL.icon,
  color: ALUGUEL.color,
  amount,
  due_date: due,
  paid: false,
  transaction_id: null,
  overdue: false,
  lands_on: due,
});

export const FORECAST_MONTH: Schemas["MonthView"] = {
  ...MONTH,
  days: Array.from({ length: 30 }, (_, index) => forecastDay(index)),
  projected_balance: "491.00",
  projected_tier: "yellow",
  bills_of_month: [
    forecastBill(1, "Cartão", "4900.00", "2026-11-23"),
    forecastBill(2, "Financiamento", "2000.00", "2026-11-28"),
    forecastBill(3, "Condomínio", "1168.00", "2026-11-30"),
  ],
};

export const FORECAST_TRANSACTIONS: Schemas["Transaction"][] = [
  { id: "t2000000-0000-4000-8000-000000000003", date: "2026-11-30", amount: "4575.00", kind: "income", note: "Salário", category: SALARIO },
  { id: "t2000000-0000-4000-8000-000000000002", date: "2026-11-25", amount: "241.00", kind: "daily", note: "Feira", category: MERCADO },
  { id: "t2000000-0000-4000-8000-000000000001", date: "2026-11-23", amount: "1925.00", kind: "bill", note: "Seguro", category: ALUGUEL },
];
```

`web/src/entities/month/forecast-alert.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { FORECAST_MONTH, FORECAST_TRANSACTIONS } from "@/test/stub-api";

import { causeOf, forecastAlert } from "./forecast-alert";

const day = (
  date: string,
  projected: string,
  tier: Schemas["Tier"],
  when: "past" | "today" | "future" = "future",
): Schemas["Day"] => ({
  date,
  income: "0.00",
  withdrawn: "0.00",
  bills: "0.00",
  daily: "0.00",
  balance: projected,
  tier,
  projected_balance: projected,
  projected_tier: tier,
  is_today: when === "today",
  is_future: when === "future",
});

const [CARTAO, FINANCIAMENTO] = FORECAST_MONTH.bills_of_month;

describe("forecastAlert", () => {
  it("finds the owner's November: red on the 23rd, worst on the 28th, back on the 30th", () => {
    expect(forecastAlert(FORECAST_MONTH.days)).toEqual({
      firstRed: { date: "2026-11-23", balance: "-675.00", today: false },
      lowest: { date: "2026-11-28", balance: "-2916.00" },
      recoversOn: "2026-11-30",
    });
  });

  it("keeps the earliest of two equal lowest days and ignores a redder past", () => {
    const days = [
      day("2026-11-09", "-9000.00", "red", "past"),
      day("2026-11-10", "100.00", "yellow", "today"),
      day("2026-11-28", "-2916.00", "red"),
      day("2026-11-29", "-2916.00", "red"),
    ];

    expect(forecastAlert(days)?.lowest).toEqual({ date: "2026-11-28", balance: "-2916.00" });
  });

  it("reads today as the first red day", () => {
    const days = [day("2026-11-10", "-675.00", "red", "today"), day("2026-11-11", "0.00", "yellow")];

    expect(forecastAlert(days)).toEqual({
      firstRed: { date: "2026-11-10", balance: "-675.00", today: true },
      lowest: { date: "2026-11-10", balance: "-675.00" },
      recoversOn: "2026-11-11",
    });
  });

  it("has no recovery when the month ends red", () => {
    const days = [day("2026-11-10", "100.00", "yellow", "today"), day("2026-11-30", "-600.00", "red")];

    expect(forecastAlert(days)?.recoversOn).toBeNull();
  });

  it("says nothing when only light red lies ahead, or the month is past", () => {
    expect(
      forecastAlert([day("2026-11-09", "-9000.00", "red", "past"), day("2026-11-10", "-100.00", "light_red", "today")]),
    ).toBeNull();
    expect(forecastAlert([day("2026-10-31", "-9000.00", "red", "past")])).toBeNull();
  });
});

describe("causeOf", () => {
  it("picks the owner's Cartão on the 23rd over Seguro, and Financiamento on the 28th", () => {
    expect(causeOf("2026-11-23", FORECAST_TRANSACTIONS, FORECAST_MONTH.bills_of_month)).toBe(CARTAO.bill_id);
    expect(causeOf("2026-11-28", FORECAST_TRANSACTIONS, FORECAST_MONTH.bills_of_month)).toBe(FINANCIAMENTO.bill_id);
  });

  it("on a tie prefers the conta fixa, then a Saída over a Diário; income never counts", () => {
    const [salario, feira, seguro] = FORECAST_TRANSACTIONS;
    const on = "2026-11-12";
    const diario = { ...feira, id: "diario", date: on, amount: "100.00" };
    const saida = { ...seguro, id: "saida", date: on, amount: "100.00" };
    const entrada = { ...salario, id: "entrada", date: on, amount: "900.00" };
    const conta = { ...CARTAO, bill_id: "conta", amount: "100.00", lands_on: on };

    expect(causeOf(on, [diario, saida, entrada], [conta])).toBe("conta");
    expect(causeOf(on, [diario, saida, entrada], [])).toBe("saida");
  });

  it("has no cause on a day without outflow", () => {
    expect(causeOf("2026-11-10", FORECAST_TRANSACTIONS, FORECAST_MONTH.bills_of_month)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see red**

Run: `cd web && pnpm vitest run src/entities/month/forecast-alert.test.ts`
Expected: FAIL — `Failed to resolve import "./forecast-alert"`.

- [ ] **Step 3: Minimal implementation**

`web/src/shared/lib/tier.ts`: `const cents = …` → `export const cents = …` (body unchanged).

`web/src/entities/month/forecast-alert.ts`:

```ts
import type { Schemas } from "@/shared/api/client";
import { cents } from "@/shared/lib/tier";

type Day = Schemas["Day"];

export type ForecastAlert = {
  firstRed: { date: string; balance: string; today: boolean };
  lowest: { date: string; balance: string };
  recoversOn: string | null;
};

/** D16 from today on: the first red day, the lowest point (earliest on ties), the first day after it out of red. */
export const forecastAlert = (days: Day[]): ForecastAlert | null => {
  const ahead = days.filter((day) => day.is_today || day.is_future);
  const firstRed = ahead.find((day) => day.projected_tier === "red");
  if (!firstRed) return null;
  const lowest = ahead.reduce((low, day) => (cents(day.projected_balance) < cents(low.projected_balance) ? day : low));
  const recovery = ahead.find((day) => day.date > lowest.date && day.projected_tier !== "red");
  return {
    firstRed: { date: firstRed.date, balance: firstRed.projected_balance, today: firstRed.is_today },
    lowest: { date: lowest.date, balance: lowest.projected_balance },
    recoversOn: recovery?.date ?? null,
  };
};

const RANK = { bill: 1, daily: 2 } as const;

/** The day's largest outflow; ties go conta fixa, Saída, Diário, then list order. */
export const causeOf = (
  date: string,
  transactions: Schemas["Transaction"][],
  bills: Schemas["BillOfMonth"][],
): string | null => {
  const outflows = [
    ...bills
      .filter((bill) => bill.lands_on === date)
      .map((bill) => ({ id: bill.bill_id, amount: cents(bill.amount), rank: 0 })),
    ...transactions.flatMap((transaction) =>
      transaction.date === date && transaction.kind !== "income"
        ? [{ id: transaction.id, amount: cents(transaction.amount), rank: RANK[transaction.kind] }]
        : [],
    ),
  ];
  const [largest] = outflows.sort((a, b) => b.amount - a.amount || a.rank - b.rank);
  return largest ? largest.id : null;
};
```

- [ ] **Step 4: Run to see green**

Run: `cd web && pnpm vitest run src/entities/month src/shared/lib/tier.test.ts && pnpm typecheck && pnpm lint`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/shared/lib/tier.ts web/src/test/stub-api.ts web/src/entities/month/forecast-alert.ts web/src/entities/month/forecast-alert.test.ts
git commit -m "feat(web): SOL-50 find the first red day, the lowest point, the recovery and the cause of a day"
```

### Task 6: Hero lines (`RedDayAlert`) under `Saldo hoje`

**Files:**
- Create: `web/src/widgets/red-day-alert/red-day-alert.tsx`, `web/src/widgets/red-day-alert/red-day-alert.test.tsx`
- Modify: `web/src/widgets/month-header/month-header.tsx` (props + render `children`), `web/src/widgets/month-header/month-header.test.tsx`
- Model: `Switcher` buttons in `month-header.tsx` (hero button styling); `month-header.test.tsx`.

**Interfaces:**
- Consumes: `ForecastAlert` from `@/entities/month/forecast-alert`; `dayMonth` from `@/shared/lib/date`; `formatMoney`, `useCurrency`.
- Produces: `RedDayAlert({ alert: ForecastAlert; onJump: (date: string) => void })`; `MonthHeader` accepts `children?: ReactNode` (full variant only).

- [ ] **Step 1: Write the failing tests**

`red-day-alert.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ForecastAlert } from "@/entities/month/forecast-alert";

import { RedDayAlert } from "./red-day-alert";

const OWNER: ForecastAlert = {
  firstRed: { date: "2026-11-23", balance: "-675.00", today: false },
  lowest: { date: "2026-11-28", balance: "-2916.00" },
  recoversOn: "2026-11-30",
};

const text = (element: HTMLElement) => element.textContent?.replace(/\s/g, " ");

describe("RedDayAlert", () => {
  it("names the first red day and the worst day with its recovery", () => {
    render(<RedDayAlert alert={OWNER} onJump={vi.fn()} />);

    expect(screen.getAllByRole("button").map(text)).toEqual([
      "Dia 23 fica no vermelho: -R$ 675,00",
      "Pior dia: 28/11, -R$ 2.916,00 · recupera em 30/11",
    ]);
  });

  it("says Hoje when today is red, in one line when today is also the worst", () => {
    const today = { date: "2026-11-10", balance: "-675.00" };
    render(<RedDayAlert alert={{ firstRed: { ...today, today: true }, lowest: today, recoversOn: null }} onJump={vi.fn()} />);

    expect(screen.getAllByRole("button").map(text)).toEqual(["Hoje está no vermelho: -R$ 675,00"]);
  });

  it("drops the recovery when the month ends red", () => {
    render(<RedDayAlert alert={{ ...OWNER, recoversOn: null }} onJump={vi.fn()} />);

    expect(text(screen.getByRole("button", { name: /Pior dia/ }))).toBe("Pior dia: 28/11, -R$ 2.916,00");
  });

  it("jumps to the day of the tapped line", async () => {
    const onJump = vi.fn();
    render(<RedDayAlert alert={OWNER} onJump={onJump} />);

    await userEvent.click(screen.getByRole("button", { name: /Pior dia/ }));
    expect(onJump).toHaveBeenLastCalledWith("2026-11-28");
    await userEvent.click(screen.getByRole("button", { name: /Dia 23/ }));
    expect(onJump).toHaveBeenLastCalledWith("2026-11-23");
  });
});
```

`month-header.test.tsx`, add:

```tsx
  it("shows what the page puts under the balance", () => {
    render(
      <MonthHeader month="2026-11" balance="0" tier="yellow" onMonthChange={vi.fn()}>
        <p>Dia 23 fica no vermelho</p>
      </MonthHeader>,
    );

    expect(within(screen.getByRole("region", { name: "Saldo hoje" })).getByText("Dia 23 fica no vermelho")).toBeVisible();
  });
```

(add `within` to the `@testing-library/react` import).

- [ ] **Step 2: Run to see red**

Run: `cd web && pnpm vitest run src/widgets/red-day-alert src/widgets/month-header`
Expected: FAIL — unresolved `./red-day-alert`; the header test finds no text.

- [ ] **Step 3: Minimal implementation**

`red-day-alert.tsx`:

```tsx
import { TrendingDown } from "lucide-react";

import type { ForecastAlert } from "@/entities/month/forecast-alert";
import { useCurrency } from "@/shared/lib/currency";
import { dayMonth } from "@/shared/lib/date";
import { formatMoney } from "@/shared/lib/money";

const Line = ({ text, onClick }: { text: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex min-h-11 items-center gap-2 rounded-full px-3 text-left font-semibold text-sm transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white motion-reduce:transition-none"
  >
    <TrendingDown className="size-4 shrink-0" aria-hidden />
    {text}
  </button>
);

/** SOL-50: the first red day and, when later, the worst day with its recovery; a tap jumps to the day. */
export const RedDayAlert = ({ alert, onJump }: { alert: ForecastAlert; onJump: (date: string) => void }) => {
  const currency = useCurrency();
  const { firstRed, lowest, recoversOn } = alert;
  const first = firstRed.today
    ? `Hoje está no vermelho: ${formatMoney(firstRed.balance, currency)}`
    : `Dia ${Number(firstRed.date.slice(8))} fica no vermelho: ${formatMoney(firstRed.balance, currency)}`;
  const recovery = recoversOn ? ` · recupera em ${dayMonth(recoversOn)}` : "";
  const worst = `Pior dia: ${dayMonth(lowest.date)}, ${formatMoney(lowest.balance, currency)}${recovery}`;
  return (
    <div className="mt-4 flex flex-col items-center gap-1 lg:items-start">
      <Line text={first} onClick={() => onJump(firstRed.date)} />
      {lowest.date !== firstRed.date && <Line text={worst} onClick={() => onJump(lowest.date)} />}
    </div>
  );
};
```

`month-header.tsx`: `MonthHeaderProps` base gains `children?: ReactNode;` (next to `onMonthChange`); destructure `children` in `MonthHeader`; render `{children}` right after the `mt-8` balance `div`, inside the `Saldo hoje` section. The compact variant ignores it.

- [ ] **Step 4: Run to see green**

Run: `cd web && pnpm vitest run src/widgets/red-day-alert src/widgets/month-header && pnpm typecheck && pnpm lint`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/widgets/red-day-alert web/src/widgets/month-header/month-header.tsx web/src/widgets/month-header/month-header.test.tsx
git commit -m "feat(web): SOL-50 hero lines for the first red day and the worst day"
```

### Task 7: Page wiring — jump, 2 s ring, `Motivo da queda`

**Files:**
- Modify: `web/src/app/(app)/(shell)/mes/page.tsx`, `web/src/app/(app)/(shell)/mes/page.test.tsx`
- Modify: `web/src/widgets/ledger/ledger.tsx` (props `highlight`, `causes`; group `id`; caption in `Row` and `DueRow`)

**Interfaces:**
- Consumes: `forecastAlert`, `causeOf`, `RedDayAlert`, `MonthHeader children`.
- Produces: `Ledger` props `highlight?: string | null`, `causes?: ReadonlySet<string>`; DOM ids `dia-YYYY-MM-DD`.

- [ ] **Step 1: Write the failing tests**

`page.test.tsx` (import `FORECAST_MONTH`, `FORECAST_TRANSACTIONS` from `@/test/stub-api`):

```tsx
  it("warns of the first red day and the worst day; a tap jumps to the day, rings it for 2 s and names the cause", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    open({
      "GET /api/months/2026-11": { status: 200, body: FORECAST_MONTH },
      "GET /api/transactions": { status: 200, body: FORECAST_TRANSACTIONS },
    });

    const hero = await screen.findByRole("region", { name: "Saldo hoje" });
    const first = await within(hero).findByRole("button", { name: /^Dia 23 fica no vermelho: -R\$\s675,00$/ });
    expect(
      within(hero).getByRole("button", { name: /^Pior dia: 28\/11, -R\$\s2\.916,00 · recupera em 30\/11$/ }),
    ).toBeVisible();
    expect(within(ledger()).getByRole("listitem", { name: "Cartão" })).toHaveTextContent("Motivo da queda");
    expect(within(ledger()).getByRole("listitem", { name: "Financiamento" })).toHaveTextContent("Motivo da queda");
    expect(within(ledger()).getByRole("button", { name: /Seguro/ })).not.toHaveTextContent("Motivo da queda");

    await userEvent.click(first);
    const day = document.getElementById("dia-2026-11-23");
    expect(scroll).toHaveBeenCalledWith({ block: "start" });
    expect(day).toHaveClass("ring-2");
    await waitFor(() => expect(day).not.toHaveClass("ring-2"), { timeout: 3000 });
  });

  it("says nothing in the hero when no day ahead is red", async () => {
    open();

    const hero = await screen.findByRole("region", { name: "Saldo hoje" });
    expect(within(hero).queryByText(/no vermelho/)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to see red**

Run: `cd web && pnpm vitest run "src/app/(app)/(shell)/mes/page.test.tsx"`
Expected: FAIL — no `Dia 23 fica no vermelho` button.

- [ ] **Step 3: Minimal implementation**

`ledger.tsx`:
- `LedgerProps` gains `highlight?: string | null; causes?: ReadonlySet<string>;` and `Ledger` destructures `highlight = null, causes = new Set<string>()`.
- Caption element, used by both rows:

```tsx
const Cause = () => <span className="text-expense text-xs">Motivo da queda</span>;
```

- `Row` gets `cause: boolean`; its `<Money … />` becomes

```tsx
      <span className="flex flex-col items-end gap-0.5">
        <Money amount={transaction.amount} income={transaction.kind === "income"} className="font-bold text-base" />
        {cause && <Cause />}
      </span>
```

- `DueRow` gets `cause: boolean`; same wrapper around its `Money`.
- Group wrapper:

```tsx
          <div
            key={day.date}
            id={`dia-${day.date}`}
            className={cn("scroll-mt-28 rounded-xl", highlight === day.date && "ring-2 ring-expense")}
          >
```

- Pass `cause={causes.has(transaction.id)}` to `Row`, `cause={causes.has(bill.bill_id)}` to `DueRow`.

`page.tsx`: imports `causeOf, forecastAlert` from `@/entities/month/forecast-alert` and `RedDayAlert` from `@/widgets/red-day-alert/red-day-alert`. Before the early returns:

```tsx
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(null), 2000);
    return () => clearTimeout(timer);
  }, [highlight]);
```

After `if (!view.data || !transactions.data) return <MonthSkeleton />;`:

```tsx
  const entries = transactions.data;
  const bills = view.data.bills_of_month;
  const alert = forecastAlert(view.data.days);
  const causes = new Set(
    (alert ? [alert.firstRed.date, alert.lowest.date] : [])
      .map((date) => causeOf(date, entries, bills))
      .filter((id): id is string => id !== null),
  );
  const jump = (date: string) => {
    document.getElementById(`dia-${date}`)?.scrollIntoView({ block: "start" });
    setHighlight(date);
  };
```

`<MonthHeader …>{alert && <RedDayAlert alert={alert} onJump={jump} />}</MonthHeader>` and `<Ledger … highlight={highlight} causes={causes} />`.

- [ ] **Step 4: Run to see green**

Run: `cd web && pnpm vitest run "src/app/(app)/(shell)/mes" src/widgets && pnpm typecheck && pnpm lint`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/widgets/ledger/ledger.tsx "web/src/app/(app)/(shell)/mes/page.tsx" "web/src/app/(app)/(shell)/mes/page.test.tsx"
git commit -m "feat(web): SOL-50 a hero line jumps to its day, rings it for 2 s and names the cause"
```

### Task 8: E2E — the hero line jumps to the red day

**Files:**
- Modify: `web/e2e/forecast.spec.ts` (rename the test, append the lines)

- [ ] **Step 1: Extend the test**

Add under the `API` constant:

```ts
/** `YYYY-MM-DD` of `day` next month, in the browser's calendar. */
const nextMonthDay = (day: number) => {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, day);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
```

Rename the test to `"an unpaid conta fixa paints next month's due day Crítico and the hero line jumps to it"` and append to its end:

```ts
  const hero = page.getByRole("region", { name: "Saldo hoje" });
  await hero.getByRole("button", { name: /Dia 28 fica no vermelho: -R\$\s600,00/ }).click();
  await expect(page.locator(`#dia-${nextMonthDay(28)}`)).toHaveClass(/ring-2/);
  await expect(ledger.getByRole("listitem", { name: "Aluguel" })).toContainText("Motivo da queda");
```

- [ ] **Step 2: Run**

Run: `cd web && pnpm e2e e2e/forecast.spec.ts` (server up with `DATABASE_URL=…/soldi_50`).
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/e2e/forecast.spec.ts
git commit -m "test(web): SOL-50 e2e for the red-day line jumping to its day"
```

### SOL-50 gate and review

- [ ] Same gate as SOL-49 (Rust part runs unchanged; it must stay green).
- [ ] `qa` only if the diff passes ~200 lines (it carries no contract, auth or isolation change). Checklist: no `Number()`/float on an amount (only `cents()`); `forecastAlert` window excludes past days; ties earliest; `light_red` never alerts; `Hoje` copy only when `firstRed.today`; highlight timer cleared on unmount; missing `#dia-…` is a no-op.
- [ ] `pixel` (`sonnet`): `RedDayAlert` is a new component — screenshots at 375 and 1440, light and dark, of the owner's November (two lines, ring on the 23rd) against `docs/specs/cards/SOL-50.md`; 44 px targets; the hero text contrast on the gradient.

## Self-review

- Spec coverage: SOL-49 rules 1, 2, 7 → Task 1; contract → Tasks 1–2; UI/copy/states → Task 3; e2e → Task 4. SOL-50 definitions → Task 5; hero copy/states → Task 6; scroll, 2 s ring, cause caption → Task 7; e2e → Task 8.
- Names used across tasks: `projected_balance`, `projected_tier`, `lands_on`, `dayMonth`, `cents`, `forecastAlert`, `causeOf`, `ForecastAlert.firstRed/lowest/recoversOn`, `RedDayAlert`, `Ledger.highlight/causes`, `dia-YYYY-MM-DD`, `FORECAST_MONTH`, `FORECAST_TRANSACTIONS`.
