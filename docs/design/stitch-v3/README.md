# Stitch v3 — verified gap analysis (SOL-72)

> Superseded by `FIDELITY.md` (SOL-79). Fidelity is now the default (D24). The "Not built" and "Cut" tables below hold only where they cite one of the owner's explicit rules.

The owner's Stitch project, 14 screens (PNG + HTML). Each screen is compared with `developer` at 0.28.0 (`719e814`), read through the code and the shipped screenshots in `docs/design/screens/SOL-62` … `SOL-70` and `SOL-9`. Spec: `docs/specs/2026-11-11-stitch-v3.md`. Plan: `docs/specs/plans/SOL-72.md`. Decision: D23.

Rules applied:

- **Gap**: built only with evidence, meaning a `file:line` that shows the difference or a grep that returns nothing.
- **Equal**: already shipped. Stitch's sample data (`Cartão Nubank`, `Pão de Açúcar`, etc.) is not a difference.
- **Not built**: breaks an owner rule, which is named.
- **Cut**: no rule is broken, but the item duplicates a shipped feature or would add a guess or a store for little value (YAGNI). Each cut gives its reason.

The HTML exports concatenate several screens. Copy below is quoted from the HTML text, not from the file name.

The earlier inventory was wrong on these points, now checked:

- Day chips with dots exist: `web/src/widgets/bills-of-month/bills-of-month.tsx:260-281`.
- Resgatar exists: `features/withdraw-cofrinho/withdraw-form.tsx` and `widgets/cofrinhos/cofrinhos.tsx:205-208`.
- Month deltas on Para onde vai exist: `widgets/category-breakdown/category-breakdown.tsx:35-55`, with `delta_pct` in `crates/soldi-types/src/reports.rs:26`.
- "Posso comprar isso?" exists inside Lançar: `features/add-transaction/simulation.tsx:37`.
- There is no savings API. `crates/soldi-server/src/savings` and `web/src/entities/savings` do not exist, and the savings table was dropped in `0013_cofrinhos.sql`. Savings are `Economia` entries (SOL-20) and cofrinhos are its subcategories.

---

## 1. Mês, mobile — `mes-mobile-home`

Route `/mes`: `web/src/app/(app)/(shell)/mes/page.tsx`. Widgets: `month-overview` (hero and summary), `bills-of-month`, `month-overview` `ThermometerCard`. Shipped: `screens/SOL-70/mes-375.png`.

**Equal**

- `Saldo hoje` with its tier pill, then the Entradas / Saídas / Projetado summary overlapping the hero (`month-overview.tsx:64-145`).
- The month switcher pill.
- Contas a pagar: `Ver todas`, overdue rows tinted red with `Venceu dia 02/11` (`bills-of-month.tsx:61-71`, `:139`).
- Termômetro do Mês: the 5-tier strip and the "Você comprometeu X% da renda…" line (`month-overview.tsx:147-187`).
- The tab bar with the FAB.

**Gaps**: none.

**Kept as shipped**

- Per-row `Pagar` / `Pago` / `Vencido` pills. The round check (SOL-64, `bills-of-month.tsx:74-108`) does the same in one tap, and the amount opens Pagar to adjust it.
- The tab label `Economia`. It stays `Cofrinhos` (`app-shell.tsx:38`; D21 keeps the nav labels). The year view goes inside that tab (gap 6.1).

**Not built**

| Stitch | Rule |
|---|---|
| `Plano Pro` under the greeting | No "Soldi Pro" plan (owner, D2) |
| Bell with a badge | D21: no bell, no notification source |
| Greeting and switcher drawn inside the dark hero | The Mês hero stays as shipped (SOL-69, D21 update) |
| `67% Comprometido` pill on the Termômetro title | Repeats the insight line two rows below. Cut, duplicate |

## 2. Mês, desktop — `mes-dashboard-desktop`

Same route at `lg`+, with the top bar in `widgets/app-shell/app-shell.tsx`. Shipped: `screens/SOL-70/mes-1440.png` and `screens/SOL-64/mes-1440-collapsed.png`.

**Equal**

