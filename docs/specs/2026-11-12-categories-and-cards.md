# Mixed category groups, credit cards and the default standard

Cards: SOL-105 (mixed groups), SOL-101 (kind change, web on top of SOL-105), SOL-110 (default seeds), SOL-106 (credit cards).
Decisions: D26, D27, D28, D29 in `docs/specs/decisions.md`. Plan: `docs/specs/plans/SOL-105.md`.
Panel: product, finance and architect voted on every open question below; the winner is written, with the trade-off and the rejected options. The owner's request (2026-11-12) is the input; no question is left open.

## 1. SOL-105: a group holds Diário and Saída subcategories

### Model (winner: "the kind lives on each category; a group may hold either outflow kind")

- No migration. `categories.kind` stays `NOT NULL` on every row. A category's `kind` is the kind of **its own entries**, nothing more.
- A subcategory's kind no longer has to match its parent's. Rules on `parent_id` (`categories::domain::check_parent`):
  - outflow (`daily`, `bill`) and income never share a group: an `income` child needs an `income` parent and the reverse (422 `parent_id`, `must be of the same kind`);
  - under `Economia` only `bill` children (they are cofrinhos);
  - `Resgate` takes no children (422 `savings-category`, unchanged); one level deep (unchanged); not itself (unchanged).
- A **group** is any top-level category with active subcategories. It is not a new entity, it has no flag. Its own kind still decides where entries posted on the group itself go.
- "The kinds a group shows in" = its own kind plus the kinds of its active subcategories.

Every existing row stays valid: the change only removes a restriction. Reverting is reverting the code; no data written under SOL-105 breaks the old code except a mixed group, which the old code still reads and lists (it just would not let the user create another).

### Where each screen puts a mixed group

| Place | Rule |
| --- | --- |
| Lançar picker (chips and `Ver todas`) for kind `k` | The categories of kind `k`, plus each parent of another kind that holds a category of kind `k`, shown as its group. A parent of another kind is a header only: tapping its circle chooses its first subcategory of kind `k` (API order) and shows its `Sub:` pills; the parent itself is never the chosen category. |
| Ajustes › Categorias, tab `k` | Same set. `Veículo` (Saída) shows in the Diário tab with `Combustível` under it. `Nova subcategoria` from that row creates a Diário child. Editing the row edits `Veículo` with its own kind, never the tab's. |
| `Subcategoria de` (parent picker) | Every active top-level of the same side (outflow or income); `Economia` only for a Saída child. |
| Para onde vai (`/api/reports/categories`) | Unchanged grouping by parent: `Veículo` adds `Parcela` (Saída) and `Combustível` (Diário). `CategoryGroup.kind` becomes the **parent's own kind** (`COALESCE(p.kind, c.kind)`), not the first child's. Income and outflow still split by the leaf's kind; they never mix (rule above). |
| Contas fixas (`recurring_bills.category_id`) | Unchanged: any active `bill` category, top-level or subcategory, whatever its parent's kind. |
| Lançamento | Unchanged: an entry's kind equals its category's kind (`check_kind`). |

### Colors (D15 kept, extended)

- The DB index `categories_top_color_idx (user_id, kind, color)` stays as it is.
- A group's color must be unique in **every kind it shows in**. `repo::top_colors(kinds, except)` returns the colors of active top-levels whose own kind is in `kinds` **or** that hold an active subcategory whose kind is in `kinds`.
  - Creating a top-level of kind `k`: taken = `top_colors([k])`.
  - Recoloring a top-level: taken = `top_colors(kinds it shows in, except itself)`; a requested taken color is 409 `color-taken` (unchanged slug).
  - A group starts showing in a new kind (a child of the other kind is created, moved in, or changes kind): if its color is taken there, the group takes the lowest token free in all the kinds it shows in, and its subcategories wear it. If no token is free in all of them, it keeps its color.
- Subcategories still wear the parent's color and have no picker.

