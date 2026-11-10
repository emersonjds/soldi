# Market research: forward-looking cash flow, "can I afford this"

Owner's ask: day-by-day red-day warning like the sheet, plus semestral/annual, plus "the soul of the product."

## 1. Player table

| Player | Horizon | Granularity | What-if/scenario | Installments (parcelas) | Negative-day alert | UI form | Weakness (reviews/docs) |
|---|---|---|---|---|---|---|---|
| PocketSmith | up to 30 years | per-day calendar + line graph | yes, named "Scenarios", compare 2 at once | no native card model, generic future txns | orange day on calendar/graph; min-balance alert (first hit/month only, can mask repeats) | calendar + forecast graph, color-coded (green/red actual, blue/orange forecast) | complex for non-nerds; min-balance alert only fires once a month |
| Quicken Simplifi | rolling ~weeks/months | end-of-period "Projected Cash Flow" | limited | no | none explicit | spending plan + cash-flow chart | community complains Projected Cash Flow ignores "Planned Spending" items — 194-upvote request open 3+ yrs, users call it "worthless and wrong" without it |
| Monarch Money | 30 days | end-of-period projection from recurring+bills | no | treats recurring charge as a row, no installment schedule | bill-due alerts, not day-red alert | list/dashboard, auto-detected recurring with approval queue | horizon short (30d), needs full bank linkage to be accurate, human review step adds friction |
| Copilot Money | rolling, recurring-based | mostly end-of-period | no | recurring-only, no installment breakdown | none notable | recurring subscriptions list | no dedicated forecast calendar found; weak on day-level warning |
| YNAB | none (by design) | n/a | n/a | no | no | category "Age of Money", true expenses | deliberately rejects forecasting ("budget only money you have"); users request multi-month forecast and get told no — philosophy gap, not a bug |
| Rocket Money | until next payday | "Safe-to-Spend" number + payday calendar | no | folds card payments into bills, no parcela schedule | implicit (spendable number drops) | calendar + single number | horizon capped at next payday, not months/semester |
| Cleo | until next paycheck | single "safe-to-spend" number + Bills Hub | no | no | no day-red flag, just shrinking number | chat/AI persona | same short horizon, no visual red day |
| Lunch Money | n/a | transaction list by date | no | no | no | calendar is really a filtered list, not a forecast | explicitly not a forecast tool |
| Actual Budget (OSS) | currently 1 month | running balance per account | no | no | no | feature request open (#4244) for schedule-based "Balance Over Time" forecast, unshipped | forecasting beyond current month is a known gap, not built |
| Mobills (BR) | several months | "Saldo Previsto" = saldo atual + pendências; per-card invoice view | no | yes — card invoice + parcelas tracked per month | no explicit red-day flag | monthly saldo previsto number + card invoice screens | Reclame Aqui full of "saldo não bate", duplicated Open Finance txns, parcelas future months miscalculated |
| Organizze (BR) | future months via "Previsto" entries | day-level if user enters future txns manually | no | yes for manual entries; auto-import breaks ("todas as parcelas num mês só") | no explicit red-day color | list, "Previsto" tag on future entries | Open Finance import does not carry future parcela schedule for most banks (only Nubank/Itaú/Mercado Pago do) |
| Nubank / Itaú / Inter app | short (current/next invoice) | invoice-level, not daily | no | yes, card invoice only | no | app screen, "Nu Limite" is credit-limit not cash forecast | "saldo previsto"/limite features are about credit limit, not a day-by-day cash calendar — no cross-account forecast |

Sources: [PocketSmith calendar/forecast](https://learn.pocketsmith.com/article/1246-using-the-calendar-and-forecast-graph), [PocketSmith min-balance alerts](https://learn.pocketsmith.com/article/209-setting-minimum-balance-alerts-for-my-accounts), [PocketSmith scenarios](https://learn.pocketsmith.com/article/1248-everything-you-need-to-know-about-scenarios-in-pocketsmith), [Simplifi community request](https://community.simplifimoney.com/discussion/1651/ability-to-add-planned-spending-items-to-our-projected-cash-flow-edited-4-merged-votes), [Simplifi review](https://getfinny.app/blog/quicken-simplifi-review-2026), [Monarch cash flow](https://robberger.com/monarch-money-review/), [YNAB forecasting gap](https://fortune.com/article/ynab-pros-and-cons), [Rocket Money safe-to-spend](https://www.rocketmoney.com/learn/personal-finance/tracking-expenses-with-rocket-money), [Cleo safe-to-spend](https://web.meetcleo.com/blog/how-we-rebuilt-recurring-bill-detection-at-cleo), [Lunch Money calendar](https://support.lunchmoney.app/guides/budgeting/step-3-navigating-the-budget-page), [Actual Budget forecast issue #4244](https://github.com/actualbudget/actual/issues/4244), [Mobills saldo previsto](https://comunidade.mobills.com.br/hc/pt-br/articles/115004254074-Como-s%C3%A3o-calculados-os-saldos-no-Mobills), [Mobills Reclame Aqui](https://www.reclameaqui.com.br/mobills-educacao-financeira/inconsistencia-de-dados-e-saldos-incorretos-no-mobills_kZxB5Z8VM9bdC--J/), [Organizze saldo projetado](https://www.organizze.com.br/blog/controle-de-gastos/saldo-projetado), [Organizze parcela import limits](https://www.reclameaqui.com.br/organizze/problemas-com-a-conexao-do-cartao-de-credito-e-importacao-incorreta-de-compras-parceladas-no-organize_m7RGIUX_MA0kIf9N/).

## 2. Gaps nobody fills well (manual-entry, everyday BR user)

- **Parcela no cartão as a real schedule.** BR apps that bank-sync (Mobills, Organizze) fight Open Finance for future parcelas and mostly lose (duplicate, wrong month, wrong date). Nobody gives a clean manual "N parcelas de R$X a partir do dia Y" that just drops rows into the calendar reliably.
- **13º salário / bonus as a one-off future income that changes the whole year's red zones.** No player treats it as a first-class seasonal input; it's just "add a transaction" if the user remembers.
- **Fixed-day salary vs variable-day bills on one visual.** PocketSmith has the calendar depth but is built for US/AU accounts and 30-year horizon — overkill, no pt-BR, no parcela/13º concept. BR apps have the parcela concept but not the day-level red/green calendar depth.
- **"Posso comprar isso?" as a lightweight before-you-commit check.** Everyone forces you to actually enter the transaction to see the effect (Mobills, Organizze) or gives only a single number with no date (Cleo, Rocket Money). Nobody offers "preview this purchase against the calendar, don't save it" cheaply. (Validated as a real unmet need — a different OSS project has an open feature spec for exactly this: `TCC-OPES/frontend-opes#54`.)
- **Alert fatigue/false confidence.** PocketSmith's min-balance alert fires once/month even if the balance dips red three times — the owner's whole use case (see every red day, not just the first) is under-served even by the forecast leader.
- **Multi-month visual (semestral/annual) at a glance, not a 30-year power tool.** PocketSmith over-serves (30yr); Monarch/Rocket Money under-serve (30 days); nobody sits at "6-12 months, dead simple."

## 3. Product vote — ranked ideas

Ranking is value/effort for Soldi specifically, given existing data model (manual entries, "repeat N months", contas fixas not materialized until paid, no card/installment entity).

**1. Parcela wizard → materializes N real Saída rows (highest value, low-medium effort)**
- User story: "Comprei um fogão em 10x de R$200, quero ver essas 10 parcelas certas no calendário sem digitar 10 vezes."
- Beats market: BR apps promise this via bank sync and deliver broken dates/duplicates (Mobills, Organizze complaints above); Soldi does it manually and correctly because the user types it once and the app explodes it — same mechanism Soldi already has ("repeat N months"), just a friendlier entry form with a start date + installment count + optional first-payment-different-amount.
- Effort: reuses the existing "repeat N months" row-creation path; just a new form and distribution logic, no new money concept.

**2. Red-day list across a chosen range (6/12 months) — the semestral/annual the owner asked for (highest value, lowest effort)**
- User story: "Quero ver, dos próximos 6 meses, só os dias que ficam vermelhos, sem abrir mês por mês."
- Beats market: PocketSmith does this but buried in a 30-year generic tool; Rocket Money/Cleo cap at next payday. Soldi's sheet mental model (tiers, running balance) already produces this per day — this is just a cross-month query that filters to "day where tier = red" and lists date + lowest point + why (which entry caused the dip), which is literally the owner's example (Nov 23 → -675, Nov 28 → -2.916).
- Effort: low — read-only aggregation over existing day-balance calc, already computed per month; no new write model.

**3. "Posso comprar isso?" preview — bold idea, the candidate "soul"**
- User story: "Antes de comprar, digito valor + data (+ parcelas), e vejo se algum dia fica vermelho, sem salvar nada."
- Beats market: confirmed gap — nobody ships a no-commit preview; everyone forces a saved transaction to see the effect. This is the one feature a nerd-free owner can explain to a friend in one sentence, and it is the *direct* translation of what the owner already does in the sheet by typing a draft row and looking at the color — Soldi just makes that draft disposable and instant.
- Effort: medium — reuses #1's parcela math and #2's red-day scan, adds a transient (non-persisted) projection; no new entity, no new table, pure computation on top of existing data.
- This is the bold one: make it a single input box ("R$2000, 23/11, 5x") that answers red/green before the user commits — turns the spreadsheet's "type it and look" ritual into an instant yes/no, which is the one thing no competitor (BR or international) does cheaply.

**4. 13º / bonus as a flagged one-off income type (medium value, low effort)**
- User story: "Em dezembro cai o 13º, quero marcar essa entrada como anual e ver como ela recupera o saldo."
- Beats market: no player treats this BR-specific seasonal income as first-class; it's a manual entry everywhere.
- Effort: trivial — one new entry subtype or just a tag on Entrada, no model change. Lower-ranked because it's a label, not new insight; could ship as part of category tagging instead of a dedicated feature.

**5. Lowest-point-of-month badge on the month view (low value, trivial effort — nice-to-have, not a priority)**
- User story: "Quero ver de cara qual vai ser meu pior dia do mês sem rolar a lista inteira."
- Beats market: small UX win matching PocketSmith's "lowest point" callout, cheap because the day-balance list already exists.
- Effort: near-zero (max/min over existing rows) — fold into #2 rather than ship standalone.

## What NOT to build (YAGNI)

- **Bank sync / Open Finance.** Spec already rules this out; BR competitors' worst complaints (duplicated txns, wrong parcela dates, "saldo não bate") all come from sync, not manual entry. Manual-first is Soldi's actual advantage here — don't trade it for sync's accuracy problems.
- **30-year / generic multi-scenario modeling (PocketSmith-style).** Owner wants semestral/annual, not a retirement-planning tool; scenarios-vs-scenarios compare is finance-nerd territory the card explicitly excludes.
- **Credit-card/installment account model as a new entity (card balance, interest, due-date engine).** Out of scope per spec ("a card bill is just a Saída"); the parcela wizard (#1) only needs to generate Saída rows, not model a card account.
- **AI chat advisor (Cleo-style).** Flashy, not predictive; doesn't address the owner's literal ask (see red days ahead) and adds a whole new surface (LLM cost, tone, trust) for no gain on the calendar problem.
- **YNAB-style envelope budgeting / zero-based categories.** Different mental model than the owner's sheet (income/bills/daily + running balance); importing it would violate "never add a concept the owner did not have."
