# SOL-47 — Change the number of months of an existing series

Panel: `product`, `ux`, `finance` voted; `architect` arbitrated (2026-11-10). Follow-up of SOL-21 (D14). Depends on SOL-52 (`installments`, D16). No migration.

## Why

A repeat is launched with a guess: the gym is cancelled after 6 of 12 months, Netflix outlives its 12x, a parcelamento is paid off early. Today the only tool is `Excluir · Este e os próximos`, and nothing grows a run. The user picks the new count on any member and Soldi adds or drops months at the end.

## Rules (finance → unit tests in `transactions/domain.rs` and the service tests)

N is the new total, the first member included (R2). `position`/`total` are the read-time count by `(date, id)` (SOL-21 Model).

| # | Rule | Worked example | Edge |
|---|------|-----------------|------|
| L1 | Growing (N > total) inserts N − total members in the months **right after the last member's month** (`max(date)`), each on the **first member's day** (`min(date)`), clamped like `bills::domain::due_date`: `following_dates(first, last, N − total)`. Counting by month, not by position, keeps a gap from doubling a month. | "Internet" 12 × R$ 99,90 from 2026-11-05 (last 2027-10-05), N=15 → 2027-11-05, 2027-12-05, 2028-01-05. | First 2027-01-31, last 2027-04-30, N=6 → **2027-05-31**, 2027-06-30: day 31 comes from the first member, never from April's 30. #5 deleted alone, N back to 12 → one new member on 2027-11-05, 2027-10 keeps its one. #1 moved alone to 2026-10-05, N=13 → 2027-11-05, no month twice. |
| L2 | New members copy the **edited member as saved** in this same request: `amount`, `kind`, `category_id`, `note`. | Edit #3 of "Internet", `Este e os próximos`, R$ 109,90, N=14 → #3–#12 become 109,90 (R6) and #13, #14 are 109,90. | `Só este` R$ 120,00 on #3 with N=14 → #13, #14 are 120,00; the helper `+2× R$ 120,00` shows it before saving. |
| L3 | Shrinking (N < total) deletes the members ranked N+1..total by `(date, id)`. Floor: **N ≥ the edited member's position** (read after its own date edit), so no member before it is ever deleted (D14). | 12-run, edit #3, N=6 → #7–#12 deleted; #3 reads `3/6`. | From #5: N=4 → 422 `repeat_months`; N=5 → #6–#12 deleted, #5 reads `5/5`. From #1, the floor is 2 (`check_repeat`): dropping to one entry is `Excluir · Este e os próximos` from #2. |
| L4 | N stays 2..60 (`check_repeat`). N = total writes nothing. | 12-run, N=61 → 422 `repeat_months`, nothing written. | Any new date past 2100 → 422 `date` `must leave room for every month`. One guard in `following_dates` serves POST `repeat_months`/`installments`, a PATCH that starts a series and a resize (closes SOL-60). |
| L5 | **No re-split.** Kept members keep their stored amounts; an installment series is resized like any repeat. The total changes only by the rows the helper names before saving. | R$ 1.000,01 em 10x (9 × 100,00 + 100,01), edit #2, N=12 → #11, #12 at 100,00; Σ 1.200,01; helper `+2× R$ 100,00`. Same series, N=8 from #2 → #9 (100,00) and #10 (100,01) deleted; Σ 800,00; helper `Remove os 2 últimos`. | Edit from #10 (100,01), N=11 → #11 at 100,01: the helper shows it. A different split is a new parcelamento: delete and launch again. |
| L6 | The length change is independent of `scope`: scope governs which members take the field edits (R6); N always acts on the tail, bounded by L3. One DB transaction for field edits + resize. | `Só este` amount on #3 and N=6 → #3 alone changes, #7–#12 deleted. | Bill payments and resgates are never members (R3/R4), so no extra check. |

## Arbitration (winner · trade-off)

