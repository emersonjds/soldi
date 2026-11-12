# SOL-95 — `Personalizar` the category row; simulation `Histórico` in the browser (P9, P10)

Phase 2 of SOL-79. Go decided in `docs/specs/2026-11-11-stitch-fidelity.md` §12. The panel (product, finance, ux, architect) decided; decisions are final. New rule: D34 (P10, a D16 note). Plan: `docs/specs/plans/SOL-93-96.md`, tasks 10–12.

Stitch: FIDELITY 9.3 (`Categoria` + `Personalizar`, `lancar-modal-desktop`) and 11.4 (`Histórico` in the header of `posso-comprar-isso-simulador-desktop`). Shipped screens: Lançar's chip row (`entities/category/category-chips.tsx`, spec §3.4) and `/posso-comprar` (`widgets/purchase-simulator/purchase-simulator.tsx`, spec §11, SOL-92).

## Panel outcome

### 1. Pinned chips (P9)

Votes:

- **product:** the row ranks by this month's use; a user who launches `Mercado` daily but `Farmácia` rarely wants `Farmácia` reachable without `Ver todas`. Pins lead the row; usage fills the rest of the eight.
- **ux:** `Personalizar` as a text button left of `Ver todas`, at every width (the mobile frame omits it; Lançar is mostly used at 375, so omission is not a conflict, D24). A sheet with two lists and up / down buttons (no drag library: keyboard and 44 px targets come for free).
- **finance:** no money.
- **architect:** `categories.pin_rank SMALLINT NULL`, one user-wide order. A mixed group (D26) shows in two rows; one column cannot hold two ranks, and a per-kind pins table is a second model for a list of at most 24. One global order works: each row shows the pinned tops it contains in that order. Writes are one `PUT /api/categories/pins` with the whole ordered list (atomic, one request), not a PATCH per category (eight requests, transient duplicate ranks). Read is `GET /api/categories/pins`, so `Category` (embedded in every transaction) does not grow.

Winner: the architect's model with the ux sheet.

Trade-offs:

- Pinning a mixed group in Diário also pins it in Saída; the sheet says so under such a group (`Também fixada em {outro tipo}.`).
- The web merges one kind's edit into the global list (pure `mergePins`), so the server stays a dumb store.

Rejected: a `category_pins(kind)` table (second model), `PATCH {pin_rank}` per category, drag and drop.

### 2. Simulation history (P10, D34)

Votes:

- **product:** the user compares a few purchases; the last 10 inputs are enough.
- **finance:** D16 holds: nothing is stored server-side, no verdict is stored (it goes stale when entries change). A history row re-runs against today's forecast.
- **ux:** `Histórico` button in the header card, hidden while the history is empty (D25). A sheet lists rows; tapping one fills the inputs and calculates.
- **architect:** `localStorage` key `soldi:simulations:{userId}`, newest first, 10 max, deduplicated by inputs. Read after mount (static export: no `window` at build). Cleared on sign-out, sign-out-everywhere and account deletion (all pass through `useLeave`).

Winner: as above. Trade-off: history does not follow the user to another browser.

## Rules

- **P9-1.** `GET /api/categories/pins` → `{ "category_ids": [uuid] }`: the caller's active top-level categories with a `pin_rank`, ordered by it.
- **P9-2.** `PUT /api/categories/pins { "category_ids": [...] }`, in one transaction: refuse (422, field `category_ids`) more than 24 ids (`"must have at most 24 ids"`), a duplicate (`"must not repeat an id"`), or any id that is not the caller's active top-level category, or is `Resgate` (`"must be your active top-level categories"`). Then clear every `pin_rank` of the caller and set `pin_rank = position` (1-based) for the listed ids. Returns the new list (200).
- **P9-3.** An archived category or one moved under a parent keeps its stored rank but leaves the GET; the next PUT clears it.
- **P9-4.** Row order (web): the row's tops that are pinned, in global order, then the shipped ranking (use this month, then preset order) for the rest, sliced to 8. The selected parent still takes the last slot when outside (shipped).
- **P9-5.** At most 8 pinned per row (sheet disables `Fixar` at 8). The server only enforces 24 overall.
- **P10-1.** Entry `{ amount: string, count: 1|6|10|12, date: "YYYY-MM-DD" | "", cardId: string, categoryId?: string, at: ISO string }`. Saved on `Calcular Projeção`. Same inputs move to the top instead of repeating. Max 10.
- **P10-2.** Unreadable, non-array or malformed storage reads as empty (entries failing the shape check are dropped). A `setItem` error (quota, private mode) is ignored.
- **P10-3.** Restoring an entry whose card or category is gone drops that field (falls back to `Nenhum` / the first chip).
- **P10-4.** `useLeave` removes every key starting with `soldi:simulations:` before redirecting.

