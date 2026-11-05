# SOL-4 — Contas fixas, pago/a pagar e saldo projetado

Panel of 2026-11-05 (product, ux, finance, architect). Depends on SOL-3. Spec sections 4–7; design `docs/design/stitch/mes-*.png` ("Contas do Mês" card).

## Why

The sheet's `Saída` column is mostly the same bills every month. Registering them once removes most typing and lets the month turn red before the money is gone: the projected balance subtracts what is still unpaid.

## Rules (finance → unit tests in `months/domain.rs` and `bills/domain.rs`)

| # | Case | Expected |
|---|------|----------|
| 1 | Bill Aluguel 2259.56 due day 5, unpaid, month-end ledger balance 1000 | `projected_balance` -1259.56, projected tier Red; `bills_of_month[0].paid` false |
| 2 | Same bill paid on 11-05 via `POST /bills/{id}/pay` | a transaction kind `bill`, amount 2259.56, date 11-05, `recurring_bill_id` set; projected = ledger balance (nothing unpaid) |
| 3 | Paid with a different amount (`{ amount: "2300.00" }`) | transaction uses 2300.00; bill amount unchanged |
| 4 | Pay the same bill twice in one month | 409 `bill-already-paid` |
| 5 | `DELETE /bills/{id}/pay?month=2026-11` | the linked transaction is deleted; projected drops again |
| 6 | Due day 31 in November, 29 in February 2027 | `due_date` 2026-11-30, 2027-02-28 (clamped) |
| 7 | Unpaid and `due_date < today` | `overdue` true; unpaid and due today or later → false |
| 8 | Past month view (December 2026 viewed in January) | unpaid bills still listed as overdue, still subtracted from that month's projection |
| 9 | Bill created mid-month with due day earlier than today | listed for the current month, overdue |
| 10 | Bill `active=false` or archived | not listed, not projected; its past transactions stay |
| 11 | Category must be the user's and kind `bill` | 422 on `category_id` |
| 12 | Pay with a date outside the requested month | 422 on `date` |
| 13 | `projected_tier` uses the same thresholds as the daily tier | — |

Projection formula: `projected_balance = balance at month end (ledger as is) − Σ amount of bills_of_month where paid = false`.

## API (architect)

- `GET /api/bills` (exists; add `include_inactive=true` for Ajustes), `POST /api/bills`, `PATCH /api/bills/{id}` (name, amount, due_day, category_id, active), `DELETE /api/bills/{id}` (archive).
- `POST /api/bills/{id}/pay` `{ date: "YYYY-MM-DD", amount?: "123.45" }` → 201 transaction. `DELETE /api/bills/{id}/pay?month=YYYY-MM` → 204.
- `GET /api/months/{YYYY-MM}` now fills `bills_of_month[] { bill_id, name, icon, color, amount, due_date, paid, transaction_id?, overdue }` and the real `projected_balance`.

## Screen (ux; copy final)

- Card `Contas do Mês`, subtitle `{n} obrigações cadastradas`, filter chips `Todas / Pendentes / Pagas` (desktop), link `Ver todas` → Ajustes › Contas fixas.
- Row: icon circle (category color), name, caption `Vence dia dd/mm`, amount, pill: `Pagar` (violet soft) → tap → `Pago` (green, check) with optimistic update; `Vencido` (red pill, tinted row, caption `Venceu dia dd/mm` with clock icon). Tap on the amount of an unpaid bill opens `Pagar` sheet with the amount prefilled (editable) and date `Hoje`.
- Footer line: `Próximo vencimento: {name} em {n} dias` or `Todas as contas do mês pagas`.
- Empty: `Nenhuma conta fixa ainda` + link `Cadastrar contas`.
- Summary `Projetado` and the thermometer sentence now use the projection: `Com as contas em aberto, seu mês termina em {amount}.`
- Ajustes › Contas fixas: list with inactive section, add/edit sheet (nome, valor, dia 1–31, categoria chip), archive with undo toast.

## Acceptance

Rules 1–13 as tests; Mês shows bills with the three pills and the tinted overdue row at 375 and 1440, light and dark; one tap marks paid and the hero/projected numbers update without reload; coverage ≥ 90% both sides.
