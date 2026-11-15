# Market benchmark: everyday money flows (SOL-146)

2026-11-14. Desk research: help centers, store listings, reviews, teardowns. No app was installed. Taps are counted from the documented steps; `~` means inferred from the steps, not measured on a device. Typing the amount counts as zero taps (keypad open by default) unless noted. pt-BR labels quoted as each app shows them.

## Apps covered

| App | Type | Manual logging? | Notes |
|---|---|---|---|
| Nubank | bank | no (auto from card/account) | recategorize on purchase screen |
| Inter | bank | no | category on "detalhamento de compras" |
| C6 | bank | no | filter extrato by category; C6 Assistant |
| PicPay | bank/wallet | no | bought Guiabolso, shut it down 11/2022 |
| Mercado Pago | wallet | no | "histórico categorizado", edit + create category on the transaction |
| Itaú | bank | no | no public help on per-purchase categories found (not verified) |
| Bradesco | bank | no | "Meus Bancos" + "Simplifica" app, editable subcategories |
| Banco do Brasil | bank | no | "Minhas Finanças" inside the BB app, move spends between categories |
| Mobills | manager | yes | BR market leader for manual logging |
| Organizze | manager | yes | BR, very simple, strong on "fixo"/"parcelado" |
| Minhas Economias | manager | yes | free, categories + subcategories |
| Guiabolso | aggregator | no | discontinued 11/2022 (PicPay) |
| Meu Dinheiro | manager | yes | manual only, web-first (details not verified) |
| Olivia | AI aggregator | no | view-only bank link; acquired by Nubank (status not verified) |
| YNAB | budget | yes | category = budget line; heavy onboarding |
| Monarch | aggregator | yes | categories in groups, rules on recategorize |
| Copilot | aggregator | yes | categories + "groups of categories" |
| Revolut | bank | no | create category from the transaction's category list |
| Wallet (BudgetBakers) | manager | yes | most-used categories on top |
| Spendee | manager | yes | keypad + category layers, swipe expense/income |
| Money Manager (Realbyte) | manager | yes | grid picker, subcategories opt-in |
| Toshl | manager | yes | "4 taps" add flow, inline "+" in pickers |

Key split: **banks categorize, they never ask you to log.** Their category UX is only "fix a wrong label": tap the category icon on the purchase, pick, confirm. Logging UX benchmarks come from Mobills, Organizze, Toshl, Wallet, Spendee, Money Manager.

## 1. Logging an expense / income

Common pattern: one global "+" (FAB or bottom-center) → expense/income choice (tab or separate buttons) → amount with keypad already open → category → save. Date defaults to today, account defaults to last used. Description optional.

| App | Order | Taps (simple spend) |
|---|---|---|
| Toshl | "+" → amount keypad → ">" → category (swipe pages or search) → tick | 4 (documented: "amount, category, tags, save"; tags optional) |
| Wallet | "+" → "New Record" (Android) → type tab → amount → account → category → save | ~5 |
| Mobills | "+" → "Despesa" → "Valor" → "Descrição" → "Categoria" → "Conta" → save | ~5 + description typing |
| Organizze | "+" → "Despesa" (or "Despesa" in "Acesso Rápido" on Visão geral, web) → fields → green confirm | ~5 |
| Spendee | "+" (center) → keypad → category (mandatory) → submit | ~3-4; reviewer flagged keypad/category/details "layers" as confusing before you know what the page is |
| Money Manager | "+" → "Date" (prefilled) → "Account" grid → "Category" grid → "Amount" keypad → "Save" | ~5; account, category, amount mandatory |

Best example: **Toshl** — amount first on a big keypad, then a full-screen category grid with search, date "today" by default with a one-tap "yesterday" shortcut, everything else (description, repeat, photo) behind small icons. "For a basic expense all you need to do is: enter the amount, select a category and tap save."

Notes:
- Amount-first wins in every manual app that is praised for speed (Toshl, Spendee, Money Manager keypad). Field-list forms (Mobills, Organizze) are slower but familiar to BR users of spreadsheets.
- Date: default today everywhere; Toshl adds "yesterday" — the most common correction.
- Mobills/Organizze show "Pago"/"Não pago" toggle on the form; it confuses first-timers less when default is "pago" for today and "não pago" for future dates.

## 2. Picking a category and creating one inline

