# SOL-20 — Cofrinhos: poupar para um objetivo

Owner feedback 2026-11-05: the `Economia` year table ("Guardado", `%`) is confusing; wanted the Nubank / Mercado Livre "cofrinho" mechanic: a named goal you move money into and out of. Panel (product, ux, finance, architect) recorded by the orchestrating session.

## Why

Saving is an action, not a number typed into a table. A cofrinho makes the saved money visible, tied to a goal, and keeps the month balance honest: money moved into a cofrinho leaves the spendable balance.

## Rules (finance)

| # | Case | Expected |
|---|------|----------|
| 1 | Create cofrinho `Reserva` target 10000, no deadline | balance 0, progress 0% |
| 2 | Deposit 500 on 11-05 | cofrinho balance 500 (5%); a transaction kind `saving` 500 on 11-05 reduces the month running balance like a `daily` outflow; listed on Mês as `Cofrinho › Reserva` |
| 3 | Withdraw 200 on 11-10 | cofrinho balance 300; a transaction kind `saving` with `direction = withdraw` adds 200 back to the running balance (shown as income-colored `+`) |
| 4 | Withdraw more than the balance | 422 `insufficient-cofrinho` |
| 5 | Target reached (balance ≥ target) | `done: true`, UI celebrates once (toast `Meta batida`) |
| 6 | Deadline 2027-06-30, today 2026-11-05, balance 300 of 10000 | `monthly_suggestion = (target − balance) / months_left` = 9700 / 8 = 1212.50 (half-even) |
| 7 | Deposit date before `opening_date` | 422 `before-opening-date` |
| 8 | Archive a cofrinho with balance > 0 | 422 `cofrinho-not-empty`; the UI offers `Resgatar tudo e arquivar` |
| 9 | Month totals | `totals.saved` = deposits − withdrawals of the month; `performance` keeps `income − (bills + daily)`; `outflow` does not include savings; the thermometer sentence adds `Guardou {amount} este mês.` when > 0 |
| 10 | Savings rate of the month | `saved / income`, null when income 0 (replaces the old `savings` object on `MonthView`) |

## Data model

- `cofrinhos`: `id`, `user_id`, `name` (≤ 40), `icon` (lucide), `color` (`cat-n`), `target NUMERIC(12,2) > 0`, `deadline DATE NULL`, `archived_at`, timestamps. Unique active name per user.
- `transactions.kind` gains `saving`; new columns `cofrinho_id UUID NULL REFERENCES cofrinhos`, `direction TEXT NULL CHECK (direction IN ('deposit','withdraw'))` (required when kind = saving). `category_id` NULL allowed only when kind = saving (relax the NOT NULL with a CHECK).
- The `savings` table and `savings_goal_pct` are dropped (migration moves nothing: the owner asked to discard the imported values; other users have none).

## API

- `GET /api/cofrinhos` (active, with `balance`, `progress_pct`, `done`, `monthly_suggestion`), `POST`, `PATCH /{id}`, `DELETE /{id}` (archive, rule 8).
- `POST /api/cofrinhos/{id}/deposit` and `/withdraw` `{ date, amount, note? }` → 201 transaction; `GET /api/cofrinhos/{id}/movements?limit=50`.
- `GET /api/months/{m}`: `savings` becomes `{ saved, rate_pct }`; `days[].saving` added; `totals.saved` added.
- Remove `GET/PUT /api/savings*` and `savings_goal_pct` from settings; OpenAPI regenerated.

## Screens (ux; copy final)

- Tab `Economia` renamed `Cofrinhos` (piggy-bank icon stays). Header: `Guardado R$ 1.300,00` across cofrinhos and `Este mês +R$ 500,00`.
- Cards per cofrinho: icon circle, name, `R$ 300,00 de R$ 10.000,00`, progress bar in the cofrinho color, caption `Faltam R$ 9.700,00 · R$ 1.212,50/mês até jun 2027` or `Sem prazo`; `done` shows a check and `Meta batida`. Tap → detail sheet with `Guardar` and `Resgatar` (amount keypad, date chips Hoje/Ontem, note), movements list, `Editar`, `Arquivar`.
- `+ Novo cofrinho`: nome, meta (money), prazo (date, optional), ícone (IconPicker), cor (swatches). Suggestions as chips: `Reserva de emergência`, `Viagem`, `Carro`, `Casa`.
- Lançar sheet unchanged; a `saving` entry on Mês shows `Cofrinho › {name}` with the piggy icon and `Guardado` / `Resgatado` caption.
- Empty state: `Nenhum cofrinho ainda. Comece pela reserva de emergência.` + button.

## Acceptance

Rules 1–10 as tests both sides; screens at 375 and 1440; `out/economia.html` keeps the URL (route stays `/economia`, title `Cofrinhos`); coverage ≥ 90%.