- Sidebar groups MENU / CONFIGURAÇÕES (`app-shell.tsx:44-58`).
- Top bar with the switcher and `+ Lançar`.
- The 3-column grid (`mes/page.tsx:76`).
- Contas a pagar with `X de Y pagas`, `Próxima: …`, day chips with dots, and Todas / Pendentes / Pagas (`bills-of-month.tsx:27-31`, `:226-282`).
- Lançamentos grouped by day: `Hoje, 10 nov`, `Ontem, 9 nov`, `Agendado · 15 nov`, the day's balance and tier (`Previsto · …`, `tier-pill.tsx:22`), the series `3/12` and `Ver o mês inteiro` (`ledger.tsx:33-37`, `:120`, `:270`).
- Para onde vai glance with the top 4 groups (`spending-glance.tsx:26`).
- Cofrinhos glance with `Guardado` and the top 2 (`cofrinhos-glance.tsx:57-80`).

**Gaps**

| # | Stitch | Today | Evidence |
|---|---|---|---|
| 2.1 | Próximos meses: each month shows an amount (`1.842`, `-420`) | The chip shows the month and its tier label only | `entities/forecast/month-chips.tsx:43`. `MonthAhead` has no amount: `entities/forecast/months-ahead.ts:7` |
| 2.2 | Próximos meses: the `Posso comprar? →` link | No link. Simular is reachable only inside Lançar | `grep -rn "Posso comprar" web/src` returns only the comment at `features/add-transaction/simulation.tsx:36` |
| 2.3 | Lançamentos: the `Todos` / `Diário` / `Contas` filter | No filter | `grep -n "Todos" web/src/widgets/ledger/ledger.tsx` returns nothing. All days are listed at `ledger.tsx:172` |
| 2.4 | Cofrinhos glance: a progress bar under each cofrinho with a goal | Text `32% de R$ 10.000,00` only | `widgets/cofrinhos-glance/cofrinhos-glance.tsx:70-76` |

**Not built**

| Stitch | Rule |
|---|---|
| Red-day banner above the grid (`Dia 23 fica no vermelho…`, `Ver o dia 23`) | The alert lives in the hero as shipped (`mes/page.tsx:95`, `red-day-alert.tsx`). The hero stays (SOL-69) |
| Split bar `Para onde foi a entrada deste mês` | Rejected by the owner (SOL-69, D21 update) |
| Bell, and the `Plano Pro` row | D21 (no bell); no Pro plan |
| Termômetro `Entradas / Saídas / Resultado` box and `67% Gasto` | Repeats the summary under the hero. Cut, duplicate |
| Tier pill in the top bar | Repeats the hero's pill on Mês and needs the month query on every page. Cut |
| `Cartão Nubank · Fatura prevista com fechamento dia 10` | No credit cards and no fatura (owner). A card bill is a plain conta fixa |
| `Débito Nubank` / `Pix` payment method on rows | No accounts or payment methods (single ledger, D8). Cut |

## 3. Para onde vai, desktop — `para-onde-vai-analytics-desktop`

Route `/para-onde-vai`, widget `widgets/category-breakdown/category-breakdown.tsx`. Shipped: `screens/SOL-66/para-onde-vai-seeded-1440.png`.

**Equal**

- Donut with the total in the center (`:65-100`).
- Top 5 bars (`:126-148`).
- Rows with the share and the month delta (`:35-55`, `:102-124`).
- Picking a category lists its entries (`:152-187`).
- The Saídas / Entradas switch.

**Gaps**

| # | Stitch | Today | Evidence |
|---|---|---|---|
| 3.1 | `Detalhamento por Grupo`: a top-level group with its subcategories folded under it | A flat list of leaf categories (`Economia › Reserva`) | `category-breakdown.tsx:222` reads `report.data[tab]`. `groups` (with `children`) is read only by `spending-glance.tsx:26` |
| 3.2 | Picking a group lists the group's entries, subcategories included | The entries query filters one exact `category_id` | `category-breakdown.tsx:154` → `crates/soldi-server/src/transactions/repo.rs:91` (`t.category_id = $4`) |
| 3.3 | Entries panel: `Adicionar lançamento em Mercado` | No add action in the panel | `category-breakdown.tsx:152-187`. `TransactionSheet` already takes `initialCategory` (`transaction-sheet.tsx:423`) |
| 3.4 | Entries panel: `3 itens`, `Total no recorte selecionado: R$ 184,31` | Title and `Limpar filtro` only | `category-breakdown.tsx:158-166` |
| 3.5 | Top 5 shows the amount and the share | Share only | `category-breakdown.tsx:135` |