| App | Picker | Inline create? | Where the "+" is |
|---|---|---|---|
| Toshl | paged grid + search | yes | "+" icon on the Category tab of the add flow; same for tags |
| Revolut | list on the transaction | yes | "Create" item inside the "Category" list → name, colour, icon → "Save"/"Confirm" |
| Mercado Pago | list on transaction detail | yes | "editar" on the transaction, create new category there |
| Wallet | list with most-used on top | no (settings) | — |
| Money Manager | grid; tap parent → subcategory panel | no in picker; subcategory "+" top-right inside Category Management | settings |
| Mobills | list grouped by parent | no; "…" → "Criar categoria" / subcategory "+" next to the category in Gerenciar → Categorias | settings |
| Organizze | list | no on app; profile → "Categorias" → "+ Criar categoria" | settings |
| YNAB | grouped list | on mobile only via Plan → "Edit Plan" → "+" on the group header | plan tab |
| Nubank | icon grid on purchase | no custom categories in BR | — |

Best example: **Revolut** — the "Create" row lives at the end of the same list you are picking from; three fields (name, colour, icon), one "Save", and you return to the transaction with the new category already picked. **Toshl** does the same inside the add flow.

Observed: BR leaders (Mobills, Organizze) still force a trip to settings to create a category. That is the gap Soldi already beats (D43) and must keep.

Recent/frequent: **Wallet** puts "most used" categories first; Toshl orders tags by the chosen category. Nobody in the set hides the full list behind a "more" tap on mobile — the full list is the picker, recents only sort it.

## 3. Categories management screen

Common pattern: two tabs or a switch "Despesas"/"Receitas" (Mobills: "Expenses or Incomes"; Organizze asks "despesa ou receita" at create), parents listed with their subcategories indented below, "+" next to each parent to add a child, a global "+ Criar categoria", each row with icon + colour, tap row → edit name/icon/colour, delete inside edit.

| App | Layout | Add child | Edit/delete |
|---|---|---|---|
| Mobills | Gerenciar → Categorias → tab Despesas/Receitas, parents with children | "+" beside the parent | tap → edit; "…" menu |
| Organizze (web) | list, "+ subcategoria" under each parent | inline under parent | Android has separate "Editar categoria"/"Editar subcategoria" |
| Money Manager | Income/Expense Category Management, subcategories off by default (switch) | tap parent → "+" top-right | pencil icon |
| Monarch (web) | Settings → Categories, grouped; "Create Category", "Create group", drag into group | drag or create in group | — |
| Copilot | Categories tab; group via category menu → "Spending category group" | — | menu top-right |
| Revolut | "Custom" section; defaults cannot be edited or deleted | — | "…" → "Edit category" → "Confirm" |
| YNAB | groups with "+" on the group header | "+" on header | rename/hide inline |

Best example: **Mobills** — the "+" sits on the parent row, so "add a subcategory to Alimentação" is one tap from where you are looking. Expand/collapse is uncommon on mobile; lists stay flat with indented children because category counts are small (~10-20 parents).

Revolut lesson: system categories are locked; custom ones are editable. Simpler mental model but conflicts with Soldi's owner-standard (D29) where every category is the user's.

## 4. Credit cards and the fatura

- **Mobills**: card registered with name, limit, closing day ("fechamento") and due day ("vencimento"). On the expense form, choosing a card instead of an account reveals the "fatura" (month) field and the "parcelado" switch. Installments are spread into future faturas automatically. Card "despesa fixa" appears only on its scheduled day so it does not eat the limit early.
- **Organizze**: card is picked in the same "conta/cartão" field as accounts. Lançamento can be sent to another fatura ("Enviar um lançamento para outra fatura") or duplicated afterwards — fix-after, not ask-before.
- **Banks (Nubank, Inter, C6)**: the fatura is the home of the card: "Resumo de faturas" → purchase → category icon. No assigning; the card is implicit.
- **Toshl / Wallet / Money Manager**: card = an account of type credit; no fatura concept beyond a balance.

Common pattern: **card lives in the same picker as accounts**; the fatura month is derived from the closing day and shown, not asked; an "outra fatura" override exists but is secondary. Best example: Mobills (fields appear only when a card is chosen).

Taps to log a card spend in Mobills: same as a normal spend + 1 (pick card) — no extra step when the default account is the card.

