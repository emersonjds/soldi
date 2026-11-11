# SOL-79 plan — Stitch v3, faithfully

- Spec: `docs/specs/2026-11-11-stitch-fidelity.md` (§ numbers below).
- Diff with evidence: `docs/design/stitch-v3/FIDELITY.md` (item numbers below).
- Decisions: D24 (fidelity by default) and D25 (a card with no content does not render).

Thirteen sequential cards, in the order the owner sees the screens. Shared primitives come first: the top-bar tier pill, the page hero, the banner, the hero split, the Pagar pill and status badge, and the month grid. Phase 2 lists the needs-data cards, which wait for the owner.

Each card:

- is shippable alone and is about one session;
- gets its own santi card under SOL-79, its own branch from `developer` (`feat/SOL-<n>-<summary>`) and its own session;
- is TDD (`tdd` skill: the slice's tests in one red run, then one green run, both reported);
- commits on green;
- is mobile first (375, then 1024, 1280, 1440);
- deletes what it replaces in the same card: no parallel component and no dead copy;
- applies D25 to every card it touches.

Gate for every card:

- `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` (> 90% on 4 metrics), `pnpm build`, `pnpm e2e`;
- cards with backend add `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace` and `scripts/sqlx-prepare.sh --check`.

Screenshots for every card (spec §13):

- the real stack (axum + Postgres + `pnpm build`), light only;
- 375×812, 1024×768, 1280×800 and 1440×900;
- five-digit amounts (≥ `R$ 12.345,67`), negatives where they can occur;
- saved to `docs/design/screens/SOL-79/<card>/`;
- `expectNoClipped(page)` (`web/e2e/clipped.ts`) on each.

Fidelity check for every card:

- a side-by-side of each Stitch frame it touches against the real screen: 1440 for desktop frames, 390 for mobile frames;
- `pixel` (sonnet) walks the frame's FIDELITY rows and marks each B row done or names the deviation;
- an unlisted deviation is a finding, fixed on the same branch.

Review:

- `qa` (opus) when the card changes a contract or the diff is over 200 lines;
- the fidelity check above, always.

Agents:

- Every prompt carries the absolute path and the branch, the `tdd` skill, caveman lite and ponytail. It names the graph (`search_graph`, `get_code_snippet`), context-mode for all output, this card, the spec section, and the model files below.
- Each prompt ends with "Retorne dados brutos/síntese direta, sem preâmbulo nem narração".
- One agent at a time.

---

## Card 1 — Shell: top bar, app bar, tab bar, page hero (`web`, opus)

Spec §1. FIDELITY 0.1, 0.3–0.6, 0.8–0.10. This card lands the shared primitives the screens use: the tier pill in the top bar and the page hero band.

Model files:

- `web/src/widgets/app-shell/app-shell.tsx`:
  - `NAV` `:35-40`, `SIDEBAR` `:44-58`, `MONTH_PAGES` `:62`, `ShellMonthSwitcher` `:65-77`, `TabLink` `:79-91`, `TodayLink` `:93-101`;
  - footer `:164-186`, header `:191-218`, tab bar `:225-243`;
  - and `app-shell.test.tsx`;
- `shared/ui/tier-pill.tsx:21-43` (`TierPill`) and `entities/month/month-query.ts` (`useMonth`), for the top-bar pill on today's month;
- `shared/ui/month-switcher.tsx:17-75` (`TONE.hero` / `surface`, `Switcher`);
- `widgets/month-header/month-header.tsx:5-23` (`CompactHeader`), extended to `PageHero({ eyebrow, title, children })` and reused by Para onde vai and Economia;
- `shared/lib/date.ts` (`todayISO`), for today's month;
- e2e `web/e2e/shell.spec.ts`.

Steps:

1. Write the tests for the top bar (pill, avatar, switcher on every page, no title) and the footer, then make them pass.
2. Mobile app bar and tab bar with the centered `+`.
3. `PageHero` in `month-header.tsx`. Pages adopt it in their own cards; the Mês hero takes the greeting in card 2.

Cases a naive build gets wrong:

- **Wrong month for the pill.** Reading the viewed month (`?m=`) shows another month's tier. Use today's month, whatever is viewed.
- **Query on every page.** A second `useMonth` instance with another key refetches. Use the same query key as Mês, so the cache is shared.
- **Pill flash.** A skeleton or `Crítico` default while loading. Render nothing until data arrives.
- **Switcher reset.** Moving from Mês to Contas fixas must keep `?m=`. `ShellMonthSwitcher` already does this for month pages; widen it to every shell page, not by copying it.
- **FAB inside the grid.** The raised `+` must stay a `button` that opens the shell's Lançar, not a tab `Link` with `aria-current`.
- **Safe area.** The full-width bar must pad `env(safe-area-inset-bottom)`, and `--tabbar-space` must grow so the last card is not covered.
- **Sign-out lost.** Remove the footer button only together with card 12's `Sair da conta`. Until then keep a sign-out reachable: Minha conta already has it.

Acceptance:

- Spec §1 acceptance.
- Screenshots: Mês and Contas fixas at the 4 widths (the pill, the switcher and the avatar at ≥ 1024; the app bar and tab bar at 375).
- Side-by-side: `mes-dashboard-desktop` top bar and sidebar at 1440; `mes-mobile-home` app bar and tab bar at 390.

Review: `qa` (diff > 200 lines likely), plus the fidelity check.

## Card 2 — Mês hero, banner, split, Termômetro, flow layout and D25 (`web`, opus)

Spec §2.1–§2.5 and the D25 rule for every Mês card. FIDELITY 1.1–1.7, 1.21–1.24, 1.32, 2.1, 2.5, 2.8–2.10.

Model files:

- `web/src/app/(app)/(shell)/mes/page.tsx:30-163`: the pinned grid `:86-148` becomes two flow stacks; skeletons `:100-105`, `:119`, `:135`;
- `widgets/month-overview/month-overview.tsx`:
  - `MonthSummary` `:64-111`, `MonthHero` `:113-145`, `Insight` `:147-169`, `ThermometerCard` `:171-187`, skeletons `:192-212`;
  - and `month-overview.test.tsx`;
- `shared/ui/split-bar.tsx:1-67` (unused since SOL-69; reuse, and change the legend to one-decimal `formatPct` from `shared/lib/percent.ts:8`);
- `docs/specs/2026-11-10-dashboard-redesign.md` §2.1 (segment rules and the worked example);
- `widgets/red-day-alert/red-day-alert.tsx:8-34` (becomes the banner) and `entities/month/forecast-alert.ts:13-60` (`forecastAlert`, `causeOf`), with their tests;
- `shared/ui/thermometer-strip.tsx:5`, for the `Você está aqui:` marker;
- `shared/lib/percent.ts:15` (`wholeShare`);
- e2e `web/e2e/mes.spec.ts` and `forecast.spec.ts`.

Steps:

1. D25 and layout:
   - each Mês card gets its content predicate, with tests for absent and present;
   - the page drops pinned rows for two stacks at ≥ 1280, a stack plus a 2-column rail grid at 1024–1279, and one column below;
   - the fresh-account test.
2. Hero: the desktop white card with the Projetado box and the split; the mobile indigo hero with the greeting and switcher (moved from card 1's app bar); `MonthSummary` < 1024 only.
3. Banner: the pure `topOutflows(date, …)` in `forecast-alert.ts`, the banner copy, and the deletion of the `Pior dia` line.
4. Termômetro: header percent, box, marker, the two insight lines; delete `Guardou …`.

Cases a naive build gets wrong:

- **Holes.** Hiding a card inside the pinned `xl:row-start-*` grid leaves a gap. Delete the pinning; flow stacks only.
- **Odd rail at 1024.** Three visible rail cards in 2 columns leave a half row. The last odd card spans both.
- **Flash then vanish.** A `RowsSkeleton` for a card that turns out empty. Only the hero has a skeleton.
- **Errors hidden.** A failed query is not "no content". Keep `PageError`.
- **Split base.** Using `income` when overspent. When `performance < 0`, the base is `bills + daily` and there is no Livre (§2.1). Sum in cents.
- **Split shares.** `Math.round` to whole numbers. One decimal, half-to-even, through `formatPct`.
- **Two summaries.** Rendering `MonthSummary` at ≥ 1024 next to the Termômetro box. It is < 1024 only.
- **Termômetro on a fresh month.** It shows a tier with zeros. Hide it when income and outflow are 0.
- **Ritmo copy.** Any "ritmo" string is a D16 breach; a test greps the rendered text.
- **Banner causes.** Counting paid bills or entries of other days, or summing floats. Only open bills landing on that day and outflow entries dated on it, by cents.
- **Jump after layout change.** The banner moved out of the hero; `jump` must still reset the ledger filter and expand, inside `flushSync` (`mes/page.tsx:75-84`).

Acceptance:

- Spec §2 acceptance for the hero, banner, split, Termômetro, layout and D25.
- Tests: a fresh account renders only the `Saldo hoje` region, at each layout; each card is present only with its data.
- Screenshots at the 4 widths:
  - a fresh account (hero only);
  - a seeded month with a red day, five-digit income, an overspent variant.
- Side-by-side: `mes-dashboard-desktop` at 1440 (hero, banner, Termômetro); `mes-mobile-home` at 390 (hero, Termômetro).

Review: `qa` (> 200 lines), plus the fidelity check.

## Card 3 — Contas a pagar / Contas do Mês: Pagar pill and status badge (`web`, opus)

Spec §2.6. FIDELITY 1.8–1.12, 2.6, 2.7.

Model files:

- `web/src/widgets/bills-of-month/bills-of-month.tsx`:
  - `FILTERS` `:27-31` (deleted), `unpaidLabel` `:36-40`, `carriedFrom` `:42-43`, `Status` `:45-58`, `RoundCheck` `:60-95`, `Row` `:96-148`;
  - the card `:156-297`;
  - and `bills-of-month.test.tsx`;
- the new `entities/bill/bill-status.tsx` holds the `Pagar` pill and the `Pago` / `Vencido` badges, built from `Status` `:45-58`; card 10 reuses the badge style;
- `entities/month/schedule.ts` (`nextDue`, `whenDue`), for `Próxima` and the captions;
- `entities/transaction/transaction-queries.ts:22` `useTransactions(month)`, for the paid date behind `Pago no prazo`;
- `shared/ui/category-icon.tsx`, for the tinted (desktop) and solid (mobile) circles;
- e2e `web/e2e/bills.spec.ts`.

Cases a naive build gets wrong:

- **Pill and check disagree.** The `Pagar` pill must call the same `payNow` as the check, with the same undo toast.
- **Nested buttons.** Pill and amount inside the row button. They are siblings.
- **Paid on time.** Comparing the bill's `due_date` with today instead of the paying entry's date.
- **Carried bills (D17).** Using `lands_on` for `Atrasada desde`. It is the original `due_date`.
- **Mobile undo.** With no check at < 1024, `✓ Pago` must undo (`aria-pressed`). Otherwise a payment cannot be reverted after the toast.
- **Filter state.** Removing the filter UI but leaving its state, so a stale `Pagas` hides rows.
- **Plural.** `1 obrigação cadastrada`.

Acceptance:

- Spec §2.6 acceptance.
- Screenshots at the 4 widths with a paid bill on time, a paid bill late, an open bill, an overdue bill and a carried bill, each five-digit.
- Side-by-side: `mes-dashboard-desktop` (Contas a pagar) at 1440; `mes-mobile-home` (Contas do Mês) at 390.

Review: the fidelity check; `qa` if > 200 lines.

## Card 4 — Lançamentos, the month grid, and the two glances (`web`, opus)

Spec §2.7–§2.10. FIDELITY 1.14–1.18, 1.25–1.30. The month grid is the shared primitive that card 13 reuses.

Model files:

- `web/src/widgets/ledger/ledger.tsx`:
  - `KIND_LABEL` `:32`, `dayLabel` `:34-43`, `isForecast` `:81`, `DueRow` `:90-109`, `Row` `:111-140`, `FILTERS` `:142-146`;
  - the card `:169-378` (filter `:252-270`, day header `:293`, expand `:321`);
  - and `ledger.test.tsx`;
- `widgets/months-ahead/months-ahead.tsx:14-105` (`HORIZONS` and the toggle, deleted) and `entities/forecast/month-chips.tsx:7-113` (`reds` badge `:9`, deleted), with `month-chips.test.tsx`; `MonthChips` becomes the 4-column month grid;
- `entities/forecast/months-ahead.ts:7-19` (`low`, `flat`);
- `widgets/cofrinhos-glance/cofrinhos-glance.tsx:15-88` and `entities/cofrinho/cofrinho-bar.tsx`;
- `widgets/spending-glance/spending-glance.tsx:12-67`;
- `shared/ui/dash-card.tsx:9-45`, for the icon in the title and the `→` link;
- `shared/lib/money.ts:78` (`formatWhole`);
- e2e `mes.spec.ts`, `months-ahead.spec.ts`.

Cases a naive build gets wrong:

- **Signs from kind.** Deriving `-` from `kind === "bill"` misses resgates (income-like) and Economia deposits. Sign by whether the entry adds to or takes from the balance, as the day balance does.
- **Day balance.** It stays the API's, never recomputed from filtered rows.
- **`Ver o mês inteiro` without a count.** The cap logic stays; only the label changes.
- **Year in the short label.** `Jan` alone hides the year. The accessible name carries it.
- **D22.** Removing the tier word makes color the only signal. Keep it at 11 px (spec §2.8).
- **Twelve always.** The horizon state and its query param go too, not just the toggle UI.
- **Glance percent.** One decimal from the report's `pct`, not recomputed in floats.

Acceptance:

- Spec §2.7–§2.10 acceptance.
- Screenshots at the 4 widths with a month of five-digit entries, a series, a future band, 12 months with a red one, two cofrinhos and four groups.
- Side-by-side: `mes-dashboard-desktop` (Lançamentos and the rail) at 1440.

Review: the fidelity check; `qa` if > 200 lines.

## Card 5 — Lançar (`designer` then `web`, opus)

Spec §3. FIDELITY 8.1–8.8, 9.1, 9.2, 9.4–9.7, 9.9–9.13.

Model files:

- `web/src/features/add-transaction/transaction-sheet.tsx`:
  - `KINDS` `:41-43`, `PRESETS` `:46`, the form `:80-425` (date `:249`, Repetir `:278`, Parcelar `:294`, presets `:322`, summary `:348-357`, Transformar `:372-378`, Observação `:387-393`, Salvar `:422`);
  - the sheet `:453-569` (title `:549-550`);
  - and its tests;
- `entities/category/category-chips.tsx:20-184` (`ROW` `:21`, `ranked` `:43-53`, `Nova` `:160-167`, deleted) and `category-select.tsx`, for `Ver todas` and `Sub:`;
- `shared/ui/date-chips.tsx:10-51` (it has `Ontem`; add the `Hoje ({d mmm})` label and `Outra data`);
- `shared/ui/amount-input.tsx:24` (`inputMode`) and `shared/ui/money.tsx:17`, for the lighter cents;
- `components/ui/kbd.tsx`, for the Enter hint;
- `crates/soldi-server/src/transactions/domain.rs:328`, read only, for the R9 remainder the residual line must mirror;
- e2e `repeat.spec.ts`, `shell.spec.ts` (pinned save), `simulate.spec.ts` (still passes; Simular leaves in card 13).

Steps:

1. `designer`, after invoking `frontend-design` and `ui-ux-pro-max`: the keypad (`shared/ui/amount-keypad.tsx`) and the scrolling chip row with `Sub:`, with stories-as-tests.
2. `web`: header and kind copy, amount label, dates, note row, Repetir / Parcelar copy, footer.

Cases a naive build gets wrong:

- **Keypad and the system keyboard.** Both open. Use `inputMode="none"` only while the keypad shows, and keep paste and hardware keys.
- **Decimal comma.** The keypad's `,` goes through `maskAmount`, never `parseFloat`.
- **Pinned save at 375.** The keypad pushes `Salvar Lançamento` off screen; the SOL-65 e2e must pass.
- **Residual line.** Computing the last installment in floats, or splitting the remainder evenly. Truncate each to cents; the remainder goes on the last.
- **Sub row and `Ver todas`.** A child picked in `Ver todas` must select its parent circle and its `Sub:` pill.
- **Kind word leak.** Renaming `bill` to `Conta` in the shared `KIND_LABEL` changes the ledger pill. The ledger keeps `Saída`.
- **Enter.** Enter in the note field must not submit.

Acceptance:

- Spec §3 acceptance.
- Screenshots: Lançar at the 4 widths, with `R$ 12.345,67`, a parent with `Sub:`, Repetir 12× and Parcelar 10× with a residual.
- Side-by-side: `lancar-modal-desktop` at 1440; `lancar-bottom-sheet-mobile` at 390.

Review: `pixel` (new keypad and chip row), then `qa` (> 200 lines), plus the fidelity check.

## Card 6 — Editar série (`web`, opus)

Spec §4. FIDELITY 10.1–10.6, 10.8–10.14.

Model files:

- `web/src/entities/transaction/scope-radio.tsx:10-69` and its test;
- `features/add-transaction/transaction-sheet.tsx`:
  - `dayHelper` `:117-121`, `monthsLabel` `:123-125`, the resize note `:134-142`, `Aplicar em` `:401`, toasts `:476-490`;
- `widgets/ledger/ledger.tsx:208-240` (edit and delete with scope);
- e2e `repeat.spec.ts:44`.

Cases a naive build gets wrong:

- **k off by one.** `As outras {k} parcelas futuras` is `total − pos`, not `total − 1`.
- **Delete copy.** The delete lines must not say `alterada`.
- **Member 1.** It shows `Toda a série ({total} lançamentos)` and not `Este e os próximos`. The third scope from the middle is P2, not this card.
- **Ciclo Atual.** It resets to the current total, not to 12.
- **Economy line.** It applies to outflow series only; for an income series, shortening loses money.
- **Order.** Moving `Escopo` to the top must keep the form's single submit and the focus order.

Acceptance:

- Spec §4 acceptance.
- Screenshots of the series sheet at the 4 widths (member 3 of 12, shortened to 6, day moved), and in delete mode.
- Side-by-side: `editar-serie-modal-desktop` at 1440.

Review: the fidelity check; `qa` if > 200 lines.

## Card 7 — Para onde vai (`web`, opus)

Spec §5. FIDELITY 3.1–3.6, 3.8–3.16, 4.1, 4.2, 4.4–4.8.

Model files:

- `web/src/widgets/category-breakdown/category-breakdown.tsx`:
  - `COPY` `:36-48` (the `income` tab deleted), `DeltaBadge` `:55-83`, `Donut` `:85-134`, `GroupRow` `:136-205`, `TopFive` `:207-243`, `CategoryEntries` `:245-309`, the screen `:331-428`;
  - and its tests;
- `app/(app)/(shell)/para-onde-vai/page.tsx:11-28`, and card 1's `PageHero`;
- `crates/soldi-types/src/reports.rs:12-61` (`CategoryShare`, `CategoryGroup`, `CategoryReport`), read only;
- `components/ui/select.tsx`, for `Todas as Categorias` and `Todas as subcategorias`;
- `shared/lib/percent.ts:8-15`;
- e2e `reports.spec.ts`.

Cases a naive build gets wrong:

- **Top 5 by leaf.** Stitch's Top 5 is by group.
- **Panel total.** Summing floats, or counting last month's reference rows. The total and count are this month's, from cents.
- **Subcategory filter.** Filtering by exact `category_id` drops the parent's own entries under `Todas as subcategorias`.
- **Reference month.** At January, the previous month is December of the year before.
- **CSV.** A `.` decimal or `,` separator breaks pt-BR spreadsheets. Use `;`, a comma decimal, and a BOM.
- **Two pick sources.** The select and a row tap must share one state; the select shows the picked group.
- **Entradas switch.** It is deleted with its state, query param and tests.

Acceptance:

- Spec §5 acceptance.
- Screenshots at the 4 widths: nothing picked; Mercado-like group picked and expanded with a subcategory filter; an empty month.
- Side-by-side: `para-onde-vai-analytics-desktop` at 1440; `para-onde-vai-mobile-analytics` at 390.

Review: `qa` (> 200 lines), plus the fidelity check.

## Card 8 — Cofrinhos (`backend` then `web`, opus)

Spec §6. FIDELITY 5.1–5.8, 5.12, 5.14, 5.15, 5.17, plus the computable D rows 5.5d, 5.9 and 5.10.

Model files, backend:

- `crates/soldi-server/src/cofrinhos/handler.rs:19-80` (`list_cofrinhos`, `list_movements`; add `month` to the list query);
- `cofrinhos/repo.rs:14-50` (the user-pinned joins at `:20-24`, `:42-45`);
- `transactions/repo.rs` `movements` (the parent includes children);
- `crates/soldi-types/src/cofrinhos.rs:13-44` (`Cofrinho` gains `next_contribution`);
- `months/domain.rs` (`parse_month`) and `crate::today_sao_paulo()`;
- `tests/cofrinhos.rs` and `tests/openapi.rs`.

Model files, web:

- `web/src/widgets/cofrinhos/cofrinhos.tsx`:
  - `useGoalCaption` `:36-47`, `Balance` `:48-68`, `Status` `:69-88`, `CardActions` `:90-122`, `CofrinhoCard` `:124-148`, `Movements` `:150-203`, `CofrinhoDetail` `:207-272`, `Total` `:274-297`, the view `:323-483` (grid `:407`, h1 `:444`);
  - and its tests;
- `features/withdraw-cofrinho/withdraw-form.tsx`, for the picker;
- `components/ui/dropdown-menu.tsx`, for `⋮` and the filter;
- e2e `cofrinhos.spec.ts`.

Steps:

1. `backend`: `?month=`, `next_contribution` (one `DISTINCT ON` query), parent movements. Then tests, `scripts/sqlx-prepare.sh` and the OpenAPI snapshot. Commit.
2. `web`: run `pnpm gen:api`, then header, hero, Meta Global, grid controls, cards, Reserva Livre, the create tile, first use.

Cases a naive build gets wrong:

- **Isolation.** `next_contribution` joined without `t.user_id = $1` and `c.user_id = t.user_id` leaks another user's series.
- **N+1.** A query per cofrinho for its next member.
- **Past members.** Taking a series member dated today or earlier. It must be after today, on the São Paulo day.
- **Foco atual ties.** Two cofrinhos with the same nearest deadline: one badge, the earliest created.
- **Meta Global.** Summing every balance, including cofrinhos without a target.
- **Resgatar at zero.** A disabled `Resgatar` must not open an empty picker.
- **Overlay.** The shipped stretched open-button pattern (`after:inset-0`) swallows `⋮`. It is removed with the chevron.

Acceptance:

- Spec §6 acceptance.
- `cargo llvm-cov` keeps the cofrinhos module ≥ 90%.
- Screenshots at the 4 widths: a goal at `R$ 12.345,67 de R$ 50.000,00` with a series, one met, one empty with a deadline, Reserva Livre, and first use.
- Side-by-side: `cofrinhos-metas-desktop` at 1440.

Review: `qa` (contract, user isolation), plus the fidelity check.

## Card 9 — Economia do ano (`backend` then `web`, opus)

Spec §7. FIDELITY 6.1, 6.2, 6.4, 6.5, 6.9, 6.11–6.14, 6.16, 6.18, 6.20, 6.21, 7.1, 7.2, 7.5–7.7, plus the computable D row 6.17.

Model files, backend:

- `crates/soldi-server/src/reports/domain.rs:63-72` (`year_range`, extended to December with a `forecast` flag) and `:92` (`months.push`), with the tests at `:475-490` and `:564`;
- `reports/handler.rs:47` and `crates/soldi-types/src/reports.rs:68-91` (`SavingsMonth` gains `forecast`);
- `tests/reports.rs` and `tests/openapi.rs`.

Model files, web:

- `web/src/widgets/savings-year/savings-year.tsx:20-148` (`LEVELS` `:22-34`, `MonthRow` `:45-85`, the card `:87-148`) and its tests;
- card 1's `PageHero`, with the year switcher `shared/ui/month-switcher.tsx:38`;
- `components/ui/table.tsx`, for the desktop table;
- card 7's CSV helper;
- e2e `cofrinhos.spec.ts`.

Cases a naive build gets wrong:

- **Totals with the future.** `saved_total` must still stop at today's month.
- **Forecast is entered data.** No average or extrapolation (D16): future months hold only entries already dated there.
- **Ascending vs newest first.** The table is ascending at ≥ 1024; the mobile list stays newest first.
- **Consistência run.** Counting all positive months instead of the run that ends at today's or last month.
- **`Fecha hoje`.** The last day of the month says `Fecha hoje`, not `fechamento em 0 dias`.
- **Pencil link.** It must open Para onde vai on that month with the Economia group picked (`g=`), which card 7's state must accept.

Acceptance:

- Spec §7 acceptance.
- Screenshots at the 4 widths: the current year seeded with five-digit income, a negative month and a future December, the previous year, and a fresh account (no section).
- Side-by-side: `economia-anual-desktop` at 1440; `economia-mobile-anual` at 390.

Review: `qa` (contract), plus the fidelity check.

## Card 10 — Contas fixas (`web`, opus)

Spec §8. FIDELITY 12.1–12.6, 12.8–12.13, 12.15, 12.16.

Model files:

- `web/src/widgets/bill-list/bill-list.tsx`:
  - `Rows` `:25-76`, `NextDue` `:78-100`, `Summary` `:102-131`, the view `:133-272` (pause and archive toasts `:150-215`);
  - and its tests;
- `features/edit-bill/edit-bill-sheet.tsx:28-214` (`BillForm` `:28-161`, the sheet `:180-214`): the form is extracted to render in the side panel too;
- `app/(app)/(shell)/ajustes/contas/page.tsx:6-14` and `components/ui/breadcrumb.tsx`;
- card 3's `entities/bill/bill-status.tsx`, for the `Pausada` badge style;
- `components/ui/tabs.tsx`, `select.tsx`, `table.tsx`;
- e2e `bills.spec.ts`.

Cases a naive build gets wrong:

- **Paused in the total.** The total and `{n} contas` count active bills only.
- **Month of `Compromete`.** It is the switcher month's income, not the bill list's.
- **Two filters.** Tabs and `Status:` hold one state; with separate states they drift.
- **Two forms.** Copying the sheet form into the panel. Extract one form and render it in both.
- **Edit in panel.** `Descartar alterações` while editing reloads the bill; it does not clear to a new one.
- **Sort with paused.** Paused rows go after active ones under `Todas`, whatever the sort.

Acceptance:

- Spec §8 acceptance.
- Screenshots at the 4 widths: seeded with a five-digit total, one paused bill and income; no income; first use.
- Side-by-side: `contas-fixas-desktop` at 1440.

Review: `qa` (> 200 lines), plus the fidelity check.

## Card 11 — Categorias (`web`, opus)

Spec §9. FIDELITY 13.1–13.6, 13.8–13.13.

Model files:

- `web/src/widgets/category-list/category-list.tsx:23-254` (`KIND_LABELS` `:26-28`, `kindParam` `:32`, `RowActions` `:52-85`, the list `:87-200`, header `:214-219`) and its tests;
- `entities/category/category-sheet.tsx:27-411`:
  - the palette names `:31-55`, `freeColor` `:62`, `CategoryForm` `:102-310`, the sheet `:339-411`;
  - the form is extracted for the side panel;
- `entities/category/icon-picker.tsx`;
- `entities/report/report-query.ts:14` `useCategoryReport(month)` and `entities/transaction/transaction-queries.ts:22` `useTransactions(month)`, for totals and `lanç.` counts;
- card 10's breadcrumb;
- e2e `categories.spec.ts`.

Cases a naive build gets wrong:

- **Accent search.** `includes` without normalizing misses `Saúde` for `saude`. Use `normalize("NFD")`.
- **Totals for empty categories.** The report omits them; show `R$ 0,00`, do not hide the row.
- **Counts across months.** `lanç.` counts the switcher month only.
- **Colors (D15).** Offering a taken color. Free tokens of the kind only; a subcategory has no color picker.
- **Savings parent.** `+ Adicionar cofrinho` keeps target and deadline.
- **Tab order.** It changes to daily, bill, income; `?tipo=` keeps its values.

Acceptance:

- Spec §9 acceptance.
- Screenshots at the 4 widths: the daily tab seeded with five-digit totals; a search with no match; the side form in Subcategoria mode at 1440.
- Side-by-side: `categorias-desktop` at 1440.

Review: `qa` (> 200 lines), plus the fidelity check.

## Card 12 — Ajustes (`web`, opus)

Spec §10. FIDELITY 14.1, 14.3, 14.5–14.15, 14.17.

Model files:

- `web/src/app/(app)/(shell)/ajustes/page.tsx:20-98` (groups `:24-48`, `Row` `:64-77`) and the subpages `termometro`, `moeda`, `saldo-inicial`, `apagar`, `conta` (each becomes a section and a redirect);
- `features/edit-settings/thermometer-form.tsx:20-100` (labels `:20-23`, preview `:59`);
- `features/edit-settings/currency-form.tsx` and `shared/ui/currency-picker.tsx`;
- `features/edit-settings/opening-form.tsx:17-74`;
- `features/delete-entries/delete-entries-form.tsx:29-216` (`WORD` `:37`, `Preview` `:53-67`);
- `features/edit-account/profile-form.tsx`, `password-form.tsx`, `features/delete-account/delete-account-button.tsx`, `features/sign-out/sign-out-button.tsx`, `sign-out-everywhere-button.tsx`;
- `crates/soldi-server/src/settings` defaults (D9), read only, for `Restaurar Padrões`;
- e2e `delete-entries.spec.ts`, `account.spec.ts`, `currency.spec.ts`.

Cases a naive build gets wrong:

- **Deep links.** `/ajustes/termometro` must land on `#termometro`. The static export has no server redirects: use a client `router.replace`.
- **Restaurar saves.** It writes the draft only; `Salvar Novos Limites` saves.
- **Scale marker.** It uses today's balance under the draft bounds, not the saved ones.
- **Delete month.** It is the switcher month; `Mês atual` only when it is today's month.
- **`CONFIRMAR`.** It is an exact match: no trim, no case folding.
- **Blur save.** It must not save an unchanged or invalid opening balance, and the undo restores both amount and date.
- **Sign-out.** With card 1's footer button gone, `Sair da conta (Logout)` is the only one. Its e2e must find it.

Acceptance:

- Spec §10 acceptance.
- Screenshots at the 4 widths, each section in view, plus the delete box typed.
- Side-by-side: `ajustes-desktop` at 1440.

Review: `qa` (> 200 lines; the account deletion path), plus the fidelity check.

## Card 13 — Posso comprar isso? (`web`, opus)

Spec §11. FIDELITY 11.1, 11.2, 11.5–11.10, 11.11–11.15, 11.17–11.20.

Model files:

- `web/src/features/add-transaction/simulation.tsx:16-105` (`dayName`, `verdictLine` `:25-43`, `Simulation`) and its tests; the math moves to `entities/forecast/` so the page and nothing else uses it;
- `transaction-sheet.tsx:185-205` (the Simular switch), `:438` (`initialSimulate`), and `mes/page.tsx:39`, `:48-51`, `:138`, `:157` (`simulating`), all deleted;
- `entities/forecast/forecast-query.ts`, `months-ahead.ts`, and card 4's month grid;
- `app-shell.tsx:151-156` (the sidebar button becomes a `Link`);
- `components/ui/chart.tsx` (recharts), for the curve;
- the Lançar amount and chips from card 5;
- e2e `simulate.spec.ts`, rewritten for the page.

Cases a naive build gets wrong:

- **Month-end vs lowest.** The cards show month-ends; the verdict and the tier use the lowest day (D23). Mixing them makes a red card with a positive verdict.
- **Floats in installments.** Use R9 cents, and the same split Lançar would create.
- **Stale results.** Results must hide when an input changes after `Calcular Projeção`.
- **Already red.** A month red without the purchase is not "fica no vermelho".
- **Leftover Simular.** Any `initialSimulate` or `onSimulate` left behind (grep).
- **Chart a11y.** The chart is `aria-hidden`, and the month cards are the accessible data.

Acceptance:

- Spec §11 acceptance.
- Screenshots at the 4 widths: a red 6× `R$ 12.345,67` draft, a fitting draft, and the empty form.
- Side-by-side: `posso-comprar-isso-simulador-desktop` at 1440.

Review: `qa` (> 200 lines), plus the fidelity check.

---

## Phase 2 — needs data, owner gate

Spec §12, P1–P12. None starts without the owner's yes. Each becomes one card: `backend` (migration, `user_id` filter, OpenAPI, `qa`) and then `web`, using its spec section.

| Id | Card | Backend |
|---|---|---|
| P1 | Semanal / Anual series (reverses D14) | yes |
| P2 | `Toda a série` from any member (reverses D20) | yes |
| P3 | `Lançamento Automático` for bills | yes (column + daily job) |
| P4 | Cofrinho note | yes |
| P5 | `Meta Anual` | yes |
| P6 | Month notes | yes |
| P7 | Payment method (recommend dropping) | yes |
| P8 | `Ver histórico anual` per category | yes (computable) |
| P9 | `Personalizar` the chip row | yes |
| P10 | Simulation `Histórico` | no (`localStorage`) |
| P11 | E-mail `Verificado` | yes |
| P12 | Liquidity and sync lines (recommend dropping) | — |

## Ship

After each card's merge to `developer`, the orchestrating session:

- bumps the minor version in `Cargo.toml`, `web/package.json` and `CHANGELOG.md`;
- opens the PR `developer` → `main`, merged when CI is green, and tags it;
- moves the card to Done with a comment.

The epic closes when card 13 ships. Phase 2 cards close on their own.