| Question | product | ux | finance | Winner · trade-off |
|---|---|---|---|---|
| 1. Entry point | Same `Salvar` of the member's edit sheet | Chips `2x 3x 6x 12x Outro` in the slot `Repetir` holds today, preselected on the current total | Own action "Alterar duração" | **ux + product**: chips in the edit sheet, saved with the regular `Salvar` in one PATCH. A separate action means a second sheet for one number. Trade-off: one save can now edit fields and length; the helper names both effects. |
| 2. Growing: date and source | Copy the last member | Copy the edited member | First member's day | **First member's grid (finance) + edited member as saved (ux)**: the web knows the edited amount, so the helper shows the exact money added; the last member's amount would need another GET. Trade-off: a `Só este` one-off on the edited row propagates to new months (shown in the helper). |
| 3. Shrinking floor | Edited member's position | Edited member's position, chips below it disabled | Never delete a member dated ≤ today | **Position** (D14: never before the edited row). Today's floor adds a clock to the rule with no gain: `Excluir · Toda a série` from #1 already deletes past members. Trade-off: shrinking from an old member can drop past months; the helper names the end month. |
| 4. Installment series | Re-split the remaining total | Same as repeat, show the delta | Refuse | **Same as repeat, no re-split (L5)**. The server stores no flag; a flag needs a migration, and the heuristic "amounts differ" misses an even 10 × 100,00 and catches a repeat with a `following` price change. Re-split from the edited member would halve a Netflix run. The total never changes silently: the helper shows `+k× amount` or `Remove os k últimos`. Trade-off: "parcelar em 12 em vez de 10" is delete + launch again. |
| 5. Contract | Reuse `repeat_months` | — | Dedicated `PATCH …/series {total}` | **Reuse `UpdateTransaction.repeat_months`**: it already means "this series counts N entries"; on a standalone entry it starts one (SOL-21), on a member it resizes. One request, one DB transaction, no new field, no new endpoint. Trade-off: `already-repeated` no longer answers a member (contract change, noted below). |
| 6. Feedback | Toast with the new count | Toast + badge from read time | — | Toast `Série ajustada para 6 meses`; badge `3/6` comes from the LATERAL count after the usual refresh. |

## Model

- No migration; index `transactions_series_idx (user_id, series_id, date)` serves both new statements.
- `transactions/domain.rs`: `check_series_length(months: i16, position: i64) -> Result<i16, AppError>` (L3 floor; field `repeat_months`, `must keep this entry and the ones before it`). `following_dates(first, last, count) -> Result<Vec<NaiveDate>, AppError>` (L1 dates, L4 2100 guard); `repeat_dates(date, n)` is `following_dates(date, date, n − 1)`. `check_repeatable` loses its `series` branch (members now resize); `already_repeated()` stays for the `set_series` race.
- `repo.rs`, every statement filters `user_id`:
  - `series_span(conn, user_id, series_id) -> Option<(NaiveDate, NaiveDate)>`: `SELECT min(date), max(date) FROM transactions WHERE user_id = $1 AND series_id = $2`, one statement.
  - `lock_series(conn, series_id)`: `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`, held until the transaction ends. Taken at the start of the resize and by `DELETE ?scope=following` (now one DB transaction), so two resizes, or a resize and a `following` delete, of one series never double or gap a month.
  - The LATERAL join that counts `position`/`total` also reads `max(m.date) AS last_date`.
  - `delete_beyond(conn, user_id, series_id, keep: i64)`: `DELETE FROM transactions WHERE user_id = $1 AND id IN (SELECT id FROM transactions WHERE user_id = $1 AND series_id = $2 ORDER BY date, id OFFSET $3)` (same order as the LATERAL `position`).
  - Growth reuses `insert_copies(conn, user_id, &next, series_id, &dates, &vec![next.amount; dates.len()])`.
- `service::update`, member with `repeat_months: Some(n)`: after `repo::update` and `update_following` (unchanged), `lock_series` → `repo::find` the edited row → `check_series_length(n, position)` → `n > total`: `series_span` + `following_dates(first, last, n − total)?` + `insert_copies`; `n < total`: `delete_beyond(series.id, n)`. Final `find`, commit. Standalone with `repeat_months`: unchanged (SOL-21).

## API (`web/openapi.json` regenerated)

