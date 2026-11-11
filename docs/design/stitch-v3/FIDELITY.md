# Stitch v3 — fidelity diff (SOL-79)

The owner's 14 Stitch screens compared element by element with `developer` at 0.34.0 (`2945c88`). Current state is read from the code (paths under `web/src/`, `file:line`) and from the latest real screenshots in `docs/design/screens/SOL-64` … `SOL-78`. Stitch evidence is the copy in the HTML export (quoted verbatim) or the region of the PNG.

This file supersedes the "Not built" and "Cut" tables of `README.md` (SOL-72). Decision: D24 (fidelity by default) and D25 (a card with no content does not render). Spec: `docs/specs/2026-11-11-stitch-fidelity.md`. Plan: `docs/specs/plans/SOL-79.md`.

## Classes

- **B — build.** Fidelity: the element is built, changed or deleted to match Stitch. Deleting what Stitch replaces counts as B.
- **R — out by rule.** The owner's explicit list, 2026-11-11:
  - `R-card`: credit cards and fatura (a "Cartão Nubank" row is a plain conta fixa with its category);
  - `R-AI`: AI copy (Diagnóstico, Dica, Sugestões, Classificação automática, "Soldi AI");
  - `R-CDI`: CDI yield and investment returns;
  - `R-Pro`: the Pro plan;
  - `R-income`: recurring income;
  - `R-avg`: averages, estimates and "no ritmo atual" (D16);
  - `R-dark`: dark mode;
  - `R-bell`: the notifications bell.
  Where only a phrase breaks a rule, the element is B with that phrase adapted, and the phrase is listed as R.
- **D — needs data.** No API data exists. Each names the smallest field or endpoint and says whether existing rows can compute it.

Stitch's sample data (`Cartão Nubank`, `Pão de Açúcar`, `Enel`) is not a difference.

## How frame conflicts are resolved

The frames disagree in a few places. Resolution, applied everywhere below:

1. A mobile frame governs < 1024 px and a desktop frame governs ≥ 1024 px. Where they differ (the Mês hero, the Contas card, the tab label `Economia`), each breakpoint follows its own frame.
2. Within one breakpoint, the majority of frames wins. The top bar follows `mes-dashboard-desktop`, the owner's first screen and the majority. That means no top-bar breadcrumb (`Finanças Pessoais / Visão Geral` appears in 3 of 9 desktop frames, always with the same wrong page name), no search box (1 frame), `Lançar` in the top bar rather than the sidebar (1 frame), and the sidebar label `Cofrinhos`, not `Economia` (1 frame).
3. One switcher per page. Cofrinhos draws a second month switcher under the top-bar one; only the top-bar one is built.
4. An element a frame leaves out is not removed when doing so removes a capability the frame has no replacement for. These are listed as **kept** under each screen.

## Counts

| Screen | B | R | D |
|---|---:|---:|---:|
| 0. Shell (every frame) | 8 | 2 | 0 |
| 1. Mês, desktop | 28 | 4 | 1 |
| 2. Mês, mobile | 7 | 3 | 0 |
| 3. Para onde vai, desktop | 15 | 4 | 2 |
| 4. Para onde vai, mobile | 7 | 1 | 1 |
| 5. Cofrinhos | 12 | 7 | 5 |
| 6. Economia anual, desktop | 13 | 5 | 3 |
| 7. Economia anual, mobile | 5 | 2 | 2 |
| 8. Lançar, mobile | 8 | 0 | 0 |
| 9. Lançar, desktop | 11 | 0 | 2 |
| 10. Editar série | 13 | 0 | 1 |
| 11. Posso comprar isso? | 17 | 3 | 1 |
| 12. Contas fixas | 14 | 6 | 1 |
| 13. Categorias | 12 | 2 | 0 |
| 14. Ajustes | 14 | 1 | 2 |
| **Total** | **184** | **40** | **21** |

---

## 0. Shell — every frame

`widgets/app-shell/app-shell.tsx`.

| # | Stitch | Today | Class |
|---|---|---|---|
| 0.1 | Top bar: tier pill `● Confortável` left of `+ Lançar` | No pill. The bar holds the title, the switcher and Lançar (`app-shell.tsx:204-218`) | B |
| 0.2 | `notifications` bell | — | R-bell |
| 0.3 | Avatar button (`person`) right of `Lançar` | Desktop has none. The avatar is only in the mobile greeting card (`app-shell.tsx:192-202`) | B |
| 0.4 | Month switcher at the left of the top bar on Mês, Contas fixas, Categorias, Ajustes, Cofrinhos and Posso comprar | Only on `MONTH_PAGES = ["/mes", "/para-onde-vai"]` (`app-shell.tsx:62`, `:205-211`) | B |
| 0.5 | No page title in the top bar (Mês frame) | `current?.label` at 22 px (`app-shell.tsx:204`) | B (delete; page headers carry the title) |
| 0.6 | Sidebar footer: avatar, name and e-mail only | Also the version and a sign-out button (`app-shell.tsx:179-184`) | B (delete both; sign out is `Sair da conta (Logout)` in Ajustes, 14.15) |
| 0.7 | Footer `Plano Pro` (Para onde vai, Cofrinhos, Posso comprar frames) | — | R-Pro |
| 0.8 | Mobile app bar: `● Soldi` left, page title centered, avatar right | A card `Olá, {nome}` with the avatar (`app-shell.tsx:192-203`; `screens/SOL-73/mes-375.png`) | B |
| 0.9 | Mobile tab bar: full-width white bar, `Mês`, `Para onde vai`, a raised center `+`, `Economia`, `Ajustes`; active tab in primary | A floating pill with 4 tabs plus a separate FAB at the right, label `Cofrinhos` (`app-shell.tsx:35-40`, `:225-243`) | B |
| 0.10 | Mobile page hero: an indigo band holding an eyebrow, the title and the switcher (Para onde vai, Economia), or the greeting and the switcher (Mês) | The switcher sits in its own card above (`app-shell.tsx:205-211`); `CompactHeader` holds the title only (`widgets/month-header/month-header.tsx:8-23`) | B |
| 0.11 | Sidebar groups MENU / CONFIGURAÇÕES, `Posso comprar isso?` in MENU | Equal (`app-shell.tsx:44-58`, `:151-156`) | — |

## 1. Mês, desktop — `mes-dashboard-desktop`

`app/(app)/(shell)/mes/page.tsx`. Shipped: `screens/SOL-76/mes-glance-1440.png`, `screens/SOL-74/mes-contas-1440.png`.

**Layout**

