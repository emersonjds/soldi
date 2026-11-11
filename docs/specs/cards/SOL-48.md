# SOL-48 — Move the day of a whole series

Panel: `product`, `ux`, `finance` voted; `architect` arbitrated (2026-11-10). Follow-up of SOL-21 (R6 "changing the day of the whole run = a follow-up card") and SOL-47 (D19). Amends D14 and D19 through D20. No migration.

## Why

The internet bill moves from the 5th to the 10th; the card's closing day changes the parcela's day. Today `Este e os próximos` carries amount, category and note but never the date, so the user edits each member by hand. Now the same edit sheet moves the day of this and the following members.

## Rules (finance → unit tests in `transactions/domain.rs` and the service tests)

"Moved members" are the edited member and every member dated after it. `position`/`total` stay the read-time count by `(date, id)` (SOL-21 Model).

| # | Rule | Worked example | Edge |
|---|------|-----------------|------|
| M1 | `PATCH ?scope=following` on a member whose `date` changes **inside its month** moves the moved members to the new date's day. `scope=this` keeps D14: only this row moves, to any month. On #1 (`Toda a série`) every member moves. Members before the edited one never change. | "Internet" 12 × R$ 99,90 from 2026-11-05. Edit #5 (2027-03-05), `Este e os próximos`, date 2027-03-10 → #5–#12 on the 10th (2027-03-10 … 2027-10-10); #1–#4 stay on the 5th. | #1 `Toda a série` 2026-11-05 → 2026-11-20: all 12 on the 20th. Date unchanged: nothing moves. `following` on an entry outside a series equals `this` (SOL-21). |
| M2 | Each moved member lands on the new day **clamped to its own month** (`bills::domain::due_date(first of its month, day)`), never chained from the previous member (R1). | Series 2027-01-10 × 4, #1 → 2027-01-31 `Toda a série` → 01-31, **02-28**, **03-31**, 04-30. | From a clamped member: #2 2027-02-28 of a day-31 series → 2027-02-27 moves everyone from February to the 27th. A February member cannot pick 30 or 31: start from a 31-day month. 2028-02 lands on the 29th. |
| M3 | Growth (D19 L1) takes the **last member's day**; when the last member sits on its month's last day and the member before it has a larger day, that larger day. Months still continue after the last member's month. | After M1's move from #5, N=15 → 2027-11-10, 2027-12-10, 2028-01-10. | 2029-01-31 × 4 (last 04-30, before it 03-31), N=6 → 05-31, 06-30 (D19's L1 edge holds). Day-30 series ending 2026-11-30 (before it 10-30) → 12-30. A `Só este` date on the last member now leads growth: #3 moved alone to 2027-02-10, N=5 → 03-10, 04-10 (was 03-05, 04-05). |
| M4 | A month change with `scope=following` on a member is refused: 422 `date` `must stay in this entry's month when the series moves`, nothing written. The sheet blocks it before saving. | #5 2027-03-05 → 2027-04-05 with `Este e os próximos` → 422. | The same date with `Só este` moves #5 alone to April (D14 unchanged). |
| M5 | A move never reorders members. Every moved member stays in its month, and the move is refused when any two members from the edited member's month on share a month (left by a `Só este` month change): 422 `date` `must not move a series with two entries in one month`, nothing written. | #3 moved alone from 2027-01-05 to 2027-02-20: February holds two members. `Este e os próximos` with a new day from #2 (December) or from either February member → 422: February is among the moved months. From #5 (2027-03-05) → moves #5–#12. | #1 moved alone to 2026-10-05 (an empty month): no month holds two, `Toda a série` from it moves all. |
| M6 | Money is untouched: the move writes `date` only. Installment and repeat series move the same way. The R6 field edits of the same request still apply, in the same DB transaction. Only the edited member's new date meets the opening-date check; the others sit in later months. | R$ 1.000,01 em 10x from 2027-01-10, #1 → 2027-01-25 `Toda a série`: ten rows on the 25th, Σ 1.000,01, R$ 100,01 still on #10. | `Este e os próximos` with amount R$ 109,90 and a new day: both reach #5–#12. A `Só este` one-off date on a later member is overwritten by the move (the user chose the scope, as in R6). |

## Arbitration (winner · trade-off)