## 5. Recurring and installments while logging

- **Organizze**: one "Repetir" entry on the form; inside, two options: "é uma despesa fixa" (with periodicity, e.g. mensal) or "é um lançamento parcelado em" N parcelas, with the total in "Valor". App path: "Repetir lançamento > fixo > mensal" (3 taps).
- **Mobills**: "parcelado" checkbox → number of parcelas; separate "Despesa fixa" option; repeat with N times.
- **Toshl**: "repeats" behind a small icon below the date (some on Pro).
- **Money Manager**: "Repeat" / "Installment" options on the form.

Common pattern: **one "Repetir" control, two choices: fixo (todo mês, no end) vs parcelado (N vezes, total split)**. Best example: Organizze — the plain words "fixa" and "parcelado em" and total-amount input match how Brazilians say it at the counter ("parcelei em 10x").

## 6. Month overview / home

- **Nubank (2025-26 redesign)**: white background, vertical scroll; first block = account balance, then shortcuts (Pix, boleto, transferir, recarga) beside the balance; card block shows "Fatura atual"; one tap to hide values. Bottom quick icons were removed. Redesign goal stated as "fewer taps; balance, goals and next payments on the home".
- **Organizze**: "Visão geral" with "Acesso Rápido" buttons ("Despesa", "Receita") at the top, then balances, then cards/faturas.
- **Mobills**: dashboard of cards: balance, receitas/despesas of the month, cards, categories chart.
- **Copilot / Monarch**: spending vs budget for the month first; Monarch is reported as overwhelming for new users.

Common pattern: **one number first (balance), then "what is coming" (next bills/fatura), then detail**. Best example: Nubank — one number, quick actions next to it, everything else below the fold.

## 7. Onboarding for a first-time, low-literacy user

- **YNAB**: 45-60 min to first dashboard, pushes a class on zero-based budgeting. Anti-model for Soldi's audience.
- **Monarch**: 20-30 min, accounts + categories + goals + tour; reported overwhelming.
- **Copilot**: 10-15 min, ends with a spending review.
- **Toshl**: no setup required; default categories; first expense in 4 taps.
- **Mobills / Organizze**: ready-made default categories; "Começando a usar o Organizze" help article walks the first lançamento.
- **Banks**: zero setup — data arrives categorized.

Common pattern for mass-market BR: **default categories already there, first action = log one spend, teach in context**. Best example: Toshl (log first, configure never).

## Patterns Soldi should adopt (ranked by impact)

1. **The full category list is the picker; recents only sort it.** One tap from the form opens every category; most-used float to the top. Proof: Wallet (most used first), Toshl (paged grid + search), Money Manager (grid).
2. **Create a category from the bottom of the list you are picking from, and come back with it selected.** Name + icon (+ color) only, one save. Proof: Revolut ("Create" in the "Category" list), Toshl ("+" on the Category tab), Mercado Pago (edit on transaction). Mobills/Organizze lack it — Soldi's edge.
3. **Amount first, keypad already open, today pre-filled, "ontem" one tap away.** Proof: Toshl, Spendee, Money Manager keypad.
4. **Defaults over questions: last account/card, "pago" for today, fatura derived from the closing day.** Proof: Mobills (card fields appear only when a card is picked), Organizze (fix later via "Enviar para outra fatura").
5. **Cards in the same picker as accounts; the fatura month is shown, not asked.** Proof: Organizze ("conta/cartão" field), Mobills, Wallet/Toshl (card = account type).
6. **One "Repetir" control, two plain words: "Todo mês" (fixo) and "Parcelado em Nx" with the total amount.** Proof: Organizze ("é uma despesa fixa" / "é um lançamento parcelado em"), Mobills ("parcelado").
7. **Fix-after beats confirm-before: edit category from the entry itself (tap the icon, pick, done).** Proof: Nubank (tap category circle on the purchase → "Alterar"), Revolut, BB "Minhas Finanças".
8. **Home = one number, then what is coming, then detail.** Proof: Nubank 2025-26 home ("Fatura atual", balance first, shortcuts beside it), Organizze "Visão geral".
9. **Categories screen: tabs Gastos/Receitas, parents with indented children, "+" on the parent row.** Proof: Mobills (Gerenciar → Categorias, "+" beside parent), Organizze web ("+ subcategoria"), YNAB ("+" on group header).
10. **Zero-setup start: default categories exist, first action is logging one spend.** Proof: Toshl, Mobills, Organizze defaults; banks; against YNAB/Monarch 20-60 min setups.

