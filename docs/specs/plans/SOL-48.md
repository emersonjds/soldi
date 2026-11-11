# SOL-48 plan — move the day of a series

Spec: `docs/specs/cards/SOL-48.md` (rules M1–M6, contract, screens, acceptance) and D20. Branch `feat/SOL-48-move-series-day`. Two tasks, in order; each one is TDD (red then green) and commits on green.

## Task 1 — backend (`backend` agent, opus)

Model: `service::update` and `resize` (`crates/soldi-server/src/transactions/service.rs:117-204`), the lock + re-read in `service::delete` (`service.rs:207-231`), `insert_copies` UNNEST (`repo.rs:196`), `series_span` (`repo.rs:297`), `following_dates` (`domain.rs:87-103`) with its tests (`domain.rs:400-428`), and the series tests in `crates/soldi-server/tests/transactions.rs` (`repeat` helper at :324, `r6_this_keeps_…` at :665, growth tests at :1091 and :1447).

1. `domain.rs`: `following_dates(day, last, count)` (`repeat_dates` passes `date.day()`), `series_day(last, before)`, `check_day_move(from, to)`, `moved_dates(dates, day)`. Unit tests: the spec's M2, M3, M4, M5 vectors; the existing `following_dates` tests rewritten with a day.
2. `repo.rs`: `series_span` → `series_end` (`query_scalar!`, `ORDER BY date DESC, id DESC LIMIT 2`), `members_from`, `set_dates` (UNNEST like `insert_copies`). Every statement filters `user_id`.
3. `service::update`: a member takes `lock_series` and is re-read right after the first `find` (copy `delete`); `resize` drops its own lock. `check_day_move` before `repo::update`; after `update_following`, `members_from` → `moved_dates` → `set_dates`. Growth: `series_end` → `series_day` → `following_dates`.
4. Docs: `scope` param on the PATCH handler (`handler.rs:112-121`), `Scope::Following` (`crates/soldi-types/src/transactions.rs:45`), the two new 422 `date` messages in the PATCH 422 list; `UPDATE_OPENAPI=1 cargo test -p soldi-server --test openapi`; `scripts/sqlx-prepare.sh`.
5. Integration tests from the spec's backend acceptance list; update `r6_this_keeps_the_series_and_following_rewrites_later_members_but_not_dates` (later members on the 10th, renamed) and `l1_growth_reads_the_span_after_the_edited_members_own_date_change` (2027-03-10, 2027-04-10).

Done when: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `scripts/sqlx-prepare.sh --check` are green.

## Task 2 — web (`web` agent, opus)

Model: the `moved` flag and the `Meses na série` block of `web/src/features/add-transaction/transaction-sheet.tsx:102-153, 228-310`, the `save` toasts at :420-440, the `ApiError` field match in `features/sign-up/sign-up-form.tsx:44-46`, and the member tests in `transaction-sheet.test.tsx:282-400`; e2e model `web/e2e/repeat.spec.ts:96` (the 12x resize flow).

1. `pnpm gen:api`.
2. Under `DateChips`: the day helper (`Os próximos também vão…` / `Toda a série vai…`, suffix for 29–31) and the month-change alert `Para mudar o mês, use Só este.` that stops `fields()`; both only with `scope === "following"` and a moved date.
3. `save`: toast `Série movida para o dia N` for a following day move; `onError` with an `ApiError` carrying field `date` → the shared-month toast; else `failed`.
4. Vitest for every state in the spec; the e2e from the acceptance list in `web/e2e/repeat.spec.ts`.

Done when: `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` (> 90% on 4 metrics) and `pnpm build` are green.

## Review and ship

`qa` (contract change, series writes under a lock), then merge to `developer`, release minor, PR to `main`, tag, Railway deploy, card Done.
