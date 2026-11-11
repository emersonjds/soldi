# SOL-79 — Stitch v3, rebuilt faithfully

Epic SOL-79. It supersedes `docs/specs/2026-11-11-stitch-v3.md` wherever the two disagree.

Inputs:

- the verified diff `docs/design/stitch-v3/FIDELITY.md` (item numbers below, such as `1.5`, point there);
- the 14 screens in `docs/design/stitch-v3/`;
- `docs/specs/decisions.md` (D24, D25).

Plan: `docs/specs/plans/SOL-79.md`.

## 0. Rules for every section

**Fidelity by default (D24).** Every Stitch element is built: layout, order, components, copy, states, sizes and colors through tokens. Only these are cut:

- credit cards and fatura;
- AI copy;
- CDI yield;
- the Pro plan;
- recurring income;
- averages, estimates and "no ritmo atual" (D16);
- dark mode;
- the bell.

Elements that need data the API does not have are specified in §12 and wait for the owner (see the plan).

**Copy.** Copy is pt-BR, quoted verbatim from the Stitch HTML. A phrase is changed only where a rule above, or a standing rule named next to it, forces it; the original is quoted in `FIDELITY.md`. Where Stitch's copy and shipped copy differ, Stitch wins.

**Frames.** The mobile frame governs < 1024 px and the desktop frame ≥ 1024 px. Same-breakpoint conflicts go to the majority of frames (`FIDELITY.md`, "How frame conflicts are resolved").

**A card with no content does not render (D25).**

- Each card in this spec states when it has content. Without content it returns `null`, and its heading and frame go with it.
- Exceptions:
  - the Mês hero always shows, since a balance exists from the opening date;
  - full screens whose page is the place to create keep a first-use empty state with the create action (Contas fixas, Cofrinhos, Categorias).
- Loading: only the Mês hero has a skeleton. Other cards render nothing until their data arrives, so a card that turns out empty never flashes.
- An error is content. A card whose query fails renders its `PageError` with Tentar de novo.
- A filter that empties a card does not hide it. The card has content under another filter, so it shows the filter's empty line.
- Layouts are flow, never pinned rows or columns. A hidden card leaves no hole at 375, 1024, 1280 or 1440.

**Standing rules that still bind.**

- Money is `Money` / `formatMoney` from the API string, never a float; sums are in integer cents (`shared/lib/tier.ts`).
- Every query is filtered by `user_id`.
- Touch targets are ≥ 44 px, form text is ≥ 16 px, and there is no horizontal scroll at 375.
- Color is never the only signal (D22). This forces one visible change against Stitch, in §2.8.
- Light only.

**Percentages.** A share drawn with one decimal in Stitch (`42,5%`, `53,1%`) is rounded half-to-even to one decimal in pt-BR. A whole one (`67%`) uses `wholeShare`. Shares are not forced to sum to 100.

---

## 1. Shell

`widgets/app-shell/app-shell.tsx`. FIDELITY 0.1–0.10.

### 1.1 Top bar (≥ 1024)

- Left: the month switcher on every shell page. It is the shell's `?m=` (D21), kept while moving between pages. There is no page title (0.5); each page's own header carries it.
- Right, in order: the tier pill, `+ Lançar`, the avatar.
- The tier pill is today's balance tier, `balance_today_tier` from `useMonth(<today's month>)`, whatever month is viewed. It is the shared `TierPill` at `md`, with the accessible name `Saldo hoje: Confortável`. It is not a button. While loading or on error it is absent.
- The avatar is a 40 px initial circle, a link to Minha conta (`/ajustes#conta`, §10), accessible name `Minha conta`.

### 1.2 Sidebar (≥ 1024)

- Groups and items as shipped.
- The footer card holds the avatar, name and e-mail, as a link to Minha conta. The version line and the sign-out button are removed: sign-out lives in Ajustes (§10.6), and the version in Ajuda (§10.7).

### 1.3 Mobile app bar (< 1024)

- `● Soldi` at the left, a link to `/mes` named `Soldi, ir para hoje`.
- The page name centered: `Mês`, `Para Onde Vai`, `Economia`, `Ajustes`, `Contas Fixas`, `Categorias`, `Posso comprar isso?`.
- The avatar at the right, as in 1.1.
- The greeting card is removed; the greeting moves into the Mês hero (§2.3).

### 1.4 Page hero (< 1024)

The shared indigo band (`widgets/month-header/month-header.tsx`, extended), holding an eyebrow, a title and a switcher:

| Page | Eyebrow | Title | Switcher |
|---|---|---|---|
| Para onde vai | `FLUXO DE DESPESAS • CONSOLIDADO` | `Para onde vai` | month |
| Economia do ano | `PLANEJAMENTO & METAS` | `Evolução e Poupança` | year |
| Mês | — | (greeting, §2.3) | month |

Pages with no mobile frame (Contas fixas, Categorias, Ajustes, Cofrinhos, Posso comprar) show the month switcher in a card under the app bar, as today.

### 1.5 Tab bar (< 1024)

- A full-width bar fixed to the bottom, in `--card`, with a top border and the safe-area inset.
- Five slots: `Mês`, `Para onde vai`, a raised 56 px `+` (`Lançar`) centered and overlapping the bar's top edge, `Economia` (`/economia`), `Ajustes`.
- The active tab is `--primary` (icon and label); the others are `--muted-foreground`.
- Each slot is ≥ 44 px. The nav keeps the name `Navegação principal`.
- The desktop sidebar keeps `Cofrinhos`.

**Acceptance, §1**

- At ≥ 1024 the top bar shows the switcher on every shell page and `● {tier}` left of `Lançar`. The tier matches the Mês hero's tier on the current month and does not change when another month is viewed.
- No page title in the top bar; no bell.
- The avatar opens Minha conta. The sidebar footer has no version and no sign-out button.
- At 375 the app bar reads `● Soldi`, the page name and the avatar. The tab bar has 5 slots with the `+` centered, the label `Economia`, and the active tab in primary.
- `Lançar` from the tab bar and from the top bar opens the same sheet.

---

## 2. Mês

`app/(app)/(shell)/mes/page.tsx` and its widgets.

### 2.1 Layout

| Width | Layout |
|---|---|
| ≥ 1280 | Two flow stacks, main `minmax(0,2fr)` and rail `minmax(0,1fr)`. Main: hero, Contas a pagar, Lançamentos. Rail: Termômetro do Mês, Próximos meses, Cofrinhos, Para Onde Vai |
| 1024–1279 | Main stack full width (desktop variants), then the rail cards in a 2-column grid; an odd last card spans both columns |
| < 1024 | One column, mobile variants: hero, Contas do Mês, Termômetro do Mês, Lançamentos, Próximos meses, Cofrinhos, Para Onde Vai |

- The red banner (§2.2) sits above both stacks, full width.
- No `row-start` / `col-start` pinning. A hidden card closes up.

### 2.2 Red-day banner

Shown when `forecastAlert(days)` finds a red day in the viewed month. Otherwise there is no content and nothing renders.

| Part | Copy |
|---|---|
| Title, first red day is today | `Hoje está no vermelho: {saldo}.` |
| Title, otherwise | `Dia {d} fica no vermelho: {saldo}.` |
| Cause, 2+ outflows | `Contas de {A} e {B} previstas excedem o saldo em caixa projetado.` |
| Cause, 1 outflow | `Conta de {A} prevista excede o saldo em caixa projetado.` |
| Cause, none | (omitted) |
| Button | `Ver o dia {d}` / `Ver hoje`, with an arrow |

- `{A}` and `{B}` are the two largest outflows of that day: open bills landing on it and outflow entries dated on it, by amount. A pure function goes in `entities/month/forecast-alert.ts` next to `causeOf`.
- The button runs the existing `jump`.
- The `Pior dia: …` line is removed (Stitch replaces it with the cause).
- Style:
  - `--expense-soft` background;
  - a 40 px red circle with a warning glyph;
  - bold `--expense` text;
  - a white button.