Trade-off: when all 24 tokens are taken in the union, two families can share a color in one kind's view. Color is never the only signal (D22: icon and name always show), so this is cosmetic, and it never blocks a save.

### Names

Unchanged: unique per user, kind and lower-cased name among active categories (`categories_active_name_idx`). `Seguro` under `Casa` and under `Veículo` both as Saída is refused (409 `duplicate-name`); the user names one `Seguro do carro`.

Trade-off: a per-parent name index would allow that, but it needs a migration, a new index, a down path that can fail on new duplicates, and SOL-110's standard has no such clash. Rejected for now.

### Rejected

- **Kind-neutral groups** (`kind` nullable on groups, or a new `group` kind): touches every query that reads `categories.kind`, needs a migration and a backfill decision for groups that already hold entries, and the color index needs a new space for kindless rows.
- **One color space for all outflow** (`daily` + `bill` share the 24 tokens): existing accounts seeded with the old defaults hold 28 outflow top-levels, more than 24, so the migration cannot keep every row valid.
- **Accepting any collision** (drop the D15 check for mixed groups): the owner asked for unique colors per kind; the extra rule is one SQL predicate.

### Acceptance (SOL-105)

Backend:
1. `POST /api/categories {kind: "daily", parent_id: <Veículo, bill>}` → 201; the child wears Veículo's color.
2. An income child under an outflow parent, or the reverse → 422 `parent_id`. A `daily` child under `Economia` → 422 `parent_id`.
3. Moving a `daily` category under a `bill` group with `PATCH parent_id` → 200.
4. Veículo (bill, `cat-8`) gets a daily child while a daily top-level wears `cat-8`: Veículo and all its children move to the lowest token free in both kinds; the response of the create returns the child with the new color.
5. Same, with every token taken in the union: Veículo keeps `cat-8`, 201.
6. Creating a daily top-level without a color skips the colors of groups that hold daily children.
7. `GET /api/reports/categories`: Veículo's group sums Parcela and Combustível; `kind` is Veículo's own.
8. An entry `kind: bill` on `Combustível` (daily) → 422 `category_id` (unchanged).
9. Another user's category as parent → 404 (unchanged).

Web (every state):
- Lançar Diário with Veículo (Saída) › Combustível (Diário): Veículo's circle shows; tapping it chooses Combustível and shows `Sub: Combustível`; deselecting the pill keeps Combustível (the parent is never chosen); `Ver todas` lists `Veículo › Combustível` and Veículo as a non-selectable heading.
- Lançar Saída: Veículo is choosable itself (own kind) and shows Parcela, Seguro, IPVA.
- A group with no child of kind `k` and of another kind does not show in `k`.
- Ajustes › Categorias Diário: Veículo header with Combustível; editing Veículo opens `Editar categoria` with Saída's colors and its own kind; `Nova subcategoria` from it creates a Diário child.
- Loading, empty (`Nenhuma categoria ainda`), error with retry: unchanged.
- 375 and 1440, light only.

## 2. SOL-101 under D26: a category changes kind on its own

Built on `feat/SOL-101-category-kind` (backend, unmerged). With mixed groups the "carry the whole family" rule is wrong: `Veículo` changing to Diário must not drag `Parcela` along.

Winner (D27):
- `PATCH /api/categories/{id} {kind}` changes **that category only**, top-level or subcategory. Its entries (series members included) take the new kind in the same transaction. Subcategories keep theirs.
- `kind-of-subcategory` is removed. `kind-locked` stays (Economia, cofrinhos, Resgate, any income category, any change to income).
- Name check: only the category's own name in the new kind (409 `duplicate-name`).
- `category-has-bills`: only conta fixas on this category (not its children) block a change to Diário.
- A top-level with no free color in every kind it would show in is refused with 422 `palette-full` and nothing changes (the color index would refuse two top-levels of one kind with one color).
- Color: a top-level keeps its color when it is free in every kind it now shows in, else takes the lowest free one there; its children wear it. A subcategory keeps its parent's color, and the parent applies D26's "starts showing in a new kind" rule.
- SOL-106 adds `category-has-card-entries` (422): a category whose entries carry a card cannot become Saída.
- The balance never moves: Diário and Saída are both outflow.

