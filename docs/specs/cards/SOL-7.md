# SOL-7 — Importador da planilha Termômetro.xlsx

Panel of 2026-11-05 (product, finance, architect). Depends on SOL-5 (savings). The owner's file lives at `~/Downloads/_Termômetro.xlsx` and never enters the repository; tests use a small synthetic workbook built in the test with the same layout.

## Why

The owner has 2024–2026 in the sheet. Importing it fills the thermometer with history on day one and makes `Para onde vai` useful once entries are recategorized.

## File layout (verified on 2026-11-05 with openpyxl)

- Sheets named by year (`2024`, `2025`, `2026`) plus `Economia`. Other sheets are ignored.
- A year sheet holds twelve month blocks side by side, six columns each, starting at column A: block `m` (0-based) spans columns `A+6m .. E+6m`. Row 1 has the month name in the first column of the block (`JANEIRO` … `DEZEMBRO`); row 2 has the headers `Data | Entrada | Saída | Diário | Saldo`.
- Rows 3..33 are days 1..31 (`Data` holds the day number as a float). Days past the month's length are empty.
- Cells are either numbers or formulas that are sums of numbers (`=368 + 2259.56 + 950`, `= 59.17 + 35.71`). Evaluate only `+` sums of decimal literals; any other formula is a parse error reported in the preview. `Saldo` (column E of the block) is a formula and is ignored: Soldi recomputes it.
- Rows 37–44 hold totals and `Performance`; ignore everything below row 33.
- `Economia` sheet: two tables, one per year, headers at row 4: `B4 = 2025, C4 = Entradas, D4 = Economia, E4 = %` and `H4 = 2026, I4 = Entradas, J4 = Economia, K4 = %`; rows 5–16 are `jan … dez` with the amount saved in `D`/`J`. `Entradas` there is derived; ignore it. A table whose year cell is empty is skipped.
- The first day of the first imported year starts from the previous year's December balance (`='2025'!BS33`); the importer does not read it. The user confirms an opening balance and date in the preview (default: the earliest imported date and `0.00`).

## Mapping

- Each non-empty `Entrada` → one transaction kind `income`, category `Importado (entrada)`; `Saída` → `bill`, category `Importado (conta)`; `Diário` → `daily`, category `Importado (diário)`. A cell that is a sum of several literals becomes several transactions (one per literal), note `Planilha {year}`. Categories named `Importado (...)` are created on first import (kind set, icon `file-spreadsheet`, color `cat-12`) and never seeded otherwise.
- `Economia` rows with a non-zero value → `savings` upsert for `(year, month)`.
- Zero cells and empty cells produce nothing.
- Import is idempotent per `(user, year)`: a second import of the same year replaces the transactions and savings created by the previous import of that year (tagged `import_batch_id`), never touches manual entries.

## API

- `POST /api/imports/xlsx` multipart (`file`, ≤ 5 MB) → preview `{ years: [{ year, transactions, income_total, bills_total, daily_total, savings_months }], errors: [{ sheet, cell, message }], token }`; nothing is written.
- `POST /api/imports/xlsx/confirm` `{ token, opening_balance, opening_date }` → writes in one transaction, returns counts. Token expires in 15 minutes (stored server-side with the parsed rows).
- Rust: `calamine` for xlsx reading (new dependency, approved by this brief); formulas come from `calamine`'s formula reader.

## Screen (Ajustes › Importar planilha)

Drop zone / file picker, preview table per year with totals and the error list, opening balance + date fields, button `Importar`, then toast `Importado: {n} lançamentos` and redirect to `/mes` of the latest imported month. Errors keep the user on the preview.

## Acceptance

Synthetic workbook test covers: sums in formulas, empty days, February, a non-sum formula error, `Economia` with one empty year table, idempotent re-import. Owner's file imports with zero errors (checked manually by the orchestrating session before the morning report).
