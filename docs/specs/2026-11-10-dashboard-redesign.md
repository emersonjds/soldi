# SOL-61 — Dashboard redesign: a pleasure to use on desktop and polished on mobile

Epic SOL-61. Inputs: the audit `docs/design/audit/2026-11-10/README.md` (screenshots at 375 and 1440), `docs/design/tokens.md`, the approved Stitch screens in `docs/design/stitch/`, the v1 design `docs/specs/2026-11-05-soldi-v1-design.md`, `docs/specs/decisions.md` and the owner's two "Duo Finn" references (desktop and mobile). Panel in one pass: `product`, `ux`, `designer`, `architect`; arbitrated below. Plan: `docs/specs/plans/SOL-61.md`. Cross-cutting outcome: D21.

## 1. Problem

The audit, in one line per finding that this epic acts on:

1. Desktop `/mes` is a phone list stretched wide: one 3900 px column of 30+ day groups, the right rail ends a third of the way down (`mes-1440-light.png`).
2. No desktop top bar: the month switcher is buried inside the dark hero.
3. The hero number has no cents hierarchy: `R$ 15.519,68` is one dense block.
4. The mobile header lost its identity row: wordmark and avatar only.
5. Lançar on mobile: the primary `Salvar` sits below the fold (`clientHeight` 746 vs `scrollHeight` 862).
6. The fixed bottom tab bar covers the last row of scrollable lists.
7. Native `<input type="date">` shows `11/10/2026` (mm/dd) in an en-US browser while everything else is dd/mm.
8. No dark theme.
9. The mobile ledger has no rhythm and no empty-state art.

Two audit claims are corrected after reading the code:

- Finding 4 of the audit: Lançar below 1024 px already is a bottom `Sheet` (`shared/ui/responsive-sheet.tsx`). In `lancar-sheet-375-light.png` it is flush to the edges. The real defect is the unpinned `Salvar`.
- Finding 5 of the audit: `main` already reserves `6rem + safe-area`, and `ajustes-375-light.png` is a full-page capture, which paints the fixed bar mid-page. The cards below change the bar's height, so the fix is one shared spacing value plus an e2e that scrolls to the end and proves the last row clears the bar.

What stays, because Soldi already beats both references there:

- every tier is color plus label;
- the running balance on every day of the ledger;
- the 6/12-month Próximos meses forecast.

## 2. Product: what the dashboard answers

`/mes` becomes a grid of cards. Each card answers one question with data Soldi already has.

| # | Card | Question | Data |
|---|------|----------|------|
| C1 | **Saldo hoje** (hero) | How much do I have, and how will the month end? | `MonthView.balance_today`, `balance_today_tier`, `projected_balance`, `projected_tier`, `totals` |
| C2 | **Termômetro do mês** | Which tier am I in, in one sentence? | existing `ThermometerCard` |
| C3 | **Contas a pagar** | What is due next, and how much is still open? | `MonthView.bills_of_month` |
| C4 | **Lançamentos** | What happened in the last days, with the running balance? | `MonthView.days` + `GET /api/transactions?month` |
| C5 | **Próximos meses** | Will a coming month turn red? | existing `MonthsAhead` (`GET /api/forecast`) |
| C6 | **Para onde vai** | Where did this month's outflow go? | `GET /api/reports/categories?month` |
| C7 | **Cofrinhos** | How much is saved, and how close is each goal? | `GET /api/cofrinhos` |

C1 carries the owner's "salário livre" idea as the **split bar** "Para onde foi a entrada": the month's income split into Contas, Guardado, Diário and Livre (rules in §2.1).

Out, with the reason:

- "Divisão da casa": Soldi has no couples or shared split.
- "Cartões": Soldi has no credit-card entity.
- "Moradia" with a 30% reference: that is advice, not data the user entered (D16 spirit). C6 already shows each category's share.
- The bell: there is no notification source. The red-day alert already lives in the hero.
- Search: there is no search endpoint.
- Export: not asked.
- The Economia year table from `economia-anual.png`: SOL-20 replaced it with Cofrinhos, which remains the owner's direction. `tokens.md` §Layout is updated to match in card 5.

