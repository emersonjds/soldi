# Decisions

Architecture decision records, one entry per cross-cutting choice. Newest at the bottom. Card-level choices stay in `docs/specs/cards/SOL-<n>.md`; an entry lands here when it binds more than one card. Format: context, options with votes when a panel ran, winner, trade-off.

## D1 — Name: Soldi (2026-11-05, owner)

Five letters, "money" in Italian, memorable. Alternatives offered: Saldo, Moola, Plata, Kassa.

## D2 — Multi-user from day one, free, no billing (2026-11-05, owner)

Every table carries `user_id`; every query filters by it; no cross-user endpoint exists. Plans and billing are a future card.

## D3 — pt-BR and BRL only (2026-11-05, owner)

Copy in Portuguese, `Intl.NumberFormat("pt-BR", { currency: "BRL" })`. No i18n layer.

## D4 — Rust backend, single repository, mirror of santi (2026-11-05, owner)

axum 0.8 + sqlx 0.9 + PostgreSQL, vertical slices (`domain`, `repo`, `service`, `handler`), utoipa OpenAPI, `crates/` + `web/` in one repo, one Railway deploy. Kotlin/Spring Boot and a separate API repo were considered and dropped by the owner.

## D5 — Next.js static export served by the axum binary (2026-11-05, owner picked option A)

`web/` is `next-shadcn-admin-dashboard` with `output: "export"`; the server serves `web/out` at `/` and answers `/api/*`. Trade-off: no SSR or server components with data; a logged-in dashboard does not need them. Alternatives: Next as a separate service (two deploys, CORS, cross-site cookie) and a Vite SPA port (throws the template away).

## D6 — Session cookie, argon2id, no JWT (2026-11-05, architect)

Opaque token, SHA-256 of it stored in `sessions`, `HttpOnly; Secure; SameSite=Lax` cookie named `__Host-soldi_session`. Same as santi; no key rotation, revocation is a row delete. Google OAuth (SOL-6) links by e-mail into the same table.

## D7 — Money is Decimal end to end (2026-11-05, finance + architect)

`NUMERIC(12,2)` in PostgreSQL, `rust_decimal::Decimal` in Rust, string in JSON, formatted only in the web. Rounding half-even at two decimals. Floats never touch an amount.

## D8 — Transactions are the only ledger; projection is computed (2026-11-05, architect)

Recurring bills never generate rows ahead of time. Paying one inserts a transaction with `recurring_bill_id`; the month view computes the projected end-of-month balance by subtracting unpaid bills. One `GROUP BY date` query per month view, never N+1.

## D9 — Thermometer thresholds per user, sheet values as defaults (2026-11-05, product)

`-500 / 0 / 1000 / 2000` from the owner's sheet; editable in Ajustes with a live preview. Color is never the only signal: each tier also has a label.

## D10 — Backlog lives in the santi tracker, project SOL (2026-11-05, owner)

Never Jira. Branches carry `SOL-<n>`; a card moves To Do → In Progress at branch → Done at merge to `developer`.

## D11 — Unused template screens are deleted in SOL-2 (2026-11-05, architect)

Keeps build size, lint and coverage scoped to Soldi. The `finance` and `default` dashboards stay until `Mês` exists, as the model to adapt (reuse rule).

## D12 — Autonomous delivery: agents decide, owner reviews in the morning (2026-11-05, owner)

Panel (`product`, `ux`, `finance`, `architect`) votes are recorded in the card brief; nothing waits for the owner. One implementing agent at a time, each in its own worktree with a shared `CARGO_TARGET_DIR`. Flow per card: branch from `developer` → build → review → merge `--no-ff` into `developer` → merge into `main` → push both.

## D13 — "Today" is the São Paulo calendar day (2026-11-05, architect + finance)

pt-BR only product (D3): the server computes `today` in `America/Sao_Paulo` (chrono-tz) for `is_today`, `balance_today` and overdue checks; the web sends nothing. Found in SOL-3: UTC flipped the day at 21:00 local. A per-user time zone setting is a future card if the product ever leaves Brazil. Same panel: entries within a day are ordered by `created_at desc` (random v4 ids made `id desc` meaningless); a transaction dated before `opening_date` is refused with 422 `before-opening-date` instead of being silently ignored.

