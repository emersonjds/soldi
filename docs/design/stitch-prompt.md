# Stitch prompt — Soldi

Paste the block below into Google Stitch (or any UI generator). Generate the mobile frames first (390×844), then the desktop (1440×900).

```
Design "Soldi", a personal-finance app in Brazilian Portuguese that replaces a spreadsheet "thermometer". Platform: responsive web app, mobile-first (390x844), then desktop (1440x900). Style: clean fintech, calm and confident, lots of white space, one accent color (deep green), neutral grays, rounded 12px cards, 8px grid, Geist or Inter, tabular figures for money. Light and dark themes. Numbers are the hero: the main number is always the biggest element on screen. Color carries meaning only through five "tiers" of the balance: red (< R$ -500), light red (R$ -500 to 0), yellow (R$ 0 to 1.000), light green (R$ 1.000 to 2.000), green (> R$ 2.000). Every colored element also shows a small label so color is never the only signal. shadcn/ui component vocabulary (cards, sheets, segmented controls, chips, tables, donut chart).

Screens:

1. "Mês" (home). Top: month switcher "Novembro 2026" with arrows. Thermometer header: three large numbers side by side on desktop, stacked on mobile: "Saldo hoje R$ 1.842,10" (tinted light green with label "Confortável"), "Projetado fim do mês R$ -312,40" (tinted light red with label "Atenção"), "Performance R$ 2.105,00". Below: a list of the days of the month, one row per day: day number, income (+), bills, daily spending, running balance with a colored pill by tier; today's row is pinned and highlighted; future days are muted. Side panel on desktop / section on mobile: "Contas do mês" with rows like "Aluguel · vence dia 5 · R$ 2.259,56" with a one-tap toggle "Pagar" → "Pago"; overdue ones get a small red clock. Floating primary button "Lançar".

2. "Lançar" bottom sheet (mobile) / dialog (desktop): big amount field with a numeric keypad feel "R$ 0,00", segmented control "Entrada / Conta / Diário", category chips with icons (Mercado, Transporte, Comida fora, Lazer, Saúde, Assinaturas, Aluguel, Luz, Internet, Cartão, Salário, Extra), date chips "Hoje / Ontem / Escolher", optional note, one primary button "Salvar". Three taps for the common case.

3. "Para onde vai": donut chart by category for the month with the total in the middle, a legend with amounts and percentage, "vs mês anterior" delta badges, a "Top 5" list, and the transactions of the selected slice below.

4. "Economia": a twelve-row table (Mês, Entradas, Guardado, %) with inline editable "Guardado", a year total row, and an optional goal "Meta 20%" progress bar.

5. "Onboarding" in three steps with a progress indicator: "Quanto você tem hoje?" (amount + date), "Suas contas fixas" (repeatable row: nome, valor, dia do vencimento, categoria, button "Adicionar outra"), "Pronto" with a confetti-free, calm success state and button "Ver meu mês".

6. "Entrar" and "Criar conta": e-mail, senha, one primary button, link to the other screen, inline errors.

7. "Ajustes": sections Categorias, Contas fixas, Termômetro (four threshold inputs with a live colored preview strip), Saldo inicial, Sair.

Show empty states ("Nenhum lançamento ainda. Toque em Lançar."), loading skeletons and an inline error state for the month screen. Keep touch targets at least 44px and form fields at least 16px font. No illustrations, no gradients, no decorative icons.
```