| Question | product | ux | finance | Winner · trade-off |
|---|---|---|---|---|
| 1. Entry point | Same `Salvar`: `Este e os próximos` carries the day | Same, with a helper under the date naming the day before saving | Own action "Mudar o dia da série", so a date edit never moves rows by accident | **product + ux**: the radio already means "this and the following"; its default stays `Só este`, so moving takes two deliberate choices and the helper names the result. A separate action is a second sheet for one field. Trade-off: D14's "a date change never propagates" ends (D20); `Este e os próximos` + a new date now moves the tail. |
| 2. Clamp | Own month | Own month | Own month (R1) | **Unanimous**: `bills::domain::due_date` per member, never chained. Trade-off: a move started on a February member cannot reach 29–31. |
| 3. D19 anchor | Keep the first member's day | Last member's day: new months follow what the user sees at the end | The edited member's day | **Last member's day, raised by the member before it when the last one is clamped (M3)**. The first member breaks after any mid-series move; the edited member breaks when the resize is done from an old member. Two rows already read by `ORDER BY date DESC LIMIT 2`, no stored day, no migration. Trade-off: a `Só este` date on the last member now leads growth (one SOL-47 test changes). |
| 4. Month change in the same edit | Refuse | Refuse, inline before saving | Apply to this row only (D14 today) | **Refuse (M4)**, server 422 and blocked in the sheet. "This row only" makes one save move the day of some rows and the month of one. Trade-off: moving #5 to another month while changing the following members' fields takes two saves. |
| 5. Order | Must not change | Badge `5/12` stable | Refuse when a month holds two members | **finance (M5)**: one member per month plus moves inside a month make reordering impossible; no re-ranking code. Trade-off: a rare 422 after a `Só este` month change; the toast tells what to do. |
| 6. Contract | Reuse `PATCH ?scope=following` with `date` | Toast with the new day | Dedicated `PATCH …/series {day}` | **Reuse the PATCH**: no new field, no new endpoint, one DB transaction under `lock_series`, `user_id` on every statement. Trade-off: `scope=following` changes meaning for `date` (contract change below). |
| 7. Installment vs repeat | Same | Same | Same, money untouched | **Unanimous (M6)**. |

## Model

- No migration; index `transactions_series_idx (user_id, series_id, date)` serves the new reads.
- `transactions/domain.rs`:
  - `following_dates(day: u32, last: NaiveDate, count: u32)` takes the day instead of the first member (M3); `repeat_dates(date, n)` is `following_dates(date.day(), date, n − 1)`.
  - `series_day(last: NaiveDate, before: Option<NaiveDate>) -> u32` (M3).
  - `check_day_move(from: NaiveDate, to: NaiveDate) -> Result<(), AppError>` (M4: same year and month, else 422 `date`).
  - `moved_dates(dates: &[NaiveDate], day: u32) -> Result<Vec<NaiveDate>, AppError>`: `dates` by `(date, id)`; 422 `date` when two share a month (M5), else each through `bills::domain::due_date` (M2).
- `repo.rs`, every statement filters `user_id`:
  - `series_span` becomes `series_end(conn, user_id, series_id) -> Vec<NaiveDate>`: `SELECT date FROM transactions WHERE user_id = $1 AND series_id = $2 ORDER BY date DESC, id DESC LIMIT 2` (`query_scalar!`).
  - `members_from(conn, user_id, series_id, from: NaiveDate) -> Vec<(Uuid, NaiveDate)>`: `SELECT id, date … AND date >= $3 ORDER BY date, id`.
  - `set_dates(conn, user_id, ids: &[Uuid], dates: &[NaiveDate])`: `UPDATE transactions t SET date = m.date, updated_at = now() FROM UNNEST($2::uuid[], $3::date[]) AS m(id, date) WHERE t.user_id = $1 AND t.id = m.id` (UNNEST as in `insert_copies`).
- `service::update`:
  1. First `find`; when the entry is a member, `lock_series` and `find` again (as `delete` does). Every series write now takes the advisory lock before any row lock, so a move, a resize and a `following` delete of one series run one at a time and cannot deadlock. `resize` drops its own `lock_series`.
  2. `scope=following`, member, `next.date != current.date`: `check_day_move(current.date, next.date)?` before any write.
  3. After `repo::update` and `update_following` (unchanged): `members_from(series.id, first day of next.date's month)` → `moved_dates(dates, next.date.day())?` → `set_dates`. The edited row is in the list and keeps the date just written.
  4. `resize` growth: `series_end` → `series_day(last, before)` → `following_dates(day, last, n − total)`.

