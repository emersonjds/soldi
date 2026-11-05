# Changelog

All notable changes to Soldi are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0.0 the HTTP API may change between minor
versions. This file covers the server and the web app together.

## [Unreleased]

## 0.5.1

> Headline: light theme only

### Removed

- Dark mode and the template's theme preferences: the `.dark` tokens, the `theme_mode` preference and its `data-theme-mode` attribute, the boot script that followed the system color scheme, the preferences store, and the `next-themes`, `zustand` and `ts-node` dependencies. Soldi always renders the light Soldi palette, whatever the system setting; toasts are light too.

## 0.5.0

> Headline: import the Termômetro spreadsheet

### Added

- `POST /api/imports/xlsx` takes the Termômetro workbook as multipart `file` (at most 5 MB, 413 `too-large` above; 422 when it is not an .xlsx). Year sheets (2000 to 2100) give one entry per `Entrada`, `Saída` and `Diário` number, or from a formula of `+` and `-` over numbers (a leading `+` and a `sum( … )` wrapper are accepted, in any case): one entry per literal for a pure sum, one net entry when there is a `-`, an error when the net is zero or less; the `Economia` sheet gives the saved months of each table with a year. The answer lists, per year, the entry count, the income, bills and daily totals and the saved months, plus every unreadable cell (`{ sheet, cell, message }`: a cell reference or any other formula, text, more than two decimals, a day the month does not have) and a `token`. Only the preview is stored, for 15 minutes.
- `POST /api/imports/xlsx/confirm` `{ token, opening_balance, opening_date, skip_errors? }` writes the preview in one transaction: the opening balance and date (422 on `opening_date` after the first imported day), the categories `Importado (entrada)`, `Importado (conta)` and `Importado (diário)` (created once, `file-spreadsheet`, `cat-12`), the entries noted `Planilha {year}`, the saved months, and onboarding, and answers `{ transactions, savings_months, years, skipped }`. A second import of a year replaces what the first wrote for that year; entries made by hand stay. With `skip_errors: true` a preview with errors is confirmed without the cells it lists, returned as `skipped: [{ sheet, cell }]`; without it such a preview answers 422 `import-has-errors`. An expired token answers 410 `import-expired`, another user's token 404.
- Ajustes › Dados › `Importar planilha` (`/ajustes/importar`): pick or drop the `.xlsx` (files over 5 MB are refused before upload), then a card per year with its entries, `Entradas`, `Contas`, `Diário` and saved months, the unreadable cells as `{sheet}!{cell}: {message}` with `Importar mesmo assim, pulando essas células` (required to confirm when there are any), `Saldo inicial` (default `0,00`) and `Data do saldo inicial` (default January 1 of the earliest year). `Importar` shows `Importado: {n} lançamentos` and opens `Mês` (December of the latest year when it is a past year). Too large, not an .xlsx and expired previews each get their own message; errors keep the preview, and `Escolher outro arquivo` starts over.

### Upgrade notes

- Migration `0010_import_previews` adds the `import_previews` table and nullable `import_batch_id` and `import_year` columns on `transactions` and `savings`, with a partial index on imported entries. It runs on start-up with the others; no manual step.

## 0.4.0

> Headline: where the money goes and the savings year

### Added

- `GET /api/reports/categories?month=YYYY-MM`: the month's outflow (bills and daily) and income by category, each with its share of the group's total and its change against the previous month as percentages with one decimal (`delta_pct` null when the previous month had nothing), largest first.
- `GET /api/transactions?month=YYYY-MM&category_id=…` lists one category's entries; another user's category lists nothing.
- `GET /api/savings?year=YYYY`: twelve months of income, savings and their percentage (null without income; income and savings null before the opening month), the year totals and the progress towards the savings goal, capped at 100%.
- `PUT /api/savings/{year}/{month}` `{ amount }` sets a month's savings (zero or more, two decimal places; a month before the opening date answers 422 `month-before-opening`).
- `GET /api/months/{YYYY-MM}` fills `savings` with the month's amount and its percentage of the month's income.
- Web `Para onde vai` (`/para-onde-vai?m=YYYY-MM`): a short header with the month switcher, `Saídas / Entradas`, a donut in the category colors with the month's total in the center, legend rows with amount, share and the change against the previous month (red when spending grew, green when it fell), a `Top 5` with bars, and tapping a slice or a row lists that category's entries with `Limpar filtro`. Rows are keyboard-selectable buttons.
- Web `Economia` (`/economia?y=YYYY`): a year switcher, `Guardado no ano` with its share of income and the progress to the goal (edited inline: pencil, 1 to 100, empty clears it), and a twelve-month table where `Guardado` is edited in place (Enter or leaving the field saves with `Salvo`, Escape cancels); `%` carries a red, yellow or green dot (under 5%, 5 to 15%, over 15%); months before the opening show `—`. On a phone the income sits under the month name and the share under the amount.

### Changed

- `savings_goal_pct` in `PATCH /api/settings` is 1 to 100; `null` clears the goal and `0` is refused.
- Web: toasts on a phone sit above the tab bar and its `Lançar` button instead of covering them.

### Upgrade notes

- Migration `0009_savings_goal` turns a stored goal of 0 into no goal and narrows the `settings.savings_goal_pct` check to 1..100. It runs on start-up with the others; no manual step.

## 0.3.0

> Headline: recurring bills, one-tap payment and the projected balance

### Added

