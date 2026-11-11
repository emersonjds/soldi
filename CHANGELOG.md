# Changelog

All notable changes to Soldi are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0.0 the HTTP API may change between minor
versions. This file covers the server and the web app together.

## [Unreleased]

## 0.40.0

> Headline: Editar série looks like Stitch

### Web

- The series sheet is titled Editar Lançamento Recorrente, with a `∞ Parte de uma série de {n} meses` chip and a line naming the member being edited.
- Escopo da Alteração comes first, as radio cards with a line each that counts the remaining members; Este e os próximos is marked Recomendado. The delete dialog uses its own lines.
- Valor por parcela, Duração da série (3, 6, 12 meses or Customizado, with Ciclo Atual) and Dia de vencimento follow Stitch's copy; shortening an outflow series shows the projected saving.
- The footer offers Excluir da Série..., which opens the delete dialog, Cancelar and Salvar Alterações na Série. A resize ends with `Série ajustada com sucesso para {n} meses futuros.`

## 0.39.1

> Headline: the end-to-end suite is green again

### Web

- A month's lowest balance in Próximos meses sizes itself from its cell's width, so a negative low such as -2.213 no longer spills out of the chip at 375 px or in the 1280 px rail (SOL-97).
- The Next.js dev indicator is hidden in development, where it covered the Mês tab at 375 px.
- The end-to-end flows expect the signed ledger amounts (`- R$`) and run the round-check bill flow at 1440 px, where the day chips live.

### Server

- The committed OpenAPI snapshot carries the release version again; the release step now refreshes it.

## 0.39.0

> Headline: Lançar as in the Stitch design

### Web

- Lançar has the Stitch header (Novo Registro on mobile, Novo Lançamento on desktop), the Entrada / Conta / Diário segment with icons, and the amount labelled "Valor do gasto" or "Valor da entrada" with lighter cents. A long amount steps its size down instead of scrolling sideways (SOL-84).
- On a touch screen under 1024 px, an amount keypad is docked above Salvar Lançamento. It enters amounts like a calculator: digits are reais, the comma starts the cents.
- The category row holds up to eight circles and scrolls with snap. A parent with subcategories shows "Sub:" pills, and the entry saves the child. "Nova categoria" moved into "Ver todas".
- The date reads "Hoje (11 nov)" on desktop, then Ontem and Outra data. The note row has a clear button.
- Repetir and Parcelar use the Stitch wording, and Parcelar says when the last installment absorbs the residual cents. "Criar como Conta Fixa" turns the entry into a fixed bill.
- The desktop dialog is 560 px wide, with Cancelar and Salvar Lançamento in the footer. Enter saves from any field except the note.

## 0.38.0

> Headline: Lançamentos, Próximos meses and the glances as in the Stitch design

### Web

- Lançamentos has the Stitch title row, with Todos / Diário / Contas and "Ver o mês inteiro". Each day gets a muted band with "Saldo ao final" (or "Projeção" on future days) and its tier. Amounts are signed (+ in, - out), and each series shows a pill such as "↻ Saída · 3/12" (SOL-83).
- Próximos meses is always a 4-column grid of twelve months. Each month shows its lowest balance and its tier word, so color is never the only signal. The horizon toggle is gone.
- The Cofrinhos glance shows the total saved and the two largest goals, each with its share, bar and target. Para Onde Vai shows each group's share with one decimal, taken from the report.
- Red words on the soft red fill use a darker text color to reach 4.5:1.

## 0.37.0

> Headline: Contas a pagar as in the Stitch design

### Web

- Contas a pagar has a Pagar pill on every open bill that pays at once, the same as the round check, with the same undo (SOL-82).
- A paid bill shows a Pago badge, its name struck through and whether it was paid on time or late. An overdue bill shows a red ! in the check slot, "Atrasada desde {day}" and a Vencido badge.
- The header shows "{n} de {total} pagas" and "Próxima: dia {dd} · {amount}", with the day chips on the right. The Todas / Pendentes / Pagas filter and the open total are gone.
- On mobile the card is Contas do Mês with "{n} obrigações cadastradas". Each row has a status pill: Pagar pays, ✓ Pago undoes, Vencido pays.

## 0.36.0

> Headline: Mês as in the Stitch design

### Web

- Mês hero as in Stitch: today's balance with its tier, the "Projetado no fim do mês" box and the split bar "Para onde foi a entrada deste mês" with its legend and total; on mobile, the indigo hero with the greeting and the month switcher (SOL-81, D24).
- The red-day banner spans the page and names the day's two largest outflows.
- Termômetro do Mês shows the spent share, the Entradas / Saídas / Resultado box and "Você está aqui".
- A card with nothing to show does not render, and the cards flow in two stacks with no holes (D25).

## 0.35.0

> Headline: the shell as in the Stitch design

### Web

- Desktop top bar: month switcher on the left, today's balance tier, Lançar and the avatar; mobile app bar with the page name and avatar; a full-width tab bar with a raised "+" and Economia (SOL-80, D24).
- The viewed month travels with every navigation link, and the month switcher shows only where the month matters.
- Pages open with their own title band.

## 0.34.0

> Headline: Contas fixas at a glance

### Web

- Contas fixas shows the total of active bills, how much of this month's income they take, and the next bill due (SOL-78).
- Each bill has an Ativa switch. A pause waits until its toast closes, so Desfazer keeps the bill's overdue months owed; a resume goes out at once.

### Fixed

- Saving a conta fixa from its sheet only sends "active" when it changed, so an edit can no longer resume a paused bill by accident.

