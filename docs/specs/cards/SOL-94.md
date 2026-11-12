# SOL-94 — Cofrinho note, yearly savings target, month notes (P4, P5, P6)

Phase 2 of SOL-79. Go decided in `docs/specs/2026-11-11-stitch-fidelity.md` §12. The panel (product, finance, ux, architect) decided; decisions are final. No reversal: D24 already superseded D23's "no yearly target". Plan: `docs/specs/plans/SOL-93-96.md`, tasks 5–9.

Stitch: FIDELITY 5.13 (`Meta para 2028 · Início planejado após consolidar a Reserva de Emergência.`, `cofrinhos-metas-desktop`), 6.7 and 7.3 (`Meta Anual`, `Faltam R$ 7.306,67`, `Alvo estratégico de 20% sobre as receitas líquidas estimadas (…)`, `Progresso atual (42.5%)`; mobile `Meta Anual (20%)`, `42,5% concluído`, `R$ 5.416,53 de R$ 12.723,20`), 6.14d and 7.8 (`1ª parcela do 13º salário` in `STATUS / OBSERVAÇÃO`; mobile chip `1ª Parc. 13º`). Shipped screens: Cofrinhos (`widgets/cofrinhos/`, spec §6), Economia do ano (`widgets/savings-year/savings-year.tsx`, spec §7).

## Panel outcome

### 1. Cofrinho note (P4)

- **product / ux:** one line under the goal amount on the card; edited in the cofrinho form.
- **finance:** no money.
- **architect:** `categories.note` (≤ 140). Read through `Cofrinho.note` only, not `Category`: `Category` is embedded in every transaction and selected by about ten queries; the note is shown only on Cofrinhos. Written through `CreateCategory.note` / `UpdateCategory.note`, under the same rule as `target` / `deadline` (cofrinho only, cleared when the category leaves Economia).

Winner: the architect's split. Trade-off: the edit form gets the note from the cofrinho item, not from the category list; a junior sees `target` on `Category` and `note` on `Cofrinho` (doc comment says why).

### 2. Yearly savings target (P5)