## D14 — Repeated entries are real rows grouped by `series_id` (2026-11-05, SOL-21 panel, architect arbitrated)

"Repetir por N meses" (2..60, N counts the original) inserts all N rows at once, sharing a nullable `transactions.series_id`; position and total are counted at read time, never stored. A series action reaches only `this` row or `following` rows (date ≥ the edited one); past members are never rewritten, and a date change never propagates (D20: `following` moves the day of the month). Bill payments and resgates cannot repeat: an open-ended repeat is a recurring bill (D8), offered as "Transformar em conta fixa". Trade-off: D8's "no rows ahead of time" holds for bills only; a finite user-chosen repeat writes future rows, bounded by 60. Options: lazy generation (breaks D8's single ledger), a third "Toda a série" scope (rewrites reconciled months).

Update (2026-11-12, SOL-93): monthly-only is reversed by D32 (weekly and yearly steps) and the third scope by D33.

Update (2026-11-12, SOL-118): D36 adds open-ended Entrada/Diário series that grow as months are read; an open-ended Saída is still a conta fixa.

## D15 — Category colors are unique per kind; subcategories wear the parent's (2026-11-08, owner)

Among a user's active top-level categories of one kind no two share a color; the palette grows to 24 tokens so the defaults fit. Every subcategory, cofrinhos included, takes its parent's color and has no picker. Rejected: uniqueness across kinds (about 40 tokens, too close to tell apart) and cofrinhos keeping their own colors (an exception to a rule the owner wants without exceptions). Detail: `docs/specs/cards/SOL-32.md`.

## D16 — Forecast is computed from what the user entered, never guessed (2026-11-10, owner + product/finance/ux panel)

Future days show a projected balance built from committed future entries and unpaid contas fixas on their due day (a past-due one lands today); nothing is stored ahead (D8 holds). Future daily spending is not averaged in: false alarms cost more trust than late ones. Salary stays an entry repeated with D14, no recurring-income entity. The alert is the user's red tier, not "below zero". Horizon tops out at 12 months. "Posso comprar isso?" previews a draft without writing it; installments are a D14 series with the cents remainder on the last one. Rejected: bank sync, multi-year or multi-scenario models, envelope budgeting. Detail: `docs/specs/forecast/`.

Update (2026-11-12, SOL-95): D34 keeps a browser-only history of simulation inputs; the server still stores none.

## D17 — A conta fixa unpaid in an earlier month lands today until it is paid in its own month (2026-11-10, SOL-55 architect + finance rule 2)

One rule for every month, past, current and future: a month is owed only when its due date is on or after the opening date and on or after the bill's `active_since` (the São Paulo day it was registered, moved to today when a paused bill is resumed, D13), so a bill typed or resumed today never brings back months Soldi could not see. Payments are read from the first day of the opening date's month, so one dated before a moved opening date still pays its month. Months are bound to years 2000–2100 (SOL-30's bound). Each unpaid month lands once on `max(due_date, today)`; the current month lists it as `Venceu em <mês>`, a future month opens already lower by it, a past month never changes. Paying it books the entry inside its own month (one payment a month, SOL-4), so `balance_today` is the same as if it were booked today. The 6/12-month forecast (SOL-51) and every month view share this one rule. Rejected: carrying from the opening date alone (new users start red), a `bill_month` column to book late payments on their real day (migration, owner's call), `Ignorar este mês` (persisted skip; follow-up if asked). Detail: `docs/specs/cards/SOL-55.md`.

## D18 — No spreadsheet importer (2026-11-10, owner, SOL-59)

The `Termômetro.xlsx` importer (SOL-7) is removed: every spreadsheet has its own layout, so a parser written for one workbook cannot serve other users. Entries already imported stay as ordinary entries; only the import bookkeeping (`import_previews`, `transactions.import_batch_id`/`import_year`) is dropped. SOL-8, SOL-11 and SOL-22 die with it. Rejected: keeping the screen for the owner's workbook only (a feature nobody else can use), a column-mapping CSV importer (no demand yet; a new card if it comes).

## D19 — A series is resized at its end, never re-split (2026-11-10, SOL-47 panel, architect arbitrated)