- `PATCH /api/transactions/{id}?scope=this|following`, body `UpdateTransaction { …, repeat_months: Option<i16> }`. Doc comment becomes: `How many entries the series counts, 2 to 60: starts a series from an entry outside one, or adds or removes members at the end of this entry's series (never one dated before it).` 200 returns the edited row with the new `series.total`.
- 422 `validation`, field `repeat_months`: outside 2..60 (`must be 2 to 60`), below the edited member's position (`must keep this entry and the ones before it`). 422 `validation`, field `date`: grid past the date bound. Nothing written on any 422 (one DB transaction).
- Contract change: `repeat_months` on a member no longer returns 422 `already-repeated`. Still 422 `repeat-not-allowed-on-bill-payment` / `-on-cofrinho-withdrawal` on standalone entries; 404 on another user's id.
- `TransactionSeries` gains `last_date: NaiveDate`, the series' `max(date)`, read in the existing LATERAL join.
- `POST` with `repeat_months`/`installments` whose dates pass 2100: 422 `date` `must leave room for every month`, nothing written. `DELETE` contract untouched.

## Screens (ux; copy final)

- **Editar** a member (`features/add-transaction/transaction-sheet.tsx`), below `DateChips`, where `Repetir` sits for a standalone entry: label `Meses na série`, chips `2x 3x 6x 12x Outro` (same `ToggleGroup`, 44 px), preselected on `series.total` (`Outro` with the number typed when it is not a preset). Chips below `series.position` are disabled. `Outro` input 16 px, error `Escolha de {max(2, position)} a 60 meses.`
- Helper under the chips:
  - N > total: `+3× R$ 99,90 · até jan 2028` (added count × the amount in the form; the month is `series.last_date` + k months).
  - N < total: `Remove os 6 últimos` (`Remove o último` when 1), no month: with gaps in the series it would be wrong.
  - N = total: no helper; nothing sent. A member alone in its series (`total` 1) saves its fields with no count.
  - While the date in the form differs from the stored one, the chips and `Outro` are disabled, no helper shows and nothing is sent: a moved date can change the member's position.
- Header `Parte de uma série de 12` and `Aplicar em` (`ScopeRadio`) unchanged; the radio does not limit the chips (L6).
- `repeat_months` is sent only when N ≠ total and the date is unchanged. Toast when it is sent: `Série ajustada para 6 meses` (replaces `Série atualizada` / `Lançamento atualizado`). 422 → the field error under `Outro`; network error → `Não foi possível salvar o lançamento.`
- Ledger badge `Saída · 3/6` (`aria-label` `3 de 6`) needs no change: same refresh as today's PATCH.

## SOL-48 must not break

L1 takes the day from the first member and the month from the last. Moving the day of a whole series must move the first member too, so new members keep the series' day; L3's `(date, id)` order must stay the order `position` reads.

## Acceptance

- Backend: L1–L6 in `transactions/domain.rs` (`check_series_length` vectors, `following_dates` for 31→May 31 and after a gap, the 2100 guard) and service/handler tests: grow 12→15 (three rows on the first member's grid, edited values), shrink 12→6 from #3 (`3/6`, #1–#2 untouched), floor 422 from #5 with N=4 and nothing written, N=61 422, N = total writes nothing, installment 1.000,01 10x → 12 from #2 (Σ 1.200,01, kept members unchanged), `Só este` + resize in one request, forced failure after the update leaves the series as it was, 404 on another user's member, `GET /api/transactions` totals after each change.
- Web: Vitest for the member sheet (chips preselected on total, `Outro` preselected for 7, disabled chips below position, `Outro` error with the dynamic minimum, both helpers and singular, nothing sent when N = total, `repeat_months` sent otherwise, toast), standalone sheet unchanged (`Repetir` switch).
- e2e (375 px): Lançar `12x` → edit #1, `6x` → toast `Série ajustada para 6 meses`, sixth month shows `Saída · 6/6`, seventh month empty; edit #6, `12x` → twelfth month shows `Saída · 12/12`.
- Screens at 375 and 1440, light and dark; coverage ≥ 90% both sides; gate green.