**Not built**

| Stitch | Rule |
|---|---|
| `Diagnóstico Inteligente Soldi` (IA) | No AI callouts |
| `Dentro da média` badge | Needs an average of past months, which is a guess (D16). Cut |
| `Todas as Categorias` dropdown, export button | Duplicate filter (tap a row); no export demand. Cut |
| `Ver histórico anual` per category | No yearly category report requested. Cut (YAGNI) |
| `Fatura fechada dia 20`, `Cartão Nubank` group | No credit cards and no fatura |

The sidebar entry `Posso comprar isso?` seen here is gap 9.3.

## 4. Para onde vai, mobile — `para-onde-vai-mobile-analytics`

Same widget at 375.

**Equal**: the donut, `Detalhamento` rows with share and `+18%` / `-6%` deltas, Top Categorias, and the entries of the picked category.

**Gaps**: 3.1 to 3.4 apply here too.

**Not built**

| Stitch | Rule |
|---|---|
| Page title drawn inside a dark hero | The shell header card (SOL-62) is the pattern on every non-Mês page. Cut |
| `Dentro da média` | D16 (no averages) |
| `Ver todas as transações de Mercado` | The panel already lists all of them for the month. Cut |

## 5. Cofrinhos — `cofrinhos-metas-desktop`

Route `/economia`, widget `widgets/cofrinhos/cofrinhos.tsx`. Shipped: `screens/SOL-66/cofrinhos-seeded-1440.png`.

**Equal**

- `Guardado` hero total and `Este mês +…` (`:240-262`).
- Cards with the balance, `de {meta}` and the bar, plus `Faltam R$ … · R$ …/mês até out 2027` (`:35-81`).
- `Novo cofrinho`.
- Guardar / Resgatar / Movimentos / Editar / Excluir in the cofrinho sheet (`:176-236`).

**Gaps**

| # | Stitch | Today | Evidence |
|---|---|---|---|
| 5.1 | `+ Guardar` and `Resgatar` on every card | The card is one button that opens the sheet. The actions live only in the sheet | `cofrinhos.tsx:96-118` (stretched `after:inset-0` button at `:105`), actions at `:200-208` |
| 5.2 | `Seus Cofrinhos · 4 ativos` heading over the grid | No heading or count | `cofrinhos.tsx:365` (the `Cofrinhos` list has no visible title) |

**Not built**

| Stitch | Rule |
|---|---|
| `102% CDI`, `Rendendo…`, `Evolução do Rendimento CDI`, `Tributação IR` | No CDI yield (no rate source) |
| `Dica Inteligente Soldi`, `Aplicar R$ 50 agora` | No AI callouts |
| `Simulação Automática: R$ 14.800 em 1 ano` | Extrapolates a pace, which is a guess (D16) |
| `No ritmo atual você atinge a meta 1 mês antes` | D16 |
| `Aporte automático: R$ 500 todo dia 06` | D8: nothing generates rows by itself; a monthly saving is already a D14 series |
| `Meta Global Consolidada` | Sums goals of different horizons into one bar with no meaning. Cut |
| `Em andamento` / `Foco atual` / `Longo prazo` badges | No stored priority. The shipped `%` / `Meta atingida` status covers it (`:83-94`). Cut |
| `Reserva Livre … Resgate em D+0` | `Sem objetivo` (`parent`) is the free reserve; no bank liquidity data |
| `Criar novo objetivo ou sonho` tile | `Novo cofrinho` button already exists. Cut |
| Month switcher and `Histórico` icon on Cofrinhos | Balances are all-time; Movimentos is the history. Cut |

