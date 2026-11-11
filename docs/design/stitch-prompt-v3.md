# Stitch prompt — Soldi (v3, dashboard redesign)

v2 (`stitch-prompt.md`) set the Organizze-like language that shipped in 0.1–0.21. v3 is for exploring the SOL-61 redesign (D21): every feature shipped up to 0.21.0, a desktop dashboard of cards, and a polished mobile app. Use it to compare what Stitch generates against `docs/specs/2026-11-10-dashboard-redesign.md`; it does not override the spec.

```
Design "Soldi", a Brazilian personal-finance web app (all copy in pt-BR, money in BRL like "R$ 1.842,10") that replaces a spreadsheet "thermometer": the month's running balance turns green or red by itself and the projection warns before money runs out. It must feel like a premium consumer fintech (Nubank-level polish), a pleasure to use, NOT a generic admin template and NOT a phone screen stretched on desktop. Generate each screen twice: mobile 390x844 first, then desktop 1440x900. Light theme only.

VISUAL LANGUAGE
- Canvas #F4F5FA. Cards #FFFFFF, radius 16px, soft shadow 0 4px 16px rgba(30,27,75,0.08), generous 20-24px padding, 16px gaps.
- Brand: deep indigo #1E1B4B / #312E81 (sidebar accents, selected tab pill, headings), action violet #6C5CE7 (primary buttons, FAB, links).
- Text #1B1F3B, secondary #6B7280. Income green #16A34A, spending stays dark text, danger #DC2626.
- Inter, tabular figures. Money is the hero: big bold reais with SMALLER, lighter cents (e.g. "R$ 5.304" + ",28" at ~55% size, raised). Hero number 44px desktop / 36px mobile.
- The thermometer: 5 tiers, always a colored pill WITH its word, never color alone: Crítico #DC2626, Atenção #F87171, Apertado #F59E0B, Confortável #4ADE80, Folga #16A34A.
- Categories: 40px round icon circles in the category color with a white line icon (Mercado amber, Comida fora orange, Transporte blue, Saúde red, Lazer purple, Aluguel indigo, Luz yellow, Internet cyan, Assinaturas violet, Salário green, Economia teal). Subcategories wear the parent's color.
- Segmented horizontal bars with a legend (value + %), day chips with dot counts, round checkboxes to mark bills paid, thin progress bars, status badges. Touch targets ≥ 44px, inputs ≥ 16px, no horizontal scroll.

NAVIGATION
- Desktop: white left sidebar 240px: Soldi wordmark; group "Menu": Mês, Para onde vai, Cofrinhos; group "Ajustes"; user avatar + name at the bottom. Sticky 64px top bar: page title, month switcher "‹ Novembro 2026 ›" on month pages, violet button "+ Lançar".
- Mobile: a header card "Olá, Emerson" with avatar; a separate month switcher card; a floating pill tab bar (Mês, Para onde vai, Cofrinhos, Ajustes) with the selected tab in an indigo pill, and a separate round violet "+" FAB beside it that opens Lançar. Content keeps bottom padding so the last row is never under the tab bar.

SCREENS

1. MÊS (dashboard). Desktop: 3-column grid of cards; mobile: the same cards stacked.
 a. Hero "Saldo hoje" (2 columns wide): "R$ 1.842,10" with tier pill "Confortável"; second line "Projetado no fim do mês R$ -312,40" with pill "Atenção"; a segmented bar "Para onde foi a entrada" splitting this month's income into Contas (indigo), Guardado (teal), Diário (cyan), Livre (light grey track), legend with values and %. A thin red banner variant: "Dia 23 fica no vermelho: R$ -675,00. Ver o dia".
 b. "Termômetro do mês": Entradas R$ 6.361,60 / Saídas R$ 4.256,50 / Resultado, plus a 5-color strip with a marker where the balance sits.
 c. "Contas a pagar": "Próxima: dia 05 · R$ 2.259,56", "3 de 8 pagas", day chips 05 08 10 12 15 with dots, rows with round checkbox, category icon, name "Aluguel", caption "vence dia 5" (overdue: red clock + "atrasada desde 5 out"), amount; tapping the circle marks it "Pago".
 d. "Lançamentos": grouped by day with day headers "Hoje, 10 nov" / "Ontem, 9 nov" and, at the right of each header, the running balance pill colored by tier. Rows: icon circle, title, caption "Diário" / "Conta" / "Entrada", series badge "↻ Saída · 3/12", amount (green "+" for income). Future days show "Previsto" in muted style with the projected balance. Button "Ver o mês inteiro".
 e. "Próximos meses": 12 month tiles with projected end balance and tier dot, the first red month highlighted; link "Posso comprar isso?".
 f. "Para onde vai": top 4 spending groups with icon, amount, % and thin bar in the category color; link "Ver tudo".
 g. "Cofrinhos": total saved "R$ 5.416,53" and the 2 main goals with progress "R$ 3.200 de R$ 10.000 · 32%".
 Also: a loading skeleton and an empty month ("Nenhum lançamento ainda" + "Lançar agora").

2. LANÇAR (bottom sheet on mobile, right-side panel or dialog on desktop, "Salvar" always visible in a pinned footer). Segmented "Entrada" / "Saída" / "Diário"; big amount "R$ 184,31"; category chips with icon circles (with subcategories); date chips "Hoje" / "Ontem" / calendar; "Observação"; switch "Repetir" with chips 2x 3x 6x 12x Outro and helper "12× R$ 39,90 · até out 2027"; switch "Parcelar" splitting a total "10× R$ 100,00 (última R$ 100,01)"; link "Prefere uma conta fixa? Transformar em conta fixa".

3. EDITAR LANÇAMENTO DE UMA SÉRIE: header "Parte de uma série de 12", radio "Só este" / "Este e os próximos" ("Toda a série" on the first), row "Meses na série" with chips and helper "+3× R$ 99,90 · até jan 2028" or "Remove os 6 últimos", date helper "Os próximos também vão para o dia 10.", toasts "Série ajustada para 6 meses" / "Série movida para o dia 10". Delete confirmation with the same radio, destructive "Excluir".

4. POSSO COMPRAR ISSO? (simulate, writes nothing): amount, "À vista" or "Parcelado em 6x", date; result card: projected balance line before/after for the next months and a verdict "Cabe no seu mês" (green) or "Em março você fica no vermelho: R$ -420,00" (red).

5. PARA ONDE VAI: month switcher; donut with total "R$ 4.256,50" in the center; legend with icon, amount, %, delta vs last month badge ("+18%" red, "-6%" green); groups expand into subcategories; tapping a slice lists its entries.

6. COFRINHOS: hero "Guardado R$ 5.416,53"; goal cards (name, color, target, optional deadline, progress bar, "Faltam R$ 6.800 · R$ 566/mês até out 2027"); actions "Guardar" and "Resgatar"; a "Sem objetivo" bucket; empty state with a friendly line and "Criar cofrinho".

7. CONTAS FIXAS (Ajustes): list of recurring bills with icon, name, amount, "vence dia 5", status chip "Ativa" / "Pausada"; sheet to add/edit (nome, valor, dia 1-31, categoria) and "Pausar"/"Retomar".

8. AJUSTES: grouped settings list: Organização (Categorias, Contas fixas), Termômetro (Termômetro limits with four amount inputs -500 / 0 / 1.000 / 2.000 and a live 5-color preview strip; Saldo inicial; Moeda: Real, Dólar, Libra, Euro), Dados (Apagar lançamentos: mês, ano ou tudo, with typed confirmation), Ajuda (Como funciona), Conta (Minha conta: nome, e-mail, senha; Excluir conta in red), "Sair".

9. CATEGORIAS: groups by kind (Entrada, Conta, Diário) with color and icon, subcategories indented; "+" asks Categoria or Subcategoria; row menu "⋮ Editar / Excluir".

10. ONBOARDING + TOUR: step "Quanto você tem hoje?" (amount + date), step "Suas contas fixas" (add rows, "Pular por agora"), "Tudo pronto"; then a 4-card tour (Entradas, Saídas, Projeção, Economia) with simple flat illustrations.

11. AUTH: Entrar, Criar conta, Esqueci minha senha ("Enviamos um link para seu e-mail"), Redefinir senha; tagline "Seu mês no verde."; inline errors like "E-mail ou senha incorretos".

Keep one consistent component system across all screens; prefer clarity and hierarchy over decoration.
```