`repeat_months` on a series member sets how many entries the series counts (2..60). Growing appends members in the months right after the last member's month, on the first member's day (D20: the last member's) (D14 clamp), copying the edited member as saved; counting by month keeps a gap left by a deleted or moved member from doubling a month, and an advisory lock on the series id serializes resizes and `following` deletes of one series. shrinking deletes the last members, never one ranked before the edited member. Kept members keep their amounts, installment series included: the server stores no flag telling parcelas from a repeat, and the sheet names the rows added or removed before saving, so the total never changes silently. Rejected: re-splitting the remaining total (halves a repeat; needs a flag and a migration), refusing installment series (same flag), a floor at today (`Excluir · Toda a série` already reaches past members), a dedicated `/series` endpoint (two requests for one save). Detail: `docs/specs/cards/SOL-47.md`.

## D20 — `Este e os próximos` moves the day of the month (2026-11-10, SOL-48 panel, architect arbitrated)

A date change with `scope=following` on a series member moves this and every later member to the new day, each clamped to its own month (D14 clamp); members before it never change and `scope=this` still moves one row to any month. The month never spreads: a month change with `following` is refused, and so is a move whose months hold two members of the series, so `(date, id)` order never changes. Money is untouched. D19's growth now takes the last member's day, or the larger day of the member before it when the last sits clamped on its month's last day, so a resize after a mid-series move lands on the new day. Rejected: a separate "move day" action (a second sheet for one field), keeping the first member as the anchor (wrong after a mid-series move), a stored series day (migration), applying a month change to this row only (one save with two meanings). Detail: `docs/specs/cards/SOL-48.md`.

Update (2026-11-12, SOL-93): "members before it never change" is reversed by D33 (`Toda a série` from any member, after a confirmation).

## D21 — Mês is a dashboard of cards; the shell owns the month and Lançar; Soldi stays light only (2026-11-10, SOL-61 panel, designer arbitrated)

`/mes` becomes a grid of seven cards: Saldo hoje (with the split bar "Para onde foi a entrada"), Termômetro, Contas a pagar, Lançamentos, Próximos meses, Para onde vai, Cofrinhos. They are 1 column at 375, 2 columns at 768, and 3 at 1440. Every card composes existing endpoints; no field or route is added. The ledger is capped to recent days, with an in-place expand.

Navigation:

- Desktop keeps the sidebar, in two groups with small uppercase grey labels: `MENU` (Mês, Para onde vai, Cofrinhos) and `CONFIGURAÇÕES` (Contas Fixas, linking to `/ajustes/contas`, and Ajustes), with 20 px line icons on 44 px rows and no `Lançar` entry (SOL-68). It gains a sticky top bar holding the title, the month switcher on month pages, and `Lançar`.
- Mobile gets a floating pill tab bar with four labelled tabs and a separate `Lançar` FAB, both in `Navegação principal`.
- Nav labels are unchanged (`Mês` stays).

Visual system:

- Money figures get a cents hierarchy, with the symbol and cents at 55%.
- One new token, `--split-daily`.
- Empty states reuse the tour's inline SVGs; there are no 3D assets.

Dark mode stays off, per the owner's SOL-12 decision. This supersedes the "light and dark" screenshot lines of the v1 spec and earlier cards. Components stay on semantic tokens, so reopening dark mode is one card.

The Economia year table stays unbuilt; Cofrinhos (SOL-20) is the savings screen.

Rejected:

- a top-bar-only shell (it loses the persistent nav);
- an `/extrato` route (an extra page for a list one tap away);
- a bell (no notification source);
- licensed 3D illustrations (license, weight, decoration);
- delivering dark mode now (doubles tokens and review for a layout epic).

Detail: `docs/specs/2026-11-10-dashboard-redesign.md`, plan `docs/specs/plans/SOL-61.md`.

Update (2026-11-11, owner, SOL-69): C1 went back to the 0.23.0 hero, today's balance with its tier and the Entradas / Saídas / Projetado summary; the split bar "Para onde foi a entrada" is dropped from Mês. The rest of the grid stays.

Update (2026-11-11, owner, SOL-79): the update above is reversed by D24 (the Stitch hero with the split returns; the top bar gains the tier pill), and empty cards no longer render (D25).

## D22 — The category palette is checked for color blindness; icon and label name a category, color only helps (2026-11-11, SOL-9, designer)

Ten of the first twelve `cat-*` tokens get new hex values (`cat-5` Lazer and `cat-11` Salário stay). Names do not change, so stored categories keep their token and no migration runs. Each token keeps its hue family (Mercado still amber, Aluguel still indigo); most moved in lightness, the axis a dichromat still sees.

Method: the dataviz `validate_palette.js` validator. It measures OKLab ΔE between colors simulated for protan, deutan and tritan vision (Machado, Oliveira & Fernandes 2009, severity 1.0), and WCAG contrast on the white card. Candidates were searched inside each hue family under hard rules: at least 3:1 on white, every one of the 24 at least the old 0.05 OKLab apart, `cat-11` fixed because Guardado wears it beside `--split-daily`. The search scored the set a user really sees: a new account fills each kind from the lowest free token, so Diário shows 15 categories painted `cat-1..cat-15`.

Rules, locked by `web/src/app/category-palette.test.ts`:

- every `cat-*` reaches 3:1 against `--card` and under its white glyph (WCAG 1.4.11);
- any two of the 24 sit at least 0.05 apart in OKLab;
- any two of `cat-1..cat-15` sit at least 3 apart under protan and deutan;
- any two of `cat-1..cat-12` sit at least 5 apart under tritan.

Limit: the validator's target of 8 (floor 6) between every pair is out of reach. 3:1 on white caps lightness at about OKLab 0.67, and a dichromat sees only lightness and one hue axis; fifteen colors in that band cannot all sit 6 apart. The best search reached about 6 on the twelve alone, and only by repainting all of them, `cat-11` included, out of their families (yellow turned olive, orange turned salmon), while cutting the fifteen-color set back toward 1. The shipped palette is the trade: worst pair 0.3 → 3.2 under protan and deutan across the fifteen, 2.7 → 5.3 under tritan across the twelve. Six pairs stay below 6: Mercado / Oliva, Comida fora / Luz, Extra / Framboesa, Luz / Salário, Comida fora / Oliva, Mercado / Extra. Salário / Verde-azulado stays at 2.6 under tritan, two tokens this card left alone. They can sit together: Ajustes › Categorias lists a whole kind, and the "Saídas do mês" donut mixes Diário and Saída. Every place a category color shows draws the category's own lucide icon and its name next to it (the donut through its legend rows, which also highlight their slice), so color is never the only signal and must not become one.

Rejected:

- a palette that reaches 6 on the twelve (it repaints all twelve out of their families and breaks the fifteen);
- renaming or reordering tokens (needs a migration and breaks D15's stored names);
- moving `cat-13..cat-24` too (the card is scoped to the failing defaults; their own collisions, such as Ardósia / Malva at 0.9 under deutan, need a card of their own);
- patterns or textures in the circle (decoration on a 40 px icon that already carries a glyph).

## D23 — Stitch v3 lands only where it keeps the rules; the Economia year view is built from entries (2026-11-11, SOL-72, architect)

The owner's Stitch v3 round (14 screens) is built as six cards (`docs/specs/plans/SOL-72.md`). Every gap was verified against the code first (`docs/design/stitch-v3/README.md`). Anything that breaks a standing rule stays out, whatever Stitch draws:

- the Mês hero (SOL-69): no split bar, and the red-day alert stays in the hero;
- light only (D21), no bell (D21);
- no Soldi Pro (D2), no CDI yield, no AI callouts;
- no credit cards or fatura, no payment methods;
- no weekly or yearly series (D14), no recurring income (D16), no auto-posted entries (D8);
- no averages, paces, targets or forecast savings (D16);
- no third series scope (D20).

Outcomes:

- **Economia do ano is built.** This reverses D21's "the Economia year table stays unbuilt". `GET /api/reports/savings?year=` computes, per month from the opening month to today's, the month view's own `totals.income` and `savings.saved` / `rate_pct`, in one `GROUP BY` month query scoped by `user_id`. Nothing is stored. It renders on `/economia` under the cofrinhos, and the tab keeps the label `Cofrinhos`.
- **Posso comprar isso? gets entry points, not a page.** A sidebar button in `MENU` and a `Posso comprar?` button on Próximos meses open Lançar with Simular on. The verdict names the balance, and month chips show the lowest balance in whole units with the value before the draft.
- **Month chips show the lowest projected balance**, floored to whole units, never the month-end. The chip's color is the lowest day's tier.

Rejected:

- a separate simulator page (a second form with the same rules as Lançar);
- a yearly savings target and a "meta sugerida" (a stored goal plus a guess);
- month-end amounts on the chips (they contradict a red chip);
- per-category month totals on Ajustes › Categorias (Para onde vai already has them).

Detail: `docs/specs/2026-11-11-stitch-v3.md`.

Update (2026-11-11, owner, SOL-79): superseded by D24.

## D24 — Stitch is the design source of truth; fidelity by default; only explicit rules cut elements (2026-11-11, owner, SOL-79)

The owner rejected SOL-72's cuts. Many of them broke no rule; they were judged duplicate or YAGNI. From now on every element of the 14 Stitch v3 screens is built as drawn: layout, order, components, copy (verbatim from the HTML), states, sizes, and colors through tokens. Deleting what Stitch replaces is part of fidelity.

Only these rules cut an element:

- credit cards and fatura (a card bill is a plain conta fixa with its category);
- AI copy: Diagnóstico, Dica, Sugestões, Classificação automática;
- CDI yield;
- the Pro plan;
- recurring income;
- averages, estimates and "no ritmo atual" (D16);
- dark mode;
- the bell.

Where only a phrase breaks a rule, the element is built and the phrase adapted. Elements that need data the API lacks are listed with their smallest field or endpoint. Those that add stored data or reverse D14, D20 or D8 wait for the owner's yes, one card each.

Frame conflicts: a mobile frame governs < 1024 px and a desktop frame ≥ 1024 px. Within one breakpoint the majority of frames wins.

This reverses:

- **SOL-69 and the D21 update.** The Mês hero follows Stitch: `Saldo hoje em conta` with its tier pill, the `Projetado no fim do mês` box with its pill, and the split bar `Para onde foi a entrada deste mês` with its 4-item legend and `Total`. At < 1024 the mobile frame's indigo hero with Entradas / Saídas / Projetado stays.
- **D21 "no tier pill in the top bar".** The top bar shows today's tier pill next to `+ Lançar`. There is still no bell.
- **D23's cut list,** except where it names a rule above. D23's chip rule (lowest balance, never the month-end) stays.

Standing rules still bind: money as `Decimal`, `user_id` on every query, 44 px targets, 16 px form text, and D22 (color is never the only signal; it keeps the tier word on the month chips).

Detail: `docs/design/stitch-v3/FIDELITY.md`, `docs/specs/2026-11-11-stitch-fidelity.md`, plan `docs/specs/plans/SOL-79.md`.

## D25 — A card with no content does not render (2026-11-11, owner, SOL-79)

The owner, looking at `Contas a pagar` showing `Nenhuma conta fixa / Cadastrar conta fixa`: cards appear only when there is something to show.

- Every card defines its content, and without it renders nothing, title included. Examples:
  - Contas a pagar without bills;
  - the Cofrinhos glance without a cofrinho;
  - the Para onde vai glance without spending;
  - Lançamentos without entries;
  - Próximos meses without a forecast;
  - the Termômetro of an empty month;
  - the split without an entrada;
  - the red banner without a red day.
- The Mês hero always shows, since a balance exists from the opening date.
- Full screens whose page is where things are created keep a first-use empty state with the create action: Contas fixas, Cofrinhos, Categorias.
- Only the hero has a skeleton, so a card never flashes and then vanishes.
- An error is content: a failed card shows its retry.
- A filter that empties a card shows its empty line, since the card has content under another filter.
- Layouts flow: no pinned grid rows or columns. A hidden card leaves no hole at 375, 1024, 1280 or 1440.

A fresh account's Mês shows the hero alone.

This replaces the empty states of D21's dashboard cards.

## D26 — A group holds Diário and Saída subcategories; the kind lives on each category (2026-11-12, owner request, SOL-105 panel, architect arbitrated)

A subcategory's kind no longer has to match its parent's: `Veículo` (Saída) holds `Parcela` (Saída) and `Combustível` (Diário). Outflow and income never share a group, and `Economia` holds only Saída (cofrinhos). No migration: `kind` stays on every row and means the kind of that category's own entries; a group is just a top-level with subcategories. Each kind's view (Lançar picker, Ajustes tab) shows that kind's categories plus the parents that hold them, a parent of another kind as a header only. Para onde vai keeps grouping by parent and reports the parent's own kind. D15 extends: a group's color is unique in every kind it shows in; when it starts showing in a new kind and its color is taken there, it moves to the lowest token free in all of them, or keeps its color when none is (color is never the only signal, D22). Names stay unique per kind. Rejected: kind-neutral groups (nullable kind, a migration and a new color space), one color space for all outflow (old accounts hold 28 outflow top-levels, more than 24 tokens), per-parent names (a migration SOL-110's standard does not need). Detail: `docs/specs/2026-11-12-categories-and-cards.md` §1.

## D27 — A category changes kind on its own; its subcategories keep theirs (2026-11-12, SOL-101 under D26, architect)

`PATCH /api/categories/{id} {kind}` moves one category and its entries (series included) between Diário and Saída, top-level or subcategory; `kind-of-subcategory` is dropped, `kind-locked` stays for Economia, cofrinhos, Resgate and income. The name check and `category-has-bills` look at that category only. A top-level keeps its color when free in every kind it now shows in, else takes the lowest free one; a subcategory keeps its parent's and the parent applies D26. Carrying the family was right when groups had one kind; with mixed groups it would drag `Parcela` along with `Veículo`. Cost: a pure group the user wants wholly Saída takes one change per category. Detail: `docs/specs/2026-11-12-categories-and-cards.md` §2.

## D28 — Credit cards: a card is a conta fixa with a closing day; its spends hit the balance on the fatura's due date (2026-11-12, owner, SOL-106; reverses D24's card cut)

The owner reverses D24's cut of "credit cards and fatura". A card is a `recurring_bills` row with `closing_day` and no `amount`; it keeps name, due day, category (`Cartão › Porto`), archive, one payment a month, pay/unpay and D17. A Diário entry may carry `card_id`; a spend dated before the clamped closing day joins this month's cycle, on or after it the next, and the fatura is due on `due_day` after the closing. Finance rule: the running balance, tier, projection and forecast drop on the fatura's due date (the unpaid sum lands on `max(due, today)`, the payment on its date), never on the spend date, so Soldi matches the bank; Para onde vai counts the spend in its own category and leaves the payment out. Each view counts the spend or the payment, never both. The month view still runs one `GROUP BY date` query (`card_id` joins it). Series and parcelas on a card land each member in its own fatura. The sheet's card totals stay plain Saídas; no backfill. Trade-off: a payment above its itemized spends (fees, untyped spends) is right in the balance and absent from Para onde vai. Rejected: a separate `cards` table (duplicates the bill machinery), dropping the balance on the spend date (disagrees with the bank and double-drops on payment), a stored fatura row (breaks D8), cards on Saída entries (not asked). Detail: `docs/specs/2026-11-12-categories-and-cards.md` §4.

## D29 — New accounts start with the owner's grouped standard (2026-11-12, owner, SOL-110)

The seeds become the owner's organized tree: Casa, Veículo, Saúde, Educação and Família groups (Saúde, Educação and Família mixed, D26), Alimentação and Transporte daily groups, Lazer, Cartão (empty, for cards, D28), Assinaturas, a daily `Gasto` for unnamed spending, and the savings pair. Colors are fixed per top-level and unique across all outflow, so a new account never triggers D26's recolor; `cat-11` stays off outflow (D22). This replaces the market-analysis list and its "lowest free token per kind" rule for seeds. Existing accounts are not touched. Detail: `docs/specs/2026-11-12-categories-and-cards.md` §3.

## D30 — Partial payments and paid faturas (2026-11-12, owner, SOL-106 QA)

(a) A fatura paid below its total carries `max(0, fatura − paid)` into the same card's fatura of the next month, with no interest; an overpayment stays as D28 says (the balance drops by the payment, nothing is carried). (b) A paid fatura is frozen: changing the `amount`, `date` or `card_id` of a card spend whose fatura is paid, putting a spend into a paid cycle (create, card set, date move) or deleting a spend of a paid fatura is refused 422 `fatura-paid` ("Essa fatura já foi paga."); changing a card's `closing_day` is refused the same way while any fatura of that card from the current month on is paid. Trade-off: the carry is derived from payments and spends on every read (D8), never stored. Detail: `docs/specs/2026-11-12-categories-and-cards.md` §4 "Partial payments and paid faturas".

## D31 — Year views count spending by purchase date; Gastos leave out savings and fatura payments (2026-11-12, SOL-103 panel, architect arbitrated)

`Gastos` = Saída entries except deposits into Economia and fatura payments, plus every Diário entry (card spends on their own date). Year insights (`GET /api/reports/year`, Meu ano) use it. A card purchase belongs to the month and year it was made: paying the fatura is moving money, and a deposit is saving. Totals keep the month view's `Totals` shape, so `splitOf` reads a year the same way it reads a month: Economia deposits inside `bills`, `saved` = deposited − withdrawn. The year runs in whole months, from the opening month or January to today's month or December, the same cut as Economia do ano (D23). Entries in later months never count, and there are no averages (D16).

Trade-offs:

- With cards or deposits, a month's `Gastos` differs from Mês `Saídas`. Mês counts the fatura payment and the deposits, as the balance does (D28). The screen says `Gastos`, never `Saídas`.
- A fatura paid above its itemized spends is left out (the D28 trade-off).

Rejected:

- counting fatura payments (they pull last December's purchases into the year, leave this December's out, and carry D30's carries);
- counting both spends and payments (double count);
- cutting the year at today (it would disagree with Economia do ano).

Detail: `docs/specs/cards/SOL-103.md`.

## D32 — A series repeats monthly, weekly or yearly; the step lives on every member (2026-11-12, SOL-93 panel, architect arbitrated; reverses D14's monthly-only)

Stitch draws `Mensal` / `Semanal` / `Anual` (FIDELITY 9.8). `repeat_every: "month" | "week" | "year"` on create (absent = month) and when a standalone entry starts a series; a running series never changes its step. Every member carries `transactions.series_every`, null outside a series, tied to `series_id` by a CHECK. D19 and D20 apply per step: weekly members sit 7 days apart, grow 7 days after the last and move to a new weekday inside each one's ISO week; yearly members sit on the original's day each year (29 Feb clamps to 28 Feb and returns in leap years), grow on the last member's month and move like monthly. `repeat_months` keeps its name and counts entries of any step (2..60, 2100 cap). Parcelas stay monthly. Rejected: a series table (D14), inferring the step from dates (wrong after a gap or a `Só este` move), weekly or yearly parcelas. Detail: `docs/specs/cards/SOL-93.md`.

## D33 — `Toda a série` reaches every member from any member, after a confirmation (2026-11-12, SOL-93 panel; reverses D20's "members before it never change" and D14's rejected third scope)

`?scope=all` on PATCH and DELETE rewrites or deletes every member, past ones included; from a middle member the web asks first, naming how many earlier entries change. Frozen rows still refuse the whole call: a member in a paid fatura (D30b, when amount, date or card changes, and on delete) and a member in a deleted cofrinho (SOL-102). Bill payments and resgates are never members (R3, R8). A date change under `all` moves every member per D32's step and refuses when the earliest would land before the opening date. Member 1 keeps sending `following`, which already reaches the whole series. Trade-off: reconciled months can change, guarded by the dialog and the frozen-row refusals, not by a lock. Detail: `docs/specs/cards/SOL-93.md`.

## D34 — Simulation history lives in the browser only (2026-11-12, SOL-95 panel; a note to D16)

D16's "a simulation is never stored" holds for the server: no table, no endpoint. `/posso-comprar` keeps the last 10 simulation inputs in `localStorage` under `soldi:simulations:{userId}`, never a verdict (it goes stale when entries change; a row re-runs against today's forecast). Sign-out, sign-out-everywhere and account deletion remove every such key. Trade-off: the history does not follow the user to another browser. Detail: `docs/specs/cards/SOL-95.md`.

## D35 — Stopping or finishing something ends it at a month; past months never change (2026-11-12, owner + SOL-118 panel, architect arbitrated)

Owner rule (binding): stopping a conta fixa, a Fixo series or a subscription removes its amount from the **following** months only. Every past month, every paid entry and Para onde vai's history stay visible and unchanged. Reaching the last parcela behaves the same way.

Model:

- A bill gains `recurring_bills.last_month`: the first day of the last month it owes; null means no end.
- A bill gains `installments` (2..60), which makes it parcelado. Month `m` holds parcela `installments − months(m → last_month)`; it is computed, never stored per month.
- `recurring_bills.active` is dropped. `Bill.active` is derived and false once **Parar** ends a non-parcelado bill.
- **Parar** sets `last_month` to this month, or to a later month already paid. **Retomar** clears it, and moves `active_since` to today only when the end was before this month (D17).
- A parcelado bill (Fies) is created with its `installments` and `last_month`. The form's `Já pagas` computes `last_month`. Nothing is written at the last parcela.
- `months::domain::owed` gains one gate, `month ≤ last_month` and parcela ≥ 1. Month view, Contas a pagar, the D17 carry and the forecast all share it.
- Paying a month after `last_month` is refused 422 `bill-ended`. Earlier months stay payable, so a carried month can still be paid after Parar.
- The migration ends each paused bill at its last paid month, or before it started owing.

This reverses:

- `active = false` hiding a bill from every month, past ones included. SOL-4 rule 10 and its `rule_10_…` test no longer hold.
- SOL-55's "a paused bill is out of the month and the projection" for months before the stop.
- The SOL-118 brief's "Parar = the `Ativa` switch as is" and "auto `active = false` at the last parcela". The switch stays; what it writes changes.

Unchanged: Excluir (archive) still removes a bill from every month, because deleting is not stopping. A card has no end and no pause (D28).

Trade-offs:

- An unpaid month between two paid ones of a once-paused bill reappears as `Venceu em …` (D17 was hiding nothing; the pause was).
- Ending a parcelado bill early means editing its parcelas, not tapping Parar.

Rejected:

- a `paid_before` seed counted from `active_since` (it restarts on resume);
- keeping `active` beside `last_month` (two truths for one fact);
- a per-month skip (D17 rejected it).

Detail: `docs/specs/cards/SOL-118.md` › Technical design.

## D36 — An open-ended Fixo is a series that grows as months are read (2026-11-12, SOL-118 panel, architect arbitrated; reverses D24's "recurring income" cut and narrows D14's "open-ended repeat is a conta fixa")

`open_ended` on an Entrada or Diário entry (not on a card yet, SOL-119) starts an ordinary D14 series. Every member carries `transactions.series_open`.

Growth:

- Before the month view, the forecast and the ledger list read rows, the server appends copies of each open series' last member through `max(horizon_end(today), the viewed month)`.
- It uses D19's growth under the series lock, capped at 60 months from today and at 2100.
- It usually costs one indexed query and no write; concurrent reads write once.
- A salary therefore counts in every month of Mês and Próximos meses without typing, as committed rows (D16), never as a guess.

Editing and stopping:

- Edits use this/following/all as any series does.
- **Parar série** at a member deletes only the later members and closes the series, per D35's rule. Deleting `following` closes it too.
- **Tornar fixo** opens a bounded series or a standalone entry. Growth starts after the last member, by period (D19), so converting the owner's 12x salary never doubles a month.
- `transactions.series_offset` lets a parcelado purchase start at parcela k (`first_installment`): earlier parcelas are never written, and the chip reads k/N from the first save.

A Saída with no end is still a conta fixa (D8, D14). D8's "no rows ahead" for bills is untouched.

Trade-offs:

- Three GETs may write, bounded and idempotent.
- Rows exist up to 60 months ahead.
- Deleting only the very last member of an open series is refilled on the next read.

Rejected:

- (a) a general recurring rule for income and card spends, projected and confirmed monthly. An unconfirmed salary would land "today" under D17, or need a tap each month. Faturas, Para onde vai, Meu ano and Economia do ano would each need a projection branch. It also breaks D14's "income is never a bill".
- A scheduled job, because the binary has no scheduler.
- A stored infinite flag with no rows, which breaks every report that reads rows.

Detail: `docs/specs/cards/SOL-118.md` › Technical design, plan `docs/specs/plans/SOL-118.md`.