| # | Stitch | Today | Class |
|---|---|---|---|
| 1.1 | Two stacks: main (hero, Contas a pagar, Lançamentos) and a rail (Termômetro, Próximos meses, Cofrinhos, Para Onde Vai) | A 3-column grid with pinned `xl:row-start-*` (`mes/page.tsx:86-148`). The rail order is Termômetro, Próximos meses, Para onde vai, Cofrinhos (`:134-148`) | B |
| 1.2 | Full-width red banner above the grid: `Dia 23 fica no vermelho: R$ -675,00.` + `Contas de fatura e condomínio previstas excedem o saldo em caixa projetado.` + `Ver o dia 23 →` | Two buttons inside the hero: the first red day and `Pior dia: …` (`mes/page.tsx:108-110`; `widgets/red-day-alert/red-day-alert.tsx:20-34`) | B (the cause sentence names the cause entries; "fatura" is dropped, R-card) |
| 1.32 | Every card renders only with content (owner, 2026-11-11) | Empty cards render: `Nenhuma conta fixa` (`bills-of-month.tsx:198-206`), `Nenhum lançamento ainda` (`ledger.tsx:276-282`), `Lance seus próximos meses…` (`months-ahead.tsx:53`), `Nenhum gasto neste mês ainda.` (`spending-glance.tsx:29`), `Nenhum cofrinho ainda…` (`cofrinhos-glance.tsx:37-55`); `screens/SOL-76/mes-glance-1440.png` | B |

**Hero**

| # | Stitch | Today | Class |
|---|---|---|---|
| 1.3 | White card; `SALDO HOJE EM CONTA`, `R$ 1.842,10` with cents raised, tier pill | Indigo gradient, `Saldo hoje` (`widgets/month-overview/month-overview.tsx:128-138`) | B |
| 1.4 | Tinted box at the top right: `Projetado no fim do mês`, `R$ -312,40`, pill `Atenção` | Projetado is the third figure of the summary (`month-overview.tsx:94-105`) | B |
| 1.5 | `Para onde foi a entrada deste mês` + `Total: R$ 6.361,60` and a 4-segment bar | None since SOL-69. `shared/ui/split-bar.tsx` exists and nothing renders it | B |
| 1.6 | Legend of 4: dot, `Contas fixas` / `Guardado` / `Gastos diários` / `Livre restante`, amount, `42,5%` | Dashboard spec labels `Contas` / `Guardado` / `Diário` / `Livre` (`docs/specs/2026-11-10-dashboard-redesign.md` §2.1) | B |
| 1.7 | No Entradas / Saídas / Projetado row under the hero | `MonthSummary` (`month-overview.tsx:64-111`) | B (delete at ≥ 1024; Entradas and Saídas move to the Termômetro box, Projetado to 1.4) |

**Contas a pagar**

| # | Stitch | Today | Class |
|---|---|---|---|
| 1.8 | One header row: `Contas a pagar` + badge `3 de 8 pagas`; under it `Próxima: dia 05 · R$ 2.259,56`; day chips `05 ••` right-aligned on the same row | Title, then `Próxima…`, a large total, `0 de 1 pagas`, and chips on their own row (`bills-of-month.tsx:194-260`; `screens/SOL-73/mes-375.png`) | B |
| 1.9 | No Todas / Pendentes / Pagas filter | A `ToggleGroup` at `lg` (`bills-of-month.tsx:27-31`, `:224-241`) | B (delete) |
| 1.10 | Row: round check, tinted icon circle, name, `Vence dia 10`, amount, `Pagar` pill | Round check, solid icon, amount; no `Pagar` pill (`bills-of-month.tsx:60-148`) | B |
| 1.11 | Paid row: filled check, name struck through, `Venceu dia 05 · Pago no prazo`, grey amount, green `Pago` | A `Pago` badge (`bills-of-month.tsx:48`); no strike, no "no prazo" | B |
| 1.12 | Overdue row: `!` in the check slot, red tint, clock + `Atrasada desde 5 nov`, red amount, red `Vencido` | Red tint and `Venceu dia 02/11` (`bills-of-month.tsx:47-58`) | B |
| 1.13 | `Cartão Nubank · Vence dia 15` | — | R-card |

**Lançamentos**

| # | Stitch | Today | Class |
|---|---|---|---|
| 1.14 | One row: `Lançamentos`, the `Todos` / `Diário` / `Contas` segment inline, `Ver o mês inteiro →` at the right | The filter sits on its own row (`ledger.tsx:252-270`); `Ver o mês inteiro (n dias)` is at the bottom (`:321`) | B |
| 1.15 | Day band `Hoje, 10 nov` … `Saldo ao final: R$ 1.842,10` `Confortável` | A tier pill with no label (`ledger.tsx:293`; `screens/SOL-76/mes-glance-1440.png`) | B |
| 1.16 | Future band `Previsto · 15 nov` … `Projeção: R$ 450,20` `Apertado`; its rows muted | `Agendado · 28 nov` and a `Previsto · Folga` pill (`ledger.tsx:34-43`; `screens/SOL-73/mes-375.png`) | B |
| 1.17 | Signed amounts: `- R$ 184,31`, green `+ R$ 1.500,00` | Unsigned (`screens/SOL-74/mes-contas-1440.png`) | B |
| 1.18 | Series chip `↻ Saída · 3/12` as a pill after the caption | Inline `Saída · 1/12` with a `Repeat` icon (`ledger.tsx:122-126`) | B |
| 1.19 | Payment method in the caption: `Diário · Débito Nubank`, `Entrada · Conta Principal` | — | D: no field and no Stitch input for it. Smallest: `transactions.payment_method TEXT NULL` plus a Lançar field Stitch does not draw. Not computable |
| 1.20 | `Cartão Nubank · Fatura prevista com fechamento dia 10` | — | R-card |

**Termômetro do Mês**

| # | Stitch | Today | Class |
|---|---|---|---|
| 1.21 | Gauge icon (`speed`), `Termômetro do Mês`, `67% Gasto` at the right | Thermometer icon, no percent (`month-overview.tsx:171-187`) | B |
| 1.22 | Box `Entradas` / `Saídas` / `Resultado` (`+ R$ 2.105,10` in green) | None in this card | B (`totals.income`, `totals.outflow`, `totals.performance`) |
| 1.23 | Marker `Você está aqui: Confortável` above the active tier | The active label is bold (`screens/SOL-76/mes-glance-1440.png`) | B |
| 1.24 | `Você comprometeu 67% das receitas líquidas.` | `Insight` (`month-overview.tsx:147-169`) leads with other copy | B |
| 1.24r | `O ritmo atual mantém o caixa no verde até o encerramento do ciclo.` | — | R-avg (adapted to the projected tier, spec §2.5) |

**Rail**