## 0.33.0

> Headline: Economia do ano

### Added

- `GET /api/reports/savings?year=YYYY`: the year's income, savings and rate month by month, from the opening month to today's, computed from the entries in one grouped query (D23).

### Web

- Cofrinhos shows "Economia do ano": the year's total and share of income, and each month with a colored band (with its word for screen readers) that opens the month on Mês (SOL-77).

## 0.32.0

> Headline: save and withdraw right from each cofrinho

### Web

- Each cofrinho card has Guardar and Resgatar (Guardar primeiro valor while it is empty); a tap anywhere else on the card still opens it, and the actions wait for the categories to load (SOL-76).
- "Seus cofrinhos" counts the active ones, and the Criar cofrinho invitation stays visible while only Sem objetivo holds money.
- The Mês Cofrinhos card shows each goal's progress bar and keeps long names whole.

## 0.31.0

> Headline: Para onde vai by group

### Web

- Para onde vai lists top-level groups that fold open to their subcategories, with a "(sem subcategoria)" row for the parent's own entries; the donut is by group (SOL-75).
- Picking a group lists its own and its subcategories' entries with the count and total, and "Adicionar lançamento em {nome}" opens Lançar on that category, dated inside the viewed month.
- Top 5 shows amounts, and a group's share rounds the same way on Mês and Para onde vai.

## 0.30.0

> Headline: faster category picking and a Lançamentos filter

### Web

- Lançar and the bill sheet pick the category from a row of this month's five most used ones, with "Ver todas" for the full list and "Nova" to create one (SOL-74).
- Lançamentos on Mês filters by Todos, Diário or Contas; Contas leaves out money put in a cofrinho, and the filter resets on every month change.
- Editing a series explains what each scope reaches, and a shrink says where the series ends.

### Fixed

- Editing a conta fixa whose category was archived keeps that category instead of swapping in another one; the server only checks the category when it changes.

## 0.29.0

> Headline: the months ahead in reais, and Posso comprar isso? one tap away

### Web

- Próximos meses shows each month's lowest balance in reais, and Simular names the red day's balance and what each month had before the purchase (SOL-73).
- "Posso comprar isso?" opens from the sidebar and from Próximos meses, straight into Simular.
- Thermometer labels wrap instead of running into each other in narrow cards; long month lows stay inside their chip.

### Fixed

- Pressing Enter while Simular is on no longer saves a real entry, and "Transformar em conta fixa" is hidden while simulating (D16).
- CI runs every end-to-end flow: 21 tests in 14 specs were silently skipped because they looked for the server on the wrong port; a missing server now fails CI.

## 0.28.0

> Headline: category colors readable with color blindness

### Changed

- Ten of the twelve main category colors are re-stepped in the same hue families so every circle reaches 3:1 on white and the pairs that looked identical under protan, deutan or tritan vision now differ (SOL-9, D22). Category names stay the same; nothing moves in the database.

## 0.27.1

> Headline: fixes

### Fixed

- The Mês summary (Entradas, Saídas, Projetado) no longer cuts its amounts on desktop: it keeps one compact layout at every width (SOL-70).
- Deleting a period takes the series locks first, so it can no longer deadlock with a concurrent edit of a series it cuts (SOL-67).

## 0.27.0

> Headline: Para onde vai and Cofrinhos on the new cards, closing the redesign

### Web

- Para onde vai shows the donut and legend in a "Por categoria" card and the Top 5 beside it on desktop, with the total in the figure size and an illustrated empty state (SOL-66).
- Cofrinhos opens with the Guardado total in the hero size and shows each cofrinho as a card, two per row on desktop, with an illustrated empty state.

## 0.26.0

> Headline: mobile polish, and the Saldo hoje hero is back

### Web

- Mobile tab bar floats as a pill (Mês, Para onde vai, Cofrinhos, Ajustes) with the selected tab in a dark pill and a separate round Lançar button; no screen's last row ever sits under it (SOL-65).
- Lançar, Pagar and the bill sheet keep Salvar pinned at the bottom while the rows scroll, and a focused field never hides behind it; Arquivar stays in the rows.
- Every date is picked on a pt-BR calendar showing dd/mm/aaaa; Lançar starts at the opening date, and the opening date cannot be in the future.
- Toasts sit above the tab bar up to desktop width, and the app draws under the iOS safe areas.
- Mês shows the previous Saldo hoje hero again, with the Entradas, Saídas and Projetado summary; the split bar is gone (SOL-69).

## 0.25.0

> Headline: bills at a glance and a shorter ledger

### Web

- Contas a pagar shows the next bill, the open total and "N de M pagas", day chips with a dot per unpaid bill (tap again to clear), a round check to pay or unpay with the undo toast, and a text status badge (SOL-64).
- Lançamentos shows the next 3 scheduled days, today and the 6 days before; "Ver o mês inteiro (N dias)" expands it in place, and the red-day jump expands it before scrolling.
- Empty-state illustrations are faded so their sample figures never read as real data.

## 0.24.0

> Headline: Mês is a dashboard

### Fixed

- A month's saving starts at the opening date when the opening falls inside the month, so it can never exceed the month's bills.

### Web

- Mês is a grid of cards (1, 2 or 3 columns): the hero shows today's balance and the projected end of month with smaller cents, and the split bar "Para onde foi a entrada" divides the income into Contas, Guardado (gross deposits), Diário and Livre, with the base total under the title (SOL-63, D21).
- New Para onde vai and Cofrinhos glance cards; each card loads and fails on its own and keeps its data when a background refresh fails.
- Loading is announced once per page.