## API (`web/openapi.json` regenerated)

- `PATCH /api/transactions/{id}?scope=this|following`, body unchanged. `scope` doc: "`following` also writes the amount, kind, category and note onto the series' later members, and a new day of the month onto this and every later member, each clamped to its month; the month never spreads". `Scope::Following` doc: "This entry and the series' entries dated on or after it; a new day of the month moves them all."
- 422 `validation`, field `date`: `must stay in this entry's month when the series moves` (M4); `must not move a series with two entries in one month` (M5). Nothing written on any 422.
- Contract change: `scope=following` with a `date` in the same month now moves the later members' day (was: this row only); in another month it is 422 (was: this row moved alone). `scope=this` and `DELETE` untouched. 200 returns the edited row.

## Screens (ux; copy final)

- **Editar** a member (`features/add-transaction/transaction-sheet.tsx`), under `DateChips`, when `Aplicar em` is the second option and the date differs from the stored one:
  - Same month: helper `Os próximos também vão para o dia 10.`; on #1 `Toda a série vai para o dia 10.`. Day 29 to 31 appends ` Nos meses mais curtos, no último dia.`
  - Another month: `role="alert"` `Para mudar o mês, use Só este.`; `Salvar` sends nothing while it shows.
  - `Só este`: no helper, today's behavior.
- `Meses na série` stays disabled while the date differs (SOL-47), whatever the scope: move and resize are two saves.
- Toast when `following` moved the day: `Série movida para o dia 10` (replaces `Série atualizada`). Other toasts unchanged.
- 422 with field `date` on that save → toast `Outro lançamento da série está no mesmo mês. Mova-o com Só este antes.`; any other error → `Não foi possível salvar o lançamento.`
- The ledger and badges refresh as after any PATCH (`onSettled` refresh); positions do not change (M5).

## SOL-x notes

- SOL-21 R6 "Date never propagates" and D14's "a date change never propagates" hold for `scope=this` only (D20).
- SOL-47 / D19: L1's "first member's day" becomes M3. Tests that change: domain `l1_growth_takes_the_first_members_day_in_the_months_after_the_last_ones` (new signature), integration `l1_growth_reads_the_span_after_the_edited_members_own_date_change` (→ 2027-03-10, 2027-04-10) and `r6_this_keeps_the_series_and_following_rewrites_later_members_but_not_dates` (later members now on the 10th). The `até {mês}` helper still reads `series.last_date`.
- SOL-47's "SOL-48 must not break": a move from #1 moves the first member too; a mid-series move is followed by growth through M3; `(date, id)` order holds through M5.

## Acceptance

- Backend: M1–M6 in `transactions/domain.rs` (`series_day` vectors incl. 04-30 after 03-31, 11-30 after 10-30, 02-10 alone; `check_day_move`; `moved_dates` clamp 31 → 02-28/03-31/04-30, 2028-02-29, shared month 422; `following_dates` with a day) and service/handler tests: move from #5 (#5–#12 on the 10th, #1–#4 untouched, positions unchanged), `Toda a série` from #1 to the 31st (clamped), month change 422 and nothing written, shared month 422 after a `Só este` month change and nothing written, installment 10x moved (Σ unchanged, 100,01 still on #10), amount + day in one request, grow after a mid-series move lands on the new day, `scope=this` date change still moves one row to any month, 404 on another user's member, `GET /api/transactions` positions after each move.
- Web: Vitest for the member sheet: helper with the day (later member and #1), the ` Nos meses mais curtos` suffix for 29–31, month-change alert blocks `Salvar`, no helper with `Só este`, `Meses na série` disabled while moved, toast `Série movida para o dia N`, the shared-month toast on a 422 `date`.
- e2e (375 px): Lançar `12x` on the 5th → edit #3, `Este e os próximos`, day 10 → toast `Série movida para o dia 10`; month 3 and month 12 show the 10th, month 2 the 5th, badge `3/12` unchanged.
- Screens at 375 and 1440, light and dark; coverage ≥ 90% both sides; gate green.
