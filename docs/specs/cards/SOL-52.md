# SOL-52 — Posso comprar isso? (Simular + Parcelar)

Epic SOL-40, sprint 3, card 3 of 3, built on SOL-51's `GET /api/forecast` and `monthsAhead`. Rules: D7, D14, D16, `02-finance.md` rule 3; screens: `03-ux.md` §4, §6, §7 card 4. Plan: `docs/plans/2026-11-10-forecast-sprint-3.md` tasks 10–15.

## Panel (architect challenge)

| Question | Options | Winner | Why |
|---|---|---|---|
| How does the API write parcelas? | (a) client sends `repeat_months` with `total/n` (copies one amount, remainder lost); (b) client posts N entries (not atomic, no shared series); (c) `CreateTransaction.installments` | **(c)** | Rule 3 wants the last parcela to carry the cents; `repeat_months` copies one amount by definition (D14). (c) reuses the series insert in one database transaction; position/total still counted at read time. |
| `amount` with `installments` | per parcela, total | **total** | The user types the price of the thing; the server splits (Decimal, half-even), the web shows the same split from the same vectors. |
| Combine with `repeat_months` | allow, refuse | **refuse** (422 `installments`) | A repeated parcelamento is two features in one field. |
| Kinds | any, `bill`/`daily` only | **any on the server; the web offers `Parcelar` on Saída and Diário only** | No rule needs to refuse income; the UI keeps the offer where a purchase lives. |
| Where the preview runs | server dry-run endpoint, client | **client**: `withDraft(forecast.days, rows, bounds)` in cents | ux §4: no round-trip per keystroke; nothing is written. Same split vectors tested on both sides. |
| Verdict line | reuse `forecastAlert` | **`draftVerdict(before, after)`** | `forecastAlert` answers "first red day"; the sheet must answer "which day *this purchase* turns red". Reusing it would claim a purchase caused a red day that was already there. `forecastAlert`/`causeOf` stay as they are. |

## Contract (`crates/soldi-types/src/transactions.rs`)

`CreateTransaction` gains, after `repeat_months`:

```rust
/// 2 to 60 monthly parcelas splitting `amount`, the total: each `amount / n` half-even to cents,
/// the last takes the remainder (D16); dated like `repeat_months`; not with `repeat_months`.
#[serde(default)]
#[schema(minimum = 2, maximum = 60)]
pub installments: Option<i16>,
```

`POST /api/transactions` 201 body: the first parcela (`amount` = parcela 1, `series` `{position: 1, total: n}`). New 422 cases, all `field: "installments"`: not 2..60 (`must be 2 to 60`), with `repeat_months` (`cannot be combined with repeat_months`), a parcela at or below zero (`must leave every installment above zero`). `UpdateTransaction` unchanged (no parcelar on edit).

Split (`transactions::domain::installment_amounts`, `shared/lib/installments.ts`): `each = round_half_even(total / n, 2)`; parcelas 1..n−1 = `each`; parcela n = `total − each × (n − 1)`.

| total, n | parcelas | |
|---|---|---|
| 1000.01, 10 | 9 × 100.00 + 100.01 | rule 3 example |
| 100.00, 3 | 2 × 33.33 + 33.34 | |
| 1000.00, 12 | 11 × 83.33 + 83.37 | |
| 0.05, 2 | 0.02 + 0.03 | 0.025 → 0.02 (half-even) |
| 0.06, 4 | 0.02 × 3 + 0.00 | refused |
| 0.01, 2 | 0.00 + 0.01 | refused |
| 10.00, 60 | 59 × 0.17 + -0.03 | refused: half-even rounds each up, the remainder goes negative (only when a parcela is under ~R$ 0,30; rule 3 as finance wrote it) |

Dates: `repeat_dates` (D14): the start day in each following month, clamped to its last day.

## UI (`features/add-transaction/transaction-sheet.tsx`, creating only)

