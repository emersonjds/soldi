# SOL-93 — Weekly and yearly series; `Toda a série` from any member (P1, P2)

Phase 2 of SOL-79. Go decided in `docs/specs/2026-11-11-stitch-fidelity.md` §12 ("§12 decisions"). The owner was unavailable; the panel (product, finance, ux, architect) decided. Decisions are final. New rules: D32 (P1), D33 (P2). Plan: `docs/specs/plans/SOL-93-96.md`, tasks 1–4.

Stitch: FIDELITY 9.8 (`Mensal` / `Semanal` / `Anual`, `lancar-modal-desktop`) and 10.7 (`Toda a série (12 lançamentos)` · `Modifica todas as parcelas retroativas já registradas e todas as parcelas futuras.` from a middle member, `editar-serie-modal-desktop`). Shipped screens: Lançar (`features/add-transaction/transaction-sheet.tsx`, spec §3.7) and Editar série (same file plus `entities/transaction/scope-radio.tsx`, spec §4); the delete flow in `widgets/ledger/ledger.tsx`.

## Panel outcome

### 1. Where the step lives (P1)

Votes:

- **product:** the user picks `Semanal` or `Anual` once, at Lançar; nobody changes the step of a running series. Resizes and moves must keep it.
- **finance:** a weekly diarista or a yearly IPVA/IPTU is the case. Money rules do not change: each member keeps its own amount; parcelas stay monthly (a card bill is monthly).
- **ux:** the frequency segment sits under the Repetir switch, as Stitch draws it, at every width. Editar série shows the unit in every word (`semanas`, `anos`).
- **architect:** a series has no table (D14). Inferring the step from member dates breaks after a deleted member (14-day gap) or a `Só este` move. Store the step on every member: `transactions.series_every`, null outside a series, a CHECK tying it to `series_id`. One column, no new table, no backfill beyond the series rows.

Winner: the architect's column. The step is chosen at creation (or when a standalone entry starts a series) and never changes.

Trade-offs:

- `repeat_months` keeps its name and now counts entries of any step (`2..60`). Renaming it breaks the committed contract and every web call for a word. Its doc comment says "entries".
- 60 weeks and 60 years share the bound; the 2100 cap still refuses a series that passes it.

Rejected: a `series` table (D14, a migration for a value the rows can carry); inferring the step (wrong after a gap); weekly or yearly parcelas (no case; card bills are monthly).

### 2. Semantics per step (D19 / D20 for each)

| | `month` (shipped) | `week` | `year` |
|---|---|---|---|
| Create (R1) | the original's day in each later month, clamped to the month's last day | the original + 7·k days | the original + 12·k months from the **original** (chrono `checked_add_months` clamps 29 Feb to 28 Feb and returns to 29 Feb in leap years) |
| Growth (D19) | `series_day(last, before)` on the months after the last | last member + 7·k days | the last member's month, on its day; when the last sits clamped on its month's last day, the largest day among the last four members in that month (catches 29 Feb across a leap cycle) |
| Move under `following` / `all` (D20) | the new date stays in the edited member's month; every reached member goes to the new day in its own month, clamped; a month holding two reached members refuses | the new date stays in the edited member's ISO week; every reached member goes to the new weekday in its own ISO week; a week holding two reached members refuses | same as `month` (the members sit in one calendar month of different years) |
| Reached members fetched from | `first_of(date)` | the Monday of `date`'s ISO week | `first_of(date)` |
| Bound | year ≤ 2100 | year ≤ 2100 | year ≤ 2100 |

`installments` stay monthly: `repeat_every` other than `month` with `installments` is refused.

