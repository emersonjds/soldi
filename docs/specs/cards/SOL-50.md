# SOL-50 — The hero warns of the red day

Epic SOL-40, sprint 2, card 2 of 4, built on SOL-49's `Day.projected_balance`/`projected_tier` and `BillOfMonth.lands_on`. Rules: D16, `02-finance.md` rule 5; screens: `03-ux.md` §2 (hero, cause), §5 states, §6 copy, §7 card 2. Plan: `docs/plans/2026-11-10-forecast-sprint-2.md` tasks 5–8.

## Definitions (exact)

Window = the month's days with `is_today || is_future` (server São Paulo day). A past month has an empty window → no alert.

- **First red day**: first window day with `projected_tier == "red"` (balance < the user's `tier_red`, D16; `light_red` is not an alert). None → no alert at all.
- **Lowest point**: window day with the smallest `projected_balance`; ties → the earliest.
- **Recovers on**: first day after the lowest point with `projected_tier != "red"` (balance ≥ `tier_red`, finance rule 5). None → the month ends red, the recovery part is dropped.
- **Cause** of a day: its single largest outflow among unpaid bills with `lands_on` on it and transactions dated on it with kind `bill` or `daily` (income and resgates never). Ties: conta fixa before Saída before Diário, then list order (bills by due day and name, transactions as the API returns them). A day with no outflow has no cause. A day whose `projected_balance` is not below the previous day's in `days` has no cause either (a red carried in from earlier gets no `Motivo da queda`); the month's first day has no previous day and keeps its largest outflow. Computed for the first red day and for the lowest point.

## Where it is computed: web, from `MonthView.days` + the month's transactions

Pure functions in `web/src/entities/month/forecast-alert.ts`: `forecastAlert(days)` and `causeOf(date, days, transactions, bills)`. No contract change, no new endpoint, no extra query.

Why not a server `alert` field: every input is already on the client (`days`, `bills_of_month`, `useTransactions(month)`), so the server version would add a per-transaction query just for the cause (the month view only reads grouped sums); the comparisons are exact without Decimal (`cents()` integer compare, no arithmetic, `shared/lib/tier.ts` already does it for tiers); and SOL-52's `Simular` must find the red day client-side on a draft that never reaches the server (`03-ux.md` §4: "client-side projection, no server round-trip per edit") — the same `forecastAlert` runs there on the recolored days. One implementation, unit-tested with the owner's numbers. Money arithmetic stays on the server.

## Hero (`MonthHeader` gets `children`, rendered under `Saldo hoje`; new widget `RedDayAlert`)

At most two lines, each a full `button` (≥ 44 px, `TrendingDown` icon before the text, `aria-hidden`), text is the accessible name:

1. First red day:
   - future day: `Dia 23 fica no vermelho: -R$ 675,00`
   - today: `Hoje está no vermelho: -R$ 675,00`
2. Only when the lowest point is another day: `Pior dia: 28/11, -R$ 2.916,00 · recupera em 30/11`; without recovery `Pior dia: 28/11, -R$ 2.916,00`.

Amounts through `formatMoney` with the user's currency; dates `DD/MM` via `dayMonth` (moved from `bills-of-month.tsx` to `shared/lib/date.ts`).

## Tap → scroll + highlight (`mes/page.tsx`, `Ledger`)

- Each ledger day group has `id="dia-YYYY-MM-DD"` and `scroll-mt-28`.
- Tap a line → `document.getElementById("dia-<date>")?.scrollIntoView({ block: "start" })` (no `behavior`: instant, nothing to animate under reduced motion) and the group gets `ring-2 ring-expense rounded-xl` for 2000 ms (page state `highlight`, cleared by a `setTimeout` in an effect). No pulse, no network call.
- Missing group (red today with nothing on today) → no scroll, nothing breaks.

## Cause caption

The cause rows (first red day's and lowest point's, by id: `transaction.id` or `bill.bill_id`) show `Motivo da queda` (`text-expense text-xs`) under their amount, always while the alert exists, not only during the highlight. No new row.

## States

| State | Hero | Ledger |
|---|---|---|
| No red day ahead / all green | nothing (silence is the signal) | no caption |
| Red day ahead, lowest = same day | line 1 only | caption on that day's cause |
| Red day ahead, lowest later | lines 1 and 2 | captions on both causes |
| First red day is today | `Hoje está no vermelho: …` | today's pill already `Previsto · Crítico` (SOL-49) |
| Month ends red | line 2 without `· recupera em` | — |
| Past month | nothing | nothing |
| Future month | from its day 1 | — |
| Loading / error | existing `MonthSkeleton` / `PageError` | — |

## Acceptance (owner's November, SOL-49 data, today Nov 10 or earlier)

- `forecastAlert` → `{ firstRed: { date: "2026-11-23", balance: "-675.00", today: false }, lowest: { date: "2026-11-28", balance: "-2916.00" }, recoversOn: "2026-11-30" }`.
- Hero: `Dia 23 fica no vermelho: -R$ 675,00` and `Pior dia: 28/11, -R$ 2.916,00 · recupera em 30/11`.
- `causeOf("2026-11-23")` → Cartão's `bill_id` (R$ 4.900,00 beats Seguro R$ 1.925,00); `causeOf("2026-11-28")` → Financiamento's `bill_id`.
- Tap line 1 → `scrollIntoView({ block: "start" })` on `#dia-2026-11-23`, which has `ring-2` and loses it after 2 s.
- Cartão row and Financiamento row read `Motivo da queda`; Seguro's does not.
- Finance example (opening 1.200, Aluguel 1.800 due 10, Freela +500 on 15): red day 10 = lowest → one line `Dia 10 fica no vermelho: -R$ 600,00`.
- Two days at -2.916,00 (28 and 29) → lowest is 28.
- Last day still red → `recoversOn` null, no `· recupera em`.
- First red day is today → `Hoje está no vermelho: -R$ 675,00`.
- Only `light_red` ahead (-100) → no alert.
- Past month → no alert; MONTH fixture (no red) → no line in the hero.

## Out of scope

Server alert field, push/notifications, a "tudo certo" banner, carrying earlier months' unpaid bills into a future month (SOL-51).