- At 375 the button wraps under the text.

### 2.3 Hero (always shows)

**≥ 1024, white card** (`month-overview.tsx` `MonthHero`):

- Left:
  - eyebrow `SALDO HOJE EM CONTA`;
  - `balance_today` in `Money` (cents raised, 55%);
  - `TierPill` of `balance_today_tier`.
- Right, a tinted box (`--muted`):
  - `Projetado no fim do mês`;
  - `projected_balance`, in `--expense` when negative;
  - `TierPill` of `projected_tier`, size `sm`.
- Split, shown only when the base is > 0 (§2.4).
- No Entradas / Saídas / Projetado row: `MonthSummary` renders only below 1024.

**< 1024, indigo hero:**

- First row: the initial circle and `Olá, {primeiro nome}` (or `Olá`).
- The month switcher, hero tone, centered.
- `SALDO HOJE`, the amount, the `TierPill`.
- `MonthSummary` overlapping the bottom edge, as shipped: `Entradas`, `Saídas`, `Projetado` with its pill.
- The split is not drawn in the mobile frame and is not shown < 1024.

### 2.4 Split "Para onde foi a entrada deste mês"

- The rules are the dashboard spec's §2.1 (`docs/specs/2026-11-10-dashboard-redesign.md`): segments, base, the overspent case, and colors `--primary`, `--cat-11`, `--split-daily`, muted for Livre. The component is the existing `shared/ui/split-bar.tsx`.
- Heading row: `Para onde foi a entrada deste mês` and, at the right, `Total: {base}`.
- Legend, 4 columns at ≥ 1024: dot, label, amount, share with one decimal.

| Segment | Label |
|---|---|
| bills | `Contas fixas` |
| saved | `Guardado` |
| daily | `Gastos diários` |
| free | `Livre restante` |

- Content: base > 0. With no entrada the whole split block is absent; the hero remains.
- The `aria-label` keeps the dashboard spec's sentence, with these labels in lower case.

### 2.5 Termômetro do Mês

Content: `totals.income > 0` or `totals.outflow > 0`. A fresh month hides the card.

- Header:
  - a `Gauge` icon and `Termômetro do Mês`;
  - at ≥ 1024, `{p}% Gasto` at the right in `--muted-foreground`;
  - at < 1024, a pill `{p}% Comprometido`.
  - `p = wholeShare(outflow, income)`. With income 0, neither shows.
- Box at ≥ 1024 only:
  - `Entradas` `{income}` in `--income`;
  - `Saídas` `{outflow}`;
  - `Resultado` `{+|-} {|performance|}`, in `--income` or `--expense`.
- Strip: the shipped `ThermometerStrip` and the tier it shows today.
  - At ≥ 1024, a marker label `Você está aqui: {tier}` above the active segment.
  - At < 1024, the five labels in their own tier colors, the active one bold.
