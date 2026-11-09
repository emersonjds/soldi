# SOL-34 — Botão + cria categoria ou subcategoria de uma existente

Owner, 2026-11-08: "quando eu clico nesse + eu posso criar uma categoria ou uma subcategoria de uma já existente ... pense em como construir isso para ficar com uma ux e ui bacana tanto no mobile quanto na tela do computador."

## Winner

Header "+" opens a **two-step chooser inside the existing `ResponsiveSheet`** (same drawer-on-mobile / dialog-on-desktop shell, no new component): step 1 asks Categoria vs Subcategoria; step 2 (subcategoria only) is a searchable list of the kind's top-levels, each row showing icon + color swatch + name (`Command`, reused as-is) — never a bare `<select>`. Picking a parent (step 2) or "Categoria" (step 1) opens the same `CategorySheet` form that exists today, with `parentId` preset or empty. The per-row kebab shortcut from SOL-33 ("Nova subcategoria em X") skips both steps and opens that same form directly — the header "+" is for when the parent isn't decided yet, the row shortcut is for when it already is.

Rejected: a single sheet with the native "Subcategoria de" select left as the only way in (what exists now — owner explicitly asked for a visual pick, not a dropdown) · a custom icon grid for step 2 (reinvents search/keyboard nav that `Command` gives free) · collapsing both steps into one screen with a toggle (hides the parent list behind an extra click either way; two short steps read clearer at 375px than one crowded one).

## Flow

1. Header "+" (44×44, unchanged position) → sheet opens, step 1.
2. Step 1, two full-width option rows (56px tall, icon + label + one-line helper): **Categoria** → go straight to `CategorySheet` with no parent. **Subcategoria** → step 2.
3. Step 2: `Command` list of the current tab's top-levels (same `kind` already fixed by the screen), search input on top, each item = `CategoryIcon` + name, 44px row. Back chevron (`aria-label="Voltar"`) returns to step 1.
4. Selecting an item → `CategorySheet` opens with `parentId` set to it (identical code path to today's per-row "+" and to SOL-33's kebab shortcut).
5. From inside `CategorySheet`, Salvar/Criar and Arquivar behave exactly as today (SOL-32's color rules untouched).

## Copy (pt-BR, exact)

- Step 1 title: `Criar`. Description: `Categoria nova ou dentro de uma que já existe?`
- Option 1 label: `Categoria` — helper: `Nova, com ícone e cor próprios.`
- Option 2 label: `Subcategoria` — helper: `Dentro de uma categoria já existente.`
- Step 2 title: `Subcategoria de qual categoria?`
- Search placeholder: `Buscar categoria`
- Step-2 empty state (kind has no top-level yet): `Nenhuma categoria para agrupar ainda.` + button `Criar categoria` → routes to step-1's Categoria path.
- Back button `aria-label`: `Voltar`.

## States

- **Loading**: step 2's `Command` shows the same `PageLoading` pattern while categories fetch; step 1 never waits on data.
- **Error**: step 2 reuses `PageError` with retry; step 1 unaffected.
- **Kind with no top-level** (fresh income/bill tab): step 2 empty state above; never a dead-end — the "Criar categoria" button is the only CTA, no copy asks the user to go elsewhere.
- **All 24 colors taken**: unchanged — if the user picks Categoria, `CategorySheet` shows SOL-32's existing "Todas as 24 cores estão em uso" message and disables Criar; picking Subcategoria is unaffected since subcategories don't consume a color.
- **Cofrinho path**: picking Economia in step 2 opens the existing cofrinho form (title `Novo cofrinho`, suggestion chips, Meta/Prazo) — no change, same `parentId`-driven branch `CategoryForm` already has.
- **Savings rows in step 2's list**: Economia and Resgate appear like any other top-level (today's parent filter already includes them); not in scope to change.
- **Overflow**: many top-levels → `Command`'s search narrows the list; no scroll-breaking at 375px (list scrolls inside the sheet, header/search stay pinned).

## Layout

- 375px: step 1 options stack vertically, full width, 56px each. Step 2: search input full width, list below, back chevron top-left of the sheet header.
- 1440px: same two steps, dialog instead of drawer; step 1 options can sit side by side (two cards) since width allows; step 2's `Command` gets a max width (~420px) centered, same content.

## Keyboard / screen reader

- Step 1 options are real buttons, Tab order top-to-bottom (or left-to-right at 1440px); Enter/Space activates.
- Step 2's `Command` keeps its built-in combobox roles, arrow-key navigation and type-to-filter.
- Back button is a normal tab stop; Esc on step 2 goes back one step before it closes the sheet (matches "escape routes" — never jumps straight out from a sub-step).

## Acceptance

- [ ] Header "+" opens the chooser, never the bare form, at both 375px and 1440px.
- [ ] Categoria path reaches the unchanged `CategorySheet` with no parent preset.
- [ ] Subcategoria path shows a searchable, icon+color+name list — no native `<select>` anywhere in this flow.
- [ ] Selecting a parent opens `CategorySheet` with that `parentId`, same form SOL-33's kebab shortcut opens.
- [ ] Empty kind in step 2 shows the empty copy + "Criar categoria" button, no dead end.
- [ ] Economia selected in step 2 yields the cofrinho form, unchanged.
- [ ] All of step 1, step 2 and the back button are operable by keyboard alone.
- [ ] SOL-32 color rules (unique per kind, parent color inherited, all-taken message) are unaffected.

## Orchestrator notes (override the text above where they differ)

- In **create** mode the form has no `Subcategoria de` select at all: the Categoria path creates a top-level; a preset parent (step 2, or the row menu) shows a read-only row `Em {Pai}` with the parent's icon and a `Trocar` link that reopens step 2. The native select stays only in **edit** mode, where it moves a category.
- `Resgate` never appears in step 2 (`GET /api/categories` leaves it out); `Economia` does and leads to the cofrinho form.
- Step 1 title `Nova`, description `Categoria nova ou dentro de uma que já existe?`.