- **finance:** the base is entries so far, never an estimate (D16, R-avg): target = pct × `income_total` (months up to today, the summary's own number); `Faltam` = max(0, target − `saved_total`); progress = `saved_total` / target, one decimal, half-even, floor 0, no cap (a beaten goal reads above 100). Money rounds half-even at cents (D7).
- **product:** set where it is read: Economia do ano. Unset shows a `Definir meta anual` button, never an empty card (D25).
- **ux:** the desktop card follows 6.7, the mobile card 7.3. `Meta sugerida` and `Dica inteligente` stay cut (AI copy, D24).
- **architect:** `settings.savings_target_pct NUMERIC(5,2) NULL`; the reports service already reads the settings row, so `SavingsYear.target` costs no query. Pure `reports::domain::savings_target`. The old `savings_goal_pct` name stays dead (the migrations test asserts its absence).

Winner: as above. Trade-off: the target grows with each month's income, so `Faltam` can rise after a salary lands; the line says "até agora".

### 3. Month notes (P6)

- **product:** a free note per month, shown in Economia do ano's `STATUS / OBSERVAÇÃO` and as the mobile chip.
- **ux:** desktop: the row `…` menu gains `Adicionar observação` / `Editar observação`. Mobile: rows are links (`/mes?m=`), so a 44 px `⋮` sits beside the link (not inside it) with the same menu; the mobile frame draws no `⋮`: deviation accepted, the note must be writable at 375.
- **architect:** table `month_notes(user_id, month, note)`, PK `(user_id, month)`; `PUT /api/months/{month}/note` upserts, a blank note deletes. Read in the savings report with one range query (≤ 12 rows), never per month. Not on `GET /api/months/{m}`: no screen reads it there.

Winner: as above. Limit 140 characters, same as the cofrinho note.

Rejected: notes on Mês (not drawn); a note history; a `Category.note` on every category (P4 is cofrinhos only); notes in the CSV export (not asked; one column when it is).

## Rules

- **N1.** `note`: trimmed; blank → null; ≤ 140 characters (chars, not bytes); NUL refused. Field `note`, messages `"must have at most 140 characters"`.
- **N2 (P4).** `CreateCategory.note` / `UpdateCategory.note` (nullable; `null` clears) only on a cofrinho; elsewhere 422 `not-a-cofrinho` (the `check_goal` rule). A cofrinho moved out of Economia loses its note with its target and deadline. Economia itself (Reserva Livre) takes no note.
- **N3 (P5).** `UpdateSettings.savings_target_pct` (nullable decimal string): `> 0` and `≤ 100`, up to two places, never rounded; `null` clears. Field `savings_target_pct`, messages `"must be greater than 0 and at most 100"`.
- **N4 (P5).** `SavingsYear.target` is null without a pct; otherwise `{ pct, amount, remaining, progress_pct, done }`:
  - `amount` = round_half_even(pct × `income_total` / 100, 2);
  - `remaining` = max(0, `amount` − `saved_total`);
  - `progress_pct` = round_half_even(`saved_total` / `amount` × 100, 1), floored at 0; null when `amount` is 0;
  - `done` = `amount` > 0 and `saved_total` ≥ `amount`.
- **N5 (P6).** `PUT /api/months/{month}/note {note}`: `month` is `YYYY-MM`, years 2000–2100 (`parse_month`); any month is accepted. Upsert on `(user_id, month)`; blank deletes. 204.
- **N6 (P6).** `SavingsMonth.note` is the month's note or null, read with the user's `user_id` only.
- **N7.** Account deletion cascades every new row (FK `ON DELETE CASCADE`). Period deletion of entries leaves notes and the target.

## Contract

```jsonc
// Cofrinho (GET /api/cofrinhos items[])
{ "category_id": "…", "name": "Troca de Carro", "note": "Início planejado após consolidar a Reserva de Emergência.", … }

// POST /api/categories, PATCH /api/categories/{id}
{ "note": "Início planejado após consolidar a Reserva de Emergência." }   // or null

// Settings (GET/PATCH /api/settings)
{ …, "savings_target_pct": "20.00" }   // or null; PATCH { "savings_target_pct": "20" | null }

// SavingsYear (GET /api/reports/savings?year=2026)
{ …, "target": { "pct": "20.00", "amount": "12896.56", "remaining": "7480.03",
                 "progress_pct": "42.0", "done": false } }        // or "target": null
// SavingsMonth
{ "month": "2026-06", …, "note": "1ª parcela do 13º salário" }     // or null

// PUT /api/months/2026-06/note
{ "note": "1ª parcela do 13º salário" }   // "" or "   " deletes; 204
```

OpenAPI snapshot refreshed. `progress_pct` and `pct` are decimal strings (`example = "42.5"`).

## Migrations

`0022_cofrinho_note_savings_target.sql`:

```sql
-- SOL-94: a cofrinho's description (P4) and the yearly savings target (P5).
ALTER TABLE categories ADD COLUMN note text CHECK (char_length(note) BETWEEN 1 AND 140);
ALTER TABLE settings ADD COLUMN savings_target_pct numeric(5, 2)
    CHECK (savings_target_pct > 0 AND savings_target_pct <= 100);
```

Revert:

```sql
ALTER TABLE settings DROP COLUMN savings_target_pct;
ALTER TABLE categories DROP COLUMN note;
```

`0023_month_notes.sql`:

```sql
-- SOL-94 (P6): one free note per month and user.
CREATE TABLE month_notes (
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    month      date NOT NULL CHECK (extract(day FROM month) = 1),
    note       text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 140),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, month)
);
```

Revert:

```sql
DROP TABLE month_notes;
```

## UI and copy (pt-BR)

**Cofrinho card (§6.3, FIDELITY 5.13).** Under the `Faltam …` line, before the info chip: `{note}`, prefixed `Meta para {aaaa} · ` when the cofrinho has a deadline (`Meta para 2028 · Início planejado…`), muted `text-sm`, two lines max (`line-clamp-2`), full text in the accessible name. Absent without a note. Reserva Livre never shows one.

**Cofrinho form (`entities/category/category-sheet.tsx`, cofrinho branch, after Prazo).** `Textarea` label `Descrição (opcional)`, placeholder `Ex.: Início planejado após consolidar a Reserva de Emergência.`, counter `{n}/140`, 16 px text; over 140 the counter turns destructive and save is blocked with `Use até 140 caracteres.` Clearing sends `null`.

**Economia do ano, target (§7.2, FIDELITY 6.7, 7.3).**

- Unset, section shown: a ghost button `Definir meta anual` (flag icon, 44 px) after the summary tiles. It opens the dialog.
- Dialog `Meta anual de economia`: field `Percentual das entradas` (`inputMode="decimal"`, suffix `%`, 16 px), helper `Quanto das entradas do ano você quer guardar.`, error `Use um valor acima de 0 e até 100.`; buttons `Cancelar` · `Salvar meta`; when set, also `Remover meta` (sends `null`). Toasts `Meta salva` / `Meta removida`.
- Set, ≥ 1024 (card after the muted box): flag tile, `Meta Anual`, pencil `Editar meta` (`aria-label`); big `Faltam {remaining}`, or `Meta batida` with a check when `done`; `Alvo estratégico de {pct}% sobre as entradas do ano até agora ({amount}).`; `Progresso atual ({progress_pct}%)`, a bar capped at 100%, `{saved_total} / {amount}`.
- Set, < 1024 (after `Total Guardado no Ano`, before `Consistência`): `Meta Anual ({pct}%)`, pill `{progress_pct}% concluído`, `{saved_total} de {amount}`, `Faltam {remaining}` (or `Meta batida`), pencil.
- `amount` 0 (no entrada yet): the card shows `Meta Anual ({pct}%)` and `A meta conta a partir da primeira entrada do ano.`, no bar.
- Percent format `formatPct` (pt-BR comma: `42,5%`). Money through `Money`.
- The section's own content rule is unchanged: a fresh account shows no section, so no button either.

**Economia do ano, notes (§7.3, FIDELITY 6.14d, 7.8).**

- Desktop `STATUS / OBSERVAÇÃO`: past months show the note; today's month and `Previsto` months show the shipped status, then the note under it (muted). Empty without either.
- Mobile row: the note as a muted rounded chip after the month name, truncated (`max-w-[50%] truncate`), full note in the row's `aria-label` (`…, observação: {note}`).
- Menu (desktop `…`, mobile `⋮` beside the row link): `Abrir no Mês`, then `Adicionar observação` or `Editar observação`.
- Dialog `Observação de {Mês} de {aaaa}`: `Textarea` (16 px), counter `{n}/140`, `Cancelar` · `Salvar`; when a note exists, `Remover observação` (sends `""`). Toasts `Observação salva` / `Observação removida`; error `Não foi possível salvar a observação.`

## Acceptance

Backend:

- Cofrinho note: create and patch on a cofrinho store it; the list returns it trimmed; 141 characters is 422 `note`; on a plain category 422 `not-a-cofrinho`; moving the cofrinho out of Economia clears it; another user's cofrinho is 404.
- Target: PATCH `"20"` stores `20.00`; `"0"`, `"100.01"`, `"12.345"` are 422; `null` clears. Savings year with income 64.482,80 and saved 5.416,53 at 20% returns amount `12896.56`, remaining `7480.03`, progress `42.0`, done false; saved above the amount gives done true and progress over 100; income 0 gives amount `0.00`, progress null; a negative `saved_total` gives progress `0.0`; null pct gives `target: null`.
- Month notes: PUT stores, PUT again replaces, blank deletes; `2026-13` and `1999-12` are 422; 141 characters is 422; the savings year returns the note on its month only; user B's note never shows for A, and B's PUT never touches A's row.
- Account deletion test covers `month_notes`; the migrations test still sees no `savings_goal_pct`.

Web (every state):

- Cofrinho card with note and deadline, note without deadline, no note; Reserva Livre without the line. Form counter, 140 limit, clear.
- Economia: section absent on a fresh account; unset → `Definir meta anual`; set → desktop card and mobile card per copy; `Meta batida`; `amount` 0 line; dialog validation, save, remove, error toast.
- Notes: past month shows its note; current month shows status plus note; mobile chip truncates at 375 with no horizontal scroll; add, edit, remove from both menus; mobile `⋮` is 44 px and outside the link.
