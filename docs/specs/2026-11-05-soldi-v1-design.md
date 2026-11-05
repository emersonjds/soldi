# Soldi v1 — design

Date: 2026-11-05. Status: approved by the owner (conversation of 2026-11-05). Cards: epic SOL-1, stories SOL-2..7 in the santi tracker.

## 1. Purpose

Replace the owner's `Termômetro.xlsx` with a web product that does the same thing with less friction and answers the one question the sheet cannot: where the money goes.

What the sheet does today (source of truth for behavior):

- One tab per year (`2024`, `2025`, `2026`), twelve month blocks side by side, one row per day.
- Per day: `Entrada` (income), `Saída` (bills), `Diário` (day-to-day spending), `Saldo` (running balance).
- Running balance: `balance = yesterday + income - (bills + daily)`. Day 1 of a month starts from the last balance of the previous month; January starts from December of the previous year.
- Thermometer (conditional format on `Saldo`): `< -500` red, `-500..0` light red, `0..1000` yellow, `1000..2000` light green, `> 2000` green.
- Month footer: sums of income, bills and daily; `Saída Total = bills + daily`; `Performance = income - Saída Total`.
- `Economia` tab: per month, income vs amount saved and the percentage.
- Values are sums typed into a cell (`=368 + 2259.56 + 950`): no description, no category.

What Soldi adds: a category on every entry, recurring bills registered once, and a projected end-of-month balance that turns red before the money is gone.

## 2. Decisions

| # | Decision | Why |
|---|----------|-----|
| D1 | Name: **Soldi** ("money" in Italian). | Short, memorable, five letters. |
| D2 | Multi-user from day one: open sign-up, free, each user sees only their own data. No plans, no billing. | Owner's call. Billing is a future card. |
| D3 | pt-BR copy and BRL only. | Owner's call; i18n later if ever. |
| D4 | Backend in Rust: axum + sqlx + PostgreSQL, same shape as `santi`. | Owner's call; house stack, agents and CI already exist for it. |
| D5 | Single repository: `crates/` + `web/`. | Mirror of `santi`; one deploy on Railway. |
| D6 | `web/` is `next-shadcn-admin-dashboard` (Next.js 16, React 19, Tailwind 4, shadcn `radix-nova`) built with `output: "export"` and served by the axum binary from `SOLDI_WEB_DIR` (default `web/out`). | One origin, same-site cookie, no CORS, no SSR needed for a logged-in dashboard. |
| D7 | Auth: e-mail + password (argon2id) with an opaque session token stored in PostgreSQL and sent in an `HttpOnly; Secure; SameSite=Lax` cookie. Google OAuth is SOL-6, not part of bootstrap. | Same as `santi`; proven, no JWT key rotation. |
| D8 | Money as `NUMERIC(12,2)` in PostgreSQL, `rust_decimal::Decimal` in Rust, string in JSON, `Intl.NumberFormat("pt-BR")` in the web. | Never floats for money. |
| D9 | Thermometer thresholds are per-user settings with the sheet's values as defaults. | The owner tuned them for his income; other users will not share them. |
| D10 | Transactions are the only ledger. Paying a recurring bill creates a transaction linked to it; nothing is "generated" ahead of time. | No phantom rows; projection is computed, not stored. |
| D11 | No CLI, no MCP crate. | No use case yet. |
| D12 | Template screens not used by Soldi are deleted during SOL-2 (chat, mail, kanban, crm, ecommerce, logistics, academy, infrastructure, invoice, roles, users, tasks, calendar, analytics, productivity). The `finance` and `default` dashboards stay as the model to adapt, then go once the `Mês` screen exists. | Build size, coverage and lint scope. Reuse rule: adapt the nearest screen, never start from zero. |

## 3. Architecture

