# Soldi

Personal-finance thermometer: a web product that replaces the owner's `Termômetro.xlsx` (daily income, bills and day-to-day spending, a running balance colored by tier, month performance, savings) and adds categories, recurring bills and a projected end-of-month balance. Multi-user, pt-BR, BRL. Global rules in `~/.claude/CLAUDE.md` apply; this file holds only the delta.

## Backlog: cards live in santi

- Project `SOL` on the santi tracker (`santi backlog SOL`, `santi issues create SOL …`, `santi issues edit|move SOL-<n> …`; token from `santi login`). Never Jira.
- Flow: To Do → In Progress when a branch starts → Done after the merge to `developer`. Branches carry `SOL-<n>`.
- Labels only from the standard set: `frontend`, `backend`, `ux`, `documentation`, `testing`, `performance`, `security`, `ci`, `tech-debt`, `community`, `good-first-issue`, `help-wanted`.

## Card flow (one card per session)

1. Card → In Progress; worktree `../soldi-<n>` on `feat|fix|chore/SOL-<n>-<summary>` from `developer`.
2. Design panel for anything a user sees: `product`, `ux` and `finance` vote on every open question, `architect` challenges on data, performance and readability; winner, trade-off and acceptance criteria (every state) go to `docs/specs/cards/SOL-<n>.md`. Cross-cutting outcomes get a D-entry in `docs/specs/decisions.md`. Implementers never decide UX alone.
3. Build: `backend` → `designer` (tokens, components, motion) → `web`, TDD; the prompt names the model file to copy and the card brief.
4. Review: `qa` when risky (auth, migration, contract, user isolation, > ~200 lines); `pixel` checks screenshots at 375 and 1440, light and dark, against the brief. Findings fixed on the same branch by a fresh agent.
5. Merge to `developer`; bump semver in `Cargo.toml`, `web/package.json` and `CHANGELOG.md`; PR `developer` → `main`, merged when CI is green; tag `vX.Y.Z` (Railway deploys `main`). Card → Done with a comment: what shipped, deviations, follow-up cards.

## Layout

- `crates/soldi-types`: shared DTOs. `crates/soldi-server`: axum + sqlx, vertical slices (`domain.rs` pure rules, `repo.rs` sqlx, `service.rs` use cases taking `&CurrentUser`, `handler.rs` JSON API under `/api`); serves the web export from `SOLDI_WEB_DIR` (default `web/out`) at `/`.
- `web/`: Next.js 16 app from `next-shadcn-admin-dashboard` (shadcn `radix-nova`, Tailwind 4, Biome), `output: "export"`, FSD in `web/src` (`app → widgets → features → entities → shared`, imports only downward). Calls `/api/*` only through `openapi-fetch`; the contract is the committed `web/openapi.json`. Never import across `web/` and `crates/`.
- Web commands (pnpm, from `web/`): `pnpm dev` (3000, proxies `/api` to 8080), `pnpm gen:api`, `pnpm typecheck`, `pnpm lint` (Biome), `pnpm test:coverage` (> 90% on 4 metrics), `pnpm e2e`, `pnpm build` (`web/out`).
- Money: `NUMERIC(12,2)` / `rust_decimal::Decimal` / string in JSON / `Intl.NumberFormat("pt-BR")`. Never a float.
- Every query filters by `user_id` from the session. No cross-user endpoint exists.
- Product and architecture decisions: `docs/specs/decisions.md`; design spec: `docs/specs/2026-11-05-soldi-v1-design.md`. Read both before planning or coding.
- `main.rs` holds wiring only; excluded from coverage.

## Gitflow and gate

- `main` = release, `developer` = integration (always green). Work branches from `developer`.
- Gate before merge: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `scripts/sqlx-prepare.sh --check`, `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage`, `pnpm build`; CI coverage ≥ 90%.
- Local coverage: `LLVM_COV=$(brew --prefix llvm@22)/bin/llvm-cov LLVM_PROFDATA=$(brew --prefix llvm@22)/bin/llvm-profdata cargo llvm-cov --workspace --ignore-filename-regex '/main\.rs$'`.
- Agents commit on each green step; only the orchestrating session merges, pushes or opens PRs.

## Containers

`compose.yaml` runs PostgreSQL 16 on Docker Desktop. Only Soldi containers run during a Soldi session.