## 6. Economia anual — `economia-anual-desktop`, `economia-mobile-anual`

There is no route or widget for this today. `/economia` renders only `CofrinhosView` (`app/(app)/(shell)/economia/page.tsx:5`). The only report route is `GET /api/reports/categories` (`crates/soldi-server/src/reports/handler.rs:22`). D21 left the year table unbuilt.

**Gaps**

| # | Stitch | Evidence |
|---|---|---|
| 6.1 | The year's Entradas / Guardado / % guardado by month, with the year total and `X% das entradas`, a year switcher, `< 5%` / `5% – 15%` / `> 15%` dots, and `Mês atual` marked | No endpoint (handler paths list one report). `YearHeader` exists but nothing renders it (`widgets/month-header/month-header.tsx:34`) |

It can be computed from existing data. `Guardado` is the month view's own rule: Economia bills minus resgates (`crates/soldi-server/src/months/repo.rs:46-63`). `Entradas` is income without resgates (`months/domain.rs:161`). One `GROUP BY month` query fills a year, so it is built (D23).

**Not built**

| Stitch | Rule |
|---|---|
| `Rendimento Acumulado`, `Rendimento CDI`, `Juros compostos`, `Taxa Real +0,82% a.m.` | No CDI yield |
| `Dica inteligente: Meta sugerida para Dezembro` | No AI callouts |
| `Meta Anual (20%)`, `Faltam R$ 7.306,67` | Needs a stored yearly target and "estimated" income (a guess, D16). Cut |
| `Projeção de Fechamento`, `Média mensal`, `Receita Bruta` | Average and projection of savings (D16); gross income is not stored |
| `Status / Observação` column (`1ª parcela do 13º salário`) | No per-month note store. Cut |
| `Consistência 2026 · 10 meses`, `Maior aporte único` | Trivia over the same 12 rows. Cut (YAGNI) |
| `Dezembro · R$ 3.000,00 (Previsto)` | Months after today are a forecast, and Mês and Próximos meses already show them (D16). Cut |
| `Exportar` | No export demand. Cut |
| `Tesouro Selic, CDBs… Última sincronização` | No investment or bank sync (D16 rejects bank sync) |
| Pencil to edit the saved value inline | The row opens that month on Mês, where entries are edited. Cut |
| Search box `Buscar transações…` | No search feature in scope. Cut |

## 7. Lançar — `lancar-bottom-sheet-mobile`, `lancar-modal-desktop`

`features/add-transaction/transaction-sheet.tsx` in `shared/ui/responsive-sheet.tsx`. Shipped: `screens/SOL-65/lancar-375.png` and `lancar-1440.png`.

**Equal**

- Entrada / Saída / Diário.
- The hero amount.
- `Hoje` / `Ontem` / date chips (`shared/ui/date-chips.tsx`).
- Observação.
- Repetir with `2× 3× 6× 12× Outro` and `12× R$ 39,90 · até out 2027` (`transaction-sheet.tsx:340-344`).
- Pinned `Salvar`.

**Gaps**

| # | Stitch | Today | Evidence |
|---|---|---|---|
| 7.1 | A row of category icons (`Mercado`, `Comida fora`, `Transporte`…) with `Ver todas` | A searchable combobox only | `entities/category/category-chips.tsx:63-65` renders `CategorySelect` alone. No chip row since `1c7b47b` |

**Not built**

| Stitch | Rule |
|---|---|
| Custom numeric keypad | The native keyboard via `inputMode` (`shared/ui/amount-input.tsx:24`) covers it. Cut |
| `Mensal` / `Semanal` / `Anual` repeat | A series is monthly (D14, D19, D20) |
| `Sub:` subcategory chips under the icon row | `Ver todas` opens the picker, which is grouped by parent. Cut |
| `Personalizar` the icon row | No stored order. Cut |
| `Novo Registro`, `Conta`, `Salvar Lançamento` labels | Shipped copy kept (`Lançar`, `Saída`, `Salvar`) |

The desktop export is cut off at the top (the Stitch render broke). Only what is visible is compared.