- Recurring bills: `POST /api/bills`, `PATCH /api/bills/{id}` (name, amount, due day, category, `active`), `DELETE /api/bills/{id}` (archive, its payments stay) and `GET /api/bills?include_inactive=true` for paused bills. The category must be one of the caller's active bill categories.
- `POST /api/bills/{id}/pay` `{ date, amount? }` records a `bill` entry linked by `recurring_bill_id`, with the bill's amount unless another is given; an optional `?month=YYYY-MM` keeps the date inside the month being paid. A second payment in the same month answers 409 `bill-already-paid`. `DELETE /api/bills/{id}/pay?month=YYYY-MM` removes that month's payment.
- `GET /api/months/{YYYY-MM}` fills `bills_of_month` (category icon and color, due date clamped to short months, paid, payment entry, overdue) and `projected_balance` is now the month-end balance minus the unpaid bills, with its own tier.
- Transactions carry `recurring_bill_id`.
- Web: `Contas do Mês` on Mês, between the summary and the thermometer (top of the main column on desktop): each bill with its due day, amount and a pill. `Pagar` marks it paid in one tap, dated today; `Pago` undoes it (`Pagamento desfeito`); an overdue bill shows `Vencido` on a tinted row with `Venceu dia dd/mm`. A tap on the amount opens the `Pagar` sheet to change the amount or the date. Desktop filters `Todas / Pendentes / Pagas`, footer with the next due date, empty state with `Cadastrar contas`.
- Web: Ajustes is a grouped list. `Contas fixas` lists active and paused bills, adds and edits them in a sheet (nome, valor, dia, categoria, Ativa) and archives with a 5 s `Desfazer`. `Termômetro` edits the four tier bounds with a live preview of today's balance; `Saldo inicial` edits the opening balance and date. `Categorias` is a placeholder.

### Changed

- "Today" is the São Paulo calendar day for the month view, overdue bills and the default opening date.
- Entries of one day list newest first by creation time.
- A transaction dated before the opening date answers 422 `before-opening-date`.
- Web: the Projetado figure and the thermometer sentence use the projection: `Com as contas em aberto, seu mês termina em {valor}.`
- New accounts seed Mercado, Comida fora, Transporte, Saúde, Lazer, Aluguel, Luz, Internet, Cartão, Assinaturas, Salário and Extra with `cat-1` to `cat-12`; the other defaults share the palette in turn. Existing categories keep their colors.

### Security

- `ctutils` 0.4.8 (RUSTSEC-2026-0385).

### Upgrade notes

- Migration `0008_bill_payment_month` adds a unique index on one bill payment per month and drops `transactions_recurring_bill_idx`, which it covers. It fails if a bill already has two entries in one month; none can exist before 0.3.0.

## 0.2.0

> Headline: transactions and the month view with the thermometer

### Added

- Transactions: `GET /api/transactions?month=YYYY-MM` (newest first, each with its category), `POST`, `PATCH` and `DELETE /api/transactions/{id}`. Amounts must be above zero with at most two decimal places and are never rounded; the category must be the caller's, active and of the entry's kind.
- `GET /api/months/{YYYY-MM}`: every day of the month with income, bills, daily spending and the running balance carried from the opening balance across months and years, each colored by the user's thermometer tiers; today's balance, month totals and performance, and the month-end projection. A month before the opening date answers 422 `month-before-opening`.
- Web `Mês`: month switcher (`?m=YYYY-MM`, arrow keys, nothing before the opening month), today's balance with its tier, Entradas / Saídas / Projetado over the hero, `Termômetro do Mês` with the five-tier strip and how much of the income is committed, and `Lançamentos` grouped by day with the day's balance and tier. Loading, empty and error states; light and dark, 375px and 1440px.
- Web `Lançar`: bottom sheet on phones and dialog from 1024px for Entrada, Conta or Diário, with Diário, its first category and today preselected so the floating button, the amount and Salvar log a spend. The new row shows at once. Tapping a row edits or deletes it; a deletion can be undone for 5 seconds.
- Web thermometer components: tier pill, tier strip, money with tabular figures and category icons.

### Fixed

- `scripts/sqlx-prepare.sh` and CI cache the queries used only by tests, so offline builds compile the test targets.

### Removed

- The template's sample dashboards and the `simple-icons` dependency.

## 0.1.0

> Headline: workspace, auth, settings, categories, bills and onboarding API, plus the web app to sign in, onboard and see the month

### Added

- Cargo workspace (`soldi-types`, `soldi-server`), PostgreSQL 16 in `compose.yaml`, CI, Dockerfile and Railway config.
- Sign-up, sign-in, sign-out and `GET /api/auth/me` with an opaque session cookie (argon2id passwords); `me` says whether the user is `onboarded`.
- Settings: opening balance and date, the four thermometer tiers (defaults -500 / 0 / 1000 / 2000) and an optional savings goal.
- Categories seeded at sign-up (income, bill and daily), with create, rename, recolor and archive.
- `GET /api/bills`: the active recurring bills by due day.
- `POST /api/onboarding`: opening balance, date and up to 50 first bills in one transaction; a second call answers 409.
- The Next.js export is served from `SOLDI_WEB_DIR` (default `web/out`) with `.html`, `index.html` and client-route fallbacks.
- OpenAPI at `/api/openapi.json`, Swagger UI at `/api/docs`, committed snapshot in `web/openapi.json`.
- RFC 9457 problem responses for every error.
- Web app (Next.js static export, pnpm): Entrar, Criar conta, three-step onboarding (opening balance and date, fixed bills, done), a `Mês` placeholder with the month hero and today's balance tier, and `Ajustes` with sign-out.
- Soldi theme in light and dark (Inter, violet brand, indigo hero, income, expense and five thermometer tiers), desktop sidebar and phone tab bar with the raised `Lançar` button.
- Template screens Soldi does not use were removed; Vitest with 90% coverage thresholds and a Playwright smoke test.
