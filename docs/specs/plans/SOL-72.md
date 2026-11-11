# SOL-72 plan — Stitch v3

Spec: `docs/specs/2026-11-11-stitch-v3.md`. Gap analysis with evidence: `docs/design/stitch-v3/README.md`. Decision: D23.

Six cards, in order. Each card:

- is shippable alone;
- gets its own santi card under SOL-72, its own branch from `developer` (`feat/SOL-<n>-<summary>`) and its own session;
- is TDD (`tdd` skill: one red run, then one green run, both reported);
- commits on green;
- is mobile first (375, then 1024, 1280, 1440).

Only card 5 touches the backend.

Gate for every card:

- `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` (> 90% on 4 metrics), `pnpm build`, `pnpm e2e`;
- card 5 adds `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace` and `scripts/sqlx-prepare.sh --check`.

Screenshots for every card:

- the real stack (axum + Postgres + `pnpm build`), light only (D21);
- 375×812, 1024×768, 1280×800 and 1440×900;
- seeded with five-digit amounts (≥ `R$ 12.345,67`, negatives where they can occur);
- saved to `docs/design/screens/SOL-72/<card>/`;
- every screenshot run calls `expectNoClipped(page)` from `web/e2e/clipped.ts` (card 1).

Agents:

- Every agent is told: graph first (`search_graph`, `get_code_snippet`); output through context-mode; caveman lite; ponytail; the model file to copy; this plan's card and the spec section. Each prompt ends with "Retorne dados brutos/síntese direta, sem preâmbulo nem narração".
- One agent at a time.

---

## Card 1 — Próximos meses in reais and Posso comprar isso? (`web`, opus)

Spec §1 and §2 (gaps 2.1, 2.2, 9.1, 9.2, 9.3). Shared pieces first: `formatWhole` and the e2e clip helper, which every later card uses.

Model files:

- `web/src/entities/forecast/months-ahead.ts:7-19` (`MonthAhead`, `monthsAhead`) and its test, for adding `low: string | null`;
- `entities/forecast/month-chips.tsx:7-60`, for the amount line, the `before` prop and the accessible name;
- `shared/lib/money.ts:14` `formatMoney` and its test, for `formatWhole(amount)` next to it;
- `features/add-transaction/simulation.tsx:16-27` (`dayName`, `verdictLine`) and `:84-89`;
- `features/add-transaction/transaction-sheet.tsx:415-443` (props) and `:505-515` (initial draft), for `initialSimulate`;
- `widgets/app-shell/app-shell.tsx:44-58` (sidebar groups) and `:198`, `:228-232` (Lançar state), with `app-shell.test.tsx`;
- `widgets/months-ahead/months-ahead.tsx:59-89`, for the title-row button;
- e2e `web/e2e/months-ahead.spec.ts:49` (the `scrollWidth` check), extracted into `web/e2e/clipped.ts`.

Steps:

1. `formatWhole` uses `Math.floor(cents / 100)` and pt-BR grouping. Write `clipped.ts` with `expectNoClipped(page)` (spec, last section).
2. Add `low` to `monthsAhead`, then the amount and the `before` prop in `MonthChips`.
3. Change the verdict to `fica no vermelho: {saldo}`.
4. Add `initialSimulate` and the two entry points (sidebar button, `Posso comprar?`).

Cases a naive build gets wrong:

- **Rounding.** `Math.round` or `toFixed(0)` shows `0` for −0,40 on a red chip. Floor the cents.
- **Floats.** `Number("1842.10")` drifts. Compare in cents with `cents()`, as `monthsAhead` already does.
- **Sidebar active state.** A `Link` makes the entry `aria-current` and navigates away. It must be a button that opens the shell's Lançar.
- **Sticky Simular.** Simular left on after the sheet closes makes the next FAB tap a simulation. Reset it on close.
- **Before/after alignment.** `before` must align by month string, not by array index: the after list can start at a different month when the draft starts later.
- **Neutral state.** It must still hide amounts.

Acceptance:

- Spec §1 and §2 acceptance.
- Screenshots:
  - Mês at the 4 widths with the Próximos meses chips (a red month with `-12.345`);
  - Lançar in Simular at 375 and 1440 with a 6× draft showing `antes`;
  - the sidebar entry at 1440.
- `expectNoClipped` passes on each.

