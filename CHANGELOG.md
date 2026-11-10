# Changelog

All notable changes to Soldi are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0.0 the HTTP API may change between minor
versions. This file covers the server and the web app together.

## [Unreleased]

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