## Anti-patterns to avoid

- **Category list behind an extra tap** ("Mais categorias", "Ver todas") on mobile. None of the logging leaders do it; it was the SOL-140 regression the owner reverted (SOL-145).
- **Detour to settings to create a category** mid-log (Mobills "…" → "Criar categoria", Organizze profile → "Categorias", YNAB "Edit Plan"). Loses the draft and the user.
- **Check badges / selected ticks on chips** to signal the pick. Apps show the chosen category as the field's value (icon + name) and close the picker; a tick adds noise and a second "is it saved?" question.
- **Scroll-to-form buttons / long single forms** where Save sits below the fold at 375 px. Save stays visible (sticky bottom or header tick — Toshl, Money Manager).
- **Layered keypad/category/details screens with no label of where you are** (Spendee review). Each step needs a plain title.
- **Jargon**: "categoria pai", "lançamento recorrente", "periodicidade". Use "grupo", "todo mês", "parcelado em".
- **Mandatory long setup or a class** before the first log (YNAB 45-60 min, Monarch 20-30 min).
- **Subcategories off by default behind a switch** (Money Manager): hides a feature the owner uses daily.
- **Asking the fatura month up front** instead of deriving it from the closing day.
- **Locked system categories** (Revolut) — conflicts with D29; every category in Soldi is the user's.

## Sources