## Contract

```jsonc
// GET /api/categories/pins   → 200
{ "category_ids": ["…mercado", "…farmacia"] }
// PUT /api/categories/pins   body and 200 response
{ "category_ids": ["…farmacia", "…mercado", "…saude"] }
```

OpenAPI: `CategoryPins` schema, both routes under tag `categories`. No change for P10.

## Migration `0024_category_pins.sql`

```sql
-- SOL-95 (P9): the user's pinned order of top-level categories for the chip rows.
ALTER TABLE categories ADD COLUMN pin_rank smallint CHECK (pin_rank BETWEEN 1 AND 24);
CREATE UNIQUE INDEX categories_pin_rank_idx ON categories (user_id, pin_rank)
    WHERE pin_rank IS NOT NULL;
```

Revert:

```sql
DROP INDEX categories_pin_rank_idx;
ALTER TABLE categories DROP COLUMN pin_rank;
```

## UI and copy (pt-BR)

**Chip header (§3.4).** `Categoria` · dot · then at the right `Personalizar` (ghost text button, 44 px) and the shipped `Ver todas`. Wherever `CategoryChips` renders.

**Sheet `Personalizar categorias`** (`ResponsiveSheet`), description `Fixe até 8 categorias no começo da lista, na ordem que preferir.`

- `Fixadas`: rows of icon + name, `Subir` / `Descer` icon buttons (`aria-label="Subir {nome}"`, disabled at the ends), `Desafixar`. Empty: `Nenhuma fixada. A lista segue o uso deste mês.`
- `Outras`: the row's other tops by name, each with `Fixar`; at 8 pinned, `Fixar` is disabled and `Limite de 8 fixadas.` shows.
- Mixed group (D26) row: muted `Também fixada em Diário | Saída | Entrada.` when pinned.
- Footer `Cancelar` · `Salvar`. Toast `Categorias personalizadas`; error `Não foi possível salvar a ordem.`; loading the pins failed: the shipped `PageError` with retry inside the sheet; the row itself falls back to the shipped ranking.

**`/posso-comprar` header (§11.3, FIDELITY 11.4).** At the header card's right: outline button `Histórico` (History icon, 44 px), only when the history has rows. Sheet `Histórico de simulações`, description `As últimas 10 simulações ficam só neste navegador.`:

- Each row a 44 px button: `{valor total} · {À vista | 6x | 10x | 12x}` then muted `{categoria} · {dd/mm/aaaa da simulação}`.
- Tapping fills every input, closes the sheet and shows the results.
- `Limpar histórico` (ghost, destructive text) empties this user's list and closes the sheet; the button then disappears.

## Acceptance

Backend:

- GET returns `[]` for a new account; PUT of 3 ids then GET returns them in order; PUT `[]` clears.
- 25 ids, a repeated id, a subcategory, an archived category, `Resgate`, another user's category: each 422 `category_ids`, nothing changed.
- Two users pin independently; user B's PUT never clears user A's ranks.
- A pinned category archived, then GET: absent; a later PUT succeeds without a unique-index error.

Web (every state):

- No pins: the shipped ranking. Two pins: they lead the row in order, usage fills the rest; a pin unused this month still shows.
- `mergePins` unit cases: reorder within a kind keeps other kinds' slots; unpin removes; a new pin appends; a mixed group edited from one kind keeps one slot.
- Sheet: up / down, pin, unpin, limit 8, cancel discards, save sends the merged list; mixed-group note; error toast.
- History: hidden when empty; after one Calcular, the button shows with one row; the 11th Calcular drops the oldest; repeating inputs moves the row up; tapping a row restores inputs and results; `Limpar histórico` empties it.
- User A's history is not visible after sign-out and sign-in as B; after sign-out the key is gone.
- Corrupt JSON in the key: no crash, button hidden.
- 375 and 1440: header fits with `Histórico`; sheet rows 44 px; no horizontal scroll.