Review: `qa` (opus) if the diff is over 200 lines. No `pixel` (no new token or component).

## Card 2 — Lançamentos filter, Lançar category row, series copy (`designer` then `web`, opus)

Spec §3, §4 and §5 (gaps 2.3, 7.1, 8.1, 8.2).

Model files:

- `web/src/widgets/ledger/ledger.tsx:149-275` (`visibleDays` at `:172`, the empty state at `:229`, the expand at `:270`) and `ledger.test.tsx`;
- `ToggleGroup` usage at `widgets/bills-of-month/bills-of-month.tsx:234-251`, for the filter;
- `mes/page.tsx:64-70` (`jump`), which must reset the filter;
- `entities/category/category-chips.tsx:20-77` and `category-select.tsx:18-58`; `CategorySelect` gets a link-style trigger for `Ver todas`;
- `shared/ui/category-icon.tsx`, for the 48 px circle;
- `entities/transaction/scope-radio.tsx:10-48` and `features/add-transaction/transaction-sheet.tsx:134-142` (resize note);
- e2e `mes.spec.ts`, `repeat.spec.ts:44`, `shell.spec.ts` (the pinned `Salvar`).

Steps:

1. `designer`, after invoking `frontend-design` and `ui-ux-pro-max`: the chip row in `category-chips.tsx` (radiogroup, check badge, `Ver todas`, the dashed `+`), with stories-as-tests.
2. `web`: the ranking hook (`useTransactions(todayISO().slice(0, 7))`), the ledger filter, and the series copy.

Cases a naive build gets wrong:

- **Day balance.** Recomputing the day balance from the filtered rows makes it wrong. It must stay the API's day balance.
- **Cap count.** `Ver o mês inteiro (n dias)` counting unfiltered days.
- **Jump target.** The red-day jump targets a day hidden by the filter. Reset to `Todos` first, inside the same `flushSync`.
- **Hidden choice.** A choice made in `Ver todas` disappears from the five chips, so the user sees nothing chosen.
- **Stale ranking.** Ranking by the viewed month (`?m=`) instead of the current month. Lançar opens from any page.
- **Exclusions.** Re-fetching categories without `useCategoryChips`' filters lets `Resgate` back into Entrada.
- **Pinned Salvar.** The row pushes `Salvar` below the fold at 375. The SOL-65 e2e must still pass.
- **Delete copy.** The scope lines on delete must not say "edita".

Acceptance:

- Spec §3–§5 acceptance.
- Screenshots:
  - Mês Lançamentos with `Contas` picked at the 4 widths;
  - Lançar at 375 and 1440 with the row (one five-digit amount typed);
  - the bill sheet at 375;
  - the series edit sheet at 375 showing the scope lines and `Remove os 6 últimos · termina em abr 2027`.

Review: `pixel` (sonnet) for the new chip row, then `qa` (opus) for a diff over 200 lines.

## Card 3 — Para onde vai by group (`web`, opus)

Spec §6 (gaps 3.1–3.5).

Model files:

- `web/src/widgets/category-breakdown/category-breakdown.tsx`:
  - `DeltaBadge` `:35-55`, widened to `{ delta_pct, kind }`;
  - `Donut` `:65-100`;
  - `LegendRow` `:102-124` becomes `GroupRow` plus child rows;
  - `TopFive` `:126-148`;
  - `CategoryEntries` `:152-187`;
  - the screen `:209-282`;
  - and `category-breakdown.test.tsx`;
- `widgets/spending-glance/spending-glance.tsx:26`, the only current reader of `report.groups`;
- `crates/soldi-types/src/reports.rs:29-48` (`CategoryGroup`), read only;
- `widgets/cofrinhos/cofrinhos.tsx:394-410`, for opening `TransactionSheet` with `initialCategory`;
- e2e `web/e2e/reports.spec.ts`.

Cases a naive build gets wrong:

- **Missing subcategory entries.** `useTransactions(month, group.category_id)` filters the exact id (`transactions/repo.rs:91`). Use the month's list, filtered by the group's ids.
- **Parent's own entries.** A parent with entries of its own plus children. Without the `(sem subcategoria)` row, the children do not add up to the group.
- **Nested buttons.** The chevron inside the row button is invalid HTML and breaks the keyboard. Make them two sibling buttons.
- **Client totals.** Summing the panel total in floats. Use the API amount.
- **Wrong kind.** `Adicionar lançamento em` must open with the category's kind; a hard-coded `daily` breaks it.
- **Stale selection.** Switching the tab must clear the selection (as today at `:236-239`).