### 2.1 Split bar rules (finance, product arbitrated)

All math is in integer cents (`cents` in `shared/lib/tier.ts`), never floats (D7). `totals.saved` is the Economia deposits minus the resgates (`totals.withdrawn`), the deposits are already inside `totals.bills`, `totals.income` leaves the resgates out (`crates/soldi-types/src/months.rs`), and `performance = income − bills − daily`.

| Segment | Value |
|---------|-------|
| Contas | `bills − (saved + withdrawn)`, always between 0 and `bills` |
| Guardado | the gross deposits `saved + withdrawn` when `> 0`, else hidden |
| Diário | `daily` |
| Livre | `performance` when `> 0`, else hidden |

- Base: `income` when `performance ≥ 0`, else `bills + daily` (the bar stays full and has no Livre).
- The segments always sum to the base.
- Percentages are of the base, whole numbers rounded half-even. The legend shows exact amounts, so a 99% or 101% sum of rounded labels is acceptable.
- Line under the bar:
  - `performance > 0` → `Sobram 19% das entradas` (with the ↗ icon);
  - `performance < 0` → `Saídas passaram as entradas em R$ 312,40` (expense text and icon);
  - `performance = 0` → `Entradas e saídas empatadas`.
- `income = 0` and no outflow: the bar is replaced by the empty state (§3.5).
- Worked example: salary 5000 and a resgate of 300 (`income` 5000, `withdrawn` 300), Aluguel 1500, a deposit of 1000 (`bills` 2500, `saved` 700), daily 500 (`performance` 2000) → Contas 1500, Guardado 1000, Diário 500, Livre 2000; the segments sum to the 5000 base. The resgate sits outside `income`, so it is not a share of the bar.

## 3. Navigation and layout (ux)

### 3.1 Navigation

**Desktop (≥ 1024 px): keep the left sidebar, add a top bar.**

Sidebar, 240 px, `card` surface:

- wordmark and `Seu mês no verde.`;
- group `MENU`: Mês (`Calendar`), Para onde vai (`PieChart`), Cofrinhos (`PiggyBank`);
- group `CONFIGURAÇÕES`: Contas Fixas (`ReceiptText`, `/ajustes/contas`), Ajustes (`Settings`);
- group labels in small uppercase grey text; 20 px line icons left of the label; 44 px rows; the active row highlighted (SOL-68);
- the user card at the bottom: avatar, name, e-mail, version, Sair.

`Lançar` moves out of the sidebar. Nav labels stay as they are: `Mês` is Soldi's word since v1, and the e2e suites and the tour use it.

Top bar, 64 px, sticky, `background` at 90% with blur:

- the page title on the left;
- on month pages (`/mes`, `/para-onde-vai`), the month switcher `‹ Novembro 2026 ›` next to the title;
- `+ Lançar` (brand violet) on the right.

There is no bell, no search and no theme toggle.

**Mobile and tablet (< 1024 px): floating pill tab bar plus a separate FAB.**

Tab bar:

- a pill on the `card` surface with `shadow-md`, 12 px from the side edges and `12 px + safe-area` from the bottom;
- four tabs, each with icon and label: Mês, Para onde vai, Cofrinhos, Ajustes;
- the selected tab sits in a `foreground` (navy) pill with `background` text, and keeps its label;
- the others show `muted-foreground` icon and label.

FAB:

- 56 px round `brand` button, right of the pill, `aria-label="Lançar"`;
- both the pill and the FAB stay inside the `nav` labelled `Navegação principal`, so the e2e selectors in `mes.spec.ts:25` and `repeat.spec.ts:44` keep working.

Content padding: one CSS value `--tabbar-space` (bar height, plus 12 px gap, plus safe-area, plus 16 px air) is the `main` bottom padding and the `Toaster` `mobileOffset`.

Mobile header, replacing the 56 px wordmark bar:

- a header card with `Olá, {primeiro nome}` and the avatar link `Minha conta`;
- on month pages, a month switcher card under it.

### 3.2 Information hierarchy