```
soldi/
  Cargo.toml                 workspace: soldi-types, soldi-server
  crates/soldi-types/        DTOs shared by server and OpenAPI (serde + utoipa + schemars)
  crates/soldi-server/       axum 0.8, sqlx 0.9 (postgres, migrate), utoipa OpenAPI at /api/openapi.json
    src/
      main.rs                wiring only (excluded from coverage)
      lib.rs                 app() router, state, layers (compression, timeout, set-header, trace)
      error.rs               AppError -> typed JSON problem responses
      extract.rs             CurrentUser extractor (session cookie -> user)
      auth/      domain.rs repo.rs service.rs handler.rs    sign-up, sign-in, sign-out, me
      settings/  ...                                        opening balance, thresholds
      categories/ ...
      transactions/ ...
      bills/     ...                                        recurring bills + pay
      months/    domain.rs service.rs handler.rs           running balance, tiers, totals, projection
      savings/   ...
      reports/   ...                                        where-the-money-goes
    migrations/              sqlx migrations, numbered 0001_...
  web/                       Next.js 16 app from the template, FSD inside src/
    src/app/                 routes only: (auth)/entrar, (auth)/criar-conta, (main)/mes, (main)/lancar,
                             (main)/para-onde-vai, (main)/economia, (main)/ajustes, (main)/onboarding
    src/widgets/             month-thermometer, day-list, bills-of-month, category-donut, savings-table
    src/features/            add-transaction, pay-bill, sign-in, sign-up, onboarding, edit-thresholds
    src/entities/            user, category, transaction, bill, month, savings (types from openapi, queries)
    src/shared/              ui (shadcn from template), api (openapi-fetch client), lib, config
    openapi.json             committed contract; `pnpm gen:api` regenerates src/shared/api/schema.d.ts
  compose.yaml               PostgreSQL 16 for dev and tests
  Dockerfile                 multi-stage: pnpm build (web/out) + cargo build --release
  railway.toml
  docs/specs/                this file, decisions.md, cards/SOL-<n>.md
  docs/design/               stitch-prompt.md, design tokens, screenshots
  .claude/                   CLAUDE.md and agents
```

Rules carried from `santi`:

- Vertical slices: `domain.rs` pure rules with unit tests; `repo.rs` sqlx only, tested with `sqlx::test`; `service.rs` use cases taking `&CurrentUser`; `handler.rs` JSON routes tested through `app().oneshot(...)`. No trait with a single implementation.
- Every route annotated for utoipa; `cargo test -p soldi-server --test openapi` fails when `web/openapi.json` drifts (`UPDATE_OPENAPI=1` rewrites it).
- `web/` never imports from `crates/`; the contract is `web/openapi.json`.
- Every query filters by `user_id` from the session. There is no cross-user endpoint.

## 4. Data model

