# SOL-47 plan — resize a series

Spec: `docs/specs/cards/SOL-47.md` (rules L1–L6, contract, screens, acceptance) and D19. Branch `feat/SOL-47-series-length`. Two tasks, in order; each one is TDD (red then green) and commits on green.

## Task 1 — backend (`backend` agent, opus)

Model: the `repeat_months` branch of `service::update` (`crates/soldi-server/src/transactions/service.rs:117-170`) and the SOL-21 series tests in `crates/soldi-server/tests/transactions.rs:550-800` (`repeat` helper at :324).

1. `domain.rs`: `check_series_length(months, position)`; `check_repeatable` drops the series branch. Unit tests: L3 vectors and `repeat_dates(2027-01-31, 5)[3..]` landing on May 31.
2. `repo.rs`: `series_start`, `delete_beyond` (copy `delete_following` at `repo.rs:259`, `ORDER BY date, id OFFSET`). Every statement filters `user_id`.
3. `service::update`: member with `repeat_months` resizes after the field edits, same DB transaction; N = total writes nothing.
4. `UpdateTransaction.repeat_months` doc comment and the 422 list on the PATCH handler; `UPDATE_OPENAPI=1 cargo test -p soldi-server --test openapi`; `scripts/sqlx-prepare.sh`.
5. Integration tests from the spec's backend acceptance list.

Done when: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `scripts/sqlx-prepare.sh --check` are green.

## Task 2 — web (`web` agent, opus)

Model: the `Repetir` chips block of `web/src/features/add-transaction/transaction-sheet.tsx:210-300` and its tests in `transaction-sheet.test.tsx`.

1. `pnpm gen:api`.
2. Member sheet: `Meses na série` chips where `Repetir` sits, preselected on `series.total`, chips below `series.position` disabled, `Outro` with the dynamic minimum, the two helpers, `repeat_months` sent only when N differs from the total, toast `Série ajustada para N meses`.
3. Vitest for every state in the spec; the e2e from the acceptance list in `web/e2e/`.

Done when: `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` (> 90% on 4 metrics) and `pnpm build` are green.

## Review and ship

`qa` (contract change), then merge to `developer`, release minor, PR to `main`, tag, Railway deploy, card Done.