| Width | Grid | Order |
|-------|------|-------|
| 375 | 1 column, gap 16, card padding 16 | C1 Saldo hoje → C3 Contas a pagar → C4 Lançamentos → C2 Termômetro → C5 Próximos meses → C6 Para onde vai → C7 Cofrinhos |
| 768 | 2 columns, gap 16 | C1 spans 2; C3 spans 2; C4 spans 2; then C2, C5, C6, C7 in pairs |
| 1440 | sidebar + 3 columns (`xl:`), max content 1152, gap 24, card padding 24 | row 1: C1 (span 2), C2; row 2: C3 (span 2), C5; row 3: C4 (span 2), with C6 over C7 in column 3 |

From 1024 to 1279 px the grid is 2 columns, with the 768 order.

- At 1440×900, C1 and the top of C3 are above the fold.
- The ledger no longer sets the page height. C4 shows a capped list (§3.3).

### 3.3 Lançamentos (C4) cap

- Default: the next 3 scheduled entries, today, and the 6 day groups before today.
- `Ver o mês inteiro (N dias)` expands in place. After expanding, the button reads `Mostrar menos`. Focus stays on the button.
- The red-day alert's jump (`mes/page.tsx` `jump`) expands first, then scrolls.
- In a past month, the default is the last 7 day groups of that month.
- Day headers, the running balance and the `TierPill` stay as they are.

### 3.4 Contas a pagar (C3)

Header:

- title: `Contas a pagar`;
- subtitle:
  - `Próxima: Luz · dia 10 · em 3 dias`;
  - `Vence hoje: Luz`;
  - `Todas as contas do mês pagas`;
- the figure: the open total with cents hierarchy;
- the counter: `2 de 6 pagas`.

The filters `Todas / Pendentes / Pagas` stay (existing `ToggleGroup`).

Day chips:

- one chip per due day: `dia 05`, plus one dot per unpaid bill;
- `aria-label="dia 05, 2 contas a pagar"`;
- a single-select `ToggleGroup`: a tap filters the list to that day, and a second tap clears the filter;
- 44 px tall, horizontal scroll inside the card at 375 (never the page).

Rows:

- a round check button on the left: `aria-pressed`, `aria-label="Marcar Aluguel como paga"` or `"Desmarcar Aluguel"`;
- one tap pays or unpays, with the same mutation and undo toast as today's `Pagar` and `Pago` pills;
- the status badge stays as text: `Pago`, `Vence dia 10/11`, or `Venceu dia 02/11` on the tinted overdue row;
- the amount still opens Pagar to adjust it.

### 3.5 States, every card

Each card owns its query, skeleton and error. One failing request never blanks the page.

- When the month request fails, C2, C3 and C4 are hidden and only C1 shows the error: C2 and C3 read the month, and C4 needs its `days`.
- A refetch that fails after a card has data keeps the data and shows no error.
- Each loading card carries `aria-busy="true"`; the page has a single `role="status"` that reads `Carregando` while the month or its entries load.

| Card | Loading | Empty | Error |
|------|---------|-------|-------|
| C1 | skeleton of the figure and bar | `Nenhuma entrada neste mês` + button `Lançar entrada` (opens Lançar on Entrada) + `IncomeIllustration` | `Não foi possível carregar o mês.` + `Tentar de novo` |
| C2 | skeleton strip | — (always has a tier) | shares C1's request and error |
| C3 | 3 row skeletons | `Nenhuma conta fixa` + link `Cadastrar conta fixa` → `/ajustes/contas` | shares C1's request and error |
| C4 | 5 row skeletons | `Nenhum lançamento ainda` (existing) + `LedgerIllustration` + `Lançar` | `Não foi possível carregar os lançamentos.` + `Tentar de novo` |
| C5 | existing skeleton | existing | existing |
| C6 | 4 bar skeletons | `Nenhum gasto neste mês ainda.` (existing copy) | `Não foi possível carregar os gastos.` + `Tentar de novo` |
| C7 | 2 row skeletons | `Nenhum cofrinho ainda. Comece pela reserva de emergência.` (existing) + `CofrinhoIllustration` + link `Ver cofrinhos` | `Não foi possível carregar os cofrinhos.` + `Tentar de novo` |

