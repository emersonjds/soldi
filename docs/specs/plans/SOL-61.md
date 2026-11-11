# SOL-61 plan — dashboard redesign

Spec: `docs/specs/2026-11-10-dashboard-redesign.md` (cards C1–C7, navigation, tokens, states, copy) and D21. Five cards, in order. Each card:

- is shippable alone;
- gets its own branch from `developer` (`feat/SOL-<n>-<summary>`) and its own session;
- is TDD (one red run, then one green run, both reported);
- commits on green;
- is mobile first: 375 before 1440.

Gate for every card: `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` (> 90% on 4 metrics), `pnpm build`, `pnpm e2e`. Screenshots are light only (D21): 375×812 and 1440×900, saved to `docs/design/audit/<date>/screenshots/` on the card's branch.

There is no backend work in any card. If a card finds it needs a field, it stops and goes back to `architect`.

## Card 1 — Shell and primitives (`designer` then `web`, opus)

The pieces every other card uses, plus the desktop shell.

Model files:

- `web/src/shared/ui/money.tsx` and `money.test.tsx`, for the size prop;
- `shared/ui/thermometer-strip.tsx` and `thermometer.test.tsx`, for the split bar (segments with labels);
- `components/ui/card.tsx`, composed by `DashCard`;
- `Switcher` and its month helpers at `widgets/month-header/month-header.tsx:10-80`, extracted to `MonthSwitcher` (`YearHeader` keeps using the shared `Switcher`);
- `widgets/app-shell/app-shell.tsx` and `app-shell.test.tsx`, for the sidebar and the top bar;
- `styles/presets/soldi.css`, for the token.

1. `designer`, after invoking `frontend-design`, `ui-ux-pro-max` and `dataviz`:
   - `--split-daily: #0891B2` in the preset;
   - `Money` gets `size="row" | "figure" | "hero"` (spec §4.2, using `formatToParts`);
   - `shared/ui/dash-card.tsx`;
   - `shared/ui/split-bar.tsx`: segments, the legend, `role="img"` and its summary label;
   - `shared/ui/month-switcher.tsx`;
   - stories-as-tests for each.
2. `web`, the desktop shell:
   - sidebar groups `Menu` (Mês, Para onde vai, Cofrinhos) and `Ajustes`;
   - `Lançar` moves from the sidebar to a sticky 64 px top bar: page title, `MonthSwitcher` on `/mes` and `/para-onde-vai` (by pathname), and the `+ Lançar` button;
   - `MonthHeader` drops its own switcher on `lg`.
3. `web`, the mobile header: a card with `Olá, {primeiro nome}` and the avatar, plus a `MonthSwitcher` card on month pages.
   - `MonthHeader` drops its switcher below `lg` too.
   - `?m=` stays the single source of the month.

Acceptance:

- `money.test.tsx` covers the three sizes, a negative amount, income, and a string read as one by `getByText`.
- `SplitBar` tests: the segments sum to the base, hidden segments, and the summary label.
- Shell tests:
  - the switcher only on month pages;
  - `Lançar` in the top bar opens Lançar;
  - the sidebar groups render.
- No raw hex outside the preset.
- Screenshots of Mês and Ajustes at 375 and 1440: the top bar at 1440, the header card and switcher card at 375, no horizontal scroll.

Review: `pixel` (sonnet), because of the new token and components.

## Card 2 — Mês as a dashboard grid (`web`, opus)

`/mes` becomes the C1–C7 grid. C3 and C4 move into the grid as they are today; card 3 reshapes them.

Model files:

- `web/src/app/(app)/(shell)/mes/page.tsx`, the grid;
- `widgets/month-overview/month-overview.tsx`, for `ThermometerCard`, `MonthSkeleton`, and `MonthSummary`, which is replaced by the split bar;
- `widgets/months-ahead/months-ahead.tsx` and `months-ahead.test.tsx`, the model for a card with its own query, skeleton and error;
- `widgets/category-breakdown/category-breakdown.tsx`, for the report query and the empty copy;
- `widgets/cofrinhos/cofrinhos.tsx`, for the cofrinhos query and the empty copy;
- `features/welcome-tour/illustrations.tsx`;
- e2e `web/e2e/mes.spec.ts`.