## 8. Editar série — `editar-serie-modal-desktop`

The series edit is the same `TransactionSheet` with `entities/transaction/scope-radio.tsx`. Shipped: `screens/SOL-65/series-edit-375-datefield.png`.

**Equal**

- `Só este` and `Este e os próximos`. The first member reads `Toda a série` (`scope-radio.tsx:36-37`).
- The value per entry.
- `Meses na série` resizing with `Remove os 6 últimos` (`transaction-sheet.tsx:134-142`).
- The date moving the following members (D20), with the toast `Série movida para o dia 10` (`:464`).

**Gaps**

| # | Stitch | Today | Evidence |
|---|---|---|---|
| 8.1 | One line under each scope: `Apenas a parcela de Novembro/2026…`, `Altera a parcela 3 e todas as subsequentes…` | Labels only | `scope-radio.tsx:35-48` |
| 8.2 | `Série encurtada: Remove os 6 últimos meses. Termina em Abril/2027.` | `Remove os 6 últimos`, with no end month | `transaction-sheet.tsx:140-141` |

**Not built**

| Stitch | Rule |
|---|---|
| A third scope, `Toda a série` from a middle member (past members change) | D20: members before the edited one never change; `Scope` has two values (`crates/soldi-types/src/transactions.rs:41-47`) |
| `Recomendado` badge | Neither scope is safer. Cut |
| `Economia projetada de R$ 599,40` | Restates the resize line. Cut |

## 9. Posso comprar isso? — `posso-comprar-isso-simulador-desktop`

Today it is the Simular switch in Lançar (`transaction-sheet.tsx:185-205`, `features/add-transaction/simulation.tsx`). It shows a verdict line, 7 day pills and the month chips when the draft spans months.

**Equal**

- Amount and installments (`2×…12×`).
- First date.
- Nothing written (D16).
- A verdict naming the first red day.
- Months with the purchase (`simulation.tsx:84-89`).

**Gaps**

| # | Stitch | Today | Evidence |
|---|---|---|---|
| 9.1 | Verdict with the amount: `Em Março você fica no vermelho: R$ -420,00` | `Com essa compra, dia 23 vira Crítico`, with no amount | `simulation.tsx:22-27` |
| 9.2 | Each month before and after: `Saldo atual` vs `Saldo com compra` | Month chips by tier only, after the draft | `simulation.tsx:87` + `month-chips.tsx:43` |
| 9.3 | A sidebar entry `Posso comprar isso?` | No entry | `app-shell.tsx:44-52`; grep in 2.2 |

**Not built**

| Stitch | Rule |
|---|---|
| `Motor de Cálculo Soldi AI`, `Sugestão Soldi … Aplicar 10x`, `Você sabia?` | No AI callouts |
| `Histórico` of simulations | D16: a simulation is never stored |
| `Comprometimento de Renda · 6,3% da renda média` | Average income is a guess (D16) |
| `Primeiro vencimento … Cartão Nubank` | No credit cards |
| `Categoria do bem` chips | Lançar's category picker is the same field |
| A separate page with its own form | Lançar's Simular already holds every input. A second form doubles the rules. Cut; the sidebar entry opens Lançar in Simular |
| `Curva de Saldo Projetado` line chart | The month chips with before/after carry the same data at 375. Cut |
| `Criar Cofrinho para juntar à vista` | Cut (YAGNI) |

## 10. Contas fixas — `contas-fixas-desktop`

Route `/ajustes/contas`, widget `widgets/bill-list/bill-list.tsx`, sheet `features/edit-bill/edit-bill-sheet.tsx`.

**Equal**

- Rows with icon, name, `Dia 05 · categoria`, amount (`bill-list.tsx:17-46`).
- Pausadas listed apart (`:112-118`).
- `Nova conta`.
- Monthly only.
- Dia 1–31.
- `Ativa` in the sheet (`edit-bill-sheet.tsx:124`).

**Gaps**

