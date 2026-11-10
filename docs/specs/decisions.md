# Decisions

Architecture decision records, one entry per cross-cutting choice. Newest at the bottom. Card-level choices stay in `docs/specs/cards/SOL-<n>.md`; an entry lands here when it binds more than one card. Format: context, options with votes when a panel ran, winner, trade-off.

## D1 — Name: Soldi (2026-11-05, owner)

Five letters, "money" in Italian, memorable. Alternatives offered: Saldo, Moola, Plata, Kassa.

## D2 — Multi-user from day one, free, no billing (2026-11-05, owner)

Every table carries `user_id`; every query filters by it; no cross-user endpoint exists. Plans and billing are a future card.

## D3 — pt-BR and BRL only (2026-11-05, owner)

Copy in Portuguese, `Intl.NumberFormat("pt-BR", { currency: "BRL" })`. No i18n layer.

## D4 — Rust backend, single repository, mirror of santi (2026-11-05, owner)

axum 0.8 + sqlx 0.9 + PostgreSQL, vertical slices (`domain`, `repo`, `service`, `handler`), utoipa OpenAPI, `crates/` + `web/` in one repo, one Railway deploy. Kotlin/Spring Boot and a separate API repo were considered and dropped by the owner.

## D5 — Next.js static export served by the axum binary (2026-11-05, owner picked option A)

`web/` is `next-shadcn-admin-dashboard` with `output: "export"`; the server serves `web/out` at `/` and answers `/api/*`. Trade-off: no SSR or server components with data; a logged-in dashboard does not need them. Alternatives: Next as a separate service (two deploys, CORS, cross-site cookie) and a Vite SPA port (throws the template away).

## D6 — Session cookie, argon2id, no JWT (2026-11-05, architect)

Opaque token, SHA-256 of it stored in `sessions`, `HttpOnly; Secure; SameSite=Lax` cookie named `__Host-soldi_session`. Same as santi; no key rotation, revocation is a row delete. Google OAuth (SOL-6) links by e-mail into the same table.

## D7 — Money is Decimal end to end (2026-11-05, finance + architect)

`NUMERIC(12,2)` in PostgreSQL, `rust_decimal::Decimal` in Rust, string in JSON, formatted only in the web. Rounding half-even at two decimals. Floats never touch an amount.

## D8 — Transactions are the only ledger; projection is computed (2026-11-05, architect)

Recurring bills never generate rows ahead of time. Paying one inserts a transaction with `recurring_bill_id`; the month view computes the projected end-of-month balance by subtracting unpaid bills. One `GROUP BY date` query per month view, never N+1.

## D9 — Thermometer thresholds per user, sheet values as defaults (2026-11-05, product)

`-500 / 0 / 1000 / 2000` from the owner's sheet; editable in Ajustes with a live preview. Color is never the only signal: each tier also has a label.

## D10 — Backlog lives in the santi tracker, project SOL (2026-11-05, owner)

Never Jira. Branches carry `SOL-<n>`; a card moves To Do → In Progress at branch → Done at merge to `developer`.

## D11 — Unused template screens are deleted in SOL-2 (2026-11-05, architect)

Keeps build size, lint and coverage scoped to Soldi. The `finance` and `default` dashboards stay until `Mês` exists, as the model to adapt (reuse rule).

## D12 — Autonomous delivery: agents decide, owner reviews in the morning (2026-11-05, owner)

Panel (`product`, `ux`, `finance`, `architect`) votes are recorded in the card brief; nothing waits for the owner. One implementing agent at a time, each in its own worktree with a shared `CARGO_TARGET_DIR`. Flow per card: branch from `developer` → build → review → merge `--no-ff` into `developer` → merge into `main` → push both.

## D13 — "Today" is the São Paulo calendar day (2026-11-05, architect + finance)

pt-BR only product (D3): the server computes `today` in `America/Sao_Paulo` (chrono-tz) for `is_today`, `balance_today` and overdue checks; the web sends nothing. Found in SOL-3: UTC flipped the day at 21:00 local. A per-user time zone setting is a future card if the product ever leaves Brazil. Same panel: entries within a day are ordered by `created_at desc` (random v4 ids made `id desc` meaningless); a transaction dated before `opening_date` is refused with 422 `before-opening-date` instead of being silently ignored.

## D14 — Repeated entries are real rows grouped by `series_id` (2026-11-05, SOL-21 panel, architect arbitrated)

"Repetir por N meses" (2..60, N counts the original) inserts all N rows at once, sharing a nullable `transactions.series_id`; position and total are counted at read time, never stored. A series action reaches only `this` row or `following` rows (date ≥ the edited one); past members are never rewritten, and a date change never propagates. Bill payments and resgates cannot repeat: an open-ended repeat is a recurring bill (D8), offered as "Transformar em conta fixa". Trade-off: D8's "no rows ahead of time" holds for bills only; a finite user-chosen repeat writes future rows, bounded by 60. Options: lazy generation (breaks D8's single ledger), a third "Toda a série" scope (rewrites reconciled months).

## D15 — Category colors are unique per kind; subcategories wear the parent's (2026-11-08, owner)

Among a user's active top-level categories of one kind no two share a color; the palette grows to 24 tokens so the defaults fit. Every subcategory, cofrinhos included, takes its parent's color and has no picker. Rejected: uniqueness across kinds (about 40 tokens, too close to tell apart) and cofrinhos keeping their own colors (an exception to a rule the owner wants without exceptions). Detail: `docs/specs/cards/SOL-32.md`.

## D16 — Forecast is computed from what the user entered, never guessed (2026-11-10, owner + product/finance/ux panel)

Future days show a projected balance built from committed future entries and unpaid contas fixas on their due day (a past-due one lands today); nothing is stored ahead (D8 holds). Future daily spending is not averaged in: false alarms cost more trust than late ones. Salary stays an entry repeated with D14, no recurring-income entity. The alert is the user's red tier, not "below zero". Horizon tops out at 12 months. "Posso comprar isso?" previews a draft without writing it; installments are a D14 series with the cents remainder on the last one. Rejected: bank sync, multi-year or multi-scenario models, envelope budgeting. Detail: `docs/specs/forecast/`.
