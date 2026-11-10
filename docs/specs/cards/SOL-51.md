# SOL-51 — Months ahead (Próximos meses, 6/12)

Epic SOL-40, sprint 3, card 2 of 3, built on SOL-55's engine (`unpaid` months landed on `max(due_date, today)`). Rules: D16, D17, `02-finance.md` rules 4 and 7; screens: `03-ux.md` §3, §5, §6. Plan: `docs/plans/2026-11-10-forecast-sprint-3.md` tasks 5–9.

## Panel (architect challenge on ux §3 and the suggested `?months=6|12`)

| Question | Options | Winner | Why |
|---|---|---|---|
| Endpoint shape | `GET /api/forecast?months=6\|12`; one month view per chip; fixed 12 | **`GET /api/forecast`, always 12 months** | ux §3 wants the toggle without a new request, so the web always needs 12; a `months` param would be a branch nobody calls with 6. One request, 4 queries (settings, `day_sums`, `bills`, `payments`), none per month. |
| Server returns | month summaries (lowest tier, red days) or days | **days** (`date`, `projected_balance`, `projected_tier`) | SOL-52 must recompute the same summary on a draft that never reaches the server; one summary function in the web (`monthsAhead`) serves both, as SOL-50 did with `forecastAlert`. Money arithmetic stays server-side; the web only compares cents (and, in SOL-52, adds the draft's cents). ~366 days ≈ 26 KB raw, gzip via the existing `CompressionLayer`. |
| Chip | ux: 44×44 color chip, label on long-press/focus; 6 in a row, scroll for 12 | **3-column grid, chip with two visible lines** (`nov 2026`, `Crítico`) and a red-days badge | Long-press is not a web gesture and color-only fails D9; the global rule forbids horizontal scroll at 375 px. `Confortável` does not fit a 54 px chip; 3 columns (≈ 105 px) fit it at 375 px and in the lg side column. |
| Where | new tab, inside Mês | **inside Mês, under `Termômetro do Mês`** (same lg side column) | ux §3; the bottom nav keeps 5 items. |
| Drill-down | `router.push`, `router.replace` | **same as the month switcher** (`router.replace('/mes?m=…', { scroll: false })` then `window.scrollTo({ top: 0 })`) | One navigation rule on the screen. ux's "back returns to the strip" is dropped: the switcher never pushed history either. |

## Rule (server, `months::domain::forecast`)

- Horizon: today's month and the 11 after it (D16 cap). `from = max(today, opening_date)`, `to = month_end(today's month + 11)`. `from > to` → no days.
- Each day from `from` to `to`: `balance` walks the ledger (committed rows, D14 series included) exactly as `month_view`; `projected_balance = balance − every unpaid month landed on or before it` (SOL-55 `unpaid`, current month's carried rows included); `projected_tier = tier(projected_balance)` with the user's thresholds.
- Invariant: for every date in the horizon, `forecast.days[date].projected_balance == month_view(month of date).days[date].projected_balance` (current and future months).
- No averaged Diário, no recurring income (D16).

## Contract (`crates/soldi-types/src/months.rs`)

```rust
/// One day ahead (D16): the balance with every unpaid bill landed, and its tier.
pub struct ForecastDay { pub date: NaiveDate, pub projected_balance: Decimal /* money string */, pub projected_tier: Tier }