## 0.23.0

> Headline: a desktop shell, the first step of the dashboard redesign

### Web

- Desktop sidebar in two groups, Menu (Mês, Para onde vai, Cofrinhos) and Configurações (Contas Fixas, Ajustes); Lançar moves to a sticky top bar with the page title and the month switcher on month pages (D21, SOL-62, SOL-68).
- Mobile opens with an "Olá, {nome}" card and a month switcher card; the shell owns the month through `?m=`.
- New primitives for the next cards: `Money` sizes with smaller cents, `DashCard`, `SplitBar` and the `--split-daily` token.

## 0.22.0

> Headline: move the day of a whole series

### Added

- `PATCH /api/transactions/{id}?scope=following` with a new date in the same month moves this member and every later one to the new day, each clamped to its own month (D20). A month change with `following`, or a move through a month that holds two members, answers 422 on `date`.

### Changed

- Growing a series takes the last member's day, so a resize after a move lands on the new day (D19, D20).
- Every write to a series member, including a single delete, takes the series lock before any row lock and re-reads the member, so concurrent edits cannot deadlock or write a stale date.

### Web

- Editing a series member with `Este e os próximos` names the new day under the date (`Os próximos também vão para o dia 10.`), blocks a month change (`Para mudar o mês, use Só este.`) and confirms with `Série movida para o dia 10`.

## 0.21.0

> Headline: a series can change its length

### Added

- `PATCH /api/transactions/{id}` with `repeat_months` on a series member resizes the series: new members continue after the last member's month on the first member's day, copying the edited member; shrinking removes the last members, never one ranked before the edited one. Installment series are not re-split (D19).
- `TransactionSeries.last_date`, the date of the series' last member.

### Fixed

- No series write can date an entry past 2100: `repeat_months`, `installments` and a resize answer 422 on `date` instead (SOL-60).
- Resizes and `Este e os próximos` deletes of one series run under a series lock, so concurrent edits cannot double or skip a month.

### Web

- Editing a series member shows `Meses na série` with `2x 3x 6x 12x Outro`, a helper that names the rows added or removed, and the toast `Série ajustada para N meses`.

## 0.20.0

> Headline: no spreadsheet importer

### Removed

- The `Termômetro.xlsx` importer: `POST /api/imports/xlsx` and `POST /api/imports/xlsx/confirm`, the Ajustes › Importar planilha screen and the `calamine` dependency. Every spreadsheet has its own layout, so one parser could not serve other users (D18).
- Migration `0019` drops the `import_previews` table and the `import_batch_id`/`import_year` columns. Entries imported earlier stay as ordinary entries.

## 0.19.0

> Headline: one address, and screens that read clearly

### Added

- Requests to `www.` hosts get a permanent redirect to the bare domain, keeping the path and query.

### Changed

- A race test pins the parent lock when an existing category moves under a parent that is being recolored.

### Web

- Income amounts use an AA green on white; the brand green stays on fills.
- Opening a sheet clears the toasts, so none can cover it.
- Cofrinhos say `Excluir`, the same as categories.

## 0.18.0

> Headline: twelve months ahead, and "can I buy this?" before buying

### Added

- `GET /api/forecast`: twelve months of projected days (`today`, `days[]` with `projected_balance` and `projected_tier`), from four queries whatever the horizon, built by the same engine as the month views.
- `CreateTransaction.installments` (2 to 60): `amount` is the total; the server splits it truncated to cents with the remainder on the last parcela and writes one series in one transaction. Refused with 422 when combined with `repeat_months` or when a parcela would be zero.

### Changed

- Unpaid contas fixas of earlier months weigh on today's forecast and are listed first in the current month; future months open lower by every earlier unpaid month. A month is owed only when its due date is on or after the opening date and the bill's `active_since` (registration or resume day; migration `0018`), so a paused and resumed bill does not owe its paused months. Decision D17.
- Months and entry dates are bounded to the years 2000 to 2100 (422).
- A `following` edit of a series changes the members' amounts only when the amount changed.

### Web

- Mês: a `Próximos meses` card with a 6/12 toggle; one chip per month with its worst tier and red-day count, tap opens the month. A carried bill reads `Aluguel de outubro` and is paid inside its own month.
- Lançar: `Simular` previews the next days (and months for parcelas) without writing, naming the first day the purchase turns red; `Parcelar` writes the total in N parcelas.
- Contrast: the `Pago` pill and the category change in Para onde vai read at WCAG AA.

## 0.17.0

> Headline: see the red day before it comes

### Changed

- `GET /api/months/{month}`: each `Day` has `projected_balance` and `projected_tier`; each `BillOfMonth` has `lands_on`, the day an unpaid conta fixa weighs on the forecast (its due day, or today once past due; none when paid or due before the opening date). Past days are unchanged. Decision D16.

### Web

- Mês: every day shows its balance with the thermometer tier, future days as `Previsto · <tier>`; an unpaid conta fixa appears on the day it lands (`Conta fixa · a pagar` / `venceu dia DD/MM`).
- The hero warns `Dia 23 fica no vermelho: -R$ 675,00` and `Pior dia: 28/11, -R$ 2.916,00 · recupera em 30/11`; a tap jumps to that day, focuses it and rings it for 2 s, with `Motivo da queda` on the outflow that caused the drop.

## 0.16.0

> Headline: your account, your password, your data

### Added

