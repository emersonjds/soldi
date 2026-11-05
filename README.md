# Soldi

Your month at a glance: income, bills and day-to-day spending with a running balance that turns red before the money is gone. Categories tell you where it went; recurring bills and a projected end-of-month balance tell you where it is going.

Soldi replaces a spreadsheet "thermometer" kept for years. The rules are the same; the friction is not.

## Run locally

```sh
scripts/dev.sh                     # Postgres + migrations + web build + server on :8080
```

Piece by piece:

```sh
docker compose up -d postgres
sqlx migrate run --source crates/soldi-server/migrations
cargo run -p soldi-server          # API on :8080, serves web/out when built
cd web && pnpm install && pnpm dev # web on :3000, proxies /api to :8080
cd web && pnpm build               # static export to web/out, served by the server on :8080
```

## Layout

- `crates/soldi-server` — axum + sqlx + PostgreSQL, vertical slices (`domain`, `repo`, `service`, `handler`), OpenAPI at `/api/openapi.json`.
- `crates/soldi-types` — DTOs shared with the OpenAPI contract.
- `web/` — Next.js 16 + shadcn/ui, static export served by the server; Feature-Sliced Design.
- `docs/specs/` — design spec, decisions (ADRs), card briefs. `docs/plans/` — implementation plans. `docs/design/` — tokens and references.

## License

AGPL-3.0-only.