- Insight, in a tinted box (a check icon at < 1024):
  - Line 1, income > 0, desktop: `Você comprometeu {p}% das receitas líquidas.`
  - Line 1, income > 0, mobile: `Você comprometeu {p}% da renda líquida.`
  - Line 1, income 0: `Nenhuma entrada ainda este mês.`
  - Line 2 (Stitch's "o ritmo atual" / "Mantendo este ritmo" is cut by D16; the line now reads from the projection): `Com as contas em aberto, o caixa fecha o mês no {verde | amarelo | vermelho}.`
    - Folga or Confortável → `verde`; Apertado → `amarelo`; Atenção or Crítico → `vermelho`.
    - The word is bold and in its tier color; the word itself carries the meaning.
  - The shipped `Guardou R$ … este mês.` line is removed: the split shows Guardado.

### 2.6 Contas a pagar / Contas do Mês

Content: `bills_of_month.length > 0`. With no bill the card is absent.

**≥ 1024 — `Contas a pagar`**

- Header row:
  - the title and a badge `{pagas} de {total} pagas`;
  - under them, `Próxima: dia {dd} · {valor}`, or the shipped all-paid copy;
  - the day chips right-aligned on the same row (shipped chips; they scroll when many).
- The Todas / Pendentes / Pagas filter is removed.
- Row: round check, tinted icon circle (category color at 15%, glyph in the color), name, caption, amount, status.

| State | Check slot | Caption | Amount | Status |
|---|---|---|---|---|
| Open | empty circle | `Vence dia {dd}` | bold | `Pagar` pill, a button: pays now (same as the check) |
| Paid | filled check | `{Venceu \| Vence} dia {dd} · {Pago no prazo \| Pago com atraso}` | muted | `Pago` badge, `--income` |
| Overdue (incl. carried, D17) | red `!` circle, still the pay button | clock + `Atrasada desde {d} {mmm}` | `--expense` | `Vencido` badge, red |

- The paid name is struck through.
- `Pago no prazo` applies when the paying entry's date ≤ `due_date`. The date comes from `useTransactions(month)` by `transaction_id`. `Venceu` is used when `due_date ≤ today`.
- Tapping the amount opens Pagar to adjust, as shipped.

**< 1024 — `Contas do Mês`**

- Title with a 4 px primary accent bar; under it `{n} obrigações cadastradas` (`1 obrigação cadastrada`); `Ver todas` at the right.
- No Próxima, total, count or chips.
- Row: solid icon circle, name (truncates with a `title`), caption `Vence dia {dd/mm}`, amount, status pill.
  - Open: `Pagar`, a button that pays now.
  - Paid: `✓ Pago`, a toggle button with `aria-pressed="true"` that undoes the payment with the shipped toast.
  - Overdue: `Vencido`, a button that pays now, named `Pagar {nome}, vencida`. The row is tinted red with clock + `Venceu dia {dd/mm}` in red.

### 2.7 Lançamentos

Content: the month has any entry or any due-bill row. With none the card is absent.

- Title row at ≥ 1024: `Lançamentos`, the `Todos` / `Diário` / `Contas` segment inline, and `Ver o mês inteiro` with an arrow at the right. At < 1024 the segment goes under the title and the link stays at the bottom. The count `(n dias)` is removed. Expanded, the link reads `Mostrar menos`.
- Day band, a `--muted` rounded row:
  - past and today: `Hoje, {d mmm}`, `Ontem, {d mmm}`, `{d mmm}`;
  - the right side reads `Saldo ao final:`, the day balance in its tier color, and `TierPill` `sm`.
- Future band: `Previsto · {d mmm}`, with `Projeção:`, the projected balance and its pill. The band's rows render at 60% opacity.
- Amounts are signed: outflows `- R$ …`, entries and resgates `+ R$ …` in `--income`.
- A series member shows a pill after the caption: `↻ {Entrada | Saída | Diário} · {pos}/{total}`.
- The shipped day balance, cause marking and jump stay.

### 2.8 Próximos meses

Content: the shipped `flat` check is false (some month ahead differs). Otherwise the card is absent.

- Header: the `CalendarRange` icon, `Próximos meses`, and `Posso comprar?` with an arrow at the right. Until §11 ships, the link opens Lançar with Simular; after that, it opens `/posso-comprar`.
- Always 12 months, in a 4-column grid at every width. The 6 / 12 toggle and the red-day count badge are removed.
- Chip:
  - `{Mmm}` (`Nov`, `Jan`);
  - the tier dot and the lowest balance whole (D23);
  - a red month on `--expense-soft` with `--expense` text;
  - the viewed month outlined, as shipped.
- D22 forces one deviation: the tier word stays visible at 11 px under the amount. Stitch draws a dot only, and a dot would make color the only signal.
- Accessible name: `{mês por extenso} de {aaaa}: menor saldo {valor}, {tier}`.

### 2.9 Cofrinhos glance

Content: a cofrinho other than `Reserva Livre` exists, or `total_saved > 0`.

- Header: the `PiggyBank` icon, `Cofrinhos`, and `Ver todos` with an arrow.
- Eyebrow `TOTAL GUARDADO`, then `total_saved` in `Money`.
- The top 2 cofrinhos with a goal (shipped choice). Each row:
  - name, with `{pct}%` at the right;
  - `CofrinhoBar`;
  - `{saldo}` at the left and `Meta: {meta}` at the right, whole units.

### 2.10 Para Onde Vai glance

Content: `outflow_total > 0`.

- Header: the `PieChart` icon, `Para Onde Vai`, and `Ver análise` with an arrow.
- The top 4 groups. Each row: name and amount; a bar in the group's color; `{pct}%` (one decimal) under it at the right. There is no icon circle.

**Acceptance, §2**

- A fresh account (opening balance, nothing else) shows only the hero, at 375, 1024, 1280 and 1440: no banner, no split, no other card, and no hole. A test renders the page with empty data and asserts that only the `Saldo hoje` region exists.
- Adding one bill shows Contas a pagar (desktop) or Contas do Mês (mobile), and the Termômetro once its amount is in the month. Each card appears only with its data. There is one test per card for absent and present.
- Rail order: Termômetro, Próximos meses, Cofrinhos, Para Onde Vai. At < 1024 the order is hero, Contas, Termômetro, Lançamentos, …
- The banner shows above the grid only with a red day. Its cause names the two largest outflows of the day; `Ver o dia {d}` jumps and highlights. No `Pior dia` line.
- Hero at ≥ 1024: white card, Projetado box with its pill, split with the four legend items and `Total:`. No summary row. Below 1024: indigo hero with greeting and switcher, and the summary.
- With income 0 the split is absent. When overspent, the split has no Livre (dashboard §2.1).
- Termômetro: `{p}% Gasto` / `{p}% Comprometido`, the Entradas / Saídas / Resultado box at ≥ 1024, `Você está aqui:` at ≥ 1024, and the two insight lines. No "ritmo" copy anywhere (grep).
- Contas: the `Pagar` pill pays in one tap with the undo toast. Paid rows are struck through with `Pago no prazo` or `Pago com atraso`. Overdue rows read `Atrasada desde …` (≥ 1024) or `Venceu dia …` (< 1024). No filter at ≥ 1024. At < 1024 there is no check, and `✓ Pago` undoes.
- Lançamentos: signed amounts, `Saldo ao final:` and `Previsto · … Projeção:` bands, series pill, `Ver o mês inteiro` in the title row at ≥ 1024.
- Próximos meses: 12 chips in 4 columns, no toggle, no red-day badge, the tier word under each amount.
- The glances match §2.9 and §2.10.

---

## 3. Lançar

`features/add-transaction/transaction-sheet.tsx`, `entities/category/category-chips.tsx`, `shared/ui/date-chips.tsx`, `shared/ui/amount-input.tsx`. FIDELITY 8.x, 9.x.

### 3.1 Header

| | < 1024 | ≥ 1024 |
|---|---|---|
| Title, new | `Novo Registro` | `Novo Lançamento` |
| Description | (visually hidden) `Cadastre uma movimentação pontual ou recorrente` | `Cadastre uma movimentação pontual ou recorrente` |
| Title, editing a non-series entry | `Editar lançamento` | `Editar lançamento` |

### 3.2 Kind

A segment of three, each with an icon:

- `Entrada` (`ArrowDown`; its label is `--income` when not selected);
- `Conta` (`ReceiptText`, value `bill`);
- `Diário` (`ShoppingBag`).

The selected one is filled `--brand`. Elsewhere the `bill` kind keeps its own frame's word: `Saída` in the ledger pill, `Contas Fixas` in Categorias.

### 3.3 Amount

- Label: `VALOR DO GASTO` for Conta and Diário, `VALOR DA ENTRADA` for Entrada (not drawn; adapted).
- The amount shows `R$` and the integer part bold, with the cents (`,31`) lighter, and a caret.

### 3.4 Category

- Header: `Categoria`, a 6 px primary dot, and `Ver todas` at the right. The desktop frame's `Personalizar` is §12.P9.
- Row: the shipped ranking, up to 8 circles of 48 px with the name under each, scrolling horizontally with snap. The selected circle has a ring and a check badge. The `Nova` chip is removed; `Ver todas` keeps creating.
- `Sub:` row: when the picked parent has subcategories, pills of its children appear under the row.
  - Picking one sets `category_id` to the child; picking it again returns to the parent.
  - A choice made in `Ver todas` that is a child shows its parent selected and the child pill selected.

### 3.5 Date

- `Quando foi?` (< 1024 only), then chips:
  - `Hoje`, which reads `Hoje ({d mmm})` at ≥ 1024;
  - `Ontem`;
  - `Outra data` with a calendar icon. It opens the shipped date field; after a pick, the chip shows `dd/mm/aaaa`.

### 3.6 Note

A field row with a note icon and the placeholder `Adicionar nota ou observação...`. A clear button (`Limpar observação`) appears when the field has text. Its accessible name is `Observação`.

### 3.7 Repetir and Parcelar (shipped behavior)

- `Repetir lançamento (Série)` with a repeat icon and a switch. Presets `2×` `3×` `6×` `12×` `Outro`.
- The summary line with a lightbulb: `{n}× de {valor} · repete todo dia {d} até {mmm aaaa}`. The frequency choice `Mensal / Semanal / Anual` is §12.P1.
- `Parcelar compra` with a calculator icon. Lines:
  - `Divide o valor total de {total} em {n} parcelas automáticas`;
  - `Projeção: {n}× de {parcela}`;
  - when the cents do not divide: `Última parcela será ajustada para {última} devido a centavos residuais.` This is the shipped R9 rule: truncate each to cents, remainder on the last.
- The link: `Prefere transformar em conta fixa recorrente?` then `Criar como Conta Fixa` with an arrow. Same behavior as the shipped Transformar.

### 3.8 Keypad (< 1024, coarse pointer)

- A 4×3 grid of 56 px keys: `1`–`9`, `,`, `0`, `⌫` (`Apagar`). It sits under the note and writes into the amount.
- The amount input gets `inputMode="none"` while the keypad shows, so the system keyboard stays closed.
- A hardware keyboard and paste still work.
- Repetir and Parcelar follow the keypad.

### 3.9 Footer

- ≥ 1024: `Pressione Enter ↵ para salvar` at the left (`kbd`), then `Cancelar` and `Salvar Lançamento` (check-circle icon).
- < 1024: `Salvar Lançamento`, full width and pinned.
- Enter submits the form from any field except the note.

**Acceptance, §3**

- Title and description per width. The kind reads `Entrada` / `Conta` / `Diário` with icons.
- `VALOR DO GASTO`, and cents lighter.
- No `Nova` chip. `Sub:` appears for a parent with children and saves the child id.
- `Hoje ({d mmm})` at ≥ 1024, then `Ontem` and `Outra data`. The note placeholder and the clear button.
- The keypad at 375 types `12.345,67`, and `⌫` deletes. `Salvar Lançamento` stays visible above the fold at 375×812 with the keypad shown (the SOL-65 pinned-save e2e still passes).
- Repetir summary `12× de R$ 39,90 · repete todo dia 10 até out 2027`.
- Parcelar shows the residual line for `R$ 1.000,01` in 10.
- `Criar como Conta Fixa` opens the bill sheet prefilled.

---

## 4. Editar série

`entities/transaction/scope-radio.tsx`, `transaction-sheet.tsx` (series branch). FIDELITY 10.x.

Order inside the sheet:

1. Chip `∞ Parte de uma série de {total} meses`.
2. Title `Editar Lançamento Recorrente`.
3. `Você está editando a parcela {pos} de {total}:` then `"{nota ou categoria}"` and `({valor})`.
4. `Escopo da Alteração`: radio cards, each with a line under its label.
5. `VALOR POR PARCELA` and its helper.
6. `DURAÇÃO DA SÉRIE` with `Ciclo Atual`.
7. `DIA DE VENCIMENTO` and its note.
8. Kept from today, not drawn: Categoria, Observação.
9. Footer.

**Scope cards**

| Option | Line (edit) | Line (delete) |
|---|---|---|
| `Só este lançamento` | `Apenas a parcela de {Mês/aaaa} será alterada. As outras {k} parcelas futuras continuam iguais.` (`A outra parcela futura continua igual.` when k = 1; `É a última parcela da série.` when k = 0) | `Apenas a parcela de {Mês/aaaa} será excluída.` |
| `Este e os próximos` + badge `RECOMENDADO` | `Altera a parcela {pos} e todas as subsequentes até o fim da série programada.` | `Exclui a parcela {pos} e todas as subsequentes.` |
| from member 1: `Toda a série ({total} lançamentos)` | `Todos os {total} lançamentos da série.` | same |

- `k = total − pos`.
- `Toda a série` from a middle member is §12.P2.
- The delete flow keeps its legend `Excluir quais?` and uses the delete lines.

**Value.** Helper: `Novo valor monetário aplicado a partir desta cobrança.` With `Só este lançamento`, it reads `Novo valor aplicado só a esta cobrança.`

**Duration**

- Chips `3 meses`, `6 meses`, `12 meses`, `Customizado` (2–60). The current total is checked; `Ciclo Atual` resets to it.
- Shorter: `Série encurtada: Remove os {n} últimos meses. Termina em {Mês/aaaa}.` (`Remove o último mês.` when n = 1), with a lightbulb icon.
- Longer (not drawn): `Série estendida: Adiciona {n} meses. Termina em {Mês/aaaa}.`
- Shorter, outflow series only: `Economia projetada de {n × valor} no orçamento previsto.`

**Day.** When the day changes under `Este e os próximos`: `Os próximos lançamentos também serão movidos automaticamente para o dia {d}.` (calendar icon; D20).

**Footer.** `Excluir da Série...` at the left (destructive ghost; opens the scope cards in delete mode), `Cancelar`, `Salvar Alterações na Série`.

**Toasts.**

- After a resize: `Série ajustada com sucesso para {n} meses futuros.`
- Otherwise the shipped `Série atualizada`.
- After a day move, the shipped `Série movida para o dia {d}`.

**Acceptance, §4**

- The order above, at 375 and 1440.
- Scope lines with the right `k` for positions 1, 3 of 12, 11 of 12 and 12 of 12.
- Delete lines never say `alterada`.
- `RECOMENDADO` on `Este e os próximos`.
- Shortening 12 → 6 from March 2026 shows `Termina em Agosto/2026` and the economy line. Shortening an income series shows no economy line.
- The day note appears only after a day change.
- `Excluir da Série...` opens delete mode.

---

## 5. Para onde vai

`widgets/category-breakdown/category-breakdown.tsx`, `app/(app)/(shell)/para-onde-vai/page.tsx`. FIDELITY 3.x, 4.x. Outflow only: the Saídas / Entradas switch is removed (3.5).

### 5.1 Desktop (≥ 1024)

**Header row** (not a card):

- a white pill `◔ Para Onde Vai` (`PieChart`);
- a divider and `Visão analítica de despesas e alocação de capital`;
- a red pill `● Total Saídas: {outflow_total}`;
- the select `Todas as Categorias` (or a group; choosing one equals picking its row);
- an icon button `Exportar CSV`.

The row wraps at 1024.

**Grid.** Two columns at ≥ 1280: left Composição, then Detalhamento; right Top 5, then the panel. One column at 1024–1279.

**Composição de Gastos**

- Eyebrow `ALOCAÇÃO REAL`.
- Donut by group. The center reads `TOTAL GASTO`, the amount, and `✓ {n} categorias` in `--income`, where n is the group count.
- Legend 2×2 for the top 4 groups: dot, name, share. The picked group is highlighted, and a tap picks it.

**Top 5 Maiores Gastos do Mês**

- Eyebrow `CONCENTRAÇÃO`; at the right, `Representa {x}% das despesas`, the sum of the five shares.
- Rows: `#{i}`, group name, amount, `({pct})`, and a bar in the group color.

**Detalhamento por Grupo**

- Eyebrow `HIERARQUIA`, and `Recolher tudo` (`Expandir tudo` when all are closed).
- Group row (the row and the chevron are sibling buttons):
  - icon, name, `{pct}`, `{n} subcategorias` (`1 subcategoria`), amount;
  - delta: `0% estável` (muted), `+{d}% vs {mmm}` (`--expense`) or `-{d}% vs {mmm}` (`--income`); none when `delta_pct` is null.
- Expanded: an inset panel of children with dot, name and amount. A zero amount is muted. The shipped `(sem subcategoria)` row stays.
- Picked group: a left accent bar, a badge `Ativo`, and `{pct} do total gasto` in primary.

**Panel** (content: a group is picked)

- Header: icon, `Lançamentos: {grupo}`, pill `{n} itens`, then `Total no recorte selecionado: {total}`. Count and total cover the month's entries of the group and its children, with the API amount for the total.
- Select `Todas as subcategorias` / each child; it narrows the list and the total.
- Row:
  - title `{nota ou categoria} ({subcategoria})`; the parentheses appear only for a child;
  - caption `{dd/mm}`, plus `· Parcela {p}/{t}` for a series;
  - amount `- R$ …`;
  - status `Saída liquidada` when date ≤ today, else `Agendada`.
- After the month's rows, up to 3 of last month's entries of the group, muted with a history icon. Caption `{dd/mm} · Mês anterior (para comparativo)`, status `Referência {mmm}`. They are not counted in the total.
- `+ Adicionar lançamento em {grupo}` (shipped). `Ver histórico anual` is §12.P8 and absent until then.

**Export.** CSV, `;`-separated, UTF-8 with BOM. Columns `Grupo;Subcategoria;Valor;Percentual`, with pt-BR decimals. File `soldi-para-onde-vai-{aaaa-mm}.csv`. Built from the report, never floats.

### 5.2 Mobile (< 1024)

1. Page hero (§1.4).
2. `Composição de Gastos` with a pill `{n} Categorias`; donut center `TOTAL DE SAÍDAS` and the amount. No legend.
3. `Detalhamento` with `Toque para filtrar`. Rows have icon, name, `{pct} das despesas`, a delta chip (`0%`, `+18%` red, `-6%` green) and the amount. No chevrons. The picked row is tinted, with a primary dot.
4. `Top Categorias` with `Peso relativo`: the top 4, name and share over a bar.
5. `Transações: {grupo}` (content: a group is picked), with a group-color dot and a pill `{n} lançamentos`. The first 3 rows (tinted icon, name, `{dd/mm}`, red signed amount), then `Ver todas as transações de {grupo}` with an arrow, which shows the rest in place.

**Empty month.** The header and `Nenhum gasto neste mês ainda.`; no cards.

**Acceptance, §5**

- No Entradas switch.
- Header row with `Total Saídas:` and the export. The CSV matches the report with pt-BR decimals.
- Donut `TOTAL GASTO` with `✓ n categorias`, and the 2×2 legend.
- Top 5 by group with `#i` and `Representa x% das despesas`.
- Group rows with delta copy (`0% estável`, `+18% vs out`); `Recolher tudo`; `Ativo` on the picked group.
- Panel: count, total, the subcategory select, `(Subcategoria)` titles, statuses, and the last-month reference rows outside the total.
- At 375: hero with eyebrow and switcher, the four cards in order, `Ver todas as transações de …`.
- Picking `Todas as Categorias` clears the pick.

---

## 6. Cofrinhos

`widgets/cofrinhos/cofrinhos.tsx`, `entities/cofrinho/`, `crates/soldi-server/src/cofrinhos`. FIDELITY 5.x.

### 6.1 Header

- Eyebrow `POUPANÇA ATIVA & FUTURO` and h1 `Cofrinhos & Metas de Poupança`.
- `+ Novo Cofrinho` at the right, filled `--brand`.

### 6.2 Hero card

- Eyebrow `TOTAL GUARDADO EM COFRINHOS` and a badge `Protegido` (lock icon); `total_saved` in `Money`.
- Line: `{+R$ x} este mês. Saldo protegido de gastos correntes da conta principal.` The value is `saved_this_month` of the switcher's month (new `?month=`, §6.6), signed. At zero: `Nada guardado este mês. Saldo protegido de gastos correntes da conta principal.`
- Buttons:
  - `Guardar Dinheiro` (piggy icon, filled): opens Guardar with a cofrinho picker;
  - `Resgatar`: opens Resgatar with a picker of cofrinhos with balance > 0; disabled at total 0;
  - an icon button `Movimentos`: a sheet of every cofrinho's movements (§6.6).
- `Meta Global Consolidada: {Σ saldos com meta}` then `de {Σ metas}`, a pill `{pct}% concluído` (one decimal), and a bar. Content: at least one cofrinho has a target.

### 6.3 Grid

- Heading `Seus Cofrinhos`, pill `{n} ativos` (Reserva Livre excluded).
- At the right:
  - a filter menu: `Todos`, `Em andamento`, `Meta batida`, `Sem meta`;
  - a grid / list toggle (`aria-pressed`). List is one column of the same cards.
- Columns: 3 at ≥ 1280, 2 at 1024, 1 below.

**Goal cofrinho card**

- Top: a 48 px rounded-square icon tile (color at 15%, glyph in color), and at the right the status badge:
  - `● Foco atual · {pct}%`: the goal cofrinho with the nearest future `deadline`;
  - `Longo prazo · {pct}%`: deadline more than 12 months away, or none;
  - `● Em andamento · {pct}%`: otherwise;
  - `✓ Meta batida`: when `done`.
- Name; `Money` with small cents and `de {meta}`; `CofrinhoBar`; the shipped `Faltam {x} · {y}/mês até {mmm aaaa}` with the Faltam amount bold and the monthly amount in `--income`.
- Info chip, muted and rounded, the first that applies:
  - `Aporte automático: {valor} todo dia {dd}` from `next_contribution` (§6.6);
  - at balance 0 with a deadline: `Prazo: {n} meses`.
- Footer:
  - `+ Guardar` (tonal);
  - `Resgatar` (text; absent at balance 0);
  - `⋮`: `Movimentos`, `Editar`, `Excluir`.
  - At balance 0, `+ Guardar primeiro valor` full width, plus `⋮`.

**Reserva Livre card** (the Economia parent; shipped as `Sem objetivo`)

- A lock tile and `Reserva Livre`; `Money` and `sem teto fixado`.
- `Dinheiro guardado sem meta vinculada, para oportunidades ou despesas pontuais.`
- `+ Adicionar saldo livre`, plus `Resgatar` when the balance is > 0 (kept: Stitch draws none, and the resgate must stay possible).

**Create tile**, always last:

- dashed border, a `+` tile, `Criar novo objetivo ou sonho`;
- `Defina meta, prazo e acompanhe a evolução.`;
- `Começar objetivo`, which opens Novo cofrinho.

### 6.4 States

- First use (no goal cofrinho, total 0):
  - hero at `R$ 0,00` with `Nada guardado ainda.`;
  - no Meta Global;
  - the grid shows Reserva Livre and the create tile.
- Loading: the shipped skeleton. Error: `PageError`.

### 6.5 Removed

The circle icon with `25%` beside it, and the chevron. They are replaced by the tile, the badge and `⋮`.

### 6.6 Backend (computable, no new table)

**`GET /api/cofrinhos?month=YYYY-MM`.**

- `saved_this_month` for that month; the default is today's São Paulo month (D13).
- An invalid month gives 422 `invalid-month`.

**`Cofrinho.next_contribution: { amount: Decimal string, day: i16 } | null`.**

- The earliest member dated after today of any series whose rows carry this cofrinho's `category_id`.
- One query for all cofrinhos: `DISTINCT ON (category_id) … ORDER BY category_id, date`, with `t.user_id = $1` and the join `c.user_id = t.user_id`.

**`GET /api/cofrinhos/{id}/movements`.** When `{id}` is the Economia parent, it also returns its children's movements, with each row's `category_id`.

OpenAPI snapshot updated.

**Acceptance, §6**

- Header and hero copy verbatim. `+R$ x este mês.` follows the switcher month.
- `Guardar Dinheiro` and `Resgatar` open their forms with a picker. `Movimentos` lists all.
- Meta Global sums only cofrinhos with a target.
- Badges for each state, the nearest deadline being `Foco atual`.
- `Aporte automático` appears for a cofrinho with a future series member. `Prazo: n meses` appears for an empty one with a deadline.
- `⋮` holds Movimentos, Editar and Excluir.
- Reserva Livre copy; create tile last.
- Filter and grid / list work.
- Backend: user isolation on all three changes (another user's series never fills `next_contribution`); `?month=` bounds; the parent movements include children.

---

## 7. Economia do ano

`widgets/savings-year/savings-year.tsx`, `crates/soldi-server/src/reports`. FIDELITY 6.x, 7.x. It stays under Cofrinhos on `/economia`.

### 7.1 Header band

| | ≥ 1024 | < 1024 |
|---|---|---|
| Eyebrow | `PLANEJAMENTO & METAS • Exercício Fiscal` | `PLANEJAMENTO & METAS` |
| Title | `Evolução e Poupança Anual` | `Evolução e Poupança` |
| Subtitle | `Acompanhe aportes regulares e a consistência da sua reserva financeira.` | — |
| Switcher | year, hero tone, calendar icon | year, hero tone |

### 7.2 Summary

- Eyebrow `TOTAL CONSOLIDADO` (≥ 1024) / `Total Guardado no Ano` (< 1024); `saved_total`; pill `↗ {rate_pct}% das entradas`.
- At ≥ 1024, a muted box of two tiles:
  - `Entradas no ano` `{income_total}`;
  - `Meses no Azul` `{k} / {n}`: k is the months with `saved > 0`, n the months up to today's in the year.
  - Stitch's box title `Projeção de Fechamento`, `Média mensal` and `Taxa Real` are cut (R-avg, R-CDI).
- Tiles:
  - `Consistência {aaaa}` / `{k} Meses Consecutivos` (≥ 1024), or `{k} Meses` + `Consecutivos ativos` (< 1024). k is the run of months with `saved > 0` ending at today's month (or the month before, if today's has not saved yet). Absent when k = 0.
  - `Maior Aporte Único` / `{valor} ({Mês})` (≥ 1024), the month with the largest `saved`. Absent when none is > 0.

### 7.3 Detalhamento Mensal

- Heading `Detalhamento Mensal` with a pill `{n} registros` (≥ 1024) or `{n} meses` (< 1024).
- At ≥ 1024, the subtitle `Toque nos valores aportados para ajustar os lançamentos rapidamente.`
- The legend `< 5%` / `5% – 15%` / `> 15%` (shipped thresholds).
- `Exportar` at ≥ 1024: a CSV of the rows.

**Table, ≥ 1024.** January first (or the opening month). Columns `MÊS`, `ENTRADAS`, `GUARDADO`, `% GUARDADO` (pill with dot and word for screen readers), `STATUS / OBSERVAÇÃO`, `AÇÃO`.

- Today's month: accent bar and badge `MÊS ATUAL`. Guardado is a button with a pencil that opens `/para-onde-vai?m={mês}&g=economia` with Economia picked. Status: `Em andamento (fechamento em {n} dias)`, or `Fecha hoje`.
- Months after today (§7.4): muted, Entradas with `(Previsto)` under it, a grey rate dot, status `Previsto`.
- Past months: empty status until §12.P6.
- `AÇÃO`: a `…` menu with `Abrir no Mês`.

**List, < 1024.** Newest first (shipped).

- Today's month sits in a tinted card with `ATUAL` and a pencil on the amount.
- Rows: `Entradas: {x}`, the amount, the dot and the rate.

**Content.** Some month of the year has income or saved ≠ 0. A fresh account shows no section.

### 7.4 Backend

`GET /api/reports/savings?year=` returns every month from January (or the opening month) to December of that year.

- New field `forecast: bool`, true for months after today's São Paulo month. It is computed from entries already entered (D16), in the same `GROUP BY` month query.
- `income_total`, `saved_total` and `rate_pct` still cover months up to today's only.
- Future years still return empty, and `Próximo ano` stays disabled past the current year.

**Acceptance, §7**

- Band copy per width. Summary and tiles per the rules, each absent at zero.
- The desktop table is ascending, with `MÊS ATUAL`, the pencil link, `(Previsto)` rows after today, and `Exportar`.
- Mobile: tinted current card.
- Backend: December appears with `forecast: true` and its entered amounts, and the totals exclude it. Tests at the year boundary, at the opening month mid-year, and for isolation. `rate_pct` rounding is unchanged.

---

## 8. Contas fixas

`widgets/bill-list/bill-list.tsx`, `features/edit-bill/edit-bill-sheet.tsx`, `app/(app)/(shell)/ajustes/contas/page.tsx`. FIDELITY 12.x.

### 8.1 Header

- Breadcrumb `Configurações › Contas Fixas`; `Configurações` links to `/ajustes`. It replaces `‹ Ajustes`.
- h1 `Contas Fixas Recorrentes`, then `Despesas mensais que compõem sua base fixa de orçamento.`
- At the right:
  - `Status: Todos` (select: `Todos`, `Ativas`, `Pausadas`; the same state as the tabs);
  - `⊕ Nova Conta Fixa`. At ≥ 1280 it focuses the side form; below, it opens the sheet.

### 8.2 Summary

Two cards. Content: at least one bill.

**`Total de Despesas Fixas`** with a pill `{n} contas` (active bills):

- the active total in `Money`;
- `● Compromete {p}% da renda líquida`, the switcher month's `totals.income`;
- at income 0: `Sem entradas em {mês}`.

**`Próximo Vencimento`** with a pill:

- `Hoje`, `Amanhã` or `Em {n} dias`; `Vencida` in red for overdue;
- name, `Money`, and `Vence no dia {dd}` with a calendar icon;
- none ahead: the shipped `Nada a vencer este mês` or all-paid copy.

### 8.3 List

- Tabs `Todas ({n})`, `Despesas ({ativas})`, `Pausadas ({p})`.
- At the right, `ORDENAÇÃO:` with a select `Vencimento` (default) / `Valor` / `Nome`.

**Table, ≥ 1024.** Header `CONTA / CATEGORIA`, `VENCIMENTO`, `VALOR MENSAL`, `AÇÃO / STATUS`. Row:

- a tinted icon circle;
- the name (truncates with a `title`) over the category name;
- a pill `Dia {dd}`;
- the amount with small cents;
- the `Switch` (`Ativa`; the shipped pause with undo);
- `⋮` with `Editar` and `Arquivar` (the shipped archive with undo).

A paused row has the badge `Pausada`, its amount struck through and muted, and the switch off. Paused rows sort after active ones under `Todas`.

**Cards, < 1024.** The same parts, without the header row.

**Footer.** `Mostrando {visíveis} de {total} contas fixas configuradas`, and `✓ Sincronizado com projeção de caixa`.

### 8.4 Form

One form component, shared by the side panel (≥ 1280) and the sheet.

- Title `Adicionar Nova Conta` with `Formulário rápido`. Editing: `Editar Conta`.
- A static chip `Despesa Fixa`. `Receita Fixa` is cut (R-income).
- `Nome da conta fixa`, placeholder `Ex: Plano de Saúde Familiar`.
- `Valor mensal fixo estimado`.
- `Dia do vencimento recorrente`: chips `Dia 05`, `Dia 10`, `Dia 15`, `Dia 20`, and a number field 1–31 that follows them.
- `Categoria` select.
- `Periodicidade`: a static `Mensal (todo mês)` with `Fixo`.
- The shipped `Ativa` switch when editing.
- `✓ Salvar Conta Fixa`, and `Descartar alterações` (clears, or reloads the edited bill).
- `⋮ Editar` loads the bill into the panel at ≥ 1280 and into the sheet below.

The bottom `+ Nova conta` button is removed.

### 8.5 First use

No bills: the header, then the shipped `Nenhuma conta fixa ainda` with `⊕ Nova Conta Fixa`. The form panel shows at ≥ 1280.

**Acceptance, §8**

- Breadcrumb and copy verbatim; no `receitas` anywhere (grep).
- The summary excludes paused bills. `Compromete` follows the switcher month. The pill reads `Em 2 dias` two days before.
- Tabs and Status stay in sync, with counts. The three sort orders work.
- A paused row is struck through. `⋮ Arquivar` undoes.
- The side form at 1280 and 1440 saves and edits. At 375 and 1024 the sheet uses the same form.
- The footer count follows the filter.

---

## 9. Categorias

`widgets/category-list/category-list.tsx`, `entities/category/category-sheet.tsx`. FIDELITY 13.x.

### 9.1 Header

- Breadcrumb `Configurações › Gestão de Categorias`.
- h1 `Categorias & Subcategorias`, then `Organize seus lançamentos por tipo de fluxo financeiro com paleta de cores e ícones do design system Soldi.`
- At the right:
  - search `Buscar categoria...`. It filters parents and children, ignoring case and accents. No match: `Nenhuma categoria encontrada.`
  - `⊕ Nova Categoria`.

### 9.2 Tiles

**`ESTRUTURA ATIVA`.** `{n} categorias principais`, and a chip `{m} subcategorias vinculadas` (all kinds, archived excluded).

**`MAIOR CONCENTRAÇÃO`** (content: the switcher month has outflow):

- the top group's name, with `({filhos joined " & "})` when it has children;
- a bar and `{pct}% dos gastos de {Mmm}`.

### 9.3 Kind tabs

- `Gastos Diários ({n})` (bag), `Contas Fixas ({n})` (receipt), `Entradas & Receitas ({n})` (wallet), in that order.
- The counts are parents. The shipped `?tipo=` keeps the choice.

### 9.4 Cards

Two columns at ≥ 1024, one below. Card:

- icon, name, `{Diário | Fixa | Entrada} · {n} subcategorias`, `⋮` (`Editar`, `Excluir`);
- `Total no mês`, the group amount of the switcher month (`/api/reports/categories`); 0 when absent;
- child rows: a dot in the parent color (lighter at zero), the name, `{k} lanç.` when k > 0 (counted from the month's entries), and the amount (muted at zero);
- `+ Adicionar subcategoria` (`+ Adicionar cofrinho` under the savings parent). It opens the form in Subcategoria mode with the parent preset.

### 9.5 Form

One component, side panel at ≥ 1280 and sheet below.

- Title `Nova Categoria` with a pill `Configuração`. Editing: `Editar Categoria`.
- A segment `Categoria Pai` / `Subcategoria`.
- `Nome do agrupador`, placeholder `Ex: Educação & Cursos`.
- `Tipo de Fluxo`: `Diário` / `Fixa` / `Entrada`, preset from the tab.
- Category Pai mode: `Cor de Destaque`, with the picked color's name at the right. Swatches are the kind's free tokens, current first (D15).
- Subcategoria mode: `Vincular à Categoria Pai`, a radio list of the kind's parents. A subcategory wears its parent's color (D15).
- `Ícone Representativo`: the shipped `IconPicker` grid.
- The shipped target and deadline fields when the parent is savings.
- `Prévia em tempo real`: icon circle, name and a pill `Novo`.
- `✓ Criar Categoria` (`✓ Salvar Categoria` when editing).

**Acceptance, §9**

- Copy verbatim. Search filters.
- Tile numbers match the data; Maior Concentração is absent with no outflow.
- Tabs in order with counts.
- Cards in 2 columns at ≥ 1024: `Total no mês` follows the switcher, and `1 lanç.` counts. `+ Adicionar subcategoria` presets the parent.
- The form offers only free colors and swaps to the parent list in Subcategoria mode. The preview updates live.

---

## 10. Ajustes

`app/(app)/(shell)/ajustes/page.tsx`; the subpages `termometro`, `moeda`, `saldo-inicial`, `apagar` and `conta` become sections. FIDELITY 14.x.

### 10.1 Page

- Breadcrumb `Configurações › Ajustes do Sistema`.
- h1 `Ajustes & Preferências`, then `Personalize os parâmetros de cálculo do termômetro, organização de contas e segurança dos seus dados`.
- At ≥ 1024, a sticky sub-nav card with icons. Each item is an anchor; the visible section is `aria-current`.

| Sub-nav item | Anchor |
|---|---|
| `Termômetro & Limites` | `#termometro` |
| `Moeda & Saldo Inicial` | `#moeda` |
| `Organização (Contas)` | `#organizacao` |
| `Gestão de Dados` | `#dados` |
| `Minha Conta & Segurança` | `#conta` |
| `Ajuda & Como Funciona` | `#ajuda` |

- Below 1024 the sections stack in the same order, with no sub-nav.
- The old subpage routes `router.replace` to their anchors, which keeps old links working in the static export.
- `/ajustes/contas` and `/ajustes/categorias` stay as screens.

### 10.2 Calibragem do Termômetro Financeiro (`#termometro`)

- Subtitle `Defina os pontos de corte de saldo disponível projetado que determinam em qual cor o seu mês fechará.` and a pill `Projeção em tempo real`.
- Four boxes, each with two tier dots, an `R$` input and a caption:

| Box | Field | Caption |
|---|---|---|
| `Crítico / Atenção` | `tier_red` | `Abaixo disso fica Crítico` |
| `Atenção / Apertado` | `tier_zero` | `Linha zero de equilíbrio` |
| `Apertado / Confortável` | `tier_yellow` | `Colchão de segurança mín.` |
| `Confortável / Folga` | `tier_green` | `Meta de poupança livre` |

- `SIMULAÇÃO DE ESCALA TÉRMICA`, with `Faixa Ativa Atual: {tier}` at the right: today's balance under the draft bounds.
  - The 5-segment bar has a marker labelled with today's balance.
  - Five tiles: `< {red}`, `{red} a {zero}`, `{zero} a {yellow}`, `{yellow} a {green}`, `> {green}`, in whole reais with `R$` on both ends.
  - The active tile is outlined.
- `Restaurar Padrões` writes the D9 sheet defaults into the draft, unsaved.
- `✓ Salvar Novos Limites` saves. Validation and toasts as shipped.

### 10.3 Moeda & Saldo Inicial (`#moeda`)

- Subtitle `Configure a unidade monetária principal e o saldo de largada das suas contas.`
- `Moeda Base do App`: radio cards. Picking one saves, with a toast.

| Card | Caption |
|---|---|
| `Real (BRL - R$)` | `Padrão Brasil` |
| `Dólar (USD - $)` | `United States` |
| `Euro (EUR - €)` | `Zona do Euro` |
| `Libra (GBP - £)` | `Reino Unido` |

- `Saldo Inicial da Conta Corrente`: a large amount input, with an info line `Usado para recalcular o fluxo desde o primeiro mês cadastrado.`
- Kept, not drawn: the opening `Data` field.
- Both save on blur, with the toast `Saldo inicial salvo` and `Desfazer`.

### 10.4 Organização (Contas) (`#organizacao`)

The two shipped rows: `Contas fixas` and `Categorias`.

### 10.5 Gestão de Dados & Zona de Perigo (`#dados`)

- Subtitle `Operações irreversíveis sobre seus lançamentos históricos.`
- `Selecione o escopo para exclusão:` and three radio cards. The month is the switcher month; the year is its year; the counts come from the shipped count endpoint.

| Card | Title | Caption |
|---|---|---|
| Month | `Mês atual` (today's month) or `Mês selecionado` | `{Mês aaaa} ({n} registros)` |
| Year | `Ano de {aaaa}` | `Todos os {k} meses deste ano` (k = months from January or the opening up to today's, in that year) |
| All | `Zerar tudo` | `Limpa toda a base da conta` |

- Danger box: `Ação destrutiva sem retorno`, then `Para confirmar exclusão em massa, digite CONFIRMAR no campo:`. An input with placeholder `CONFIRMAR`, and `Excluir Lançamentos`, disabled until the input equals `CONFIRMAR`.
- The shipped `Serão apagados …` preview line is removed; the card carries the count.

### 10.6 Minha Conta & Segurança (`#conta`)

- Subtitle `Credenciais de acesso, e-mail de recuperação e encerramento de sessão.`
- Tiles:
  - `NOME COMPLETO`, the name, and `Alterar dados`, which opens the shipped profile form;
  - `E-MAIL CADASTRADO` and the e-mail (`Verificado` is §12.P11);
  - `SENHA DE ACESSO` `••••••••••••` and `Trocar senha`, which opens the shipped password form.
- `Excluir conta definitivamente` in red: the shipped flow.
- `Sair da conta (Logout)`: the shipped sign-out.
- Kept: `Sair de todos os aparelhos`, a text link under it.

### 10.7 Ajuda & Como Funciona (`#ajuda`)

The shipped `Como funciona` row, and a caption `Versão {x}` moved from the sidebar.

**Acceptance, §10**

- Two panes at ≥ 1024, with the sub-nav tracking the scroll. Stacked at 375.
- `/ajustes/termometro` and the others land on their anchors.
- Calibragem: copy verbatim, the live scale and active tile, `Restaurar Padrões` without saving.
- Currency cards save. Saldo inicial saves on blur with undo.
- The delete cards show counts, and `CONFIRMAR` gates the button.
- Minha Conta tiles and actions. No Pro card; no sync line.

---

## 11. Posso comprar isso?

New route `app/(app)/(shell)/posso-comprar/page.tsx` and widget `widgets/purchase-simulator/`. It reuses the forecast math from `entities/forecast/` and `features/add-transaction/simulation.tsx`. FIDELITY 11.x.

### 11.1 Entry points

- The sidebar `Posso comprar isso?` is now a `Link` (active state).
- The Mês `Posso comprar?` link opens this route.
- Simular is deleted from Lançar: the switch, `initialSimulate`, and `onSimulate`.

### 11.2 Layout

- ≥ 1024: the header card full width. Left column: Parâmetros, then `Você sabia?`. Right column: verdict, curve, months, actions.
- < 1024: one column, in the order header, Parâmetros, results, tip.

### 11.3 Header

A sparkles tile, h1 `Posso comprar isso?`, a badge `SIMULADOR PREDITIVO`, and `Simulação sem risco: projeta o impacto futuro no seu fluxo de caixa sem salvar nenhum lançamento na conta real.`

### 11.4 Parâmetros

- Eyebrow `PARÂMETROS`, `Simular nova despesa`, `Descubra se cabe no orçamento sem comprometer os meses seguintes.`
- `Valor total estimado`: a large amount with `⌫`, which clears.
- `Modalidade de pagamento`, with `Sem juros` at the right; a segment `À vista` / `6x` / `10x` / `12x`.
- Info line:
  - installments: `{n} parcelas de {parcela} a partir de {Mês/aaaa}.`;
  - `À vista`: `Pagamento único em {d} de {Mês}, {aaaa}.`
  - Installments use R9 cents.
- `Primeiro vencimento`: a date field shown as `{d} de {Mês}, {aaaa}`; default today.
- `Categoria do bem ou serviço`: the top 4 daily chips and `Ver todas`. They name the draft only.
- `Comprometimento de Renda`: `{pct}% das entradas de {mês}`, one installment over today's month `totals.income`. Absent at income 0.
- `↻` (`Limpar simulação`) and `Calcular Projeção`. Results appear after Calcular and hide when any input changes.

### 11.5 Você sabia?

`O Soldi cruza seus lançamentos futuros e recorrentes já cadastrados (como IPTU, seguros e assinaturas) com a nova simulação para detectar riscos antes de você comprar.`

### 11.6 Verdict

Months run from today's to the last installment's.

- "Red" means the month's lowest day after the purchase is < 0 and was not before.
- "Fits" means no new red day.

**Red**

- Card on `--expense-soft`, eyebrow `VEREDITO DO ORÇAMENTO • ALERTA CRÍTICO`, pill `Déficit Projetado`.
- Title: `Em {Mês} você fica no vermelho: {menor saldo do mês}`.
- Body: `A compra cabe com folga em {meses sem vermelho, "A, B e C"}, mas a soma da {k}ª parcela ({parcela}) com as despesas já agendadas ({X} e {Y}) deixará seu saldo negativo em {|saldo|} no dia {d} de {Mês}.`
  - The first clause is omitted when there is no such month.
  - `{X}` and `{Y}` are the month's two largest scheduled outflows.
  - "sazonais obrigatórias" and "ao final do mês" are changed: the value is the lowest day (D23).
- A month already red without the purchase: `{Mês} já estava no vermelho sem a compra; com ela, o menor saldo vai a {depois}.`

**Fits** (not drawn)

- Card on `--income-soft`, eyebrow `VEREDITO DO ORÇAMENTO • CABE NO ORÇAMENTO`, pill `Sem déficit`.
- Title: `Cabe no orçamento: nenhum mês fica no vermelho.`

### 11.7 Curve

- `Curva de Saldo Projetado ({n} Meses)`, n months from today's to the last installment's, at most 12.
- Subtitle `Comparativo do saldo ao fechar cada mês` ("estimado" cut).
- Legend `Cenário Atual` (dashed, muted), `Com Nova Compra` (primary), `Alerta Vermelho` (red marks).
- Points are the month-end projected balance, before and after. A red line at zero is labelled `R$ 0,00 (Linha Zero)`.
- Recharts through the installed `components/ui/chart.tsx`, `aria-hidden`. The month cards below carry the same data for screen readers.

### 11.8 Months

- Heading `Projeção Mensal Comparativa (Antes vs. Depois)`, with `Vencimento no dia {d} de cada mês` ("estimado" cut).
- One card per month, laid out as the shared month grid (§2.8). Columns: 3 at ≥ 1024, 2 below.

| Part | Normal month | Red month |
|---|---|---|
| Header | `{Mês aaaa}` and `TierPill` of the lowest day after the purchase | adds a red accent and the pill `CRÍTICO` |
| Before | `Saldo Atual:` month-end before | `Saldo Atual Original:` month-end before |
| After | `Saldo Projetado:` month-end after | `Saldo com Compra:` month-end after |
| Footer | `Parcela {k}/{n}` with `Sem alteração` (k = 0) or `- {parcela}` | `Parcela {k}/{n} (+ {X}/{Y})` |

### 11.9 Actions (only on a red verdict)

- `O que você gostaria de fazer agora?`, then `Explore alternativas seguras para viabilizar sua compra sem entrar no cheque especial.`
- `Ver Detalhe de {Mês}`: `/mes?m=` of the first red month.
- `Testar em {n}x`: the next larger of 6, 10, 12. It recalculates. Absent at 12x.
- `Criar Cofrinho para juntar à vista`: Novo cofrinho with target = total and name = the category name.

**Acceptance, §11**

- The sidebar entry navigates and is active. Lançar has no Simular (grep for `initialSimulate` returns nothing).
- Copy verbatim except where listed.
- A 6× R$ 2.400,00 draft over a seeded forecast with March red shows:
  - the red verdict with the month, lowest balance, installment index and the two outflows;
  - the curve with both series;
  - six month cards, March with `CRÍTICO` and the original / com compra labels;
  - the three actions. `Testar em 10x` recalculates.
- A fitting draft shows the green verdict and no actions.
- Inputs changed after Calcular hide the results.
- `Comprometimento de Renda` is absent at income 0.
- No AI, Histórico or Cartão element.

---

## 12. Needs data: wait for the owner

Each item adds stored data, or reverses a domain rule. None is built until the owner says yes. Then each item becomes a card: backend first, with migration, `user_id` filter, OpenAPI and `qa`, then its UI from the matching section above.

| Id | Element | Contract | Reverses |
|---|---|---|---|
| P1 | `Mensal` / `Semanal` / `Anual` (9.8) | `repeat_every: "month" \| "week" \| "year"` on `CreateTransaction` and `UpdateTransaction`; D19 / D20 semantics per step | D14 (monthly only) |
| P2 | `Toda a série` from any member (10.7) | `Scope::All` on PATCH / DELETE | D20 (earlier members never change) |
| P3 | `Lançamento Automático` (12.17) | `bills.auto_post BOOLEAN NOT NULL DEFAULT false`, a daily job at the São Paulo day inserting the payment entry once | D8 wording (paying inserts) |
| P4 | Cofrinho note (5.13) | `categories.note TEXT NULL` (≤ 140) | — |
| P5 | `Meta Anual (20%)` (6.7, 7.3) | `settings.savings_target_pct NUMERIC(5,2) NULL`; progress = `saved_total` / (pct × `income_total` so far) | — |
| P6 | Month notes (6.14d, 7.8) | `month_notes(user_id, month, note)`, `PUT /api/months/{m}/note` | — |
| P7 | Payment method (1.19, 3.15d, 4.6d) | `transactions.payment_method TEXT NULL` plus a Lançar field Stitch does not draw | — (recommend dropping) |
| P8 | `Ver histórico anual` (3.18) | `GET /api/reports/categories/{id}/year?year=`, one `GROUP BY` month | — (screen not drawn) |
| P9 | `Personalizar` the chip row (9.3) | `categories.pin_rank SMALLINT NULL` | — |
| P10 | Simulation `Histórico` (11.4) | `localStorage` per user id, last 10 | D16 (a simulation is never stored) |
| P11 | E-mail `Verificado` (14.16) | `users.email_verified_at` + a verify-mail flow | — |
| P12 | `Liquidez Diária` / `D+0` (5.16), `Última sincronização` (14.2) | no source | — (recommend dropping) |

---

## 13. Screenshots and the fidelity check (every card)

- The real stack: axum, Postgres and `pnpm build`.
- Seeded with five-digit amounts (≥ `R$ 12.345,67`) in every money slot the card touches, negatives where they can occur.
- Widths 375, 1024, 1280 and 1440, light only. Saved to `docs/design/screens/SOL-79/<card>/`.
- Every run calls `expectNoClipped(page)` from `web/e2e/clipped.ts`.
- **Side-by-side.** For each Stitch frame the card touches, a composite saved as `<frame>-vs-stitch.png`. On the left the Stitch PNG; on the right the real screen at the frame's width (1440 for desktop frames, 390 for mobile frames), with the same data shape seeded.
- The reviewer walks the frame's `FIDELITY.md` rows and marks each B row done, or names the deviation. Any unlisted deviation is a finding.


## §12 decisions (orchestrator, 2026-11-11)

The owner asked the agents to decide. Build: P1 and P2 (with a confirmation for `Toda a série` from a middle member, since it rewrites past months), P4, P5, P6, P9, P10 (browser storage only, D16 holds), P11. Out: P3 (it would create entries without the user, D8), P7 (no input in Stitch), P8 (the screen it opens is not drawn), P12 (no data source). Cards SOL-93..96.