| # | Stitch | Today | Class |
|---|---|---|---|
| 1.25 | Próximos meses: icon, title and `Posso comprar? →` on one row | The link sits under the title (`widgets/months-ahead/months-ahead.tsx:65-90`) | B |
| 1.26 | 12 months in 4 columns: `Nov`, tier dot, `1.842`; a red month tinted | A 6 / 12 toggle (`months-ahead.tsx:14-17`, `:93`), 3 columns, `nov 2026`, the tier word, a red-day count badge (`entities/forecast/month-chips.tsx:9`, `:32-62`) | B (delete the toggle and the badge) |
| 1.27 | Cofrinhos: icon, `Ver todos →`; eyebrow `TOTAL GUARDADO` and the amount | `Guardado` left and the amount right (`widgets/cofrinhos-glance/cofrinhos-glance.tsx:60-66`) | B |
| 1.28 | Per cofrinho: name with `32%` right, a bar, `R$ 3.200,00` left and `Meta: R$ 10.000` right | `Troca de…  100% de R$ 12.000,00` over a bar (`cofrinhos-glance.tsx:66-84`) | B |
| 1.29 | Para Onde Vai: icon, `Para Onde Vai`, `Ver análise →` | `Para onde vai`, `Ver tudo` (`widgets/spending-glance/spending-glance.tsx:59-62`) | B |
| 1.30 | Rows: name and amount, a bar, `53,1%` under it at the right; no icon | Category icon circles (`spending-glance.tsx:30-55`) | B |
| 1.31 | `Cartão de Crédito` row | — | R-card |

## 2. Mês, mobile — `mes-mobile-home`

Shipped: `screens/SOL-73/mes-375.png`.

| # | Stitch | Today | Class |
|---|---|---|---|
| 2.1 | The indigo hero holds `Olá, Emerson` with an initial circle, the switcher, `SALDO HOJE`, the amount and the tier pill | Greeting card and switcher card above the hero (`app-shell.tsx:192-211`) | B |
| 2.2 | `Plano Pro` | — | R-Pro |
| 2.3 | Bell with a badge | — | R-bell |
| 2.4 | Entradas / Saídas / Projetado card overlapping the hero, with `Atenção` under Projetado | Equal (`month-overview.tsx:64-111`) | — |
| 2.5 | Order: hero, Contas, Termômetro | Hero, Contas, Lançamentos, Termômetro, … (`mes/page.tsx:108-148`) | B |
| 2.6 | `Contas do Mês` with an accent bar, `5 obrigações cadastradas`, `Ver todas`; no `Próxima`, total, count or day chips | `Contas a pagar` with all four (`screens/SOL-73/mes-375.png`) | B |
| 2.7 | Rows: solid colored icon, name, `Vence dia 05/11`, amount, pill `✓ Pago` / `Pagar` / `Vencido`; no round check | A round check (`bills-of-month.tsx:60-95`) | B |
| 2.8 | `Termômetro do Mês` + pill `67% Comprometido` | No pill | B |
| 2.9 | Tier labels in their own tier colors, the active one bold | Grey labels, active bold | B |
| 2.10 | Insight with a check icon: `Você comprometeu 67% da renda líquida.` | Other copy (`month-overview.tsx:147-169`) | B |
| 2.10r | `Mantendo este ritmo, seu caixa terminará no verde.` | — | R-avg (adapted, spec §2.5) |

Kept: the red-day banner at < 1024. The mobile frame does not draw it, but its data has a red day and the desktop frame shows it. A frame omission does not remove an alert.

## 3. Para onde vai, desktop — `para-onde-vai-analytics-desktop`

`widgets/category-breakdown/category-breakdown.tsx`. Shipped: `screens/SOL-75/para-onde-vai-1440.png`.

| # | Stitch | Today | Class |
|---|---|---|---|
| 3.1 | Header row: chip `◔ Para Onde Vai` and `Visão analítica de despesas e alocação de capital` | Top-bar title only (`app/(app)/(shell)/para-onde-vai/page.tsx:11-16`; `month-header.tsx:23` is `lg:sr-only`) | B |
| 3.2 | Red pill `Total Saídas: R$ 4.256,50` | — | B |
| 3.3 | Dropdown `Todas as Categorias` | — | B (picks a group, same state as tapping its row) |
| 3.4 | Download button | — | B (CSV of the month by group and subcategory) |
| 3.5 | No Saídas / Entradas switch | `ToggleGroup` (`category-breakdown.tsx:39-47`, `:361-380`) | B (delete; the page is outflow only) |
| 3.6 | Card `ALOCAÇÃO REAL` / `Composição de Gastos`; donut center `TOTAL GASTO`, amount, `✓ 5 categorias` | `Por categoria`; center `SAÍDAS DO MÊS` (`category-breakdown.tsx:39`, `:85-134`) | B |
| 3.7 | `Dentro da média` | — | R-avg |
| 3.8 | 2×2 legend under the donut: top 4 groups with dot and percent; the picked one highlighted | The group rows sit in the same card | B |
| 3.9 | Card `CONCENTRAÇÃO` / `Top 5 Maiores Gastos do Mês`, `Representa 98,6% das despesas`, rows `#1 Aluguel & Condomínio  R$ 2.259,56 (53,1%)` with a bar, by group | `Top 5` by leaf, `Aluguel › Reforma` (`category-breakdown.tsx:207-243`) | B |
| 3.10 | Card `HIERARQUIA` / `Detalhamento por Grupo` + `Recolher tudo` | Rows inside `Por categoria`, no collapse-all (`:136-205`, `:400`) | B |
| 3.11 | Group row: icon, name, `53,1%`, `2 subcategorias`, amount, `0% estável` / `+18% vs out` / `-6% vs out`, chevron | `60% das saídas`, amount, chevron; `DeltaBadge` with other copy (`:55-83`) | B |
| 3.12 | Children in an inset panel: dot, name, amount | Plain child rows | B |
| 3.13 | Picked group: left accent bar, badge `Ativo`, `4,3% do total gasto` in primary | Row highlight only | B |
| 3.14 | Panel: icon, `Lançamentos: Mercado`, pill `3 itens`, `Total no recorte selecionado: R$ 184,31`, dropdown `Todas as subcategorias` | `CategoryEntries` without the subcategory dropdown (`:245-309`) | B |
| 3.15 | Entry: tinted icon, `Pão de Açúcar (Supermercado)`, `05/11 · … · Parcela 3/12 de rotina`, signed amount, caption `Saída liquidada` | Name and amount | B |
| 3.15d | `Débito Nubank` in the entry caption | — | D (as 1.19) |
| 3.15r | `Classificado c/ tag` | — | R-AI |
| 3.16 | Last month's entries of the group, muted, `Mês anterior (para comparativo)` / `Referência out` | — | B (computable: the previous month's list) |
| 3.17 | `Adicionar lançamento em Mercado` | Equal (SOL-75) | — |
| 3.18 | `Ver histórico anual` | — | D: no per-category year series. Smallest: `GET /api/reports/categories/{id}/year?year=`, one `GROUP BY` month. Computable from entries; the screen it opens is not drawn |
| 3.19 | `Diagnóstico Inteligente Soldi` | — | R-AI |
| 3.20 | `Cartão Nubank · Fatura fechada dia 20` | — | R-card |

## 4. Para onde vai, mobile — `para-onde-vai-mobile-analytics`

Shipped: `screens/SOL-75/para-onde-vai-375.png`.