1. `entities/month/split.ts`: the §2.1 rules in cents, plus unit tests for every branch:
   - `performance` positive, zero and negative;
   - `saved` positive and ≤ 0;
   - `income = 0`, with and without outflow.
2. C1 in `HeroFrame`:
   - `Money size="hero"` for `Saldo hoje` and its `TierPill`;
   - `Projetado fim do mês` with `Money size="figure"` and its pill;
   - `SplitBar` `Para onde foi a entrada` and its line;
   - the red-day alert stays inside the hero.
3. New widgets `widgets/spending-glance/` (C6, top 4 outflow groups, `Ver tudo` → `/para-onde-vai?m=`) and `widgets/cofrinhos-glance/` (C7, `total_saved` and the top 2 by balance, `Ver todos` → `/economia`).
   - Each one owns its query, skeleton, empty and error state (spec §3.5).
4. Illustrations move to `shared/ui/illustrations.tsx`; the welcome tour re-imports them.
5. Grid at 375, 768 and 1440 per spec §3.2. Measure the §5 budget once and write it in the card comment.

Acceptance:

- Each card's loading, empty and error state is shown in a test.
- One failing request leaves the other cards rendered.
- At 1440×900, C1 and the top of C3 are above the fold.
- e2e `mes.spec.ts`: the hero, the split legend values, the glance links navigate.
- Screenshots of Mês at 375, 768 and 1440: seeded, then empty account, then the error of one card.

Review: `qa` (opus), for a diff over 200 lines.

## Card 3 — Contas a pagar and Lançamentos (`web`, opus)

C3 gets its day chips and round checks. C4 is capped and expands in place.

Model files:

- `web/src/widgets/bills-of-month/bills-of-month.tsx` and `bills-of-month.test.tsx`, for the `ToggleGroup` filter at :241 and the pay and unpay mutation;
- `widgets/ledger/ledger.tsx`;
- `jump` in `app/(app)/(shell)/mes/page.tsx`;
- e2e `web/e2e/mes.spec.ts` and `forecast.spec.ts` (red-day jump).

1. `entities/month/`, pure functions with unit tests:
   - `dueDays(bills)`: the day, the unpaid count, sorted;
   - `nextDue(bills, today)`;
   - `visibleDays(days, today, expanded)`: the spec §3.3 cap, past month included.
2. C3:
   - header subtitle, open total (`Money size="figure"`) and `N de M pagas`;
   - day chips as a single-select `ToggleGroup` with the dot count and aria label;
   - round check button with `aria-pressed`, the same mutation and undo toast;
   - the status text badge;
   - the 150 ms check motion under `motion-safe`.
3. C4: the cap, `Ver o mês inteiro (N dias)` / `Mostrar menos`, focus kept, and `jump` expands before scrolling.

Acceptance:

- Unit tests for the three functions, past and future months included.
- Component tests:
  - a chip filters, and a second tap clears it;
  - the round check pays and unpays;
  - the expand toggle;
  - jump to a hidden day expands it.
- e2e: pay from the round check, the red-day jump still lands on the day.
- Screenshots of Mês at 375 and 1440: chips, an overdue row, the ledger collapsed and expanded.

Review: `pixel` (sonnet), because the round check and the chips are new components.

## Card 4 — Mobile polish: tab bar, FAB, sheet, dates (`designer` then `web`, opus)

This card fixes audit findings 5, 6 and 7 (spec §1).

Model files:

