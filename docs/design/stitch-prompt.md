# Stitch prompt — Soldi (v2, Organizze-like)

v1 (generic fintech, calm neutrals) was rejected by the owner on 2026-11-05: too generic, colors wrong. v2 follows the visual language of Organizze and Mobills: dark header, overlapping summary cards, round colored category icons, day-grouped lists, bottom tab bar, "+" FAB. Generate mobile (390×844) first, then desktop (1440×900).

```
Design "Soldi", a Brazilian personal-finance app (Portuguese copy) in the visual style of Organizze and Mobills: a mobile-first money app, not a generic admin dashboard. Frames: iPhone 390x844 first, then a desktop version 1440x900 that keeps the same components in a two-column layout with a slim left sidebar.

PALETTE (use exactly):
- Header gradient: #1E1B4B → #312E81 (deep indigo), white text on it.
- Accent / primary buttons / FAB: #6C5CE7 (violet), hover #5A4BD1.
- App background: #F4F5FA. Cards: #FFFFFF, radius 16px, soft shadow 0 4px 16px rgba(30,27,75,0.08).
- Text: #1B1F3B primary, #6B7280 secondary.
- Income green: #16A34A on #DCFCE7. Expense red: #DC2626 on #FEE2E2.
- Balance tiers (the "thermometer"): red #DC2626, light red #F87171, yellow #F59E0B, light green #4ADE80, green #16A34A. Tiers are shown as a pill with the amount and a 1-word label: "Crítico", "Atenção", "Apertado", "Confortável", "Folga".
- Category icon circles (40px, white lucide icon): Mercado #F59E0B, Comida fora #F97316, Transporte #3B82F6, Saúde #EF4444, Lazer #A855F7, Aluguel #6366F1, Luz #EAB308, Internet #06B6D4, Cartão #EC4899, Assinaturas #8B5CF6, Salário #16A34A, Extra #22C55E.
- Dark theme: background #0F1222, cards #1A1E36, header #141734, same accent and tier colors.

TYPOGRAPHY: Inter. Money in tabular figures, bold. Hero number 34px, section titles 16px semibold, body 14px, captions 12px.

NAVIGATION: bottom tab bar with 5 items: "Mês" (calendar icon), "Para onde vai" (pie-chart icon), a raised center "+" FAB in #6C5CE7 that opens "Lançar", "Economia" (piggy-bank icon), "Ajustes" (settings icon). Desktop: same items in a left sidebar 240px with the Soldi wordmark.

SCREENS:

1. MÊS (home). Dark indigo header (height ~220px on mobile) with: avatar + "Olá, Emerson" on the left, bell icon on the right; a month switcher centered "‹ Novembro 2026 ›"; the hero: label "Saldo hoje" and "R$ 1.842,10" in white 34px with a tier pill "Confortável" in light green below it. Overlapping the bottom edge of the header, a white card with three columns: "Entradas R$ 6.361,60" (green arrow-up icon), "Saídas R$ 4.256,50" (red arrow-down icon), "Projetado R$ -312,40" with a light-red tier pill "Atenção". Below, a white card "Contas do mês" listing rows: colored icon circle, name "Aluguel", caption "vence dia 5", amount "R$ 2.259,56" and a pill toggle "Pagar" (outline violet) / "Pago" (filled green); an overdue row shows a small red clock before the caption. Below, a section "Lançamentos" grouped by day with sticky day headers "Hoje, 5 nov" / "Ontem, 4 nov" / "3 nov"; each row: category icon circle, title (category or note), caption with the kind "Diário" or "Conta", amount right-aligned (green with + for income, dark for spending), and at the right end of each day header the running balance pill colored by tier ("R$ 1.842,10"). Future days are not listed. Include a variant with an empty state card: illustration-free, icon + "Nenhum lançamento ainda" + violet button "Lançar agora".

2. LANÇAR (bottom sheet on mobile, centered dialog on desktop). Top segmented control with three colored options: "Entrada" (green), "Conta" (indigo), "Diário" (violet). Big amount "R$ 0,00" 34px centered with a numeric keypad below on mobile. Then a horizontal scroll of category chips (icon circle + label), selected chip gets a violet border. Date chips "Hoje" / "Ontem" / calendar icon. A single-line "Observação" field. Full-width violet button "Salvar". Show the state with "Diário" selected, "Mercado" chosen and "R$ 184,31" typed.

3. PARA ONDE VAI. Header stays dark but shorter (120px) with the month switcher. Card with a donut chart (category colors above) and the total "R$ 4.256,50" in the center, legend below with icon circle, name, amount, percentage, and a small delta badge vs previous month ("+18%" red, "-6%" green). Card "Top 5" ranked list with thin progress bars in the category color. Then the transaction list of the tapped slice.

4. ECONOMIA. Header with the year "‹ 2026 ›". A hero card: "Guardado no ano R$ 5.416,53" and "8,4% das entradas" with a violet progress bar to a goal "Meta 20%". Then a table card with 12 rows: month, Entradas, Guardado (tappable, inline edit), % with a small colored dot (red < 5%, yellow 5–15%, green > 15%).

5. ONBOARDING (3 steps, violet progress dots). Step 1: dark header "Quanto você tem hoje?", big amount input, date field "05/11/2026", button "Continuar". Step 2: "Suas contas fixas": list of added bills with icon circles + a form row (nome, valor, dia, categoria chip) and a link "Adicionar outra"; button "Continuar" and a text link "Pular por agora". Step 3: "Tudo pronto" with a preview of the Mês card and button "Ver meu mês".

6. ENTRAR / CRIAR CONTA. Dark indigo full background on top 40% with the Soldi wordmark and tagline "Seu mês no verde."; white sheet below with E-mail, Senha, violet button "Entrar", link "Criar conta". Inline error example "E-mail ou senha incorretos".

7. AJUSTES. Grouped list card style like iOS settings: "Categorias", "Contas fixas", "Termômetro" (opens a card with four amount inputs -500 / 0 / 1.000 / 2.000 and a live five-color preview strip), "Saldo inicial", "Sair" in red.

Also produce a loading skeleton variant of MÊS and the dark theme of MÊS and LANÇAR. Touch targets ≥ 44px, inputs ≥ 16px text, no horizontal scrolling, no gradients outside the header, no decorative illustrations.
```
