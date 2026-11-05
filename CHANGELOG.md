# Changelog

All notable changes to Soldi are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0.0 the HTTP API may change between minor
versions. This file covers the server and the web app together.

## [Unreleased]

## 0.2.0

> Headline: transactions and the month view with the thermometer

### Added

- Transactions: `GET /api/transactions?month=YYYY-MM` (newest first, each with its category), `POST`, `PATCH` and `DELETE /api/transactions/{id}`. Amounts must be above zero with at most two decimal places and are never rounded; the category must be the caller's, active and of the entry's kind.
- `GET /api/months/{YYYY-MM}`: every day of the month with income, bills, daily spending and the running balance carried from the opening balance across months and years, each colored by the user's thermometer tiers; today's balance, month totals and performance, and the month-end projection. A month before the opening date answers 422 `month-before-opening`.

### Fixed

- `scripts/sqlx-prepare.sh` and CI cache the queries used only by tests, so offline builds compile the test targets.

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