### 3.6 Final pt-BR copy

- Top bar titles: `Mês`, `Para onde vai`, `Cofrinhos`, `Ajustes`. Button `Lançar`.
- The switcher keeps its existing aria labels.
- Mobile header: `Olá, {primeiro nome}`.
- C1:
  - `Saldo hoje`;
  - `Projetado fim do mês`;
  - `Para onde foi a entrada`, with the base under it: `Entradas R$ 6.000,00`, or `Saídas R$ 1.384,31` when the outflow passes the income;
  - legend `Contas`, `Guardado`, `Diário`, `Livre`, each `R$ 1.800,00 · 30%`;
  - the lines from §2.1.
- C3: as in §3.4.
- C4: `Lançamentos`, `Ver o mês inteiro (N dias)`, `Mostrar menos`.
- C6: `Para onde vai`, link `Ver tudo`. Rows show the category name, amount and `26%`.
- C7: `Cofrinhos`, link `Ver todos`, `Guardado R$ 1.300,00`. Rows show the name and `45% de R$ 10.000,00`, or the balance alone without a target.
- Lançar sheet: `Salvar` pinned.
- Date field: `Outra data` and the value `05/11/2026`.

C7 shows `total_saved` and not `saved_this_month`. The viewed month's saving is already the Guardado segment in C1, so C7 never contradicts a past month.

## 4. Visual system (designer)

### 4.1 Tokens

There is one new token. Every other value already exists in `web/src/styles/presets/soldi.css`.