- First row of the form, above the kind control: switch `Simular` (same row style as `Repetir`), helper `Veja o efeito antes de lançar.` Off by default; editing never shows it.
- `Parcelar` switch below `Repetir` (Saída and Diário only); turning one on turns the other off. Shares the presets (`2x 3x 6x 12x Outro`, default 12); toggle `aria-label="Quantas parcelas"`, custom input `aria-label="Parcelas"`, placeholder `De 2 a 60`, error `Escolha de 2 a 60 parcelas.`
- Parcelar summary under the presets (amount valid): `10× R$ 100,00 · até ago 2027`; with a remainder `9× R$ 100,00 + R$ 100,01 na última · até ago 2027`; a parcela at zero → on submit `Valor pequeno demais para 4 parcelas.` (`role="alert"`).
- Simular on: below Observação, region `Simulação` (`features/add-transaction/simulation.tsx`):
  - `ol aria-label="Próximos 7 dias"`: 7 forecast days from `max(first draft date, forecast's first day)`, each `DD/MM` + `TierPill size="sm"` (tier label) of the draft-applied balance;
  - verdict `p role="status"`: `Com essa compra, hoje vira Crítico` / `Com essa compra, dia 23 vira Crítico` (same month as today) / `Com essa compra, dia 23/12 vira Crítico` (another month) / `Essa compra não cria dia vermelho novo.` (red days already there, none added) / `Nenhum dia vermelho com essa compra.`;
  - draft over more than one month (Repetir or Parcelar): `h3` `Meses com essa compra` + `MonthChips` of the 12 months, static (no tap);
  - no valid amount yet: `Digite um valor para simular.`; loading: 7 `Skeleton` pills; error: `Não foi possível carregar.` + `Tentar de novo`.
  - Buttons, stacked full width: `Lançar de verdade` (`BrandButton`, submit — exactly today's Salvar) and `Descartar` (ghost, closes the sheet, nothing written, no confirm).
- Simular off: `Salvar`, as today.
- Toast after a parcelamento: `10 parcelas lançadas` (repeat keeps `N lançamentos criados`, single keeps `Lançado`).
- The optimistic row of a parcelamento shows parcela 1, never the total.

Draft rows (`draftRows`, feature): `[draft.date, ...repeatDates(draft.date, n)]`, cents `installmentCents(total, n)` for Parcelar, the same amount for Repetir, one row otherwise; sign − for Saída/Diário, + for Entrada. `withDraft` adds to each forecast day every row dated on or before it (a past date shifts every day), then `tierOf` with the user's thresholds.

## States

| State | Sheet |
|---|---|
| Simular off | unchanged (Salvar) |
| Simular on, no amount | `Digite um valor para simular.`; buttons shown, submit validates as today |
| Forecast loading / error | skeleton / `Não foi possível carregar.` + `Tentar de novo`; `Lançar de verdade` still works |
| Draft turns a day red | 7 pills recolored + `Com essa compra, dia 23 vira Crítico` |
| Already red ahead, draft adds none | `Essa compra não cria dia vermelho novo.` |
| All clear | `Nenhum dia vermelho com essa compra.` |
| Parcelar / Repetir on | + `Meses com essa compra` chips |
| Date after the horizon | 7-day list empty → hidden; verdict `Nenhum dia vermelho com essa compra.` |
| Lançar de verdade | posts once, closes, toast; Descartar posts nothing |

## Acceptance (forecast fixture `FORECAST`, today 10/11/2026, R$ 6.150,00 until 22/11)

- Server: `{"amount":"1000.01","installments":10,"date":"2027-01-31"}` → 201 `amount` 100.00, series (1, 10); 2027-02 holds 100.00 on 2027-02-28; 2027-10 holds 100.01 on 2027-10-31; the ten amounts sum to 1000.01; 2027-11 empty.
- Server: `installments` 1, 61, with `repeat_months: 3`, `amount 0.06` em 4x → 422 `installments`, nothing written.
- Simular, Saída R$ 6.700,00 hoje → `Com essa compra, hoje vira Crítico`; 7 pills from 10/11, the first `Crítico`.
- Simular, Diário R$ 100,00 on 24/11 → `Essa compra não cria dia vermelho novo.`
- Simular on a flat forecast (R$ 1.842,10), Saída R$ 50,00 → `Nenhum dia vermelho com essa compra.`
- Parcelar R$ 1.000,01 em 10x from 10/11 → `9× R$ 100,00 + R$ 100,01 na última · até ago 2027`; `Meses com essa compra` shows 12 chips.
- Toggling Simular on and off, typing, changing date or parcelas → zero `POST /api/transactions`, exactly one `GET /api/forecast`.
- `Descartar` → sheet closed, zero POST. `Lançar de verdade` → one POST with `installments: 10`, `amount: "1000.01"`, no `repeat_months`; toast `10 parcelas lançadas`.
- Parcelar is not offered on Entrada nor when editing.
- e2e (375 px): new user R$ 1.000,00 → Lançar, `Simular`, Saída R$ 1.600,00 → `Com essa compra, hoje vira Crítico`; `Descartar` → ledger still `Nenhum lançamento ainda`; Lançar, Saída R$ 300,00 `Parcelar` 3x → `3× R$ 100,00 · até <mês>`, `Salvar` → toast `3 parcelas lançadas`; next month lists R$ 100,00.

## Out of scope

Server dry-run endpoint, card/invoice entity, parcelar on edit, interest, saving a simulation, a "compare scenarios" mode.