/// `days` run from today (the opening date, when later) through the last day of the 11th month after
/// today's (São Paulo, D13); empty when the opening date is past that.
pub struct Forecast { pub today: NaiveDate, pub days: Vec<ForecastDay> }
```

`GET /api/forecast` (tag `months`): 200 `Forecast`, 401 `Problem`. No query, no 422.

JSON: `{"today":"2026-11-10","days":[{"date":"2026-11-10","projected_balance":"6150.00","projected_tier":"green"}, …]}`.

## Web

- `entities/forecast/forecast-query.ts`: `forecastQuery` with key `["month", "forecast"]` — every mutation that invalidates `["month"]` (entries, bills, settings, cofrinhos, imports) refreshes the forecast with no new code.
- `entities/forecast/months-ahead.ts` (pure): `monthsAhead(forecast, count)` → `{ month: "2026-11", lowest: Tier | null, redDays: number }[]` for the `count` months from `forecast.today`'s; `lowest` = tier of the smallest `projected_balance` among that month's days in `days` (the current month from today on), `null` when the month has no day (before the opening date); `redDays` = days with `projected_tier === "red"`. `isFlat(forecast)` = every day has the same `projected_balance` (nothing lands ahead).
- `entities/forecast/month-chips.tsx`: the chip grid (also used by SOL-52's sheet, static there).
- `widgets/months-ahead/months-ahead.tsx`: the card.

## UI — card `Próximos meses`

- Header: brand bar + `h2` `Próximos meses`; segmented `6 meses` / `12 meses` (`ToggleGroup`, `aria-label="Horizonte"`, default 6), same chip style as Lançar's kind control.
- Grid `grid-cols-3 gap-2`, one `button` chip per month, `min-h-16 rounded-xl px-2 py-2`, background and text `TIER_STYLE[lowest].pill`:
  - line 1 `nov 2026` (`monthYear`, `font-semibold text-sm`), line 2 `TIER_LABEL[lowest]` (`text-xs`);
  - red-days badge (only when > 0): `absolute -top-1.5 -right-1.5 min-w-5 h-5 rounded-full bg-tier-red text-white text-xs font-bold`, the number, `aria-hidden`;
  - `aria-label`: `nov 2026: Crítico, 7 dias no vermelho` (`1 dia no vermelho`; none → `dez 2026: Folga`);
  - the viewed month: `aria-current="date"` and `ring-2 ring-primary`.
- Tap → `onOpen("2026-12")`: page replaces `?m=2026-12` and scrolls to the top (hero).

## States

| State | Card |
|---|---|
| Loading | header + `count` `Skeleton` chips (`h-16 rounded-xl`) |
| Error | header + `Não foi possível carregar.` and a `Tentar de novo` button (refetch); the month above keeps working |
| Nothing ahead (`isFlat`) | chips neutral (`bg-muted text-muted-foreground`, line 2 hidden, aria `nov 2026`), still tappable; caption `Lance seus próximos meses para ver a cor deles aqui.` |
| Month before the opening date (`lowest === null`) | chip `bg-muted text-muted-foreground`, line 2 `Antes do início`, `aria-disabled="true"`, no click, aria `nov 2026: antes do início` |
| All green | chips `Folga`/`Confortável`, no badge, no banner |
| Normal | as above |

## Acceptance (fixture `FORECAST`: owner's SOL-49 November, today 10/11/2026, no December salary typed; thresholds -500/0/1000/2000)

- Server, owner's data: forecast 23/11 -675.00 `red`, 28/11 -2916.00, 30/11 491.00 `yellow`, 23/12 -4409.00 `red`, 31/12 -7577.00; `days[0].date` 2026-11-10, last 2027-10-31, 356 days; each equals the month view's day.
- Server: opening 15/01/2027 → first day 2027-01-15; opening 01/01/2028 → `days` empty; another user's bill never moves Ana's forecast; no session → 401.
- `monthsAhead(FORECAST, 6)` → nov `red` 7, dez `red` 9, jan `red` 31, fev `red` 28, mar `red` 31, abr `red` 30.
- Chip `nov 2026: Crítico, 7 dias no vermelho` shows `nov 2026`, `Crítico`, badge `7`.
- Toggle `12 meses` → 12 chips, last `out 2027`, and still exactly one `GET /api/forecast`.
- Tap `dez 2026` → `router.replace("/mes?m=2026-12", { scroll: false })` and `scrollTo({ top: 0 })`.
- Opening 15/01/2027 → `nov 2026` and `dez 2026` `aria-disabled`, `Antes do início`; `jan 2027` enabled.
- Flat forecast → caption `Lance seus próximos meses para ver a cor deles aqui.`, no tier label.
- Error → `Não foi possível carregar.` + `Tentar de novo` retries; the hero and the ledger still render.
- e2e (375 px): new user R$ 1.000,00 with Aluguel R$ 1.600,00 due 28 → `Próximos meses` first chip `Crítico`, second chip `Crítico`; tap it → URL `?m=<next month>`, hero `Dia 1 fica no vermelho: -R$ 600,00` (this month's unpaid Aluguel already landed) and `Pior dia: 28/<MM>, -R$ 2.200,00`.

## Out of scope

Line chart, calendar grid, multi-year, per-chip tooltips, persisting the 6/12 choice, a summary on the server.