- the tab bar in `web/src/widgets/app-shell/app-shell.tsx:149-169` and `app-shell.test.tsx`;
- the `Toaster` offset in `app/layout.tsx`;
- `shared/ui/responsive-sheet.tsx` and `responsive-sheet.test.tsx`;
- `features/add-transaction/transaction-sheet.tsx`, for the `Salvar` block;
- `shared/ui/date-chips.tsx:44` and `date-chips.test.tsx`;
- `components/ui/calendar.tsx` and `popover.tsx`;
- e2e `mes.spec.ts:25` and `repeat.spec.ts:44`.

1. `designer`:
   - the floating pill tab bar (4 labelled tabs, selected `foreground` pill) and the separate 56 px FAB, both inside `nav` `Navegação principal`;
   - `--tabbar-space` used by `main` and the `Toaster`;
   - `shared/ui/date-field.tsx`: a 44 px button showing `dd/MM/yyyy` via `Intl` pt-BR, which opens `Popover` + `Calendar` with the date-fns `ptBR` locale; its value is the API `YYYY-MM-DD`; stories-as-tests.
2. `web`:
   - `ResponsiveSheet` gets an optional `footer` slot, rendered sticky at the bottom of the sheet and the dialog;
   - Lançar, Pagar and the bill sheet pass `Salvar` there;
   - `DateField` replaces the native inputs in `date-chips.tsx`, `features/edit-settings/opening-form.tsx`, `features/onboarding/balance-step.tsx` and `entities/category/category-sheet.tsx`.
3. e2e `web/e2e/shell.spec.ts` at 375×812, for Mês, Para onde vai, Cofrinhos and Ajustes:
   - scroll to the end and assert the last row's bottom ≤ the tab bar's top;
   - assert `Salvar` in Lançar is in the viewport without scrolling.

Acceptance:

- The tests above.
- `DateField` tests:
  - it shows `05/11/2026` for `2026-11-05` under an en-US runner;
  - keyboard date pick;
  - 16 px text.
- The existing e2e selectors pass unchanged.
- Screenshots at 375 of Ajustes scrolled to the end, the Lançar sheet, and the series edit sheet with `DateField`; and at 1440 of the Lançar dialog with the pinned `Salvar`.

Review: `pixel` (sonnet), then `qa` (opus), for a diff over 200 lines.

## Card 5 — Para onde vai and Cofrinhos on the new cards (`web`, opus)

The two remaining screens move onto `DashCard`, `Money` sizes and the shared illustrations, so the app reads as one system. No new component.

Model files:

- `web/src/widgets/category-breakdown/category-breakdown.tsx` and `widgets/cofrinhos/cofrinhos.tsx`, with their pages;
- `shared/ui/dash-card.tsx` and `shared/ui/illustrations.tsx` from cards 1 and 2;
- e2e `web/e2e/reports.spec.ts` and `cofrinhos.spec.ts`.

1. Para onde vai:
   - the donut and the legend in a `DashCard`;
   - Top 5 in a second card, side by side at 1440;
   - the total with `Money size="figure"`;
   - an empty state with an illustration.
2. Cofrinhos:
   - the `Guardado` header with `Money size="hero"`;
   - the cofrinho cards on `DashCard`, two columns at 1440;
   - the empty state with `CofrinhoIllustration`.
3. `docs/design/tokens.md` §Layout: Economia is Cofrinhos (SOL-20, D21), and the year table is not planned.

Acceptance:

- Existing tests updated, no copy change.
- Screenshots of both screens at 375 and 1440, seeded and empty.

Review: none beyond the gate (no new token or component).

## Not planned

- Dark mode: kept off (SOL-12, D21). If the owner reopens it, one card: the `.dark` block in the preset from `tokens.md` dark values, a toggle in the sidebar footer and the mobile avatar menu, and `layout.test.tsx` inverted.
- Bell, search, export, Economia year table, 3D illustrations: out per spec §2 and §6.

## Ship

After each card:

1. Merge `--no-ff` to `developer`.
2. Bump the minor version (patch for card 5).
3. Open a PR to `main`, then tag.
4. Mark the card Done with screenshots.

SOL-61 is Done after card 5.
