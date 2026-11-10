
# Forecast engine — money rules (finance panel draft, feeds SOL-<n> card)

Base facts read: `docs/specs/decisions.md` D7 (Decimal), D8 (ledger computed, no rows ahead), D13 (São Paulo today, overdue = `due_date < today`), D14 (finite repeat writes real rows, `series_id`); `months::domain::month_view` (day loop sums only `sums` i.e. real transactions, `projected_balance` subtracts unpaid bills once at month end, never per day — that gap is the card); `bills::domain::due_date` (clamps `due_day` to `month_end(month).day()`).

## 1. What enters a future day

| Source | Enters forecast? | Day it lands |
|---|---|---|
| Committed rows already typed (income/bill/daily, incl. D14 series) | yes | their own date |
| Unpaid conta fixa, future due day | yes, synthetic | `due_date(month, due_day)` clamped |
| Unpaid conta fixa, due day already passed (overdue) | yes, synthetic | see rule 2 |
| Recurring income ("entrada fixa") as a new entity | **NO for v1** | n/a |
| Parcela (installment) | yes | see rule 3 |
| "Posso comprar" draft | yes, transient only, never written | chosen date |

Example: opening balance R$1.200,00. Nov 10 aluguel unpaid R$1.800,00 (due 10). Nov 15 freela R$500,00. Nov 23 parcela 3/10 R$200,00. Nov 28 internet unpaid R$150,00 (due 28). Nov 30 salário R$3.000,00. Running: day1–9 1200,00 → day10 **-600,00 (Red)** → day15 -100,00 (LightRed) → day23 -300,00 (LightRed) → day28 **-450,00 (LightRed)** → day30 2.550,00 (Green). All five entries are plain rows plus two synthetic bill dips; no new concept needed to get this.

**Vote — recurring income entity: NO, 4-0.** D14's "repetir por N meses" (2..60) already turns salário into real committed rows feeding rule 1's first bucket; the owner's gap is "re-typing," not "missing forecast input." Adding a conta-fixa-twin for income (pay/receive tap, overdue tracking) is a second concept the owner never had in the sheet — ship it only if he later asks to track "salário atrasado" symmetric to bills. One line of impact: *a bill not yet paid still moves tomorrow's number; a salary not yet typed is simply not in the sheet, same as today.*

## 2. Past-due unpaid bills — single hit, no double count

Rule: a bill subtracts once, on `max(due_date, today)`. Real days (≤ today) are frozen on actual transactions (D13), never rewritten. A future due day subtracts there. A due day already gone and still unpaid subtracts on **today**, the first day the forecast can act — never on the missed day (that day's real balance stays true) and never twice.

Example: today Nov 20. Aluguel due Nov 10, unpaid, R$1.800,00. Real balance through Nov 20 stays whatever was actually posted (no aluguel in it — true cash). Forecast for Nov 20 onward opens with `balance_today - 1.800,00`, tagged "aluguel, atrasado desde 10/11." Household line: *a late bill still counts in the projection, it does not vanish because the due day passed.*

## 3. Installments (parcela)

Reuses D14's series mechanism (N rows, `series_id`), monthly cadence from the chosen start day, each row clamped to that month's last day same as `due_date`. Split: `total / n` rounded half-even to 2 decimals for installments 1..n-1; installment n = `total - sum(1..n-1)`, so the N parcelas always sum back to the typed total — Decimal only, never float.

Example: R$1.000,01 em 10x, start Jan 31. Parcelas 1–9 = R$100,00 each (900,00). Parcela 10 = R$100,01 (remainder). Parcela landing on Feb → clamped to Feb 28 (or 29). No card/invoice entity; same "a card bill is just a Saída" rule as today, just 10 Saídas instead of 1.

## 4. Horizon

6 or 12 months, read-only (no rows written beyond what rules 1–3 already wrote). Extends `month_view`'s per-month loop across N months; each month computes its own `due_date` clamp independently (31→28/29/30 handled per month, not globally). Cap at 12 — no PocketSmith-style multi-year scenario (market research NOT-build list).

Example: conta de luz, due day 31, checked across Jan–Mar. Jan 31, Feb 28, Mar 31 — three different clamped days, three independent dips.

## 5. The red day

Alert threshold = `Tier::Red` (`balance < settings.tier_red`, default -500,00), **not** "below zero" — LightRed (-500..0) stays a soft warning color, not the alert. Lowest point = min balance in the range + its date. First red day = earliest date with `tier == Red`. Recovers-on = first later date with `balance >= tier_red`. Cause = the single entry with the largest outflow on that exact day (bill > installment > daily by amount desc, ties broken by amount then kind, deterministic).

Example (rule-1 series): lowest point Nov 10, -600,00, cause "aluguel R$1.800,00." First red day Nov 10. Recovers on Nov 15 (-100,00, back above -500). Household line: *the lowest point is the day the aluguel hits, not the day it was typed.*

## 6. Daily spending (Diário) in the future

**Vote: ignore, 4-0.** No averaged daily projection in v1. Reasoning: averaging irregular daily spend forward overstates outflow on days the user won't actually spend → false alarms, which is the exact alert-fatigue failure PocketSmith's own min-balance alert shows in the market research. Explicit tools (red-day list, posso-comprar, parcela wizard) already let the user add a real future Diário row when they know one is coming; silent background guessing is the false-calm/false-alarm trade the owner never asked to make. Household line: *the forecast only drops when a real future expense is typed, not because yesterday's coffee got averaged forward.*

## 7. Edge cases

- **Income + bill same day:** both net into the same day's flow (existing `Flows` struct sums income minus bills before touching balance) — order of entry does not matter. Example: Nov 5 salário R$3.000,00 and aluguel paid R$1.800,00 same day → day net +1.200,00, one balance point, not two.
- **opening_date:** forecast range never starts before it (SOL-3's 422 `before-opening-date` already refuses earlier transactions); a 12-month horizon query clamps its start to `max(requested_start, opening_date)`.
- **Cofrinho deposit/resgate:** treated as a literal committed row like any Saída/Entrada (deposit lowers, resgate raises) — no synthetic/recurring projection, cofrinhos have no recurring model today.
- **Bill paid early or late:** once `paid = true`, the real transaction date (already in `sums`) is the only source of truth; rules 1–2's synthetic due-day subtraction never applies to a paid bill, so there is no double count between the real posted entry and the synthetic forecast one.
- **Precision:** every synthetic amount (bill clamp carry-over, installment split, posso-comprar draft) is `Decimal`, rounded half-even to 2 decimals before it joins any sum — same as D7, no `f64` anywhere in the forecast path.

## Vote — v1 minimum vs wait

**Ship now:** rule 1 (synthetic unpaid-bill dip on due day, no new income entity), rule 2 (overdue single-hit on `max(due_date, today)`), rule 4 (6/12-month read-only extension of the existing month loop), rule 5 (red-day list: lowest point, first red day, recovers-on, cause), rule 7 (edge cases, all reuse existing D7/D13/D14 behavior — no new rule, just the forecast path must not violate them).

**Wait:** rule 3 (parcela wizard) — bigger diff (new form + split logic), ships as its own card once rule 1/2/4/5 land, per product's ranking (#1 highest value but 2 is lowest effort, ship 2 first). Rule 6 stays "ignore" indefinitely unless usage data shows the opposite. "Posso comprar" preview (card's own feature) waits until rule 1–3 all exist, since it is pure computation on top of them — no new rule to design, just no data to preview yet.
