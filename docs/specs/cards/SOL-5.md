# SOL-5 — Para onde vai e Economia

Panel of 2026-11-05 (product, ux, finance, architect). Depends on SOL-3. Design `docs/design/stitch/para-onde-vai-*.png`, `economia-*.png`; features 1 and 2 of `docs/specs/market-analysis.md`.

## Why

The sheet never answered "where did it go". A donut by category with the delta against last month is the single most requested view in every reference app, and the `Economia` tab is the only sheet feature not yet in Soldi.

## Rules (finance)

| # | Case | Expected |
|---|------|----------|
| 1 | November: Mercado 900, Comida fora 300, Aluguel 2259.56; October: Mercado 760 | categories report: Mercado 900 (37.5% of outflow 2 ... see below), delta vs previous `+18.4%`; Comida fora delta null (no previous); total outflow 3459.56 |
| 2 | Percentages are of the month's outflow (bills + daily), not of income; income categories are listed in their own group with percentages of income | — |
| 3 | Delta = (current − previous) / previous, 1 decimal, null when previous is 0 | — |
| 4 | Savings `PUT /savings/{year}/{month}` amount ≥ 0, two decimals | 422 otherwise |
| 5 | Savings pct = amount / income of that month, null when income is 0 | matches the sheet's `Economia` column `%` |
| 6 | Year totals: Σ income, Σ saved, pct = Σ saved / Σ income | — |
| 7 | Goal pct (settings `savings_goal_pct`, optional 1–100) | progress = year pct / goal, capped at 100% |
| 8 | Month view `savings` field (SOL-3 left it null) now filled when a row exists | — |

Rule 1 numbers: Mercado 900 / 3459.56 = 26.0%, Comida fora 8.7%, Aluguel 65.3%; Mercado delta (900 − 760) / 760 = +18.4%.

## API

- `GET /api/reports/categories?month=YYYY-MM` → `{ month, outflow_total, income_total, outflow: [{ category_id, name, icon, color, kind, amount, pct, previous_amount, delta_pct }], income: [...] }`, each list ordered by amount desc. One grouped query for the two months.
- `GET /api/transactions?month=&category_id=` (filter added to the SOL-3 route) feeds the "transactions of the selected slice" list.
- `GET /api/savings?year=YYYY` → `{ year, months: [{ month, income, saved, pct }] (12 rows, zeros when empty), total_income, total_saved, pct, goal_pct, goal_progress_pct }`.
- `PUT /api/savings/{year}/{month}` `{ amount }` → 200 row. `PATCH /api/settings` accepts `savings_goal_pct`.

## Screens (ux; copy final)

**Para onde vai** (`/para-onde-vai`): short indigo header with month switcher; card with donut (Recharts `PieChart`, category colors from tokens, total in the center `R$ 4.256,50`, label `Saídas do mês`); legend rows: icon circle, name, amount, `26%`, delta badge (`+18%` red when spending grew, `−6%` green when it fell, hidden when null); segmented `Saídas / Entradas` above the donut; card `Top 5` with thin bars in category color; tapping a slice or legend row selects the category and lists its transactions below (`Lançamentos de Mercado`), with `Limpar filtro`. Empty: `Nenhum gasto neste mês ainda.` Loading skeleton: donut ring + 4 rows. Invoke the `dataviz` skill before the chart.

**Economia** (`/economia`): header with year switcher `‹ 2026 ›`; hero card `Guardado no ano`, amount, `8,4% das entradas`, progress bar to `Meta 20%` (goal editable inline: pencil → number input → save); table card with 12 rows `Mês | Entradas | Guardado | %`: `Guardado` is tappable → inline amount input, saves on blur/enter with optimistic update and toast `Salvo`; `%` with a dot: red < 5%, yellow 5–15%, green > 15%; footer row `Total`. Months before `opening_date` show `—`.

## Acceptance

Rules 1–8 as tests; both screens at 375 and 1440, light and dark; donut keyboard-selectable (legend rows are buttons); coverage ≥ 90% both sides; `pnpm build` writes `out/para-onde-vai.html` and `out/economia.html`.