| # | Stitch | Today | Class |
|---|---|---|---|
| 4.1 | Indigo hero: `FLUXO DE DESPESAS • CONSOLIDADO`, `Para onde vai`, the switcher inside | Title band, switcher card above (`month-header.tsx:8-23`) | B |
| 4.2 | `Composição de Gastos` + pill `6 Categorias`; donut `TOTAL DE SAÍDAS` | `Por categoria`, `SAÍDAS DO MÊS` | B |
| 4.3 | `Dentro da média` | — | R-avg |
| 4.4 | Card `Detalhamento` + `Toque para filtrar`: icon, name, `53,1% das despesas`, delta chip `-0%` / `+18%`, amount; the picked row tinted with a dot; no chevrons | `60% das saídas` and chevrons | B |
| 4.5 | Card `Top Categorias` + `Peso relativo`: name, percent, bar; no amount | `Top 5` with amount and percent | B |
| 4.6 | Card `Transações: Mercado`, dot, pill `3 lançamentos`; rows tinted icon, name, `05/11`, red `- R$ 184,31` | Panel without count pill or signed amounts | B |
| 4.6d | `• Débito Nubank` | — | D (as 1.19) |
| 4.7 | `Ver todas as transações de Mercado →` | — | B (the panel shows 3, this shows the rest in place) |
| 4.8 | No Saídas / Entradas switch | Present | B (as 3.5) |

## 5. Cofrinhos — `cofrinhos-metas-desktop`

`widgets/cofrinhos/cofrinhos.tsx`. Shipped: `screens/SOL-76/cofrinhos-1440.png`, `cofrinhos-375.png`.

| # | Stitch | Today | Class |
|---|---|---|---|
| 5.1 | Eyebrow `POUPANÇA ATIVA & FUTURO`, title `Cofrinhos & Metas de Poupança` | `Cofrinhos` (`cofrinhos.tsx:444`) | B |
| 5.1r | `● 102% CDI` next to the eyebrow | — | R-CDI |
| 5.2 | Filled `+ Novo Cofrinho` | Outline `Novo cofrinho` | B |
| 5.3 | `TOTAL GUARDADO EM COFRINHOS` + badge `🔒 Protegido` | `GUARDADO` (`cofrinhos.tsx:274-297`) | B |
| 5.4 | `+R$ 48,20 este mês. Saldo protegido de gastos correntes da conta principal.` | `Este mês +R$ …` | B |
| 5.4r | `Rendendo 102% do CDI (aprox. …)` | — | R-CDI |
| 5.5 | Hero buttons `Guardar Dinheiro` and `Resgatar` | A piggy tile | B (each opens its form with a cofrinho picker) |
| 5.5d | History icon (all movements) | — | D: `GET /api/cofrinhos/{id}/movements` filters one exact id (`transactions::repo::movements`, `category_id = $2 OR cofrinho_id = $2`). Smallest: the parent Economia id also matches its children. Computable |
| 5.6 | `Meta Global Consolidada: R$ 5.416,53 de R$ 25.000,00`, `21,6% concluído`, bar | — | B (sum of targets, client side) |
| 5.7 | `Seus Cofrinhos · 4 ativos` with filter and grid/list icons | Heading and count equal (`cofrinhos.tsx:400`); no icons | B |
| 5.8 | Card: square icon tile top-left, status badge top-right `● Em andamento · 32%` | Round icon and `25%` / `✓ Meta batida` beside it (`cofrinhos.tsx:69-88`) | B |
| 5.9 | `Foco atual · 44%`, `Longo prazo · 0%` | — | D: no stored priority. Computable from `deadline` (nearest = Foco atual; more than 12 months away = Longo prazo) |
| 5.10 | `Aporte automático: R$ 500 todo dia 06` | — | D: computable from the cofrinho's next future series member. Smallest: `next_contribution: { amount, day } \| null` on `Cofrinho` |
| 5.11 | `No ritmo atual você atinge a meta 1 mês antes!` | — | R-avg |
| 5.12 | Footer `+ Guardar`, `Resgatar`, `⋮` | Guardar, Resgatar and a chevron that opens the sheet (`cofrinhos.tsx:90-148`) | B (`⋮`: Movimentos, Editar, Excluir) |
| 5.13 | `Meta para 2028 · Início planejado após consolidar a Reserva de Emergência.` | — | D: no description field. Smallest `categories.note TEXT NULL`. Not computable |
| 5.14 | `Prazo: 24 meses` (Stitch: `Prazo estimado: 24 meses`) | — | B ("estimado" dropped, R-avg; months to `deadline`) |
| 5.15 | `Reserva Livre`, `R$ 0,00 sem teto fixado`, `Dinheiro guardado sem meta vinculada, para oportunidades ou despesas pontuais.`, `+ Adicionar saldo livre` | `Sem objetivo` card (`cofrinhos.tsx:207`) | B |
| 5.16 | `Liquidez Diária`, `com liquidez diária imediata`, `Resgate em D+0 para sua conta corrente` | — | D: no bank or product data. Not computable; recommend dropping |
| 5.17 | Tile `Criar novo objetivo ou sonho`, `Defina meta, prazo e acompanhe a evolução.`, `Começar objetivo` | — | B |
| 5.17r | `com rendimento automático acima do CDI` | — | R-CDI |
| 5.18 | `Simulação Automática`, `Se mantiver o ritmo: R$ 14.800 em 1 ano` | — | R-avg |
| 5.19 | `Evolução do Rendimento CDI`, `Tributação …` | — | R-CDI |
| 5.20 | `Dica Inteligente Soldi`, `Aplicar R$ 50 agora` | — | R-AI |

## 6. Economia anual, desktop — `economia-anual-desktop`

`widgets/savings-year/savings-year.tsx`, under Cofrinhos on `/economia`. Shipped: `screens/SOL-77/economia-ano-atual-1440.png`.

