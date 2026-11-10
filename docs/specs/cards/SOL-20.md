# SOL-20 — Cofrinhos: Economia as a Saída category with subcategories

Owner, 2026-11-05 (final wording): "na parte de saídas, coloque a parte de economia e aí dá pra criar subcategorias; quando for selecionada uma saída do tipo economia ela vai pra parte de economia como dinheiro guardado por aquela categoria". Replaces the earlier draft of this card.

## Why

Saving money is just a `Saída` the user never gets to spend, exactly as the owner's sheet treated it. Making `Economia` a category keeps `Lançar` unchanged, keeps the month balance honest (saved money leaves the balance) and lets each goal be a subcategory the user already knows how to create.

## Model

- Seed at sign-up (and backfill for existing users in the migration): category `Economia`, kind `bill`, icon `piggy-bank`, color `cat-11`, `is_savings = true` (new boolean column, true only for this row per user; cannot be archived, renamed to something else is fine, cannot get a parent).
- A **cofrinho** is a child category of `Economia` (kind `bill`). `categories` gains optional `target NUMERIC(12,2) > 0` and `deadline DATE` (both only meaningful under `Economia`; 422 elsewhere). No children are seeded: the owner decided (2026-11-05) that every cofrinho is created by the user; the screen offers name suggestions as chips only.
- **Guardar** = a `bill` transaction whose category is a cofrinho (or `Economia` itself for "sem objetivo"). Nothing new in `Lançar`.
- **Resgatar** = an `income` transaction with the seeded income category `Resgate` (kind income, icon `piggy-bank`, `is_savings = true`) and the new nullable `transactions.cofrinho_id` pointing at the cofrinho category. Created from the Cofrinhos screen only; `Lançar` hides `Resgate` from the income chips.
- Balance of a cofrinho = Σ bill entries in it − Σ resgates with its `cofrinho_id`, since `opening_date`. Rule: a resgate above the balance → 422 `insufficient-cofrinho`.
- `Economia` itself (no child) is a cofrinho called `Sem objetivo` on screen.
- The `savings` table, `savings_goal_pct` and `GET/PUT /api/savings*` are removed (the owner discarded the imported values; no other user has rows).

## Month view

- `totals.saved` = bill entries under Economia (any depth) in the month − resgates in the month. `totals.outflow` keeps including them (money left the balance), but the thermometer sentence adds `Guardou {amount} este mês.` when > 0 and `Para onde vai` shows the `Economia` group like any other (it is spending in the sheet's sense).
- `MonthView.savings` becomes `{ saved, rate_pct }` (`saved / income`, null when income 0).

## API

- `GET /api/cofrinhos` → `{ total_saved, saved_this_month, items: [{ category_id, name, icon, color, target, deadline, balance, progress_pct, done, monthly_suggestion, parent: bool }] }` ordered: done last, then by name; `Sem objetivo` (the parent) only when its own balance > 0.
- `PATCH /api/categories/{id}` accepts `target` and `deadline` (cofrinhos only). Creating a cofrinho is `POST /api/categories` with `parent_id = Economia`.
- `POST /api/cofrinhos/{category_id}/withdraw` `{ date, amount, note? }` → 201 income transaction (`Resgate`, `cofrinho_id`).
- `GET /api/cofrinhos/{category_id}/movements?limit=50` → deposits and resgates, newest first.
- `monthly_suggestion = (target − balance) / months_left` half-even, null without deadline or when done.

## Screens (ux; copy final)

- Tab `Economia` → `Cofrinhos` (route `/economia` kept). Header: `Guardado R$ 1.300,00`, caption `Este mês +R$ 500,00`.
- Card per cofrinho: icon circle, name, `R$ 300,00 de R$ 10.000,00` (or just the balance without target), progress bar in the color, caption `Faltam R$ 9.700,00 · R$ 1.212,50/mês até jun 2027` / `Sem prazo`; `done` → check + `Meta batida`. Tap → sheet: `Guardar` (opens `Lançar` as Saída with the cofrinho preselected), `Resgatar` (amount, date chips, note), movements list, `Editar` (name, icon, color, meta, prazo), `Arquivar` (422 when balance > 0 → `Resgate tudo antes de arquivar`).
- `+ Novo cofrinho`: name, meta (optional), prazo (optional), icon, color; suggestions chips `Reserva de emergência`, `Viagem`, `Carro`, `Casa`, `Estudos`.
- `Ajustes › Categorias`: `Economia` shows with a piggy badge and its children; the `+` there creates a cofrinho the same way.
- Mês rows for these entries read `Economia › Reserva` with caption `Guardado`; resgates read `Resgate › Reserva` in income color.
- Empty: `Nenhum cofrinho ainda. Comece pela reserva de emergência.` + button.

## Acceptance

Seed + backfill tested; balance, rate, suggestion and the 422s as unit tests; `Lançar` a Saída in `Economia › Reserva` shows up on Cofrinhos within the same request cycle; resgate reduces it and appears on Mês as income; screens at 375 and 1440; coverage ≥ 90% both sides; `out/economia.html` kept.
