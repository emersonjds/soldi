# Market analysis — what the big personal-finance apps do, and what Soldi takes

Date: 2026-11-05. Scope: default categories and the few features worth adding to v1. References: Mobills, Organizze, Minhas Economias (Brazil); YNAB, Monarch, Copilot, PocketGuard (US); Nubank's "Meu mês" and bank statement categorization.

## What they share

| Feature | Who | Soldi |
|---------|-----|-------|
| Quick add in under three taps, amount first, today as default | Mobills, Copilot, Monarch | Yes: `Lançar` sheet (SOL-3) |
| Default categories with icon and color, user can add/archive | all | Yes, seeded at sign-up (below) |
| Recurring bills with due day, "paid" toggle, overdue mark | Organizze, Mobills, Monarch | Yes (SOL-4) |
| Projected end-of-month balance counting unpaid bills | Monarch "forecast", PocketGuard "in my pocket" | Yes, and it drives the thermometer color (SOL-4) |
| Spending by category with donut and month-over-month delta | all | Yes (SOL-5) |
| Savings tracking as a rate of income | YNAB, Monarch | Yes, `Economia` (SOL-5) |
| Import of past data | YNAB (CSV), Monarch (CSV) | Yes, the owner's spreadsheet (SOL-7) |
| Budget per category with alerts | YNAB, Mobills, Copilot | No in v1 (D-out of scope); the thermometer is the budget |
| Bank sync (Open Finance) | Mobills, Organizze, Monarch | No in v1 |
| Multiple accounts / wallets, credit card cycles | all | No in v1; one running balance like the sheet |
| Notifications and e-mail digests | Mobills, Monarch | No in v1 |

## Features worth adding beyond the spreadsheet (cheap, high value)

1. **Transaction search and filter** by category, kind and text inside the month and in `Para onde vai` (Copilot, Monarch). Lands in SOL-5 as a list under the donut.
2. **Month-over-month delta per category** ("Mercado +18% vs outubro") (Copilot). Lands in SOL-5 `reports/categories`.
3. **Overdue bill mark and "paid with a different amount"** (Organizze). Lands in SOL-4 `POST /bills/{id}/pay` with optional amount.
4. **Undo on delete** (toast with "Desfazer") instead of confirm dialogs (Monarch). Web pattern from SOL-3 on.
5. **Export CSV** of a month (YNAB). Follow-up card, not v1.

## Default categories (seeded at sign-up, pt-BR, lucide icon, token color)

Income (`income`): Salário `briefcase`, Extra `sparkles`, Reembolso `undo-2`.

Bills (`bill`): Aluguel `home`, Condomínio `building-2`, Luz `zap`, Água `droplets`, Internet `wifi`, Celular `smartphone`, Cartão `credit-card`, Assinaturas `repeat`, Escola `graduation-cap`, Seguro `shield`, Financiamento `landmark`, Impostos `receipt`.

Daily (`daily`): Mercado `shopping-cart`, Comida fora `utensils`, Transporte `car`, Combustível `fuel`, Saúde `heart-pulse`, Farmácia `pill`, Lazer `gamepad-2`, Roupas `shirt`, Casa `sofa`, Pets `paw-print`, Presentes `gift`, Beleza `scissors`, Educação `book-open`, Viagem `plane`, Outros `circle-dashed`.

Imported spreadsheet rows without a category land in `Importado` per kind (SOL-7), archived from the chips once the user recategorizes.

Colors come from a fixed palette of twelve token names (`cat-1..cat-12`) assigned round-robin per kind; the `designer` agent defines the OKLCH values in the theme preset.