| # | Stitch | Today | Evidence |
|---|---|---|---|
| 10.1 | `Total de Despesas Fixas · 7 contas · Compromete 67% da renda` | No summary | `bill-list.tsx:99-124` renders the rows only |
| 10.2 | `Próximo Vencimento · Aluguel · R$ 2.259,56 · Em 2 dias` | None on this page (it exists on Mês: `bills-of-month.tsx:39-45`) | `bill-list.tsx:99-124` |
| 10.3 | An `Ativa` switch on each row | Pausing needs the sheet | `bill-list.tsx:26-41` (the row is one button), `edit-bill-sheet.tsx:124` |
| 10.4 | Wide layout at desktop | `max-w-2xl` column at every width | `app/(app)/(shell)/ajustes/contas/page.tsx:7` |

**Not built**

| Stitch | Rule |
|---|---|
| `Receitas Fixas`, `Receitas (2)` tab, `Recebe dia 05` rows | D16: salary stays a repeated entry, no recurring-income entity |
| `Lançamento Automático` | D8: recurring bills never generate rows; paying one inserts the entry |
| `Ver fatura` | No fatura |
| `Dica Soldi de Planejamento` | No AI callouts |
| Inline `Adicionar Nova Conta` side form | The bill sheet is the form. Cut |
| `Status: Todos` filter and `Ordenação` | Active and paused are already split, by due day. Cut |

## 11. Categorias — `categorias-desktop`

Route `/ajustes/categorias`, widget `widgets/category-list/category-list.tsx`. Shipped: `screens/SOL-9/categorias-*-375-after.png`.

**Equal**

- One kind at a time, with each parent's subcategories under it (`category-list.tsx:86`, `:155-157`).
- `Nova subcategoria em …` (`:73`).
- Color and icon pickers.
- `Nova categoria`.

**Gaps**: none built.

**Not built**

| Stitch | Rule |
|---|---|
| `Sugestões de IA`, `Classificação Automática` | No AI callouts |
| `Total no mês` per category and subcategory | Para onde vai already shows the month by category, with deltas (gap 3.1 adds the grouping). Cut, duplicate |
| `Maior Concentração`, `Estrutura Ativa` stat tiles | Duplicate of Para onde vai / a count. Cut |
| Search box, inline `Nova Categoria` side form, two-column cards | The list fits one kind; the sheet is the form. Cut, deferred until a user has many categories |
| Unrestricted `Cor de Destaque` palette | D15: colors are unique per kind and subcategories wear the parent's |

## 12. Ajustes — `ajustes-desktop`

Route `/ajustes` with subpages `termometro`, `moeda`, `saldo-inicial`, `contas`, `categorias`, `apagar`, `conta`. Shipped: `screens/SOL-62/ajustes-1440-light.png`.

**Equal**

- Termômetro bounds with a live strip preview (`features/edit-settings/thermometer-form.tsx:20-23`, `:66`).
- Moeda (BRL, USD, EUR, GBP).
- Saldo inicial.
- Apagar lançamentos by Mês / Ano / Tudo, with a typed confirmation (`features/delete-entries/delete-entries-form.tsx:29-31`, `:180`).
- Minha conta: name, e-mail, password, sign out, delete account.
- Como funciona.

**Gaps**: none built.

**Not built**

| Stitch | Rule |
|---|---|
| `SOLDI PRO · Plano Anual Ativo` | No Pro plan (D2) |
| `Última sincronização na nuvem` | No sync; one server. Cut |
| Two-pane settings at desktop (sub-nav plus every section inline) | Layout only. Each setting is reachable at every width today. Deferred to the owner; open a card if wanted |
| `Restaurar Padrões` on the thermometer | No demand. Cut (YAGNI) |

---

## What gets built

Six cards in `docs/specs/plans/SOL-72.md`:

1. Próximos meses in reais and Posso comprar isso? (2.1, 2.2, 9.1–9.3).
2. Lançamentos filter, Lançar category row and series copy (2.3, 7.1, 8.1, 8.2).
3. Para onde vai by group (3.1–3.5).
4. Cofrinhos actions and bars (2.4, 5.1, 5.2).
5. Economia do ano, the only backend card (6.1).
6. Contas fixas summary and switch (10.1–10.4).