| Need | Token | Value |
|------|-------|-------|
| Card radius | `--radius` (1rem) | exists |
| Card shadow | `--shadow-sm` `0 4px 16px rgb(30 27 75 / .08)` | exists |
| Tab bar pill, FAB | `--shadow-md`, `--shadow-lg` | exist |
| Split bar: Contas | `--primary` `#5341CD` | exists |
| Split bar: Guardado | `--cat-11` `#16A34A` (Economia's own color, D15: the color follows the entity) | exists |
| Split bar: Diário | **`--split-daily` `#0891B2`** | new |
| Split bar: Livre | `--muted` track, 1 px `--border` outline | exists |
| Grid gap | 16 / 24 px (8 px grid) | Tailwind `gap-4` / `gap-6` |

Validated with the dataviz validator (`#5341CD,#0891B2,#16A34A`, light, all pairs):

- CVD worst ΔE is 16.1 (deutan).
- The normal-vision floor is 17.4.
- Each segment is at least 3:1 on white.

Amber was rejected: it reads as the tier `Apertado`.

Text never wears a segment color. The legend uses `foreground`, plus a 12 px swatch.

Bar geometry:

- 12 px tall, 4 px rounded ends;
- a 2 px `card` gap between segments;
- 200 ms `motion-safe` width transition on data change.

There is no progress-with-marker primitive: no Soldi card needs a reference marker (the 30% Moradia card is out). Cofrinho progress keeps its existing bar.

### 4.2 Money with cents hierarchy

`Money` gets `size?: "row" | "figure" | "hero"`, default `row`, which is today's output.

| Size | Integer part | Symbol and `,cents` |
|------|--------------|---------------------|
| `figure` | 28 px | 55% of the integer size |
| `hero` | 40 px at 375, 48 px from `lg` | 55% of the integer size |

- All parts are bold, `tabular-nums`, `tracking-[-0.02em]`, on a shared baseline.
- The parts come from `Intl.NumberFormat("pt-BR").formatToParts`, a stdlib call; there is no hand-rolled split.
- All parts keep the same text color, so contrast never drops.
- Screen readers read one string: the parts are spans inside one `span`.

Rows stay `row`.

### 4.3 Surfaces

- Canvas: `background` `#FBF8FF`. Cards: `card` with `shadow-sm`.
- C1 keeps the indigo `HeroFrame` gradient as the one dark card on the page. It anchors the eye on the number, as in the approved Stitch direction. The full-width dark band at the top of `/mes` goes away.
- One accent: brand violet only on `Lançar`, the FAB and primary buttons. The tier colors carry meaning.

### 4.4 Dark mode: kept off

The owner removed it in SOL-12, on 2026-11-05: "The tool is light-only (design approved)". Commit `20d4a4e` dropped `next-themes`. `layout.test.tsx` locks the decision.

Reasons not to reverse it:

- Bringing it back here would double every new token, every screenshot and every `pixel` pass, in an epic whose goal is layout and hierarchy.
- The audit's "byte-identical dark screenshots" is the expected result of that decision, not a bug.

What this epic guarantees instead:

- Components use semantic tokens only, with no raw hex outside the preset.
- If the owner reopens dark mode, it is a token block plus a toggle, in its own card.

The v1 spec's "light and dark" acceptance lines are superseded by D21. This epic's screenshots are light only.

### 4.5 Illustrations: no 3D assets

The references' 3D wallet and calendar are rejected:

- They need a paid or attribution license.
- They cost 30–80 KB each as WebP in a static export.
- They are decoration, which the design principles forbid.

Instead, empty states reuse the welcome tour's inline SVGs (`IncomeIllustration`, `LedgerIllustration`, `CofrinhoIllustration` in `features/welcome-tour/illustrations.tsx`), with `aria-hidden`. They add 0 KB and ship no new assets. They move to `shared/ui/illustrations.tsx`, so widgets can import them without crossing FSD.

### 4.6 Reused template components (never edited, composed)

| Component | Used for |
|-----------|----------|
| `components/ui/card.tsx` | `DashCard` |
| `sidebar.tsx` | already used |
| `sheet.tsx`, `dialog.tsx` | through `ResponsiveSheet` |
| `toggle-group.tsx` | bill filters, day chips |
| `skeleton.tsx` | loading states |
| `empty.tsx` | empty states |
| `calendar.tsx` (react-day-picker) + `popover.tsx` | `DateField` |
| `avatar.tsx`, `button.tsx` | shell and actions |

`chart.tsx` (recharts) is not used for the split bar: plain divs are lighter and fully accessible.

New shared pieces, each with stories-as-tests:

- `shared/ui/dash-card.tsx`: `Card` with a title, an optional `action` link, and body slots;
- `shared/ui/split-bar.tsx`;
- `shared/ui/month-switcher.tsx`, extracted from `widgets/month-header/month-header.tsx`;
- `shared/ui/date-field.tsx`;
- the `Money` size prop.

### 4.7 Motion

Motion only explains state:

| Motion | Duration | What it shows |
|--------|----------|---------------|
| Round check fill and scale | 150 ms | paid toggle |
| Split bar width | 200 ms | totals change after a launch |
| Sheet slide | template default | opening Lançar |
| Skeleton pulse | template default | loading |

- There is no count-up on numbers: a moving figure is misread.
- `Ver o mês inteiro` does not animate its height.
- Every transition sits under `motion-safe:`.

### 4.8 Accessibility (never traded)

- Color is never alone:
  - every split segment has a legend row with a label and value;
  - the split bar has `role="img"` with an `aria-label` that sums it up: `Entradas R$ 6.000,00: contas 30%, guardado 8%, diário 43%, livre 19%`;
  - tier pills keep their label;
  - the overdue status is text.
- Targets are at least 44 px: tabs, FAB, day chips, round checks, switcher arrows, card links.
- Inputs are at least 16 px. `DateField`'s trigger is a 44 px button showing `05/11/2026`.
- Keyboard:
  - the day chips and filters are `ToggleGroup`s (arrow keys);
  - the calendar uses react-day-picker's keyboard grid;
  - the expand button keeps focus;
  - the FAB is in tab order right after the tabs.
- No horizontal page scroll at 375. The chip row scrolls inside its card.

## 5. Architect: data and performance

There is no new endpoint and no new field. Every card composes the existing API:

| Card | Endpoint |
|------|----------|
| C1, C2, C3, C4 days | `GET /api/months/{month}` |
| C4 rows | `GET /api/transactions?month=` |
| C5 | `GET /api/forecast` |
| C6 | `GET /api/reports/categories?month=` |
| C7 | `GET /api/cofrinhos` |

The switcher's lower bound comes from `GET /api/settings`.

- `/mes` adds 2 requests to today's 4 (reports and cofrinhos). Both are already cached by `react-query` under keys their own pages share, so visiting Para onde vai or Cofrinhos afterwards is free.
- All six fire in parallel. No card waits on another.

Budget:

- each request p95 ≤ 150 ms server-side on the audit seed (one user, 12 months, about 400 rows);
- C1 painted ≤ 1 s on a throttled "Fast 4G" 375 profile;
- the `/mes` JS chunk grows ≤ 10 KB gzip.

These are measured once in card 2 and noted in its card comment.

The split bar, the day chips and the C4 cap are pure functions of data already fetched. They live in `entities/month/` with unit tests.

## 6. Open questions arbitrated

| Question | Options | Winner | Trade-off |
|----------|---------|--------|-----------|
| Desktop navigation | keep sidebar + top bar / top bar only / sidebar only | **Sidebar + top bar** (ux, designer) | The sidebar already exists. The top bar gives the switcher and `Lançar` a fixed home on every page. Costs one more 64 px row. |
| Where `Lançar` lives on desktop | sidebar / top bar | **Top bar** (ux) | Next to the month, where the reference puts it. Its old sidebar slot goes. |
| Mobile navigation | today's bar with raised center FAB / floating pill + separate FAB | **Floating pill + separate FAB** (ux, owner's reference) | Four labelled tabs instead of five slots. "Para onde vai" wraps to two lines at 11 px, as it does today. |
| Rename `Mês` to `Visão geral` | rename / keep | **Keep `Mês`** (product) | Matches Soldi's vocabulary, the tour and the e2e suites. Loses the reference's wording. |
| Ledger on desktop | full inline / capped + expand / own route `/extrato` | **Capped + expand in place** (ux, architect) | No new route. A long month is one tap away. The red-day jump auto-expands. |
| Bell and notifications | add / skip | **Skip** (product) | No source of notifications exists. The red-day alert covers the one urgent case. |
| Cofrinhos vs Economia year table | build the year table / keep Cofrinhos | **Keep Cofrinhos** (product, SOL-20) | The approved `economia-anual.png` stays unbuilt. `tokens.md` §Layout is updated in card 5. |
| Dark mode | deliver / keep off | **Keep off** (designer, SOL-12 owner decision) | Fails the reference's theme toggle. Saves a doubled token and screenshot set. Reversible in one card. |
| 3D illustrations | licensed pack / inline SVG / none | **Reuse the existing inline SVGs, empty states only** (designer) | Less charm than 3D. 0 KB, no license. |
| Split bar colors | template `chart-*` / validated set | **`primary`, `cat-11`, new `--split-daily`** (designer, dataviz validator) | One new token. `chart-5` `#06B6D4` fails 3:1 on white. |
| Native date input | keep native + Playwright `pt-BR` locale / `DateField` | **`DateField`** (ux) | A user with an English OS sees dd/mm too. Loses the OS wheel picker on phones. |
| Drag handle on the sheet | add / skip | **Skip** (designer) | A handle without drag-to-dismiss is a lie. `vaul` would be a new dependency. |
| Custom amount keypad | build / OS keypad | **OS keypad** (`inputMode="decimal"`, existing) | Native, accessible, no code. |

## 7. Acceptance (epic)

- Every card in `docs/specs/plans/SOL-61.md` meets its own list.
- Screenshots of Mês, Para onde vai, Cofrinhos, Ajustes and the Lançar sheet are taken at 375×812 and 1440×900, light, and saved to `docs/design/audit/<date>/screenshots/`. They show:
  - no horizontal scroll;
  - the last row clear of the tab bar at the scroll end;
  - `Salvar` visible without scrolling;
  - dates as dd/mm/aaaa;
  - the hero cents smaller than the integer part.
- C1 and the top of C3 are above the fold at 1440×900.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` (> 90% on 4 metrics), `pnpm build` and `pnpm e2e` are green.
- `layout.test.tsx` (light only) still passes.
