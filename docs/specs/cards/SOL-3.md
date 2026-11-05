# SOL-3 — Transações, categorias e tela Mês com termômetro

Panel of 2026-11-05 (product, ux, finance, architect; recorded by the orchestrating session). Spec sections 4–7; design `docs/design/tokens.md` and `docs/design/stitch/mes-*.png`.

## Why

The sheet's `Saldo` column is the product. Once a user logs entries with a category, the month screen must show the same running balance, colored the same way, with no formula to maintain. Outcome: a spend logged in three taps appears in the day list with the new balance and tier within one second.

## Rules (finance; `months/domain.rs` turns each row into a unit test)

Inputs: opening balance `B0` at `opening_date`, transactions since `opening_date`, thresholds `red=-500, zero=0, yellow=1000, green=2000` (defaults), today.

| # | Case | Expected |
|---|------|----------|
| 1 | B0 = 1000 on 2026-11-01; 11-02 income 500; 11-03 bill 300, daily 50 | balances 11-01 1000, 11-02 1500, 11-03 1150; totals income 500, bills 300, daily 50, outflow 350, performance 150 |
| 2 | Same day income 715 and bill 715 (the sheet's "Entrada 715 / Saída 715") | day net 0, balance unchanged, both totals grow by 715 |
| 3 | Balance exactly on a boundary: 0, 1000, 2000, -500 | tier Yellow, LightGreen, Green, LightRed (lower bound inclusive, as the sheet's "between") |
| 4 | Balance -500.01 | Red |
| 5 | Month boundary: November ends at 320; December 1 has daily 20 | December day 1 balance 300 (carry, never reset) |
| 6 | Year boundary: 2026-12-31 balance -80; 2027-01-01 income 5000 | 2027-01-01 balance 4920 |
| 7 | Requested month before `opening_date` | 422 `month-before-opening` |
| 8 | Requested month in the future, no transactions | every day balance = last known balance, `is_future` true, totals 0 |
| 9 | Opening balance negative (-1200), no transactions | all days -1200, Red |
| 10 | Amount with more than two decimals in the request (`"10.005"`) | 422 on `amount`; the API never rounds input |
| 11 | Amount `0` or negative | 422 on `amount` |
| 12 | Category of another user or archived | 404 for the transaction create/patch |
| 13 | Transaction `kind` must equal the category's kind | 422 on `category_id` |
| 14 | `balance_today`: month is current → balance at today; past month → last day; future month → last known balance |
| 15 | Zero-income month | performance = -outflow; savings pct null |

Sums use `Decimal`; the service fetches `SELECT date, kind, SUM(amount)` grouped for the whole range from `opening_date` to month end, then folds in `domain.rs`. No per-day queries.

## API (architect)

- `GET /api/transactions?month=YYYY-MM` → list ordered by date desc, id desc, each with its category (id, name, icon, color, kind).
- `POST /api/transactions` `{ date, amount, kind, category_id, note? }` → 201 with the transaction.
- `PATCH /api/transactions/{id}` same fields optional; `DELETE /api/transactions/{id}` → 204. Cross-user → 404.
- `GET /api/months/{YYYY-MM}` → `MonthView { month, days[], balance_today, balance_today_tier, totals, projected_balance, projected_tier, bills_of_month: [] (SOL-4 fills), savings: null (SOL-5) }`. Day: `{ date, income, bills, daily, balance, tier, is_today, is_future }`. Tier enum `red | light_red | yellow | light_green | green`.
- Categories already exist (SOL-2).

## Screen `Mês` (ux; copy is final)

- Header (indigo hero): month switcher `‹ Novembro 2026 ›` (keyboard arrows work), eyebrow `SALDO HOJE`, hero amount, tier pill with label: Crítico / Atenção / Apertado / Confortável / Folga.
- Summary card overlapping the header: `Entradas` (green, arrow up), `Saídas` (= bills + daily, arrow down), `Projetado` (= `projected_balance`, pill with projected tier). In SOL-3 projected equals month-end balance of the ledger; SOL-4 subtracts unpaid bills.
- Card `Termômetro do Mês`: five-segment strip, current tier highlighted, one sentence: `Você comprometeu {outflow/income}% da renda. Mantendo o ritmo, seu mês termina no {verde|vermelho}.` (income 0 → `Nenhuma entrada ainda este mês.`).
- Section `Lançamentos` grouped by day, newest first, sticky day header `Hoje, 5 nov` / `Ontem, 4 nov` / `3 nov` with the day balance pill colored by tier; row: category icon circle, title = note or category name, caption = kind label (`Entrada` / `Conta` / `Diário`), amount right (income green with `+`). Future days are not listed. Days without entries are not listed (the sheet shows them; the panel voted to hide them on screen and keep them in the API).
- Empty state: icon + `Nenhum lançamento ainda` + violet button `Lançar agora`.
- Loading: skeleton of header, summary and three rows. Error: inline card `Não foi possível carregar o mês.` with `Tentar de novo`.
- Row tap → bottom sheet with Editar / Excluir. Excluir removes at once with toast `Lançamento excluído` + `Desfazer` for 5 s (undo re-creates the entry; no confirm dialog).

## `Lançar` sheet (ux)

Bottom sheet on mobile, dialog at ≥ 1024px. Segmented `Entrada / Conta / Diário` (default Diário), hero amount input `R$ 0,00` (inputmode decimal, pt-BR mask, 16px+), category chips filtered by kind (first chip preselected: Mercado for Diário, Aluguel for Conta, Salário for Entrada), date chips `Hoje / Ontem / 📅` (date input), `Observação` optional, full-width `Salvar`. Validation inline: `Informe um valor` / `Escolha uma categoria`. Success: sheet closes, toast `Lançado`, month query invalidated, optimistic row inserted. The FAB and the sidebar `Lançar` open the same sheet from any screen.

## Acceptance

- Rules 1–15 pass as unit tests; handlers tested via `oneshot`; repo via `sqlx::test`.
- Mês renders the hero, summary, thermometer, grouped list, empty/loading/error states at 375 and 1440, light and dark; no horizontal scroll; 44px targets.
- Three taps from any screen to a saved Diário entry (FAB → amount → Salvar) with defaults.
- Coverage ≥ 90% both sides; typecheck and lint clean; `pnpm build` produces `out/mes.html`.