All tables carry `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `created_at`, `updated_at`.

- `users`: `id`, `email` (citext unique), `name`, `password_hash` (nullable once Google exists), `onboarded_at` (nullable).
- `sessions`: `id`, `user_id`, `token_hash` (sha256 of the cookie value), `expires_at`, `last_seen_at`.
- `settings` (one row per user, created at sign-up): `opening_balance NUMERIC(12,2)`, `opening_date DATE`, `tier_red NUMERIC` (-500), `tier_zero` (0), `tier_yellow` (1000), `tier_green` (2000), `savings_goal_pct SMALLINT NULL`.
- `categories`: `id`, `name`, `kind` (`income | bill | daily`), `icon` (lucide name), `color` (token name, not hex), `archived_at`. Defaults seeded at sign-up: Salário, Extra (income); Aluguel, Luz, Internet, Cartão, Assinaturas (bill); Mercado, Transporte, Comida fora, Lazer, Saúde, Outros (daily).
- `recurring_bills`: `id`, `category_id`, `name`, `amount NUMERIC(12,2)`, `due_day SMALLINT 1..31`, `active`, `archived_at`.
- `transactions`: `id`, `date DATE`, `amount NUMERIC(12,2) > 0`, `kind` (same enum, denormalized from the category at insert for fast sums), `category_id`, `note TEXT NULL`, `recurring_bill_id UUID NULL`. Index `(user_id, date)`. Unique `(recurring_bill_id, date_trunc month)` enforced in service: a bill is paid once per month.
- `savings`: `user_id`, `year`, `month`, `amount NUMERIC(12,2)`; primary key `(user_id, year, month)`.

Due day 29..31 on a shorter month clamps to the last day of that month.

## 5. Core rules (`months/domain.rs`, pure, unit-tested)

Input: opening balance at `opening_date`, all transactions from `opening_date` to the end of the requested month, recurring bills, thresholds, today.

Output `MonthView`:

- `days[]`: for each calendar day: `income`, `bills`, `daily`, `balance`, `tier`, `is_today`, `is_future`.
- `balance_today`: balance at today (or at the last day when the month is past; at the opening balance when the month is future).
- `totals`: `income`, `bills`, `daily`, `outflow = bills + daily`, `performance = income - outflow`.
- `bills_of_month[]`: each active recurring bill with `due_date`, `paid` (transaction exists this month), `transaction_id`, `overdue` (unpaid and `due_date < today`).
- `projected_balance`: balance at month end as the ledger stands plus `-sum(unpaid bills)`; `projected_tier` from the same thresholds.
- `savings`: amount and `pct = amount / income` (null when income is 0).

Tier function, inclusive on the lower bound as in the sheet: `b < red → Red`, `red <= b < zero → LightRed`, `zero <= b < yellow → Yellow`, `yellow <= b < green → LightGreen`, `b >= green → Green`.

Balance carries across months and years by walking the ledger from `opening_date`; the service fetches daily sums with one `GROUP BY date` query, never one query per day.

## 6. API (all under `/api`, JSON, cookie session)

- `POST /auth/sign-up`, `POST /auth/sign-in`, `POST /auth/sign-out`, `GET /auth/me`.
- `GET|PATCH /settings`.
- `GET|POST /categories`, `PATCH|DELETE /categories/{id}` (delete = archive).
- `GET /transactions?month=YYYY-MM`, `POST /transactions`, `PATCH|DELETE /transactions/{id}`.
- `GET|POST /bills`, `PATCH|DELETE /bills/{id}`, `POST /bills/{id}/pay` (`{ "date": "YYYY-MM-DD", "amount"?: "123.45" }` → creates the transaction), `DELETE /bills/{id}/pay?month=YYYY-MM` (unpay).
- `GET /months/{YYYY-MM}` → `MonthView`.
- `GET /reports/categories?month=YYYY-MM` → per-category totals for the month and the previous month.
- `GET /savings?year=YYYY`, `PUT /savings/{YYYY}/{MM}`.
- `POST /onboarding` → opening balance + date, optional first bills, marks `onboarded_at`.

Errors: `400` validation with field paths, `401` no session, `404` not owned or missing (never reveal which), `409` bill already paid this month, `422` domain rule. Rate limit on `/auth/*` by IP as in `santi`.

## 7. Screens (pt-BR, mobile first at 375px, then 1440px; light and dark)

1. **Entrar / Criar conta**: e-mail, senha, one button, link to the other. Errors inline.
2. **Onboarding** (first sign-in, three steps, skippable after step 1): "Quanto você tem hoje?" (opening balance, date defaults to today) → "Suas contas fixas" (name, amount, due day, category; add as many as wanted) → "Pronto" with the month screen behind.
3. **Mês** (home, `/mes`, `?m=YYYY-MM`): month switcher; thermometer header with three numbers (`Saldo hoje`, `Projetado fim do mês`, `Performance`) each colored by tier; day list colored like the sheet with today pinned; "Contas do mês" list with `Pago`/`Pagar` one-tap toggle and overdue mark; floating `Lançar` button.
4. **Lançar** (sheet over any screen): amount keypad-first, kind as three segmented buttons (Entrada / Conta / Diário), category chips filtered by kind, date (today, yesterday, pick), note. Save in three taps for the common case.
5. **Para onde vai** (`/para-onde-vai`): donut by category for the month, delta vs previous month, top 5 list, tap a slice to list its transactions.
6. **Economia** (`/economia`): twelve rows (month, income, saved, %), inline edit of saved, year total, optional goal.
7. **Ajustes** (`/ajustes`): categories, recurring bills, thresholds (with a live preview strip), opening balance, sign-out.

Every screen defines loading, empty, error and disabled states before implementation (the `ux` agent owns the brief in `docs/specs/cards/SOL-<n>.md`). Touch targets 44px, form fields 16px, no horizontal scroll at 375px.

## 8. Testing and gate

- Rust: unit tests in `domain.rs`; `sqlx::test` against the compose PostgreSQL for `repo.rs`; handler tests through `oneshot`; `cargo llvm-cov` ≥ 90% lines, regions, functions (branches on nightly), `main.rs` excluded.
- Web: Vitest + Testing Library with coverage thresholds locked at 90% on four metrics in `vitest.config.ts`; Playwright at 375 and 1440 for sign-in, onboarding, add transaction, pay bill.
- Gate (CI and before merge): `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `scripts/sqlx-prepare.sh --check`, `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage`, `pnpm build`.
- Adversarial review (`qa`) for auth, migrations, API contract and diffs over ~200 lines; `pixel` reviews screenshots at 375 and 1440, light and dark, against the card brief.

## 9. Delivery order

| Card | Scope | Depends on |
|------|-------|-----------|
| SOL-2 | Bootstrap: workspace, `web/` export served by axum, compose, CI, Dockerfile, auth, settings, onboarding, template pruning (D12) | — |
| SOL-3 | Categories, transactions, `months/domain.rs`, `Mês` screen, `Lançar` sheet | SOL-2 |
| SOL-4 | Recurring bills, pay/unpay, projection in the thermometer | SOL-3 |
| SOL-5 | `Para onde vai` and `Economia` | SOL-3 |
| SOL-6 | Google sign-in | SOL-2 |
| SOL-7 | Import `Termômetro.xlsx` (year tabs A..BS blocks, `Economia` tab) with preview | SOL-5 |

One card per session: spec brief → plan → subagent-driven build → review → merge to `developer` → version bump → PR to `main`.

## 10. Out of scope for v1

Multiple accounts or wallets per user, shared households, bank sync (Open Finance), budgets per category, notifications, exports, i18n, billing.
