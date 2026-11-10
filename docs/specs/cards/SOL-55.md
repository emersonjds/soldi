# SOL-55 — An unpaid conta fixa of an earlier month lands today

Epic SOL-40, sprint 3, card 1 of 3 (build order SOL-55 → SOL-51 → SOL-52). Follow-up named in SOL-49's review notes. Rules: D16, D17, `docs/specs/forecast/02-finance.md` rules 2 and 7. Plan: `docs/plans/2026-11-10-forecast-sprint-3.md` tasks 1–4.

Today an unpaid conta fixa of October vanishes from November: the forecast only lands the viewed month's bills, so a late Aluguel stops counting the day the month turns. Finance rule 2 says a late bill counts once, on today, until it is paid.

## Panel (architect arbitrated over the forecast panel's rules)

| Question | Options | Winner | Why |
|---|---|---|---|
| How far back? | (a) previous month only, (b) from `opening_date`, (c) from `opening_date` and the bill's `active_since` | **(c)** | (b) alone paints every new user red: a bill registered today with `opening_date` in January would carry ten "unpaid" months that were paid before Soldi knew the bill. `active_since` (registration, or the last resume) is the first day the user could have marked it paid. (a) hides a two-month-old debt. |
| Where does it land? | the missed day, today, end of month | **today**, once per unpaid month | Rule 2: real days stay frozen (D13), never twice. |
| Which months show it? | every later month, current month only | **listed only in the current month**; a future month opens already lower by it | Lists stay short; the money is still in every future day (`pending` before the month starts). |
| User never pays it | `Marcar como paga`, `Ignorar este mês`, nothing | **`Pagar` in Contas do Mês, booked in its own month** (existing pay rule: one payment a month, dated inside that month). Pausing or archiving the bill also stops the carry; resuming it owes only from the resume day on. | `Ignorar` needs a persisted skip (new table, new endpoint, undo); not trivial → out of scope, follow-up if the owner asks. |
| Contract | new `carried: bool` / `month` field, or none | **no new field**: a carried row is a `BillOfMonth` whose `due_date` is before `MonthView.month` | `due_date` already carries the month; a flag would repeat it. |

Trade-off accepted: a bill really paid late (in November for October) is booked on a date inside October. Today's balance is the same either way (it sums every entry up to today); only the days between the two dates differ. Booking it on the real day needs a `bill_month` column on the payment (migration + new unique index) — owner's call, not this card.

## Rule (server, `months::domain`)

