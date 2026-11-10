# SOL-32 — Unique category colors per kind; a subcategory wears its parent's color

Owner, 2026-11-08: "se criei uma subcategoria ela deve seguir a mesma cor da categoria pai" and "todas as categorias têm cores diferentes, não podem ter as mesmas cores". Asked the same night: uniqueness is **per kind** (Entrada, Saída, Diário — what the screen shows together) and **cofrinhos inherit** like any subcategory. Decision D15.

## Rules

1. **Palette of 24 tokens**, `cat-1..cat-24`. `cat-1..cat-12` stay as they are; `cat-13..cat-24` are new, chosen by `designer`: distinguishable from each other and from the first twelve, white glyph on the swatch at least 3:1. Daltonism is SOL-9, not this card.
2. **Top-level colors are unique per kind.** Among a user's active (`archived_at IS NULL`) top-level (`parent_id IS NULL`) categories of the same kind, no two share a color. Archived ones hold no color. Backed by a partial unique index `categories_top_color_idx ON categories (user_id, kind, color) WHERE parent_id IS NULL AND archived_at IS NULL`.
3. **A subcategory wears its parent's color**, cofrinhos included. The server writes the parent's color on create and on move; a `color` sent for a subcategory is ignored (documented in OpenAPI).
4. **A parent's color change reaches its children** (active and archived) in the same transaction.
5. **Top-level create or move to top-level** (`parent_id: null` on a subcategory): the given `color` must be free in the kind, else 422 rule `color-taken`; no color given takes the lowest free token (`cat-1` first); none free is 422 rule `palette-full`.
6. **Top-level color change** to a color another active top-level of the kind holds: 422 `color-taken`. Sending its own current color is fine.
7. A race past the check hits the index; the unique violation on `categories_top_color_idx` maps to 422 `color-taken`, not the generic 409 `already-exists` (the web reads 409 as "name taken").
8. **Seeds** (signup): per kind, the twelve palette owners keep their tokens (Mercado `cat-1` … Extra `cat-12`); every other seed, `Economia` and `Resgate` included, takes the lowest token not yet used in its kind, in list order. Result: no repeated color within a kind.
9. **Importer** `Importado (entrada|conta|diário)`: an existing active one is reused as today; a new one takes the lowest free token of its kind; none free aborts the import with `palette-full` (all or nothing, as today).
10. **Migration** `0016_unique_category_colors.sql`: widen the color CHECK to `cat-1..cat-24`; per (user, kind), walk active top-levels ordered by `created_at, id`; the first holder of a color keeps it, each later duplicate takes the lowest token in 1..24 unused by active top-levels of that kind; then every subcategory (any state) takes its parent's color; then create the index. A kind with more than 24 active top-levels makes the index creation fail (loud, wanted; none exist).

## API

Same endpoints, no new fields. Docs change: `color` is `cat-1..cat-24`; on a subcategory it is ignored; 422 slugs `color-taken`, `palette-full`.

## Web (after backend and designer)

- Sheet, top-level (no parent chosen): the `Cor` fieldset shows the 24 swatches; a color held by another active top-level of the kind renders disabled, dimmed, `aria-label="Cor Azul, usada por Transporte"`. The current category's own color is selectable. Default for a new one: first free token.
- No free color and no parent chosen: the fieldset is replaced by `Todas as 24 cores estão em uso. Crie como subcategoria ou arquive uma categoria.` and `Criar` is disabled.
- Sheet, parent chosen (subcategory or cofrinho): no `Cor` fieldset; a line `Usa a cor de {Pai}` with the parent's swatch; the icon picker previews in the parent's color. Moving a subcategory to `Nenhuma` brings the fieldset back, defaulting to the first free token.
- Errors: `color-taken` → `Essa cor já é de outra categoria`; `palette-full` → the all-taken copy above.
- Saving a parent's color refetches the list (children change too).

## Acceptance

- Two top-levels of one kind never share a color, through the UI, the API (422) or a race (422).
- Same color in different kinds is allowed.
- Every subcategory and cofrinho shows its parent's color; changing the parent's color changes theirs.
- After the migration the owner's account has no repeated color within a kind and every child wears its parent's color.
- New signup: no repeated color within a kind.