Web: `Tipo` (`Diário` / `Saída`) on `Editar categoria` for any daily or bill category that is not locked, subcategories included. Confirmation: `Mudar para {Saída|Diário}?` · `Todos os lançamentos de {nome} passam a ser {Saída|Diário}. O saldo não muda.` · `Mudar tipo` / `Cancelar`. Errors by slug: `duplicate-name` → `Já existe uma categoria {Saída|Diário} com esse nome.`; `category-has-bills` → `Uma conta fixa usa esta categoria. Troque a categoria da conta antes.`; `category-has-card-entries` → `Há gastos no cartão nesta categoria; eles só podem ser Diário.`; anything else → `Não foi possível mudar o tipo.`. After success the sheet stays open on the new kind and Ajustes switches to the new kind's tab.

Acceptance: changing `Porto` (subcategory, daily) under `Cartão` (daily) to Saída moves only Porto and its entries; Cartão now shows in both tabs; Porto wears Cartão's color, which moves if taken in Saída. Changing `Veículo` (bill) to Diário leaves `Parcela` as Saída. Every refusal above returns its slug and leaves no row changed.

## 3. SOL-110: new accounts start with the owner's standard

Seeds in `categories::domain` become two explicit tables: top-levels with a fixed color, then subcategories by parent name (they wear the parent's color). Colors are hand-assigned so no two outflow top-levels share one, across Diário and Saída, so D26 never has to recolor a new account. `cat-11` stays off outflow (D22: Guardado wears it).

| Top-level | Kind | Icon | Color | Subcategories (kind, icon) |
| --- | --- | --- | --- | --- |
| Salário | Entrada | briefcase | cat-11 | |
| Extra | Entrada | sparkles | cat-12 | |
| Reembolso | Entrada | undo-2 | cat-1 | |
| Alimentação | Diário | utensils | cat-1 | Mercado (Diário, shopping-cart), Comer fora (Diário, utensils-crossed), iFood (Diário, bike) |
| Gasto | Diário | wallet | cat-2 | |
| Transporte | Diário | bus | cat-3 | Uber (Diário, car-taxi-front), Combustível (Diário, fuel) |
| Saúde | Saída | heart-pulse | cat-4 | Plano de saúde (Saída, shield-plus), Farmácia (Diário, pill), Consultas (Diário, stethoscope) |
| Lazer | Diário | gamepad-2 | cat-5 | Viagem (Diário, plane) |
| Casa | Saída | home | cat-6 | Aluguel (Saída, key-round), Financiamento (Saída, landmark), Condomínio (Saída, building-2), Luz (Saída, zap), Água (Saída, droplets), Internet (Saída, wifi), Gás (Saída, flame) |
| Educação | Saída | graduation-cap | cat-7 | Escola (Saída, school), Cursos (Saída, book-open), Material (Diário, pencil) |
| Veículo | Saída | car | cat-8 | Parcela (Saída, receipt), Seguro (Saída, shield), IPVA (Saída, file-text) |
| Cartão | Saída | credit-card | cat-9 | none: a card's category is added with the card (SOL-106) |
| Assinaturas | Saída | repeat | cat-10 | |
| Família | Diário | users | cat-12 | Pets (Diário, paw-print), Presentes (Diário, gift), Mesada (Saída, hand-coins) |
| Economia (savings) | Saída | piggy-bank | cat-13 | |
| Resgate (savings) | Entrada | piggy-bank | cat-2 | |

Totals: 16 top-levels (4 income incl. Resgate, 12 outflow incl. Economia), 25 subcategories, 41 rows. Removed from the old list: Celular, Impostos, Roupas, Beleza, Outros (Gasto replaces it). Existing accounts are never touched (no backfill).

Lançar's first and preselected category (`FIRST` in `category-chips.tsx`) becomes `{ income: "Salário", bill: "Casa", daily: "Gasto" }`; an account without that name keeps today's fallback.

Acceptance: a new sign-up lists exactly this tree; every outflow top-level color differs from every other across Diário and Saída; every child's color equals its parent's; every icon passes `check_icon` and renders from the bundle (no lazy chunk); onboarding's bill step lists `Casa › Aluguel` etc. through `categoryLabel`.

## 4. SOL-106: credit cards and their fatura

D24 cut "credit cards and fatura"; the owner reverses that cut (D28).

### Model (winner: "a card is a conta fixa with a closing day")

- `recurring_bills.closing_day smallint NULL CHECK (1..31)`. A bill with a closing day **is a card**. Its `amount` is `NULL` (a card has no fixed amount): `CHECK ((closing_day IS NULL) = (amount IS NOT NULL))`.
- The card reuses everything a conta fixa has: name, `due_day`, `category_id` (a Saída category such as `Cartão › Porto`, which gives its icon and color), active/archived, `active_since`, one payment a month (`transactions_bill_month_idx`), pay and unpay endpoints, D17's landing rule.
- `transactions.card_id uuid NULL`, `FOREIGN KEY (user_id, card_id) REFERENCES recurring_bills (user_id, id)`, `CHECK (card_id IS NULL OR kind = 'daily')`, index `(user_id, card_id, date) WHERE card_id IS NOT NULL`. The foreign key only proves the row is one of the user's bills; that it is a card (`closing_day IS NOT NULL`), not a conta fixa, is checked by the app alone.
- A **spend on a card** is a Diário entry with `card_id`. A **fatura payment** is the usual bill payment row: `kind = 'bill'`, the card's category, `recurring_bill_id = card`, `card_id IS NULL`.

### Which fatura a spend lands in

`bills::domain::fatura_due(on, closing_day, due_day) -> NaiveDate`:
- the cycle closes on `closing_day` clamped to the month (D14 clamp). A spend dated **before** that month's closing date closes this month; **on or after**, next month (the closing day is the bank's "melhor dia de compra");
- the due date is `due_day` (clamped) in the closing month when `due_day > closing_day`, else in the month after;
- the fatura's month is the due date's month. That is the month `bills_of_month` lists it in and the month its payment must be dated in.

