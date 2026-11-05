#!/usr/bin/env bash
# Starts PostgreSQL, builds the web export and runs the server on :8080 serving it.
# Usage: scripts/dev.sh [--no-build]
set -euo pipefail
cd "$(dirname "$0")/.."

export DATABASE_URL="${DATABASE_URL:-postgres://soldi:soldi@localhost:5441/soldi}"
export SOLDI_WEB_DIR="${SOLDI_WEB_DIR:-web/out}"
export PORT="${PORT:-8080}"

docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U soldi -d soldi >/dev/null 2>&1; do sleep 1; done
sqlx migrate run --source crates/soldi-server/migrations

if [[ "${1:-}" != "--no-build" ]]; then
  (cd web && pnpm install --frozen-lockfile && pnpm build)
fi

echo "Soldi on http://localhost:$PORT"
exec cargo run --release -p soldi-server