Acceptance:

- Spec §6 acceptance.
- Screenshots of Para onde vai at the 4 widths:
  - collapsed;
  - Economia expanded and selected, with its panel;
  - a five-digit group amount.

Review: `qa` (opus) for a diff over 200 lines. No `pixel`.

## Card 4 — Cofrinhos actions and bars (`web`, opus)

Spec §7 (gaps 2.4, 5.1, 5.2).

Model files:

- `web/src/widgets/cofrinhos/cofrinhos.tsx`:
  - `Bar` `:46-60`, moved to `entities/cofrinho/cofrinho-bar.tsx`;
  - `CofrinhoCard` `:96-118`;
  - `CofrinhoDetail` `:176-236` (withdraw state `:177`);
  - the grid `:365`;
  - the sheets `:394-410`;
  - and `cofrinhos.test.tsx`;
- `widgets/cofrinhos-glance/cofrinhos-glance.tsx:57-80` and its test;
- e2e `web/e2e/cofrinhos.spec.ts`.

Cases a naive build gets wrong:

- **Overlay.** The open button's `after:absolute after:inset-0` overlay (`:105`) swallows clicks on the new buttons. Make them siblings with `relative z-10`.
- **Nesting.** Buttons inside the open button are invalid HTML.
- **FSD.** Importing `Bar` from `widgets/cofrinhos` into `widgets/cofrinhos-glance` is widget → widget. Move it to `entities`.
- **Withdraw state.** `Resgatar` must open the sheet with the withdraw form, and closing must reset it, or the next open starts on the form.
- **Count.** It must leave out `Sem objetivo`.
- **Zero balance.** A `Resgatar` shown at balance 0.

Acceptance:

- Spec §7 acceptance.
- Screenshots:
  - Cofrinhos at the 4 widths, with one cofrinho at `R$ 12.345,67 de R$ 50.000,00` and one at R$ 0,00;
  - the Mês glance with bars at 375 and 1440.

Review: none beyond the gate (no new token or component; `CofrinhoBar` is moved, not new).

## Card 5 — Economia do ano (`backend` then `web`, opus)

Spec §8 (gap 6.1). The only card with a contract change.

Model files, backend:

- `crates/soldi-server/src/reports/handler.rs:14-38`, for the route, `QueryParams`, utoipa responses and the 400/401/422 problems;
- `reports/service.rs:10-21` (with `months/service.rs:11-36` for reading settings and `crate::today_sao_paulo()` at `lib.rs:145`);
- `reports/repo.rs:9-32` and `months/repo.rs:46-63`, for the savings rule and the user-pinned joins;
- `reports/domain.rs:32-41` (`percent`) and its test module `:136-376`;
- `crates/soldi-types/src/reports.rs:8-27`, for money and percent serialization;
- `months/domain.rs:349-370` (`parse_month`, `month_end`), for bounds;
- `crates/soldi-server/tests/reports.rs:8-19` (seeding) and `:81-100` (error codes);
- `tests/months.rs`, for the cross-check against `/api/months/{m}`.

Model files, web:

- `web/src/entities/report/report-query.ts:14`, for `useSavingsYear(year)`;
- `shared/ui/month-switcher.tsx:37-75` (`Switcher`), which gains `atEnd`, and `month-switcher.test.tsx`;
- `widgets/cofrinhos-glance/cofrinhos-glance.tsx:18-80`, for a `DashCard` with its own query, skeleton and error;
- `widgets/category-breakdown/category-breakdown.tsx:35-55`, for a badge with an sr-only suffix;
- `app/(app)/(shell)/economia/page.tsx`;
- `widgets/month-header/month-header.tsx:25-45`, where `YearHeader` (unused) is deleted;
- e2e `cofrinhos.spec.ts`.

Steps:

1. `backend`: write the types, the pure `savings_year` domain with its unit tests, `savings_by_month`, the service and the handler. Then integration tests, `scripts/sqlx-prepare.sh`, and the `web/openapi.json` snapshot (`tests/openapi.rs`). Commit.
2. `web`: run `pnpm gen:api`, then the query, `atEnd`, `widgets/savings-year/savings-year.tsx`, and the page composition.