Examples: Porto closes 3, due 10: spend 2 Nov → 10 Nov; 3 Nov → 10 Dec; 5 Dec → 10 Jan. Nubank closes 28, due 5: 27 Nov → 5 Dec; 28 Nov → 5 Jan. Closes 31, due 10 (2026): 27 Feb → closes 28 Feb → 10 Mar; 28 Feb (the clamped closing day) → closes 31 Mar → 10 Apr. Closes 20, due 31: 10 Feb → 28 Feb.

### The money rule (finance vote)

**The running balance drops on the fatura's due date, never on the spend date.** Justification: the thermometer is the bank account; a card spend leaves the account only when the fatura is paid, and the owner's sheet already books the card total on the due day. Dropping on the spend date would make "Saldo hoje" disagree with the bank and drop twice when the fatura is paid.

Each view counts either the spend or the payment, never both:

| View | Card spend | Fatura payment | Unpaid fatura |
| --- | --- | --- | --- |
| Balance, tier, projection, forecast (`months`) | not counted on its date | counted on its date (it is a bill entry) | sum of its spends, lands on `max(due date, today)` (D17), only when > 0 |
| Mês totals (`Diário`, `Saídas`, split bar) | not counted | counted as Saída | not counted (not an entry) |
| Para onde vai (`reports/categories`) | counted in its own category, in its own month | **not counted** (its spends already are) | not counted |
| Lançamentos list | shown on its date with the card's name; it does not move that day's balance | shown like any bill payment | shown in `Contas do mês` |
| Economia (`saved`) | unaffected (cards carry only Diário) | unaffected | unaffected |