| # | Stitch | Today | Class |
|---|---|---|---|
| 6.1 | Indigo band: `PLANEJAMENTO & METAS • Exercício Fiscal`, `Evolução e Poupança Anual`, `Acompanhe aportes regulares e a consistência da sua reserva financeira.`, year switcher `‹ 📅 2026 ›` | Card title `Economia do ano` and a switcher pill (`savings-year.tsx:20`, `:130-138`) | B |
| 6.2 | `TOTAL CONSOLIDADO`, `R$ 5.416,53`, pill `↗ 8,4% das entradas` | `Guardado em 2026`, pill `9,9% das entradas` | B |
| 6.3 | `Projeção de Fechamento`, `Média mensal: R$ 492,41` | — | R-avg |
| 6.4 | Tile `Receita Bruta R$ 64.482,80` | — | B, labelled `Entradas no ano` (`income_total`; Soldi stores net entries only, D8) |
| 6.5 | Tile `Meses no Azul 11 / 12` | — | B (months with `saved > 0` / months in range) |
| 6.6 | Tile `Taxa Real +0,82% a.m.` | — | R-CDI |
| 6.7 | Card `Meta Anual`, `Faltam R$ 7.306,67`, `Alvo estratégico de 20% sobre as receitas líquidas estimadas`, progress | — | D: no stored target. Smallest `settings.savings_target_pct NUMERIC(5,2) NULL`; the base becomes the entries so far ("estimadas" breaks R-avg) |
| 6.8 | `Meta sugerida para Dezembro: R$ 980,00` | — | R-AI / R-avg |
| 6.9 | `Detalhamento Mensal`, pill `12 registros`, `Toque nos valores aportados para ajustar os lançamentos rapidamente.` | No heading | B |
| 6.10 | Legend `< 5%` `5% – 15%` `> 15%` | Equal (`savings-year.tsx:22-34`, `:114`) | — |
| 6.11 | `Exportar` | — | B (CSV of the rows, client side) |
| 6.12 | Table at ≥ 1024: `MÊS`, `ENTRADAS`, `GUARDADO`, `% GUARDADO` (pill with dot), `STATUS / OBSERVAÇÃO`, `AÇÃO` | A list (`savings-year.tsx:45-85`) | B |
| 6.13 | January first | Newest first | B (ascending at ≥ 1024; mobile keeps newest first) |
| 6.14 | Status of the current month `Em andamento (fechamento em 8 dias)` | — | B (derived) |
| 6.14d | Free-text notes per month (`1ª parcela do 13º salário`) | — | D: no store. Smallest table `month_notes(user_id, month, note)` and `PUT /api/months/{m}/note`. Not computable |
| 6.15 | `MÊS ATUAL` badge and accent bar | Equal (`Atual`, `savings-year.tsx:62`) | — |
| 6.16 | Pencil on the current month's Guardado | — | B (opens Para onde vai on that month with Economia picked) |
| 6.17 | `Dezembro R$ 3.000,00 (Previsto)` | The year stops at today's month (`crates/soldi-server/src/reports/domain.rs:63-72`) | D: computable from entered future entries. Smallest: all 12 months with `forecast: bool` |
| 6.18 | `…` per row | — | B (`Abrir no Mês`) |
| 6.19 | `Os valores guardados consideram aportes em Tesouro Selic, CDBs…`, `Última sincronização` | — | R-CDI |
| 6.20 | Tile `Consistência 2026 · 10 Meses Consecutivos` | — | B |
| 6.21 | Tile `Maior Aporte Único · R$ 1.150,00 (Junho)` | — | B (largest month `saved`) |
| 6.22 | Tile `Rendimento Acumulado` | — | R-CDI |

Kept: the year view stays a section of `/economia` under the cofrinhos. Stitch draws it as its own screen, but no frame draws a way between the two, and the mobile tab `Economia` opens the same route.

## 7. Economia anual, mobile — `economia-mobile-anual`

Shipped: `screens/SOL-77/economia-ano-atual-375.png`.

| # | Stitch | Today | Class |
|---|---|---|---|
| 7.1 | Indigo hero `PLANEJAMENTO & METAS`, `Evolução e Poupança`, year switcher | Card title and switcher | B |
| 7.2 | `Total Guardado no Ano`, amount, `8,4% das entradas` | `Guardado em 2026` | B |
| 7.3 | `Meta Anual (20%)`, `42,5% concluído`, `Faltam R$ 7.306,67` | — | D (as 6.7) |
| 7.4 | `Dica inteligente: Meta sugerida…` | — | R-AI |
| 7.5 | Tile `Consistência 2026 · 10 Meses · Consecutivos ativos` | — | B |
| 7.5r | Tile `Rendimento CDI · Juros compostos` | — | R-CDI |
| 7.6 | `Detalhamento Mensal · 12 meses`, legend in a tinted bar | No heading | B |
| 7.7 | Current month in a tinted card with `ATUAL` and a pencil on the amount | Plain row with `Atual` | B |
| 7.8 | Note chip `1ª Parc. 13º` | — | D (as 6.14d) |

## 8. Lançar, mobile — `lancar-bottom-sheet-mobile`

`features/add-transaction/transaction-sheet.tsx`. Shipped: `screens/SOL-74/lancar-375.png`.

| # | Stitch | Today | Class |
|---|---|---|---|
| 8.1 | Title `Novo Registro`, round close | `Lançar` (`transaction-sheet.tsx:549`) | B |
| 8.2 | Segment `↓ Entrada` (green), `Conta` (receipt icon), `Diário` (bag icon) | `Entrada` / `Saída` / `Diário`, text only (`:41-43`) | B |
| 8.3 | `VALOR DO GASTO` | `VALOR` | B |
| 8.4 | `Categoria •` + `Ver todas`; a horizontally scrolling row of 48 px circles, no `Nova` | 5 chips and a dashed `Nova` (`entities/category/category-chips.tsx:21`, `:160-167`) | B (delete `Nova`; creating stays in Ver todas) |
| 8.5 | `Quando foi?` `Hoje` / `Ontem` / `Outra data` | `Hoje` and a date chip `11/11/2026` (`screens/SOL-74/lancar-375.png`); `DateChips` has `Ontem` (`shared/ui/date-chips.tsx:38-41`) | B |
| 8.6 | Note row: icon, text, clear button; placeholder `Adicionar nota ou observação...` | Labelled `Observação`, placeholder `Opcional` (`transaction-sheet.tsx:387-393`) | B |
| 8.7 | Numeric keypad `1`–`9`, `,`, `0`, `⌫` | Native keyboard through `inputMode` (`shared/ui/amount-input.tsx:24`) | B |
| 8.8 | `Salvar Lançamento` with a check icon | `Salvar` (`transaction-sheet.tsx:422`) | B |

Kept: Repetir and Parcelar at < 1024. The mobile frame stops at the keypad; the desktop frame has both.

## 9. Lançar, desktop — `lancar-modal-desktop`

Shipped: `screens/SOL-74/lancar-1440.png`. The export also holds the page behind the modal (`Saldo Atual Disponível`, `Orçamento Executado`, `Fatura Nubank fecha em 4 dias`); that is not part of Lançar.