Yearly growth reads the last four members, so a 29 Feb series returns to 29 Feb in a leap year even when a later member was moved to the 28th by `this` (accepted: the series' grid wins over one moved member).

### 3. `Toda a série` from any member (P2)

Votes:

- **product:** Stitch draws the third card from a middle member. A user who typed the wrong category on a 12× salary wants one save, not two.
- **finance:** rewriting past months changes balances the user already saw. Acceptable with a confirmation that names how many earlier entries change. Frozen rows stay frozen: a paid fatura (D30b) and a deleted cofrinho (SOL-102) refuse the whole call.
- **ux:** three radio cards from a middle member (`Só este lançamento`, `Este e os próximos` with `RECOMENDADO`, `Toda a série`); from member 1 the shipped two (its `Toda a série` is `following`). Choosing `Toda a série` and saving opens a confirmation dialog.
- **architect:** `Scope::All`. Every existing series query already takes a `from` date; `all` passes `NaiveDate::MIN`. No new repo function; one service helper names the reach.

Winner: `Scope::All` with a confirmation dialog from a middle member.

Trade-off: past months change on a confirmed save; reconciled-month protection is the dialog plus the frozen-row refusals, not a lock.

Rejected: keeping D20 (Stitch draws the option, owner chose fidelity); no confirmation (silent rewrite of closed months); a date floor at today (`Excluir · Toda a série` already reaches past members from member 1).

## Rules

- **R-P1-1.** `CreateTransaction.repeat_every` (`"month" | "week" | "year"`), absent = `month`. Refused (422, field `repeat_every`) without `repeat_months` (`"needs repeat_months"`), and with `installments` when not `month` (`"installments are monthly"`).
- **R-P1-2.** `UpdateTransaction.repeat_every`: allowed with `repeat_months` on an entry outside a series (it starts one with that step). On a series member, a value other than the series' step is refused (422, field `repeat_every`, `"a series keeps its step"`); the same value is a no-op.
- **R-P1-3.** Every member of a series carries `series_every`; `set_series`, `insert`, `insert_copies` write it with `series_id`. `TransactionSeries.every` reads it.
- **R-P1-4.** Growth, move and fetch follow the table in §2; monthly behavior is byte-for-byte the shipped one (all existing tests stay green unchanged).
- **R-P2-1.** `?scope=all` on PATCH and DELETE reaches every member of the entry's series. On an entry outside a series it behaves as `this`.
- **R-P2-2.** PATCH `all`: the edited row as `this`; then every other member takes kind, category and note, the card only when the patch changes the card or the kind (otherwise each member keeps its own), and the amount when it changed (`update_following` with `from = NaiveDate::MIN`). A date change moves every member per §2 (the edited date must stay in its month / ISO week). `repeat_months` resizes as today (D19; never below the edited member's position).
- **R-P2-3.** DELETE `all`: deletes every member.
- **R-P2-4.** Frozen rows refuse the whole call, nothing written:
  - any member in an archived cofrinho (SOL-102) → 422 `archived-cofrinho` (checked with `from = MIN`);
  - every reached member whose amount, date or card changes is checked against its **own** card: its old fatura must be open there, and its new date (the moved date on a move) must land in an open fatura of the card it ends on; on delete, every deleted member's fatura on its own card must be open (D30b) → 422 `fatura-paid`.
  - Category or note changes on a paid-fatura member stay allowed (D30b freezes amount, date and card only).
- **R-P2-5.** Bill payments (SOL-113) and resgates are never series members (R3, R8), so `all` cannot reach one. A test pins it: linking a member to a bill stays refused.
- **R-P2-6.** A move under `all` checks the earliest moved date against the opening date: before it → 422 `before-opening-date`, nothing moves. Members already before a later-moved opening date are still rewritten by a non-date change.
- **R-P2-7.** The series advisory lock is taken first, as today; `all` keeps the lock order.

## Contract

```jsonc
// POST /api/transactions
{ "date": "2026-11-12", "amount": "150.00", "kind": "bill", "category_id": "…",
  "repeat_months": 8, "repeat_every": "week" }

// Transaction.series
{ "id": "…", "position": 3, "total": 8, "last_date": "2026-12-31", "every": "week" }

// PATCH /api/transactions/{id}?scope=all   (scope: "this" | "following" | "all")
{ "category_id": "…" }
// DELETE /api/transactions/{id}?scope=all
```

422 messages (field `date`), new for weekly: `"must stay in this entry's week when the series moves"`, `"must not move a series with two entries in one week"`. Monthly and yearly keep the shipped month messages. A series or move passing 2100 answers `"must keep every entry up to 2100"` for every step.

`Cofrinho.next_contribution` gains `every` (`RepeatEvery`), the step of the series it comes from.

OpenAPI: `RepeatEvery` schema, `Scope` gains `all`, `TransactionSeries.every` required. Snapshot refreshed.

## Migration `0021_series_every.sql`

```sql
-- SOL-93 (D32): the step of a repeated run, on every member; null outside a series.
ALTER TABLE transactions ADD COLUMN series_every text
    CHECK (series_every IN ('month', 'week', 'year'));
UPDATE transactions SET series_every = 'month' WHERE series_id IS NOT NULL;
ALTER TABLE transactions ADD CONSTRAINT transactions_series_every_ck
    CHECK ((series_id IS NULL) = (series_every IS NULL));
```

Revert:

```sql
ALTER TABLE transactions DROP CONSTRAINT transactions_series_every_ck;
ALTER TABLE transactions DROP COLUMN series_every;
```

(After a revert, weekly and yearly series stay as rows but grow and move as monthly.)

## UI and copy (pt-BR)

**Lançar, Repetir on (§3.7, FIDELITY 9.8).** Under the `Repetir lançamento (Série)` switch, a three-chip segment `Mensal` · `Semanal` · `Anual` (`ToggleGroup`, `aria-label="Frequência"`, same chip class as the presets, 44 px), default `Mensal`, at every width. Hidden for `Parcelar compra`. Summary line:

- `Mensal`: shipped `{n}× de {valor} · repete todo dia {d} até {mmm aaaa}`.
- `Semanal`: `{n}× de {valor} · repete toda semana até {d} {mmm} {aaaa}` (`repete toda semana até 31 dez 2026`).
- `Anual`: `{n}× de {valor} · repete todo ano em {d} {mmm} até {aaaa}` (`repete todo ano em 10 nov até 2037`).
- Without an amount, the `{n}× de {valor} · ` prefix drops (shipped).
- Custom count: `aria-label` `Meses` / `Semanas` / `Anos`; error `Escolha de 2 a 60 meses.` / `semanas.` / `anos.`
- Toast on create: shipped `{n} lançamentos criados`.

**Editar série (§4, FIDELITY 10.x).** Unit per step: `mês/meses`, `semana/semanas`, `ano/anos`.

- Eyebrow `Parte de uma série de {total} meses|semanas|anos`.
- Duration chips `3 / 6 / 12 meses|semanas|anos`, `Customizado`; error `Escolha de {min} a 60 {unidade}.`
- Resize helper: `Série estendida: Adiciona {n} {unidade}. Termina em {fim}.`; `Série encurtada: Remove o último mês | a última semana | o último ano. Termina em {fim}.`; plural `os {n} últimos meses | as {n} últimas semanas | os {n} últimos anos`. `{fim}`: `Mês/aaaa` (month), `dd/mm/aaaa` (week), `aaaa` (year).
- Resize toast: `Série ajustada com sucesso para {n} meses futuros | semanas futuras | anos futuros.`
- Day helper (week): `Os próximos lançamentos também serão movidos automaticamente para {dia da semana}.`; from member 1 or `all`: `Toda a série vai para {dia da semana}.` (`segunda-feira`, `sábado`, from `Intl.DateTimeFormat("pt-BR", { weekday: "long" })`). Month and year keep the shipped `… para o dia {d}.` lines.
- Moving out of the week (week): `Para mudar a semana, use Só este.` (month and year keep `Para mudar o mês, use Só este.`).
- Move toast (week): `Série movida para {dia da semana}`; month and year keep `Série movida para o dia {d}`.
- Server message `must not move a series with two entries in one week` → `Outro lançamento da série está na mesma semana. Mova-o com Só este antes.`

**Scope cards (§4 table, FIDELITY 10.7).**

| Position | Options |
|---|---|
| 1 | shipped: `Só este lançamento`; `Toda a série ({total} lançamentos)` · `Todos os {total} lançamentos da série.` (sends `following`) |
| > 1 | `Só este lançamento`; `Este e os próximos` + `RECOMENDADO`; `Toda a série ({total} lançamentos)` with line edit `Modifica todas as parcelas retroativas já registradas e todas as parcelas futuras.`, delete `Exclui todas as parcelas já registradas e todas as futuras.` (sends `all`) |

**Confirmation (scope `all` from position > 1)**, `AlertDialog`:

- Edit: title `Alterar toda a série?`; body `{k} lançamentos anteriores a este também mudam, inclusive em meses já fechados.` (k = 1: `O lançamento anterior a este também muda, inclusive se o mês já fechou.`); actions `Cancelar` · `Alterar toda a série`.
- Delete: title `Excluir toda a série?`; body `Os {total} lançamentos serão excluídos, inclusive os {k} anteriores a este.` (k = 1: `inclusive o anterior a este.`); actions `Cancelar` · `Excluir toda a série` (destructive).
- k = position − 1.
- Toasts: edit `Série atualizada`; delete `Série excluída`. Errors: `fatura-paid` and `archived-cofrinho` show the server detail through `problemMessage` (shipped mapping).

## Acceptance

Backend:

- Weekly create of 8 from Thu 2026-11-12 lands 8 Thursdays to 2026-12-31; yearly create of 5 from 2024-02-29 lands 2025-02-28, 2026-02-28, 2027-02-28, 2028-02-29; monthly unchanged.
- `repeat_every` without `repeat_months`, or `week` with `installments`, is 422 on `repeat_every`.
- Weekly growth +2 continues 7 days after the last; yearly growth of a 29 Feb series whose last member is 2027-02-28 lands 2028-02-29.
- Weekly `following` move Thu → Mon inside the week moves every later member to its week's Monday; a move to the next week is 422; a week holding two members (one moved with `this`) is 422 and nothing moves.
- `PATCH …?scope=all` from member 3 of 6 rewrites members 1–6; `DELETE …?scope=all` from member 3 removes all six.
- `all` with a paid fatura on member 1: amount change and delete are 422 `fatura-paid` and change nothing; a note change succeeds.
- `all` with member 1 moved into an archived cofrinho: 422 `archived-cofrinho`, nothing changes.
- `all` move whose first member would land before the opening date: 422 `before-opening-date`, nothing moves.
- Another user's member: 404 for `all` PATCH and DELETE; the caller's other series untouched.
- Every shipped series test passes unchanged; the migration test sees `series_every` = `month` on pre-existing series rows.

Web (every state):

- Repetir off: no segment. On: segment shows, `Mensal` checked; summary per step; switching step updates the summary. `Parcelar compra` on: no segment.
- Custom count invalid: error with the step's unit.
- Editar série of each step: eyebrow, chips, helper, toast use the unit; weekly week-change shows the alert and blocks save.
- Position 1: two scope cards, no dialog. Position > 1: three cards; `Toda a série` + save opens the dialog with the right k; `Cancelar` saves nothing; confirm sends `scope=all`. Delete mode: three cards with delete lines; confirming sends `scope=all`.
- `fatura-paid` on confirm: error toast, sheet closed, nothing changed in the ledger.
- 375 and 1440 screenshots: the segment fits without horizontal scroll; dialog buttons 44 px.