Implementation in one query: `months::repo::day_sums` adds `card_id` to its `SELECT` and `GROUP BY`. `flows_by_day` skips rows with a card; a new pure `faturas(bills, sums)` folds the card rows into `(card id, due month) → amount` through `fatura_due`. No new query for the month view or the forecast.

Para onde vai: `category_sums` adds `LEFT JOIN recurring_bills b ON b.user_id = t.user_id AND b.id = t.recurring_bill_id` and `AND b.closing_day IS NULL`.

Trade-off: a payment above its itemized spends (interest, annual fee, a spend never typed) moves the balance correctly but the excess is absent from Para onde vai. A transition month (the first fatura paid in Soldi, spends not itemized) should be typed as a plain Saída in `Cartão › Porto`, exactly as the sheet did; a card with no spends that month shows no fatura, so nothing doubles. Showing "payment minus itemized spends" as a remainder was rejected for now (a second query and a matching rule); follow-up if the owner asks.

### Fatura in the month

- `BillOfMonth` gains `is_card: bool`. For a card, `amount` is the payment's amount when paid, else the sum of its spends for that due month.
- A card month with no spends and no payment is not listed and is not owed (D25: no content, no row).
- D17 for cards: owed when the fatura is above zero and not paid. `active_since` does not apply (a spend typed today for last week still owes).
- Paying: `POST /api/bills/{id}/pay?month=` as today; for a card `amount` is **required** (422 `amount`, `required for a card`); the web pre-fills the fatura. Unpay: unchanged. Paid amount never follows later edits of the spends.
- `Bill` (API) gains `closing_day: Option<i16>`; `amount` becomes `Option<Decimal>` (always set for a conta fixa, never for a card). `CreateBill`/`UpdateBill` gain `closing_day`; a conta fixa needs `amount` and no `closing_day`, a card the reverse (422 on the wrong field). `closing_day` cannot be added to or removed from an existing bill (422 `closing_day`), so past payments never change meaning; it can change on a card, which re-buckets every unpaid fatura (paid ones keep their paid amount).
- A card has no pause: `PATCH {active: false}` on a card → 422 `active`, `a card has no pause; delete it instead`.
- An archived card leaves Contas fixas and the card picker, but its faturas with spends still show and can be paid (`months::repo::bills` and `bills::repo::find` for pay accept `archived_at IS NULL OR closing_day IS NOT NULL`).

### Spending on a card

- `CreateTransaction.card_id: Option<Uuid>`, `UpdateTransaction.card_id: Option<Option<Uuid>>` (`null` clears), `Transaction.card_id: Option<Uuid>`.
- Only a Diário entry takes a card (422 `card_id`, `only a Diário entry goes on a card`). The card must be the caller's unarchived card (422 `card_id`, `must be one of your cards`); an edit that keeps an archived card's id is allowed, unless it writes the card on new or later rows (`repeat_months`, a growing resize, `scope=following`).
- Series: `repeat_months` and `installments` copy `card_id` to every member; each member lands in the fatura of its own date (a 10x parcela on Porto shows in ten faturas). `scope=following` writes `card_id` like it writes kind and category.
- An entry change to Saída while it carries a card → 422 `card_id` unless the same patch clears the card.
- `Posso comprar isso?` with a card: the draft lands on its fatura's due date (web mirror of `fatura_due`, same cases).

### Migration `0020_credit_cards.sql`

```sql
ALTER TABLE recurring_bills
    ADD COLUMN closing_day smallint CHECK (closing_day BETWEEN 1 AND 31),
    ALTER COLUMN amount DROP NOT NULL,
    ADD CONSTRAINT recurring_bills_card_amount CHECK ((closing_day IS NULL) = (amount IS NOT NULL));

ALTER TABLE transactions
    ADD COLUMN card_id uuid,
    ADD CONSTRAINT transactions_card_fk FOREIGN KEY (user_id, card_id)
        REFERENCES recurring_bills (user_id, id),
    ADD CONSTRAINT transactions_card_daily CHECK (card_id IS NULL OR kind = 'daily');

CREATE INDEX transactions_card_idx ON transactions (user_id, card_id, date)
    WHERE card_id IS NOT NULL;
```