| # | Stitch | Today | Class |
|---|---|---|---|
| 9.1 | `Novo Lançamento` + `Cadastre uma movimentação pontual ou recorrente` | `Lançar` + `Entrada, conta ou gasto do dia.` (`transaction-sheet.tsx:549-550`) | B |
| 9.2 | Amount `184` with `,31` lighter | One weight | B |
| 9.3 | `CATEGORIA` + `Personalizar` | Ranked by this month's use (`category-chips.tsx:43-53`) | D: no stored order. Smallest `categories.pin_rank SMALLINT NULL` + PATCH. Not computable |
| 9.4 | `Sub:` chips of the chosen parent's subcategories | — | B |
| 9.5 | `Hoje (10 nov)` / `Ontem` / `Outra data` | As 8.5 | B |
| 9.6 | Note with clear, placeholder `Adicionar nota ou observação...` | As 8.6 | B |
| 9.7 | `Repetir lançamento (Série)`, sync icon, switch | `Repetir` (`transaction-sheet.tsx:278`) | B |
| 9.8 | `Mensal` / `Semanal` / `Anual` | Monthly only: `repeat_months` (`crates/soldi-types/src/transactions.rs:68`) | D: smallest `repeat_every: "month" \| "week" \| "year"` on `CreateTransaction`. Reverses D14's monthly-only series |
| 9.9 | `2× 3× 6× 12× Outro` | `2x` with a Latin x (`transaction-sheet.tsx:322`) | B |
| 9.10 | `💡 12× de R$ 39,90 · repete todo dia 10 até out 2027` | `12× R$ 39,90 · até out 2027` (`:348`) | B |
| 9.11 | `Parcelar compra`, `Divide o valor total de R$ 1.000,00 em 10 parcelas automáticas`, `Projeção: 10× de R$ 100,00`, `Última parcela será ajustada para R$ 100,01 devido a centavos residuais.` | `Parcelar` and `· até …` (`:294`, `:357`). The remainder rule exists (`transactions/domain.rs:328`) | B |
| 9.12 | `Prefere transformar em conta fixa recorrente? Criar como Conta Fixa →` | `Prefere uma conta fixa, sem data pra acabar? Transformar em conta fixa` (`:372-378`) | B |
| 9.13 | `Pressione Enter ↵ para salvar`, `Cancelar`, `Salvar Lançamento` | `Salvar` | B |

## 10. Editar série — `editar-serie-modal-desktop`

`TransactionSheet` with `entities/transaction/scope-radio.tsx`. Shipped: `screens/SOL-74/serie-editar-375.png`.

| # | Stitch | Today | Class |
|---|---|---|---|
| 10.1 | Chip `∞ Parte de uma série de 12 meses` | `Parte de uma série de 12` | B |
| 10.2 | `Editar Lançamento Recorrente` | `Editar lançamento` (`transaction-sheet.tsx:549`) | B |
| 10.3 | `Você está editando a parcela 3 de 12: "Academia Smart Fit" (R$ 99,90)` | — | B |
| 10.4 | `Escopo da Alteração` first, as radio cards with a line each | `Aplicar em` at the bottom (`transaction-sheet.tsx:401`) | B |
| 10.5 | `Só este lançamento` · `Apenas a parcela de Novembro/2026 será alterada. As outras 9 parcelas futuras continuam iguais.` | `Só este` · `Só o de nov 2026. Os outros continuam iguais.` (`scope-radio.tsx:40`) | B |
| 10.6 | `Este e os próximos` + `RECOMENDADO` · `Altera a parcela 3 e todas as subsequentes até o fim da série programada.` | `Este e os próximos até o fim da série.` (`:43`) | B |
| 10.7 | `Toda a série (12 lançamentos)` · `Modifica todas as parcelas retroativas já registradas e todas as parcelas futuras.` from a middle member | `Scope` is `this \| following` (`crates/soldi-types/src/transactions.rs:41`); `Toda a série` only from member 1 (`scope-radio.tsx:42`) | D: smallest `Scope::All` on PATCH and DELETE. Reverses D20 ("earlier members never change") |
| 10.8 | `VALOR POR PARCELA` + `Novo valor monetário aplicado a partir desta cobrança.` | `VALOR` | B |
| 10.9 | `DURAÇÃO DA SÉRIE` + `Ciclo Atual`; `3 meses` / `6 meses ✓` / `12 meses` / `Customizado` | `Meses na série`; `2x 3x 6x 12x Outro` (`transaction-sheet.tsx:46`, `:125`) | B |
| 10.10 | `💡 Série encurtada: Remove os 6 últimos meses. Termina em Abril/2027.` | `Remove os 6 últimos · termina em abr 2027` (`:141`) | B |
| 10.11 | `DIA DE VENCIMENTO` + `📅 Os próximos lançamentos também serão movidos automaticamente para o dia 10.` | `Os próximos também vão para o dia 10.` (`:117`) | B |
| 10.12 | `✓ Série ajustada com sucesso para 6 meses futuros.` | Toast `Série atualizada` (`:485`) | B |
| 10.13 | `Economia projetada de R$ 599,40 no orçamento previsto.` | — | B (removed members × amount) |
| 10.14 | `Excluir da Série...`, `Cancelar`, `Salvar Alterações na Série` | `Salvar` | B |

Kept: category, date chips and note in the series sheet. The frame shows the series part only; dropping them would remove editing a member's category or note.

## 11. Posso comprar isso? — `posso-comprar-isso-simulador-desktop`

Today: the Simular switch in Lançar (`transaction-sheet.tsx:185-205`), `features/add-transaction/simulation.tsx`; the sidebar entry opens Lançar (`app-shell.tsx:151-156`). Shipped: `screens/SOL-73/simular-1440-simulacao.png`.

