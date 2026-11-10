# SOL-49 — Dia futuro com cor (projected days)

Epic SOL-40, sprint 2, card 1 of 4. Rules: D16, `docs/specs/forecast/02-finance.md` rules 1, 2, 7; screens: `03-ux.md` §2 (day rows), §7 card 1. Plan: `docs/plans/2026-11-10-forecast-sprint-2.md` tasks 1–4.

Today every future day already walks the committed rows (`balance`), but an unpaid conta fixa only hits `projected_balance` once, at the month's end. The owner's sheet paints the 23rd red the moment the bill is typed; Soldi must too.

## Rule (server, `months::domain::month_view`)

- An unpaid conta fixa of the viewed month **lands** on `max(due_date, today)`: its clamped due day (`bills::domain::due_date`), or today when it is overdue or due today. One hit, never twice, never on the missed day.
- A landing day after the month's end does not exist: a past month lands nothing (its unpaid bills keep `overdue`, as today).
- A paid bill never lands: its real transaction is already in `sums` (no double count).
- `projected_balance` of a day = `balance` of that day − every unpaid bill landed on or before it. Days before today and every day of a past month: `projected_balance == balance`, `projected_tier == tier`.
- Committed future rows (income, Saída, Diário, D14 series, cofrinho moves) need nothing new: `balance` already walks them.
- No averaged Diário, no recurring income (D16).

## Contract (`crates/soldi-types/src/months.rs`)

`Day` gains, after `tier`:

| field | type | meaning |
|---|---|---|
| `projected_balance` | money string | `balance` minus the unpaid bills landed by this day |
| `projected_tier` | `Tier` | `tier(projected_balance)` with the user's thresholds |

`BillOfMonth` gains `lands_on: date \| null` — the day the unpaid bill enters the projection; null when paid or when that day falls after the month.

Unchanged: `balance`, `tier`, `income`, `withdrawn`, `bills`, `daily`, `is_today`, `is_future`, `totals`, `balance_today`, `MonthView.projected_balance` and its formula, `overdue`.

Why two new fields instead of reusing `balance` + a `projected: bool`: `balance` stays "what the ledger holds" (D8), so every existing assertion on it, on `balance_today` and on the past stays true; today has two honest numbers when a bill is overdue (real cash and what the forecast does to it); `is_future` already says "future", a bool would repeat it. Invariant that ties both: for the current and future months `MonthView.projected_balance == days.last().projected_balance`. `lands_on` keeps the landing rule in one place (server, São Paulo today) so the ledger never recomputes it.

## Performance

No new query, no query change: `day_sums` (one `GROUP BY date`), `bills`, `payments`, `saved` stay as they are; landing is a `BTreeMap<NaiveDate, Decimal>` built from `bills_of_month` before the day loop. `scripts/sqlx-prepare.sh --check` unchanged.

## UI (`web/src/widgets/ledger/ledger.tsx`, `web/src/shared/ui/tier-pill.tsx`)

- Every day group gets a `TierPill` (the `!day.is_future` guard goes) with `amount={day.projected_balance}` and `tier={day.projected_tier}`.
- The pill reads `Previsto · <tier label>` when `day.is_future || day.projected_balance !== day.balance` (today with a landed bill included); otherwise the plain tier label, as today. `TierPill` gets `forecast?: boolean`.
- Day label unchanged: `Agendado · 23 nov`, `Hoje, 5 nov`, `Ontem, 4 nov`.
- A day is listed when it has entries **or** an unpaid bill with `lands_on` on it. After the day's entries, one row per landed bill (in `bills_of_month` order), not a button (paying stays in Contas do Mês): category icon, bill name, caption `Conta fixa · a pagar`, or `Conta fixa · venceu dia 10/11` in `text-expense` when `overdue`; amount with `Money`. `<li aria-label={bill.name}>`.
- a11y: the tier label always travels with the color (`Previsto · Crítico`); no new tap target.

## Copy

`Previsto · Crítico` (`Previsto · ` + `TIER_LABEL`), `Conta fixa · a pagar`, `Conta fixa · venceu dia DD/MM`. Amounts through `formatMoney` (`-R$ 675,00`, cents kept as everywhere else in the app).

## States

- No unpaid bill and no future row: future days are not listed (unchanged).
- Future row only: `Agendado · 20 nov` + `R$ 957,79 Previsto · Apertado`.
- Overdue bill: lands on today; today's pill shows the projected number with `Previsto`; Contas do Mês keeps its `Venceu dia` (unchanged).
- Past month: pills as today (real balance, no `Previsto`), no bill rows.
- Future month: every listed day is `Agendado` with `Previsto`.

## Acceptance (owner's November; thresholds -500/0/1000/2000, today Nov 10)

Data: balance R$ 6.150,00 through Nov 22. Nov 23: conta fixa Cartão R$ 4.900,00 (due 23, unpaid) + Saída typed ahead Seguro R$ 1.925,00. Nov 25: Diário typed ahead R$ 241,00. Nov 28: conta fixa Financiamento R$ 2.000,00 (due 28, unpaid). Nov 30: Entrada typed ahead Salário R$ 4.575,00 + conta fixa Condomínio R$ 1.168,00 (due 30, unpaid).

- Nov 22: `projected_balance` 6150.00 `green`.
- Nov 23: `projected_balance` -675.00 `red`; `balance` 4225.00.
- Nov 25: -916.00 `red`. Nov 28: -2916.00 `red`. Nov 30: 491.00 `yellow`; `balance` 8559.00.
- `MonthView.projected_balance` 491.00 == Nov 30 `projected_balance`.
- `lands_on`: Cartão 2026-11-23, Financiamento 2026-11-28, Condomínio 2026-11-30.
- Overdue: opening R$ 1.200,00, Aluguel R$ 1.800,00 due 10 unpaid, today Nov 20 → Nov 10–19 `projected_balance` 1200.00; Nov 20 -600.00 `red` with `balance` 1200.00; Nov 30 -600.00 (once); `lands_on` 2026-11-20, `overdue` true.
- Due today: Luz R$ 100,00 due 10, today Nov 10 → `lands_on` 2026-11-10, `overdue` false, Nov 10 `projected_balance` -100.00.
- Clamp: viewing 2027-02 on Nov 10 2026, bill due 29 → `lands_on` 2027-02-28.
- Paid bill: `lands_on` null and `projected_balance == balance` on every day.
- Past month: every `lands_on` null, every day `projected_balance == balance`, `MonthView.projected_balance` unchanged (830.00 in `bill_rule_8`).
- Ledger: `Agendado · 23 nov-R$ 675,00Previsto · Crítico`; a day with only an unpaid bill is listed with its bill row; today with an overdue bill reads `Previsto`.
- Every existing server and web test passes after only additive edits (new fields in literals and fixtures; the one web test that asserted "Agendado without a balance" now asserts the pill).

## Out of scope / known limit

- A future month does not carry the unpaid bills of the months between today and it (it opens on committed rows only, as `projected_balance` already does). SOL-51 walks months and fixes it.
- Hero line, cause, tap-to-scroll: SOL-50. Horizon: SOL-51. Parcelas, Simular: SOL-52.

## Review notes (2026-11-10, qa)

- A conta fixa due before `opening_date` never lands, is not overdue and is left out of `projected_balance`: it is already inside the opening balance (finance rule 7). Without this, a new user who types today's balance and a bill due earlier in the month starts in the red.
- Any linked payment marks the bill paid; there are no partial payments.
- Unpaid bills of earlier months are not carried into this month's forecast; follow-up card SOL-55.
