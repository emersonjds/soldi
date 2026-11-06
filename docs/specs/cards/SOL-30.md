# SOL-30 — Apagar lançamentos (mês, ano ou tudo)

Owner, 2026-11-05: "coloque alguma mecânica de resetar tudo ... ou resetar só o ano coisas do tipo ... e assim tudo é apagado".

## Scope

Deletes the user's **transactions** for a period: entradas, saídas de contas fixas (pagamentos), diário, depósitos/resgates de cofrinhos. Stays: categorias, contas fixas (as regras), cofrinhos (as categorias) e ajustes. Not undoable.

## Ajustes entry

Group `Dados`, after `Importar planilha`: label `Apagar lançamentos`, hint `Mês, ano ou tudo`, icon `Trash2`. Route `/ajustes/apagar`.

## Screen (375px first, model: `saldo-inicial/page.tsx` + `opening-form.tsx`)

`BackLink` to Ajustes, title `Apagar lançamentos`.

1. **Período** — segmented control `Mês` / `Ano` / `Tudo` (44px targets), default `Mês`. `Mês` shows a month picker (current month default); `Ano` shows a year picker (current year default); `Tudo` hides both pickers.
2. **Preview** (card, live, debounced on period/date change) — `GET /api/transactions/count?period=…`:
   - loading: skeleton line `Contando…`
   - count > 0: `Serão apagados {N} lançamentos de {mês de ano | ano | "todo o período"}.` Examples: `Serão apagados 37 lançamentos de novembro de 2026.` / `Serão apagados 120 lançamentos de 2026.` / `Serão apagados 310 lançamentos de todo o período.`
   - count === 0: `Nada para apagar neste período.` — destructive button disabled
   - error: `Não foi possível contar os lançamentos.` with retry link; button disabled
3. **O que fica** — one static line under the preview: `Categorias, contas fixas e cofrinhos continuam, sem os lançamentos.`
4. **Destructive button** (`variant="destructive"`, full width mobile / auto desktop, disabled while count is 0, loading or error): `Apagar {N} lançamentos`.

## Confirm dialog (`AlertDialog`, model primitive `components/ui/alert-dialog.tsx`, unused elsewhere — first consumer)

Title `Apagar {N} lançamentos?`. Body: the period line repeated + `Isso não pode ser desfeito.` Input `Digite APAGAR para confirmar` (autoFocus, uppercase hint, 44px height); `AlertDialogAction` stays disabled until the field value is exactly `APAGAR`. Cancel closes with no call. Confirm calls `DELETE /api/transactions?period=…`.

- in flight: action label `Apagando…`, both buttons disabled
- success: toast `{N} lançamentos apagados`, dialog closes, stays on `/ajustes/apagar`; preview invalidates and refetches, landing on `Nada para apagar neste período` — the empty state is the proof it worked, no redirect needed
- error: `AlertDescription` destructive inside the dialog `Não foi possível apagar. Tente de novo.`, dialog stays open, field keeps its value
- offline: same error copy (no special offline branch; `navigator.onLine` not read, fetch failure covers it)

## Accessibility / keyboard

Segmented control is a `radiogroup` (arrow keys move, space/enter select). Dialog traps focus; Esc = cancel. Preview count update is announced via `aria-live="polite"` region. Color never carries meaning alone here (no thermometer tiers on this screen).

## API

- `GET /api/transactions/count?period=YYYY-MM|YYYY|all` → `{ count: number }`
- `DELETE /api/transactions?period=YYYY-MM|YYYY|all` → `{ deleted: number }`
- Both filter by `user_id` from session; invalid `period` → 400.

## Acceptance

- Handler tests: count and delete for month/year/all, invalid period 400, cross-user isolation.
- Web tests: preview text per period (singular `1 lançamento`), count 0 disables button, confirm button disabled until `APAGAR` typed exactly, success toast + redirect, error keeps dialog open.
- e2e: create 2 entries in November 2026 → `/ajustes/apagar` → `Mês` → preview shows 2 → type `APAGAR` → confirm → toast `2 lançamentos apagados` → `/mes` ledger for November is empty and `Mês` preview on this screen shows `Nada para apagar neste período`.
- Coverage ≥ 90%.