| # | Stitch | Today | Class |
|---|---|---|---|
| 11.1 | Its own page, sidebar entry active | Simular inside Lançar | B (`/posso-comprar`; delete Simular from Lançar) |
| 11.2 | Header: sparkles tile, `Posso comprar isso?`, badge `SIMULADOR PREDITIVO`, `Simulação sem risco: projeta o impacto futuro no seu fluxo de caixa sem salvar nenhum lançamento na conta real.` | `Veja o efeito antes de lançar.` | B |
| 11.3 | `Motor de Cálculo Soldi AI v2.4` | — | R-AI |
| 11.4 | `Histórico` | — | D: a simulation is never stored (D16). Smallest: `localStorage` per user id, no endpoint |
| 11.5 | `PARÂMETROS`, `Simular nova despesa`, `Descubra se cabe no orçamento sem comprometer os meses seguintes.` | — | B |
| 11.6 | `Valor total estimado`, large amount with `⌫` | Lançar's amount | B |
| 11.7 | `Modalidade de pagamento` + `Sem juros`; `À vista` / `6x` / `10x` / `12x` | Parcelar 2–60 | B |
| 11.8 | `6 parcelas de R$ 400,00 a partir de Dezembro/2026.` | — | B |
| 11.9 | `Primeiro vencimento` `10 de Dezembro, 2026` | Lançar's date chips | B |
| 11.9r | Chip `Cartão Nubank` | — | R-card |
| 11.10 | `Categoria do bem ou serviço` chips | Lançar's chip row | B |
| 11.11 | `Comprometimento de Renda` `6,3% das entradas de novembro` (Stitch: `da renda média`) | — | B ("média" breaks R-avg; the base is the current month's entries) |
| 11.12 | Reset `↻` and `Calcular Projeção` | Live | B |
| 11.13 | `Você sabia?` tip | — | B (`passar o cartão` → `comprar`, R-card) |
| 11.14 | Verdict card `VEREDITO DO ORÇAMENTO • ALERTA CRÍTICO`, `Em Março você fica no vermelho: R$ -420,00`, pill `Déficit Projetado` | One line `Com essa compra, dia 28 fica no vermelho: -R$ 2.123,45.` (`simulation.tsx:25-29`) | B |
| 11.15 | Verdict body naming the fitting months, the installment, and the scheduled outflows of the red month | — | B (template, spec §11) |
| 11.16 | `Sugestão Soldi … Aplicar 10x` | — | R-AI |
| 11.17 | `Curva de Saldo Projetado (6 Meses)`, `Cenário Atual` / `Com Nova Compra` / `Alerta Vermelho`, `R$ 0,00 (Linha Zero)` | — | B |
| 11.18 | `Projeção Mensal Comparativa (Antes vs. Depois)` + `Vencimento no dia 10 de cada mês` (Stitch: `estimado`) | `Meses com essa compra` (`simulation.tsx:96`) | B |
| 11.19 | Month cards: `Novembro 2026` + tier, `Saldo Atual`, `Saldo Projetado`, `Parcela 0/6 · Sem alteração`; the red month `CRÍTICO`, `Saldo Atual Original`, `Saldo com Compra`, `Parcela 4/6 (+ IPVA/Seguro)` | Chips `nov 2026 -2.124 antes 9.876 Crítico` with a red-day badge (`entities/forecast/month-chips.tsx`) | B |
| 11.20 | `O que você gostaria de fazer agora?`, `Explore alternativas seguras para viabilizar sua compra sem entrar no cheque especial.`, `Ver Detalhe de Março`, `Testar em 10x`, `Criar Cofrinho para juntar à vista` | — | B |

## 12. Contas fixas — `contas-fixas-desktop`

`widgets/bill-list/bill-list.tsx`, `features/edit-bill/edit-bill-sheet.tsx`. Shipped: `screens/SOL-78/contas-fixas-1440.png`.

| # | Stitch | Today | Class |
|---|---|---|---|
| 12.1 | Breadcrumb `Configurações › Contas Fixas` | `‹ Ajustes` (`app/(app)/(shell)/ajustes/contas/page.tsx:8`) | B |
| 12.2 | `Contas Fixas Recorrentes` | `Contas fixas` (`:9`) | B |
| 12.3 | `Despesas mensais que compõem sua base fixa de orçamento.` | — | B (Stitch's `e receitas` and `automáticas` dropped: R-income, D-12.17) |
| 12.4 | `Status: Todos` dropdown | — | B (same state as 12.9) |
| 12.5 | `⊕ Nova Conta Fixa` at the top right | `+ Nova conta` under the list | B |
| 12.6 | `Total de Despesas Fixas` + pill `7 contas`, amount, `● Compromete 67% da renda líquida` | `Total das contas fixas`, `2 contas ativas`, `Comprometem 56% das entradas de novembro` (`bill-list.tsx:102-131`) | B |
| 12.7 | `Receitas Fixas · 2 fontes` | — | R-income |
| 12.8 | `Próximo Vencimento` + pill `Em 2 dias`, name, amount, `📅 Vence no dia 05` | `Vence hoje` caption, no pill (`bill-list.tsx:78-100`) | B |
| 12.8r | `Ver fatura` | — | R-card |
| 12.9 | Tabs `Todas (9)` / `Despesas (7)` / `Pausadas (1)` | `Contas ativas` and a `PAUSADAS` section (`bill-list.tsx:241-256`) | B |
| 12.9r | `Receitas (2)` | — | R-income |
| 12.10 | `ORDENAÇÃO: Vencimento` | By due day only | B |
| 12.11 | Table at ≥ 1024 `CONTA / CATEGORIA`, `VENCIMENTO`, `VALOR MENSAL`, `AÇÃO / STATUS`; tinted icon, `Dia 05` pill, small cents, switch, `⋮` | Solid icon, `Dia 1 · Água`, amount, switch (`bill-list.tsx:25-76`) | B |
| 12.12 | Paused row: `Pausada` badge, struck amount, greyed | Separate section | B |
| 12.13 | `⋮` (Editar, Arquivar) | The row opens the sheet | B |
| 12.14 | `RECEITAS FIXAS (ENTRADAS PROGRAMADAS)` and its rows | — | R-income |
| 12.15 | `Mostrando 9 de 9 contas fixas configuradas`, `✓ Sincronizado com projeção de caixa` | — | B |
| 12.16 | Side form at ≥ 1024 `Adicionar Nova Conta · Formulário rápido`: `Despesa Fixa`, `Nome da conta fixa` (`Ex: Plano de Saúde Familiar`), `Valor mensal fixo estimado`, `Dia do vencimento recorrente` with `Dia 05/10/15/20` and a number, `Categoria`, `Periodicidade · Mensal (todo mês) · Fixo`, `Salvar Conta Fixa`, `Descartar alterações` | `EditBillSheet` with `Nome`, `Valor`, `Vence dia` (`edit-bill-sheet.tsx:28-161`) | B |
| 12.16r | `Receita Fixa` toggle | — | R-income |
| 12.17 | `Lançamento Automático · Lançar no extrato do mês na data exata` | Paying a bill inserts its entry (D8) | D: smallest `bills.auto_post BOOLEAN` + a daily job on the São Paulo day (D13). Not computable |
| 12.18 | `Dica Soldi de Planejamento` | — | R-AI |

## 13. Categorias — `categorias-desktop`

`widgets/category-list/category-list.tsx`, `entities/category/category-sheet.tsx`. Shipped: `screens/SOL-9/categorias-daily-375-after.png`.

| # | Stitch | Today | Class |
|---|---|---|---|
| 13.1 | Breadcrumb `Configurações › Gestão de Categorias` | `‹ Ajustes` | B |
| 13.2 | `Categorias & Subcategorias` + `Organize seus lançamentos por tipo de fluxo financeiro com paleta de cores e ícones do design system Soldi.` | `Categorias` (`category-list.tsx:214`) | B |
| 13.3 | `Buscar categoria...` | — | B (client filter) |
| 13.4 | `⊕ Nova Categoria` | A `+` icon (`category-list.tsx:219`) | B |
| 13.5 | Tile `ESTRUTURA ATIVA` `18 categorias principais` `75 subcategorias vinculadas` | — | B |
| 13.6 | Tile `MAIOR CONCENTRAÇÃO` `Moradia (Aluguel & Condomínio)` `53,1% dos gastos de Nov` + bar | — | B (report groups) |
| 13.7 | Tile `SUGESTÕES DE IA` | — | R-AI |
| 13.8 | Tabs `Gastos Diários (10)` / `Contas Fixas (5)` / `Entradas & Receitas (3)` with icons | `Entrada` / `Saída` / `Diário` (`category-list.tsx:26-28`) | B |
| 13.9 | Two-column parent cards: icon, name, `Diário · 4 subcategorias`, `⋮` | One list of rows | B |
| 13.10 | `Total no mês R$ 184,31` per parent | — | B (report amount of the switcher month) |
| 13.11 | Subcategory rows: dot, name, `1 lanç.`, amount (`R$ 0,00` muted) | Nested rows without amounts | B (count from the month's entries) |
| 13.12 | `+ Adicionar subcategoria` in each card | A `⋮` item `Nova subcategoria em …` (`category-list.tsx:73`) | B |
| 13.13 | Side form at ≥ 1024 `Nova Categoria · Configuração`: `Categoria Pai` / `Subcategoria`, `Nome do agrupador` (`Ex: Educação & Cursos`), `Tipo de Fluxo` `Diário` / `Fixa` / `Entrada`, `Cor de Destaque` with its name, `Ícone Representativo`, `Vincular à Categoria Pai`, `Prévia em tempo real` + `Novo`, `Criar Categoria` | `CategorySheet` (`category-sheet.tsx:102-310`) | B (swatches list the kind's free colors, D15) |
| 13.14 | `Classificação Automática` | — | R-AI |

## 14. Ajustes — `ajustes-desktop`

`app/(app)/(shell)/ajustes/page.tsx` and its 7 subpages. Shipped: `screens/SOL-62/ajustes-1440-light.png`.

| # | Stitch | Today | Class |
|---|---|---|---|
| 14.1 | Breadcrumb `Configurações › Ajustes do Sistema`, `Ajustes & Preferências`, `Personalize os parâmetros de cálculo do termômetro, organização de contas e segurança dos seus dados` | A link list titled `Ajustes` (`ajustes/page.tsx:79-90`) | B |
| 14.2 | `Última sincronização na nuvem: Hoje às 14:32` | — | D: there is no sync. The nearest fact is the last change time. Recommend dropping |
| 14.3 | Two panes at ≥ 1024: sub-nav `Termômetro & Limites`, `Moeda & Saldo Inicial`, `Organização (Contas)`, `Gestão de Dados`, `Minha Conta & Segurança`, `Ajuda & Como Funciona`, and every section inline | 7 subpages (`ajustes/page.tsx:24-90`) | B |
| 14.4 | `SOLDI PRO · Plano Anual Ativo` | — | R-Pro |
| 14.5 | `Calibragem do Termômetro Financeiro`, `Defina os pontos de corte de saldo disponível projetado que determinam em qual cor o seu mês fechará.`, pill `Projeção em tempo real` | `/ajustes/termometro` | B |
| 14.6 | Four boxes `Crítico / Atenção` `Abaixo disso fica Crítico`; `Atenção / Apertado` `Linha zero de equilíbrio`; `Apertado / Confortável` `Colchão de segurança mín.`; `Confortável / Folga` `Meta de poupança livre` | `Atenção a partir de` … (`features/edit-settings/thermometer-form.tsx:20-23`) | B |
| 14.7 | `SIMULAÇÃO DE ESCALA TÉRMICA`, `Faixa Ativa Atual: Confortável`, marker `R$ 1.842,10` on the bar, five tiles with ranges `< -R$ 500` … `> R$ 2.000` | A strip preview (`thermometer-form.tsx:59`) | B |
| 14.8 | `Restaurar Padrões`, `✓ Salvar Novos Limites` | `Salvar` | B |
| 14.9 | `Moeda & Saldo Inicial`, `Configure a unidade monetária principal e o saldo de largada das suas contas.` | Two subpages | B |
| 14.10 | Currency radio cards with `Padrão Brasil`, `United States`, `Zona do Euro`, `Reino Unido` | `CurrencyPicker` | B |
| 14.11 | `Saldo Inicial da Conta Corrente`, large amount, `Usado para recalcular o fluxo desde o primeiro mês cadastrado.` | `Saldo inicial` and `Data` (`features/edit-settings/opening-form.tsx:42-61`) | B |
| 14.12 | `Gestão de Dados & Zona de Perigo`, `Operações irreversíveis sobre seus lançamentos históricos.` | `/ajustes/apagar` | B (Stitch's `faturas e registros bancários` dropped, R-card) |
| 14.13 | Radio cards `Mês atual · Novembro 2026 (42 registros)`, `Ano de 2026 · Todos os 11 meses deste ano`, `Zerar tudo · Limpa toda a base da conta` | `Mês` / `Ano` / `Tudo` with pickers (`features/delete-entries/delete-entries-form.tsx:29-31`, `:101-140`) | B |
| 14.14 | `Ação destrutiva sem retorno`, `Para confirmar exclusão em massa, digite CONFIRMAR no campo:`, `Excluir Lançamentos` | Word `APAGAR` (`:37`), `Apagar n lançamentos` | B |
| 14.15 | `Minha Conta & Segurança`, `Credenciais de acesso, e-mail de recuperação e encerramento de sessão.`; tiles `NOME COMPLETO` + `Alterar dados`, `E-MAIL CADASTRADO`, `SENHA DE ACESSO` + `Trocar senha`; `Excluir conta definitivamente`, `Sair da conta (Logout)` | `/ajustes/conta` forms | B |
| 14.16 | Badge `✓ Verificado` on the e-mail | — | D: no verification. Smallest `users.email_verified_at TIMESTAMPTZ NULL` and a verify flow. Not computable |
| 14.17 | `Organização (Contas)` sub-nav item | Two links in `Organização` | B (a section with the Contas Fixas and Categorias links) |
| 14.18 | `Ajuda & Como Funciona` | Equal (`ajustes/page.tsx:43-48`) | — |

Kept: the opening date in Saldo Inicial (Stitch draws no date; it is required). At < 1024 there is no frame: the sections stack in the sub-nav order.

---

## Needs data — summary

| # | Element | Smallest addition | Computable today? |
|---|---|---|---|
| 1.19, 3.15d, 4.6d | Payment method on entries | `transactions.payment_method TEXT NULL` + an input Stitch does not draw | No |
| 3.18 | `Ver histórico anual` per category | `GET /api/reports/categories/{id}/year?year=` | Yes (entries) |
| 5.5d | All cofrinho movements | `/movements` on the parent id includes children | Yes |
| 5.9 | `Foco atual` / `Longo prazo` | none (from `deadline`) | Yes |
| 5.10 | `Aporte automático` | `Cofrinho.next_contribution` | Yes (series rows) |
| 5.13 | Cofrinho description | `categories.note TEXT NULL` | No |
| 5.16 | Liquidity / D+0 | — | No (no bank data) |
| 6.7, 7.3 | Meta Anual | `settings.savings_target_pct` | No (target), yes (base) |
| 6.14d, 7.8 | Month notes | `month_notes` + `PUT /api/months/{m}/note` | No |
| 6.17 | `(Previsto)` months | `SavingsMonth.forecast` and all 12 months | Yes |
| 9.3 | `Personalizar` the chip row | `categories.pin_rank` | No |
| 9.8 | `Semanal` / `Anual` series | `repeat_every` | No (reverses D14) |
| 10.7 | `Toda a série` from any member | `Scope::All` | Yes (reverses D20) |
| 11.4 | Simulation `Histórico` | `localStorage` | Client only |
| 12.17 | `Lançamento Automático` | `bills.auto_post` + daily job | No |
| 14.2 | `Última sincronização` | — | No |
| 14.16 | E-mail `Verificado` | `users.email_verified_at` + flow | No |