- **Owed month** of a bill, one rule for every month (past, current, future, own rows and carried ones alike): its clamped due date `due_date(M)` is on or after `opening_date` **and** on or after the bill's `active_since`. A month that is not owed has no overdue flag, no landing and no weight in any projection.
- **`active_since`** (`recurring_bills.active_since date NOT NULL`, migration `0018`): the São Paulo day the bill starts owing. Backfilled from `(created_at AT TIME ZONE 'America/Sao_Paulo')::date`; defaults to the São Paulo today on insert; `PATCH /api/bills/{id}` turning `active` false → true sets it to the São Paulo today (D13). So a bill created in January, paused in August and resumed on 10/11 carries nothing for August–October.
- **Unpaid month**: an owed month `M` from `opening_date`'s month on with no payment of that bill dated inside `M`. Only active, unarchived bills (as today).
- It **lands** on `max(due_date(M), today)`: a past month's lands today; a coming month's on its due day (SOL-49 unchanged).
- **Current month** view: `bills_of_month` = the carried rows (unpaid months before this one, oldest first, then by due day and name) followed by this month's own rows (unchanged). A carried row: `paid: false`, `transaction_id: null`, `overdue: true`, `lands_on: today`, `amount` = the bill's current amount, `due_date` = its own month's due date.
- **Future month** view: no carried rows; every unpaid month before it is already subtracted from day 1's `projected_balance` (fixes SOL-49's known limit; a future month view now equals SOL-51's forecast day by day).
- **Past month** view: its own rows, `projected_balance == balance` on every day.
- `MonthView.projected_balance`: current and future months = the last day's `projected_balance`; past months keep `balance at the end − its overdue own rows`.
- No new query. `payments` reads from the first day of `opening_date`'s month (was: the month), so a payment dated before a moved opening date still pays its month (no carry, no double subtraction); `bills` returns `active_since`. Same two queries, both `WHERE user_id = $1`. Memory O(bills × months since opening).
- **Month bound**: `parse_month` accepts years 2000 to 2100 only (SOL-30's period bound); `GET /api/months/9999-12` is 422 `validation` on `month`. The same bound reaches every `?month=`.

## Contract (`crates/soldi-types/src/months.rs`, doc only)

Fields unchanged. Doc changes (they reach `web/openapi.json`):

- `BillOfMonth`: "In the current month, a bill still unpaid in an earlier month is listed again with that month's `due_date`, `overdue` and `lands_on` today (SOL-55)."
- `MonthView.projected_balance`: "For the current and a future month, the last day's `projected_balance` (every unpaid bill landed, earlier months' included); for a past month, the balance at its end minus its unpaid `bills_of_month`."

Paying a carried row: `POST /api/bills/{id}/pay?month=<due_date's YYYY-MM>` with a date inside that month (existing endpoint, existing 422 `date` "must be in the month").

## UI

`web/src/widgets/bills-of-month/bills-of-month.tsx` (Contas do Mês):

- Carried row (`!bill.due_date.startsWith(view.month)`): same red treatment as an overdue row, caption `Venceu em outubro` (`Clock` icon, `text-expense`); a different year adds it: `Venceu em dezembro de 2025`. `li aria-label="Aluguel de outubro"`; pill `Vencido` with `aria-label="Pagar Aluguel de outubro, vencida"`.
- One tap on `Vencido` pays it in its own month: `month = due_date.slice(0, 7)`, `date = payDateFor(month, due_date)` (= the due date, since today is not in that month).
- The amount opens `Pagar` with `month` = the row's month; the sheet's description for any month other than the current one: `Conta de outubro: a data do pagamento fica em outubro.`
- `N obrigações cadastradas` counts the month's own rows only.
- React keys and ids use `billKey(bill)` = `` `${bill.bill_id}@${bill.due_date}` `` (two rows of one bill can coexist).

`web/src/widgets/ledger/ledger.tsx`: a carried row lands on today with caption `Conta fixa · venceu em outubro` (`text-expense`). `causeOf` returns `billKey(bill)` for bills, so `Motivo da queda` lands on the right one of two rows of the same bill.

`web/src/entities/bill/bill-queries.ts`: the optimistic `patchRow` matches `bill_id` **and** the paid month (`row.due_date.startsWith(month)`), so paying November's Aluguel never ticks October's carried row.

## Copy

`Venceu em outubro`, `Venceu em dezembro de 2025`, `Conta fixa · venceu em outubro`, `Conta de outubro: a data do pagamento fica em outubro.`, aria `Aluguel de outubro`, `Pagar Aluguel de outubro, vencida`. Month names: `janeiro … dezembro`, lowercase.

## States

| State | Contas do Mês | Ledger / hero |
|---|---|---|
| No earlier unpaid month | unchanged | unchanged |
| One carried bill | carried row first, `Venceu em outubro`, `Vencido` | lands today: `Conta fixa · venceu em outubro`; today's pill `Previsto · …`; SOL-50 hero reads it like any landed bill |
| Same bill late in Oct and due in Nov | two rows, distinct keys; paying one leaves the other | both land (today and the due day, or both today) |
| Carried row paid | row leaves after the refetch (it is paid in October now) | today's projection rises by the amount; `balance_today` unchanged when the date is before today |
| Bill paused or archived | no rows, no carry | — |
| Past month | unchanged, no carried rows | unchanged |
| Future month | no carried rows | day 1 already lower by every earlier unpaid month |

## Acceptance (thresholds -500/0/1000/2000)

- Today 20/11, opening R$ 1.200,00 on 01/10, Aluguel R$ 1.800,00 due 10, unpaid in October, paid R$ 1.800,00 on 10/11: Contas do Mês lists `(2026-10-10, overdue, lands 2026-11-20)` then `(2026-11-10, paid)`; 19/11 `projected_balance` -600.00; 20/11 -2400.00 `red` with `balance` -600.00; `MonthView.projected_balance` -2400.00; hero `Hoje está no vermelho: -R$ 2.400,00`; the carried row in the ledger reads `Motivo da queda`.
- Opening 15/10, today 05/11, three R$ 100,00 bills: Luz due 10 (created long ago), Internet due 20 created 25/10, Gás due 25 created 01/10 → carried only Gás (25/10); 05/11 `projected_balance` 900.00; month end 600.00.
- Created Jan, paused Aug, resumed 10/11, today 12/11: no carried rows; Luz due 5 not owed in November (no overdue, no landing), Aluguel due 10 owed (boundary `>=`), overdue, lands 12/11; the October view has no overdue row.
- Created 20/11, Luz due 10: not owed in November nor in December's opening; Gás due 20 created the same day is owed (lands 20/11).
- Payment dated 10/10, opening moved to 15/10, bill due 25/10: October stays paid, nothing carried into November.
- Due day 31, opening 01/11/2026, today 05/03/2027: carried 30/11, 31/12, 31/01, 28/02, each landing 05/03.
- `GET /api/months/9999-12` and `1999-12` → 422 `validation` on `month`.
- Opening 01/09, Luz R$ 100,00 due 5 never paid, today 03/11 → rows due 05/09, 05/10, 05/11; 02/11 1000.00 (last real day), 03/11 800.00, 05/11 700.00; the October view keeps one row and `projected_balance == balance` on every day.
- Viewing 2027-02 on 10/11/2026, opening 01/11, Cartão R$ 300,00 due 29 never paid → 27/02 `projected_balance` 100.00 `yellow` (Nov 29, Dec 29, Jan 29 already landed), 28/02 -200.00 `light_red`.
- Integration: Ana's bill created last month carries; Bia's identical bill never shows in Ana's month; paying it with `?month=<last month>` drops the row and keeps `projected_balance` (-2600.00 → -2600.00, cash -800.00).
- Web: `Vencido` on the carried row posts `?month=2026-10` with `{"date":"2026-10-10"}`; paying November's row optimistically ticks only November's.
- `scripts/sqlx-prepare.sh --check` passes after regenerating `.sqlx/`; every other server and web test passes; the only changed expectations are SOL-49's two future-month tests and `web/e2e/forecast.spec.ts` (they encoded the known limit this card removes: next month now opens at -R$ 600,00, day 28 reads `-R$ 2.200,00 Previsto · Crítico`, the hero shows `Dia 1 fica no vermelho: -R$ 600,00` and `Pior dia: 28/<MM>, -R$ 2.200,00`, and the second line is the one that jumps to day 28).

## Out of scope

`Ignorar este mês` (persisted skip), booking a late payment on its real day (`bill_month` column), partial payments, a lookback cap (owner's call if a years-old debt ever shows), carrying into an e2e (bills are always created "now"; covered by domain and integration tests).