Every existing bill has an amount and no closing day; every existing entry has no card: all rows stay valid. The project runs forward-only migrations; the revert, if ever needed, is:

```sql
DROP INDEX transactions_card_idx;
ALTER TABLE transactions DROP COLUMN card_id;  -- card spends then count on their own date
ALTER TABLE recurring_bills DROP CONSTRAINT recurring_bills_card_amount;
UPDATE recurring_bills SET amount = 0.01, active = false WHERE closing_day IS NOT NULL;
ALTER TABLE recurring_bills DROP COLUMN closing_day, ALTER COLUMN amount SET NOT NULL;
```

### Web

- Contas fixas › `Nova conta fixa` / `Editar`: switch `Cartão de crédito` (create only). On: `Valor` hides, `Fecha dia` shows (1 to 31) next to `Vence dia`; category defaults to none and the help reads `Ex.: Cartão › Porto`.
- Contas fixas list: a card row reads `Fecha dia {n} · vence dia {m}` where a bill shows its amount.
- `Contas do mês`: a card row reads `Fatura {nome}` with the fatura amount; `Pagar` opens the pay sheet pre-filled with it and the hint `Confira com a fatura do banco.`
- Lançar, Diário only, when the user has at least one unarchived card: field `Cartão` (native select, 16 px, 44 px target) with `Nenhum` first and each card by name. Hidden otherwise (D25). Kept across `Repetir` and `Parcelar`.
- An entry row with a card shows a `credit-card` icon and the card's name next to the category; its day's Diário column does not include it.
- Simular with a card: the draft dips on the fatura's due date.

### Rejected (SOL-106)

- **A separate `cards` table**: re-implements list, archive, one-payment-a-month, pay/unpay and D17 landing for the same shape.
- **Balance drops on the spend date** (card as a memo): the balance diverges from the bank and the fatura would need to be excluded from it, so the one thing the owner checks against the bank is wrong.
- **Fatura stored as a row** (a `card_invoices` table, or a payment written at closing): breaks D8 (projection is computed, no rows ahead of time).
- **Card on Saída entries** (a conta fixa charged on the card): not asked; the DB check keeps the door shut until a card asks for it.
- **Backfilling** the sheet's card totals into spends: the owner's history stays as plain Saídas under `Cartão › Porto`.

### Acceptance (SOL-106)

Backend:
1. `fatura_due` cases above, including the year turn (spend 5 Dec, closes 3, due 10 → 10 Jan) and the clamps.
2. A card (closes 3, due 10) with spends 50 on 2 Nov and 30 on 4 Nov: Nov's view lists `Porto` 50 due 10 Nov, `is_card`; Dec's lists 30 due 10 Dec. The balance on 2 Nov is unchanged by the spend; on 10 Nov the projected balance drops 50.
3. Paying Nov with amount 52: the balance drops 52 on the payment date; Para onde vai for Oct/Nov shows the spends in their categories and not the 52.
4. Pay without `amount` on a card → 422 `amount`. A second payment in the month → 409 (unchanged).
5. Spends on a card typed after the card's `active_since` for an earlier date still owe their fatura.
6. Archiving a card with an unpaid fatura keeps the fatura in the month view and payable.
7. A 3x installment on the card lands in three successive faturas; `following` edit moving them to `card_id: null` puts them back on their dates.
8. `card_id` on a Saída entry, another user's card, or a conta fixa id → 422 `card_id`. Another user never sees or sums the caller's cards.
9. Bills without `closing_day` behave exactly as before (every existing months, bills and reports test passes untouched, except added fields).
10. Migration test: rows from before 0020 stay valid; a card without a closing day or a bill without amount is refused by the DB.

Web: every state of the card form (empty, invalid day, saving, error), the fatura row (unpaid, overdue `Venceu em`, paid), the Cartão field (no cards: hidden; with cards: `Nenhum` default), the entry row chip, the simulation dip; 375 and 1440, light only.