Cases a naive build gets wrong:

- **Income.** Counting resgates as income. They carry `cofrinho_id`; Mês leaves them out (`months/domain.rs:161`).
- **Saved.** Counting only cofrinho subcategories and missing `Economia` itself. Or forgetting to subtract resgates.
- **Opening date.** Starting the year at January 1 when the opening date is mid-year. Mês counts from the opening date (`months/service.rs:26`).
- **Future months.** Including months after today, which contradicts D16. Cutting today's month at today, which contradicts Mês: future-dated entries of the current month count.
- **N+1.** Twelve calls to `months::repo::saved`. One `GROUP BY` month.
- **Missing months.** Months with no entries vanishing. The domain fills them with zeros.
- **Rounding.** Not half-to-even, or not exactly one decimal. Reuse `reports::domain::percent`.
- **Isolation.** The join to `categories` without `c.user_id = t.user_id`.
- **Thresholds.** Dot boundaries at exactly 5.0 and 15.0 (amber), and rates as floats. Compare the API string as a decimal (`Number` is fine for a 1-decimal percent, but test the bounds).
- **Next year.** `Próximo ano` left enabled past the current year.

Acceptance:

- Spec §8.1 and §8.2 acceptance.
- `cargo llvm-cov` shows the new module ≥ 90%.
- Screenshots of Cofrinhos with Economia do ano at the 4 widths: seeded over the year with five-digit income (`R$ 64.482,80`) and a negative-saved month, then the previous year, then a fresh account.

Review:

- `qa` (opus): new contract, user isolation, money.
- `pixel` (sonnet): new widget with rate dots.

## Card 6 — Contas fixas summary and switch (`web`, opus)

Spec §9 (gaps 10.1–10.4).

Model files:

- `web/src/widgets/bill-list/bill-list.tsx:17-46` (`Rows`), `:50-126`, and `bill-list.test.tsx`;
- `widgets/bills-of-month/bills-of-month.tsx:33-45` (`whenDue`, `subtitleOf`), moved to `entities/month/schedule.ts` next to `nextDue` (`:13-14`);
- `features/edit-bill/edit-bill-sheet.tsx:120-135` (`Switch` and its copy) and `entities/bill/bill-queries.ts:49-56` (`useUpdateBill`);
- `entities/month/month-query.ts` (`useMonth`) and `shared/lib/percent.ts:15` (`wholeShare`);
- `shared/ui/dash-card.tsx`, for the two summary cards;
- `app/(app)/(shell)/ajustes/contas/page.tsx:7`.

Cases a naive build gets wrong:

- **Paused bills.** Summing paused bills into the total.
- **Wrong month.** Taking `Comprometem` income from the bill list, or from the viewed `?m=`. It is the current month's `totals.income`.
- **Nesting.** A `Switch` inside the row button: the toggle also opens the sheet, and the HTML is invalid. Make them siblings.
- **No revert.** Not reverting the switch on error, or not refreshing both lists (`refresh` already invalidates bills and months).
- **FSD.** Importing `whenDue` from a widget into another widget.
- **Overdue.** Showing an overdue bill as "next": `nextDue` keeps `due_date ≥ today`, so overdue bills read `Nada a vencer este mês` when nothing is ahead.

Acceptance:

- Spec §9 acceptance.
- Screenshots of Contas fixas at the 4 widths: seeded with a five-digit total, one paused bill, and income in the month; then with no income; then all paid.

Review: `qa` (opus) if the diff is over 200 lines. No `pixel`.

---

## Not planned

Everything under "Not built" in the README, each with its rule. In short:

- the split bar and moving the alert out of the hero (SOL-69);
- the bell, Soldi Pro, CDI yield, AI callouts, credit cards and fatura;
- weekly or yearly series (D14);
- recurring income (D16);
- auto-posting (D8);
- averages, targets, paces and "previsto" savings (D16);
- `Toda a série` from a middle member (D20).

Deferred to the owner: the Ajustes two-pane desktop layout, Categorias month totals and search.

## Ship

After each card's merge to `developer`, the orchestrating session:

- bumps the minor version in `Cargo.toml`, `web/package.json` and `CHANGELOG.md`;
- opens the PR `developer` → `main`, merged when CI is green, and tags it;
- moves the card to Done with a comment.

The epic closes when card 6 ships.