- `PATCH /api/me` (name), `POST /api/me/password` (current + new; other sessions end, applied only from the checked hash) and `POST /api/auth/sign-out-everywhere`.
- Password reset by e-mail: `POST /api/auth/password-reset` always answers 202 and, for a real account, mails through Resend a single-use link valid for 1 hour; `POST /api/auth/password-reset/confirm` sets the password, ends every session and voids every other link. Only the SHA-256 of a link is stored (`password_resets`, migration `0017`). The server refuses to start without `RESEND_API_KEY` outside localhost.
- `DELETE /api/me` with the password deletes the account and all its data in one statement.
- Request limits, answered with 429 and `Retry-After` before any database or password work: sign-in 20 per 15 min per IP, 10 per 15 min per e-mail and IP, 50 per 15 min per e-mail; sign-up 10 per hour per IP; password change and account deletion 10 per 15 min per user; reset request 10 per hour per IP and 3 per hour per e-mail; reset confirm 20 per hour per IP.

### Web

- `Ajustes › Minha conta` (also from the name in the sidebar and the avatar on the phone): rename, change the password, sign out of every device, delete the account after the password and `EXCLUIR`.
- `Entrar › Esqueci minha senha` asks for the e-mail; the link opens `Nova senha`, with the token kept out of the address bar.
- README links to [getsoldi.app](https://getsoldi.app).

## 0.15.0

> Headline: the logo takes you to today

### Web

- The `Soldi` logo, in the sidebar and in the top bar, opens `Mês` on the current month (`Saldo hoje`) from any screen or month.

## 0.14.0

> Headline: categories with their own colors, visible actions and a guided create flow

### Changed

- Category colors: the palette grows from 12 to 24 tokens (`cat-13..cat-24`). Active top-level categories never share a color within a kind; a subcategory, cofrinhos included, always wears its parent's color, and changing the parent's color changes its children's. `POST`/`PATCH /api/categories` answer 422 `color-taken` for a color another top-level of the kind holds and `palette-full` when none is free; a `color` sent for a subcategory is validated, then ignored. The importer gives a new `Importado (...)` category a free color.
- Migration `0016_unique_category_colors` recolors repeated top-level colors per kind (the palette's named owners keep theirs) and aligns every subcategory with its parent. It cannot be undone.
- New accounts seed one color per category within a kind (`Economia` is now `cat-13`, `Resgate` `cat-2`).

### Web

- Clicking anywhere on a date field opens the calendar, including the `Outra data` chip in Lançar.
- `Ajustes › Categorias`: every row, subcategories and `Importado (...)` included, has a `⋮` menu with `Editar`, `Nova subcategoria em …` / `Novo cofrinho em …` and `Excluir` (not on `Economia`). `Excluir` acts at once with `Desfazer` and says the entries keep the category. The sheet's `Arquivar` is now `Excluir`.
- The `+` asks `Categoria` or `Subcategoria` first, then lets you search and pick the parent by icon and name; the create form shows `Em {Pai}` with `Trocar` instead of a dropdown. Taken colors show disabled with `usada por …`; a subcategory shows `Usa a cor de …`.

## 0.13.0

> Headline: delete the entries of a month, a year or all

### Added

- `GET /api/transactions/count?period=YYYY-MM|YYYY|all` answers `{ count }` and `DELETE /api/transactions?period=…` answers `{ deleted }`, both for the caller's rows only. Years run from 2000 to 2100; anything else is 400. Bill payments, cofrinho deposits and resgates are entries and go with the period; categories, cofrinhos, contas fixas and settings stay.

### Web

- `Ajustes › Dados › Apagar lançamentos` (`Mês, ano ou tudo`): choose `Mês`, `Ano` or `Tudo`, see `Serão apagados 37 lançamentos de novembro de 2026` live, then confirm by typing `APAGAR`. The dialog warns `Isso não pode ser desfeito. O saldo dos meses seguintes muda.` and stays open while deleting; the toast reads `37 lançamentos apagados` and the preview falls to `Nada para apagar neste período`.

## 0.12.1

> Headline: scheduled entries show up in Lançamentos

### Fixed

- `Lançamentos` on `Mês` lists the month's future days too, headed `Agendado · 20 nov` and without a balance pill, so an entry dated later in the month can be edited or deleted. Before, such an entry counted in `Entradas` and `Projetado` but was nowhere on screen, and the empty state still read `Nenhum lançamento ainda`.

## 0.12.0

> Headline: repeat an entry over the next months

### Added

- `POST /api/transactions` takes `repeat_months` (2 to 60): the entry and its copies, one per following month on the same day (clamped to shorter months, always from the original day), are written in one transaction and share a `series_id`. `Transaction.series` carries `{ id, position, total }`. 422 `already-repeated` on a series member, `repeat-not-allowed-on-bill-payment` and `repeat-not-allowed-on-cofrinho-withdrawal` where repeating makes no sense.
- `PATCH` and `DELETE /api/transactions/{id}` take `?scope=this|following` (default `this`); `following` reaches the members of the same series from this date on. Amount, category and note propagate; the date never does. `PATCH` with `repeat_months` turns a standalone entry into a series.
- `POST /api/bills?transaction_id={id}` creates the recurring bill and links that standalone Saída as its payment this month, in one transaction; 422 `cannot-become-bill` otherwise.

### Web

- `Lançar` gains `Repetir`: chips `2x 3x 6x 12x Outro`, helper `12× R$ 150,00 · até out 2027`, caption `Em meses mais curtos, cai no último dia.` from day 29, toast `12 lançamentos criados`. Hidden for bill payments (`Já é uma conta fixa recorrente.`) and resgates.
- Editing a series member shows `Parte de uma série de 12` and the scope `Só este` / `Este e os próximos` (`Toda a série` from the first member); the ledger's `Excluir` offers the same scope, with no `Desfazer` for a series.
- Ledger rows of a series carry a repeat icon and `Saída · 3/12`, read as `3 de 12` by screen readers.
- `Prefere uma conta fixa, sem data pra acabar? Transformar em conta fixa` under `Repetir` for a Saída opens the bill sheet prefilled; saving creates the bill and links the entry.
- Biome now forbids imports between features (`src/features/**` cannot import `@/features/*`).

### Upgrade notes

- Migration `0015_transaction_series` adds the nullable `transactions.series_id` and a partial index; it runs on start-up, no manual step.

## 0.11.0

> Headline: welcome tour

### Added

- `User` carries `tour_seen`, false until `POST /api/me/tour-seen` (204, idempotent; the first time is kept) runs.

### Web

- Right after onboarding a four-card tour explains `Entradas`, `Saídas e Diário`, `Projeção do fim do mês` and `Economia`, each with an example built from the app's own pieces (the Entradas figure, ledger rows, the thermometer with `Atenção` on `Projetado`, a cofrinho at 30%). Full screen on phones, a 560px card on desktop; progress dots, `Próximo`, `Pular`, `Começar` on the last card; arrows move and Esc skips.
- `Começar` and `Pular` mark the tour as seen and open `Mês` with `Lançar` on Entrada and the hint `Comece pela sua primeira entrada do mês`, once. An account that has not seen the tour (existing ones included) gets it on its next visit.
- `Ajustes › Ajuda › Como funciona` replays the tour; `Começar` then just goes back to `Mês`.

### Upgrade notes

- Migration `0014_tour` adds the nullable `users.tour_seen_at`; every existing user starts with `tour_seen: false` and sees the tour once. It runs on start-up with the others; no manual step.

## 0.10.1

> Headline: resgates no longer count as income

### Fixed

- `MonthView.totals.income` and `days[].income` leave resgates out, so `performance`, `savings.rate_pct` (`saved / income`) and the thermometer's share of income no longer inflate when money comes back from a cofrinho. `totals.withdrawn` and `days[].withdrawn` hold the resgates; the balance still adds them and `totals.saved` stays deposits minus `withdrawn`.
- `GET /api/reports/categories` leaves resgates out of the `income` section, so `income_total` matches `totals.income`.

## 0.10.0

> Headline: cofrinhos

### Added

- Every user has `Economia` (bill) and `Resgate` (income), both icon `piggy-bank`, color `cat-11`, `is_savings: true`; seeded at sign-up and backfilled for existing accounts. They cannot be archived nor become subcategories (422 `savings-category`), and nothing goes under `Resgate`.
- A cofrinho is a subcategory of `Economia`. `Category` carries `is_savings`, `target` and `deadline`; `POST`/`PATCH /api/categories` take `target` (money above zero) and `deadline` only for a cofrinho (422 `not-a-cofrinho` elsewhere); moving a category out of `Economia` clears both. A cofrinho holding money cannot be archived (422 `cofrinho-not-empty`).
- `GET /api/categories` leaves `Resgate` out unless `?include_system=true`.
- `GET /api/cofrinhos`: `total_saved`, `saved_this_month` and the cofrinhos with `balance` (entries minus resgates since the opening date), `progress_pct`, `done`, `monthly_suggestion` (what is left over the months to the deadline, this one included, half-even) and `parent`; done ones last, then by name; `Economia` itself as `Sem objetivo` while it holds money.
- `POST /api/cofrinhos/{category_id}/withdraw` `{ date, amount, note? }` writes a resgate: a 201 income entry in `Resgate` with `cofrinho_id` (422 `insufficient-cofrinho` above the balance, `before-opening-date`, `not-a-cofrinho`; 404 for another user's).
- `GET /api/cofrinhos/{category_id}/movements?limit=50` lists a cofrinho's entries and resgates, newest first (`limit` 1 to 200).
- `Transaction` carries `cofrinho_id`.
- Web: the `Economia` tab is now `Cofrinhos`: the saved total with this month's share, a card per cofrinho (balance against the goal, a progress bar in its color, what is left and per month until the deadline, `Meta batida` once done) and `Sem objetivo` for money kept straight in `Economia`. `Novo cofrinho` takes a name (with suggestions), an optional goal and deadline, icon and color.
- Web: a cofrinho's sheet saves into it (`Guardar` opens `Lançar` as a Saída in it), takes money back (`Resgatar`, refused above the balance), lists its movements and edits or archives it (`Resgate tudo antes de arquivar` while it holds money).

### Changed

- Web: on `Mês`, entries under `Economia` read `Economia › name` with `Guardado` and resgates `Resgate › name` with `Resgatado`; the thermometer adds `Guardou … este mês.`; `Lançar` never offers `Resgate`. `Ajustes › Categorias` marks `Economia` and its `+` creates a cofrinho.

- `MonthView.savings` is `{ saved, rate_pct }` and `totals.saved` is added: the month's bills under `Economia` minus its resgates; `rate_pct` is `saved / income` with one decimal, null without income. Those bills stay in `bills` and `outflow`.

### Removed

- `GET /api/savings`, `PUT /api/savings/{year}/{month}`, `Settings.savings_goal_pct` (now an unknown field, 422) and the imports' `savings_months`: the workbook import no longer reads the `Economia` sheet.
- Web: the yearly savings table, its goal and the import preview's months of savings.

### Upgrade notes

- Migration `0013_cofrinhos` adds `categories.is_savings`, `target`, `deadline` and `transactions.cofrinho_id`, backfills `Economia` and `Resgate` for every user (an active category already named so becomes it, moved to the top level), **drops the `savings` table** and `settings.savings_goal_pct`. The monthly savings typed or imported before are deleted; export them first if they matter. It runs on start-up with the others; no manual step.

## 0.9.0

> Headline: pick your currency

### Added

- `Settings` carries `currency`, one of `BRL`, `USD`, `GBP` or `EUR`; `BRL` for every account until changed.
- `POST /api/onboarding` takes an optional `currency` (`BRL` when absent) and `PATCH /api/settings` changes it. Any other code, lowercase included, answers 422 on `currency`.

### Web

- Onboarding opens with `Qual moeda você usa?`: four cards (Real BRL, Dólar USD, Libra GBP, Euro EUR), Real preselected; four progress dots, `Voltar` from the balance keeps the choice, and the onboarding sends `currency`.
- Every amount, the `Lançar`/`Pagar` hero prefix and the onboarding summary show the user's currency in pt-BR (`R$ 1.234,56`, `US$ 1.234,56`, `£ 1.234,56`, `€ 1.234,56`); pasting `US$`, `£` or `€` amounts reads them.
- `Ajustes › Moeda` changes the currency with the same cards (`Moeda salva`).

### Upgrade notes

- Migration `0012_currency` adds `settings.currency CHAR(3) NOT NULL DEFAULT 'BRL'` with a check limiting it to the four codes; existing users get `BRL`. It runs on start-up with the others; no manual step.

## 0.8.0

> Headline: manage categories and subcategories

### Web
- `Ajustes › Categorias` replaces the placeholder: `Entrada / Saída / Diário` (kept in `?k=`, Diário by default), one card per kind with each category and its subcategories indented under it. `+` in the header creates a category of the open kind; `+` on a category creates a subcategory in it.
- A row opens `Editar categoria`: name, parent (never itself or another subcategory; hidden for a category that has subcategories), icon and color, saved at once on the list and rolled back if the server refuses. `Arquivar` hides the category and its subcategories behind `Desfazer` for 5 s before archiving; the toast counts the subcategories that go with it.
- A new subcategory starts with its parent's icon and color.
- `Ajustes` links `Categorias` without the "em breve" caption.

### Fixed
- The `Subcategoria de` field rendered empty in browsers (a select nested in another); it now shows and changes the parent.

## 0.7.0

> Headline: subcategories

### Added

- Subcategories, one level deep: `POST /api/categories` takes `parent_id`, one of the caller's active top-level categories of the same kind, and `PATCH /api/categories/{id}` moves a category under one (`"parent_id": null` makes it top-level again). Another user's, a missing or an archived parent answers 404; a parent of another kind, or the category itself, 422 on `parent_id`; a parent that is a subcategory, or moving a category that has subcategories, 422 `nested-subcategory`. Names stay unique per kind among active categories, subcategories included.
- `Category` carries `parent_id` (null for a top-level one), in the list and in each entry's category.
- `GET /api/reports/categories` adds `parent_id` on each `outflow` and `income` item and `groups`: one per top-level category with entries in the month, itself or through its subcategories, with the subcategories' amounts and previous amounts rolled in, its share of the outflow or income total, the change against the previous month and `children`, the ids of its subcategories with entries. Outflow groups come first, then income, each by amount.

### Changed

- `GET /api/categories` stays flat, ordered within a kind by parent name with each parent followed by its subcategories by name.
- `DELETE /api/categories/{id}` archives the category's subcategories with it, in the same statement.

### Upgrade notes

- Migration `0011_category_parent` adds the nullable `categories.parent_id`, a foreign key on `(user_id, parent_id)` to the same user's category with `ON DELETE RESTRICT`, a check that a category is not its own parent and an index on `(user_id, parent_id)`. Every existing category stays top-level. It runs on start-up with the others; no manual step.

### Web
- Category picker on phones is a select-like field with a searchable sheet, grouped by parent, with a `+` to create a category or subcategory.
- New categories take any lucide icon (searchable, loaded on demand) and one of the twelve palette colors.
- Subcategories read `Pai › Filho` on Mês, Para onde vai and Contas fixas.

### Tooling
- `.editorconfig`, VS Code settings and extensions (Biome, rust-analyzer), `rustfmt.toml`, `.gitattributes` and a `.githooks/pre-commit` (`git config core.hooksPath .githooks`).

## 0.6.0

> Headline: bank-style amount entry and categories created from the picker

### Added

- `Nova categoria`, last in the category picker of Lançar and of a bill: a sheet with Nome (required, up to 40 characters) and Ícone (16 icons, `circle-dashed` by default); the kind is the picker's and the color the first `cat-n` the kind does not use yet (the server picks once all twelve are taken). The new category is selected at once and `Categoria criada` confirms it; a taken name says `Já existe uma categoria com esse nome`.

### Changed

- Every money field (Lançar, Pagar, a bill, onboarding, Ajustes saldo inicial and termômetro, import, the Economia inline edit) takes digits only, bank-style: the cents fill from the right as you type (`1` → `0,01`, `123456` → `1.234,56`), Backspace drops the last digit, a pasted `1.234,56` or `1234.56` is read whole and the caret stays at the end. Fields that may be negative take a `-`. The numeric keypad opens on phones.
- The category picker is a list of 56px rows with the icon, the name and a check below 640px; the icon grid stays from 640px.

## 0.5.1

> Headline: light theme only

### Removed

- Dark mode and the template's theme preferences: the `.dark` tokens, the `theme_mode` preference and its `data-theme-mode` attribute, the boot script that followed the system color scheme, the preferences store, and the `next-themes`, `zustand` and `ts-node` dependencies. Soldi always renders the light Soldi palette, whatever the system setting; toasts are light too.

## 0.5.0

> Headline: import the Termômetro spreadsheet

### Added

- `POST /api/imports/xlsx` takes the Termômetro workbook as multipart `file` (at most 5 MB, 413 `too-large` above; 422 when it is not an .xlsx). Year sheets (2000 to 2100) give one entry per `Entrada`, `Saída` and `Diário` number, or from a formula of `+` and `-` over numbers (a leading `+` and a `sum( … )` wrapper are accepted, in any case): one entry per literal for a pure sum, one net entry when there is a `-`, an error when the net is zero or less; the `Economia` sheet gives the saved months of each table with a year. The answer lists, per year, the entry count, the income, bills and daily totals and the saved months, plus every unreadable cell (`{ sheet, cell, message }`: a cell reference or any other formula, text, more than two decimals, a day the month does not have) and a `token`. Only the preview is stored, for 15 minutes.
- `POST /api/imports/xlsx/confirm` `{ token, opening_balance, opening_date, skip_errors? }` writes the preview in one transaction: the opening balance and date (422 on `opening_date` after the first imported day), the categories `Importado (entrada)`, `Importado (conta)` and `Importado (diário)` (created once, `file-spreadsheet`, `cat-12`), the entries noted `Planilha {year}`, the saved months, and onboarding, and answers `{ transactions, savings_months, years, skipped }`. A second import of a year replaces what the first wrote for that year; entries made by hand stay. With `skip_errors: true` a preview with errors is confirmed without the cells it lists, returned as `skipped: [{ sheet, cell }]`; without it such a preview answers 422 `import-has-errors`. An expired token answers 410 `import-expired`, another user's token 404.
- Ajustes › Dados › `Importar planilha` (`/ajustes/importar`): pick or drop the `.xlsx` (files over 5 MB are refused before upload), then a card per year with its entries, `Entradas`, `Contas`, `Diário` and saved months, the unreadable cells as `{sheet}!{cell}: {message}` with `Importar mesmo assim, pulando essas células` (required to confirm when there are any), `Saldo inicial` (default `0,00`) and `Data do saldo inicial` (default January 1 of the earliest year). `Importar` shows `Importado: {n} lançamentos` and opens `Mês` (December of the latest year when it is a past year). Too large, not an .xlsx and expired previews each get their own message; errors keep the preview, and `Escolher outro arquivo` starts over.

### Upgrade notes

- Migration `0010_import_previews` adds the `import_previews` table and nullable `import_batch_id` and `import_year` columns on `transactions` and `savings`, with a partial index on imported entries. It runs on start-up with the others; no manual step.

## 0.4.0

> Headline: where the money goes and the savings year

### Added

- `GET /api/reports/categories?month=YYYY-MM`: the month's outflow (bills and daily) and income by category, each with its share of the group's total and its change against the previous month as percentages with one decimal (`delta_pct` null when the previous month had nothing), largest first.
- `GET /api/transactions?month=YYYY-MM&category_id=…` lists one category's entries; another user's category lists nothing.
- `GET /api/savings?year=YYYY`: twelve months of income, savings and their percentage (null without income; income and savings null before the opening month), the year totals and the progress towards the savings goal, capped at 100%.
- `PUT /api/savings/{year}/{month}` `{ amount }` sets a month's savings (zero or more, two decimal places; a month before the opening date answers 422 `month-before-opening`).
- `GET /api/months/{YYYY-MM}` fills `savings` with the month's amount and its percentage of the month's income.
- Web `Para onde vai` (`/para-onde-vai?m=YYYY-MM`): a short header with the month switcher, `Saídas / Entradas`, a donut in the category colors with the month's total in the center, legend rows with amount, share and the change against the previous month (red when spending grew, green when it fell), a `Top 5` with bars, and tapping a slice or a row lists that category's entries with `Limpar filtro`. Rows are keyboard-selectable buttons.
- Web `Economia` (`/economia?y=YYYY`): a year switcher, `Guardado no ano` with its share of income and the progress to the goal (edited inline: pencil, 1 to 100, empty clears it), and a twelve-month table where `Guardado` is edited in place (Enter or leaving the field saves with `Salvo`, Escape cancels); `%` carries a red, yellow or green dot (under 5%, 5 to 15%, over 15%); months before the opening show `—`. On a phone the income sits under the month name and the share under the amount.

### Changed

- `savings_goal_pct` in `PATCH /api/settings` is 1 to 100; `null` clears the goal and `0` is refused.
- Web: toasts on a phone sit above the tab bar and its `Lançar` button instead of covering them.

### Upgrade notes

- Migration `0009_savings_goal` turns a stored goal of 0 into no goal and narrows the `settings.savings_goal_pct` check to 1..100. It runs on start-up with the others; no manual step.

## 0.3.0

> Headline: recurring bills, one-tap payment and the projected balance

### Added

- Recurring bills: `POST /api/bills`, `PATCH /api/bills/{id}` (name, amount, due day, category, `active`), `DELETE /api/bills/{id}` (archive, its payments stay) and `GET /api/bills?include_inactive=true` for paused bills. The category must be one of the caller's active bill categories.
- `POST /api/bills/{id}/pay` `{ date, amount? }` records a `bill` entry linked by `recurring_bill_id`, with the bill's amount unless another is given; an optional `?month=YYYY-MM` keeps the date inside the month being paid. A second payment in the same month answers 409 `bill-already-paid`. `DELETE /api/bills/{id}/pay?month=YYYY-MM` removes that month's payment.
- `GET /api/months/{YYYY-MM}` fills `bills_of_month` (category icon and color, due date clamped to short months, paid, payment entry, overdue) and `projected_balance` is now the month-end balance minus the unpaid bills, with its own tier.
- Transactions carry `recurring_bill_id`.
- Web: `Contas do Mês` on Mês, between the summary and the thermometer (top of the main column on desktop): each bill with its due day, amount and a pill. `Pagar` marks it paid in one tap, dated today; `Pago` undoes it (`Pagamento desfeito`); an overdue bill shows `Vencido` on a tinted row with `Venceu dia dd/mm`. A tap on the amount opens the `Pagar` sheet to change the amount or the date. Desktop filters `Todas / Pendentes / Pagas`, footer with the next due date, empty state with `Cadastrar contas`.
- Web: Ajustes is a grouped list. `Contas fixas` lists active and paused bills, adds and edits them in a sheet (nome, valor, dia, categoria, Ativa) and archives with a 5 s `Desfazer`. `Termômetro` edits the four tier bounds with a live preview of today's balance; `Saldo inicial` edits the opening balance and date. `Categorias` is a placeholder.

### Changed

- "Today" is the São Paulo calendar day for the month view, overdue bills and the default opening date.
- Entries of one day list newest first by creation time.
- A transaction dated before the opening date answers 422 `before-opening-date`.
- Web: the Projetado figure and the thermometer sentence use the projection: `Com as contas em aberto, seu mês termina em {valor}.`
- New accounts seed Mercado, Comida fora, Transporte, Saúde, Lazer, Aluguel, Luz, Internet, Cartão, Assinaturas, Salário and Extra with `cat-1` to `cat-12`; the other defaults share the palette in turn. Existing categories keep their colors.

### Security

- `ctutils` 0.4.8 (RUSTSEC-2026-0385).

### Upgrade notes

- Migration `0008_bill_payment_month` adds a unique index on one bill payment per month and drops `transactions_recurring_bill_idx`, which it covers. It fails if a bill already has two entries in one month; none can exist before 0.3.0.

## 0.2.0

> Headline: transactions and the month view with the thermometer

### Added

- Transactions: `GET /api/transactions?month=YYYY-MM` (newest first, each with its category), `POST`, `PATCH` and `DELETE /api/transactions/{id}`. Amounts must be above zero with at most two decimal places and are never rounded; the category must be the caller's, active and of the entry's kind.
- `GET /api/months/{YYYY-MM}`: every day of the month with income, bills, daily spending and the running balance carried from the opening balance across months and years, each colored by the user's thermometer tiers; today's balance, month totals and performance, and the month-end projection. A month before the opening date answers 422 `month-before-opening`.
- Web `Mês`: month switcher (`?m=YYYY-MM`, arrow keys, nothing before the opening month), today's balance with its tier, Entradas / Saídas / Projetado over the hero, `Termômetro do Mês` with the five-tier strip and how much of the income is committed, and `Lançamentos` grouped by day with the day's balance and tier. Loading, empty and error states; light and dark, 375px and 1440px.
- Web `Lançar`: bottom sheet on phones and dialog from 1024px for Entrada, Conta or Diário, with Diário, its first category and today preselected so the floating button, the amount and Salvar log a spend. The new row shows at once. Tapping a row edits or deletes it; a deletion can be undone for 5 seconds.
- Web thermometer components: tier pill, tier strip, money with tabular figures and category icons.

### Fixed

- `scripts/sqlx-prepare.sh` and CI cache the queries used only by tests, so offline builds compile the test targets.

### Removed

- The template's sample dashboards and the `simple-icons` dependency.

## 0.1.0

> Headline: workspace, auth, settings, categories, bills and onboarding API, plus the web app to sign in, onboard and see the month

### Added

- Cargo workspace (`soldi-types`, `soldi-server`), PostgreSQL 16 in `compose.yaml`, CI, Dockerfile and Railway config.
- Sign-up, sign-in, sign-out and `GET /api/auth/me` with an opaque session cookie (argon2id passwords); `me` says whether the user is `onboarded`.
- Settings: opening balance and date, the four thermometer tiers (defaults -500 / 0 / 1000 / 2000) and an optional savings goal.
- Categories seeded at sign-up (income, bill and daily), with create, rename, recolor and archive.
- `GET /api/bills`: the active recurring bills by due day.
- `POST /api/onboarding`: opening balance, date and up to 50 first bills in one transaction; a second call answers 409.
- The Next.js export is served from `SOLDI_WEB_DIR` (default `web/out`) with `.html`, `index.html` and client-route fallbacks.
- OpenAPI at `/api/openapi.json`, Swagger UI at `/api/docs`, committed snapshot in `web/openapi.json`.
- RFC 9457 problem responses for every error.
- Web app (Next.js static export, pnpm): Entrar, Criar conta, three-step onboarding (opening balance and date, fixed bills, done), a `Mês` placeholder with the month hero and today's balance tier, and `Ajustes` with sign-out.
- Soldi theme in light and dark (Inter, violet brand, indigo hero, income, expense and five thermometer tiers), desktop sidebar and phone tab bar with the raised `Lançar` button.
- Template screens Soldi does not use were removed; Vitest with 90% coverage thresholds and a Playwright smoke test.
