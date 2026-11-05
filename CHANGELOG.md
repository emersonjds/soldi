# Changelog

All notable changes to Soldi are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0.0 the HTTP API may change between minor
versions. This file covers the server and the web app together.

## [Unreleased]

## 0.3.0

> Headline: recurring bills, one-tap payment and the projected balance

### Added

- Recurring bills: `POST /api/bills`, `PATCH /api/bills/{id}` (name, amount, due day, category, `active`), `DELETE /api/bills/{id}` (archive, its payments stay) and `GET /api/bills?include_inactive=true` for paused bills. The category must be one of the caller's active bill categories.
- `POST /api/bills/{id}/pay` `{ date, amount? }` records a `bill` entry linked by `recurring_bill_id`, with the bill's amount unless another is given; an optional `?month=YYYY-MM` keeps the date inside the month being paid. A second payment in the same month answers 409 `bill-already-paid`. `DELETE /api/bills/{id}/pay?month=YYYY-MM` removes that month's payment.
- `GET /api/months/{YYYY-MM}` fills `bills_of_month` (category icon and color, due date clamped to short months, paid, payment entry, overdue) and `projected_balance` is now the month-end balance minus the unpaid bills, with its own tier.
- Transactions carry `recurring_bill_id`.

### Changed

- "Today" is the São Paulo calendar day for the month view, overdue bills and the default opening date.
- Entries of one day list newest first by creation time.
- A transaction dated before the opening date answers 422 `before-opening-date`.
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