- Mobills: [subcategorias blog](https://blog.mobills.com.br/subcategorias-mobills/), [criar subcategorias Android](https://comunidade.mobills.com.br/hc/pt-br/articles/360002180814-Como-Criar-e-Editar-Subcategorias-Android-), [criar categorias](https://mobills.zendesk.com/hc/en-us/articles/360051317613-How-to-create-Categories-for-Expenses-and-Incomes), [criar subcategoria](https://mobills.zendesk.com/hc/en-us/articles/360051312013-How-to-create-subcategories), [10 passos](https://www.mobills.com.br/blog/mobills/como-utilizar-o-mobills/), [parcelada no cartão](https://mobills.zendesk.com/hc/pt-br/articles/44243003508123-Como-criar-uma-transa%C3%A7%C3%A3o-parcelada-no-cart%C3%A3o-de-cr%C3%A9dito-manual), [despesas fixas do cartão](https://mobills.zendesk.com/hc/en-us/articles/360052557934-How-to-manage-fixed-credit-card-expenses), [gerenciar cartões](https://descubra.mobills.com.br/como-gerenciar-cartao-de-credito/), [review Showmetech](https://www.showmetech.com.br/review-mobills-gerenciador-financeiro/), [TechTudo PC](https://www.techtudo.com.br/dicas-e-tutoriais/2019/06/como-usar-o-gerenciador-financeiro-mobills-no-pc-para-economizar-dinheiro.ghtml)
- Organizze: [adicionar subcategoria web](https://ajuda.organizze.com.br/hc/pt-br/articles/6669202671507-Web-Categorias-Adicionar-subcategoria), [adicionar categoria Android](https://ajuda.organizze.com.br/hc/pt-br/articles/9996008563987-Android-Categorias-Adicionar-categoria), [lançar despesa web](https://ajuda.organizze.com.br/hc/pt-br/articles/5662695438739-Web-Lan%C3%A7amentos-Como-lan%C3%A7ar-uma-despesa), [lançamento fixo](https://ajuda.organizze.com.br/hc/pt-br/articles/5662979086355-Web-Lan%C3%A7amentos-Incluindo-um-lan%C3%A7amento-fixo), [lançamento parcelado](https://ajuda.organizze.com.br/hc/pt-br/articles/5663076876691-Web-Lan%C3%A7amentos-Incluindo-um-lan%C3%A7amento-parcelado), [outra fatura](https://ajuda.organizze.com.br/hc/pt-br/articles/5994743066259-Web-Cart%C3%A3o-de-cr%C3%A9dito-Enviar-um-lan%C3%A7amento-para-outra-fatura), [começando no Android](https://ajuda.organizze.com.br/hc/pt-br/articles/360044787873-Come%C3%A7ando-a-usar-o-Organizze-no-Android)
- Nubank: [TechTudo editar compra](https://www.techtudo.com.br/dicas-e-tutoriais/2017/11/como-editar-informacoes-de-uma-compra-na-fatura-do-nubank.ghtml), [Oficina da Net categoria](https://www.oficinadanet.com.br/bancos-digitais/29642-como-organizar-seus-gastos-por-categoria-personalizada-no-app-nubank), [nova interface](https://www.mundoconectado.com.br/mobile/nubank-lanca-nova-interface-no-app-veja-o-que-mudou/), [novidades 2026](https://diariodefinancas.com/aplicativo-nubank-novidades-2026/)
- Banks: [Mercado Pago histórico categorizado](https://www.mercadopago.com.br/blog/revise-pagamentos-historico-categorizado), [Inter detalhamento de compras](https://blog.inter.co/detalhamento-de-compras/), [C6 Assistant](https://www.c6bank.com.br/blog/c6-assistant), [BB Minhas Finanças](https://blog.bb.com.br/conheca-minhas-financas-app-bb/), [Bradesco Simplifica](https://www.moneytimes.com.br/bradesco-lanca-simplifica-app-para-organizacao-de-financas-pessoais/), [Bradesco Meus Bancos](https://banco.bradesco/cidadania-financeira/educacao-financeira/simuladores-jogos-e-ferramentas/meus-bancos/)
- BR others: [InfoMoney 8 apps](https://www.infomoney.com.br/minhas-financas/conheca-8-planilhas-e-aplicativos-para-organizar-gastos-e-controlar-despesas/), [Minhas Economias App Store](https://apps.apple.com/BR/app/id520869873), [Agora que sou rica 13 apps](https://www.agoraquesourica.com.br/economia/13-aplicativos-para-controlar-gastos-e-economizar-em-2025/)
- Global: [Revolut custom categories](https://help.revolut.com/en-US/help/accounts/budget-and-analytics/how-to-create-and-manage-custom-categories-for-transactions/), [Revolut assign categories](https://help.revolut.com/en-US/help/accounts/budget-and-analytics/how-to-assign-and-adjust-categories-for-your-transactions/), [Toshl add flow Android](https://toshl.com/blog/how-to-track-expenses-incomes-and-transfers-android/), [Toshl vs Finny tap count](https://getfinny.app/blog/add-expenses-shortcut-finny-vs-toshl-vs-lunch-money-2026), [Spendee review](https://amycheong.medium.com/app-review-spendee-1f72f4d50bc3), [Wallet categories](https://support.budgetbakers.com/hc/en-us/articles/7077082048146-All-about-Categories-and-Subcategories), [Wallet transactions](https://support.budgetbakers.com/hc/en-us/articles/7149271363090-Everything-About-Transactions-Add-edit-clone-split-duplicates), [Money Manager subcategory](https://help.realbyteapps.com/hc/en-us/articles/360015963394-How-to-add-a-subcategory-under-main-category), [Money Manager enable subcategory](https://help.realbyteapps.com/hc/en-us/articles/360042890154-How-to-enable-sub-category), [Money Manager add income/expense](https://help.realbyteapps.com/hc/en-us/articles/360042701994-How-to-add-an-income-expense), [YNAB categories](https://support.ynab.com/adding-removing-and-customizing-categories-a-guide-HJFO5j909), [YNAB split](https://support.ynab.com/en_us/split-transactions-a-guide-SJLEKwY0q?mobile-help=true), [Monarch custom categories](https://help.monarch.com/hc/en-us/articles/360048883771-Creating-Custom-Categories-and-Groups), [Monarch rules](https://help.monarch.com/hc/en-us/articles/360048393372-Transaction-Rules), [Copilot groups](https://help.copilot.money/en/articles/3767655-groups-of-categories), [onboarding times](https://freenance.io/financial-tools/best-onboarding-finance-app-2026-europe-handhold-experience-not-overwhelming-first-week-guide/), [Copilot onboarding flow](https://mobbin.com/explore/flows/bec90a3f-1c1b-490a-b27d-8445cc6e62a7)

Limits: Zendesk help centers (Mobills, Organizze, BudgetBakers, YNAB) returned 403 to direct fetch; their content comes from search-engine extracts. Itaú, Meu Dinheiro and Olivia current screens not verified. Tap counts with `~` need a device check before they back a decision.
