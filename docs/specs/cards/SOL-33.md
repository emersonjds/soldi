# SOL-33 — Editar e excluir visíveis em toda categoria e subcategoria

Owner, 2026-11-08: "sub categorias podem ser excluídas ou editadas, assim como categorias" and, on "Importado (diário)": "isso pode remover ...". Today: row click opens the edit sheet (chevron hints it); delete lives inside the sheet as "Arquivar" with a 5 s undo toast; entries keep the archived category.

## Winner

Trailing kebab (`⋮`, 44×44) on every row — top-level and subcategory, Importado included — opening a dropdown with **Editar** and **Excluir**. Row click still opens the sheet (unchanged, fastest path to edit); the kebab is the one place delete is visible without entering the sheet. **Excluir fires straight away with the undo toast — no confirm dialog** (undo over confirm). The per-parent ghost "+" is removed from the row; "Nova subcategoria em X" becomes a third menu item on a top-level's kebab, so a top-level row now carries exactly one icon button, not two.

Rejected: swipe-to-reveal (no desktop parity, fights vertical scroll) · context-menu/long-press only (no visible affordance, fails discoverability) · confirm dialog before delete (contradicts the undo principle, adds a tap) · keeping "+" as a second row icon (crowds 375px, two icon buttons per row).

## Flow

1. Row renders: icon, name, (top-level) savings chip if `is_savings`, kebab.
2. Tap/click row body → edit sheet opens (existing `CategorySheet`), unchanged.
3. Tap/click kebab → dropdown: **Editar** (opens the same sheet) · **Nova subcategoria em {name}** / **Novo cofrinho em {name}** (top-level only, same preset-parent sheet SOL-34's shortcut also opens) · **Excluir** (destructive style, red text).
4. Excluir → immediate soft-delete + 5 s toast with **Desfazer**; closing the tab inside those 5 s keeps the undo (ponytail, no unarchive endpoint).
5. Economia/Resgate (`is_savings`): kebab has **Editar** only — no Excluir, no "Nova subcategoria" item swap for cofrinho wording is unchanged from today.

## Copy (pt-BR, exact)

- Kebab trigger `aria-label`: `Mais ações de {name}`.
- Menu items: `Editar` · `Nova subcategoria em {name}` (or `Novo cofrinho em {name}` when `is_savings`) · `Excluir` (red).
- Toast title: `Categoria excluída` (top-level) / `Subcategoria excluída` / `Cofrinho excluído`.
- Toast description — parent with children: `{N} subcategoria(s) também; lançamentos continuam com a categoria.` — no children: `Lançamentos continuam com a categoria.`
- Undo action label: `Desfazer`.
- Error (generic): `Não foi possível excluir a categoria.`
- Error (cofrinho with balance): `Resgate tudo antes de excluir.`

## States

- **Loading / error / empty kind**: unchanged (`PageLoading`, `PageError`, "Nenhuma categoria aqui ainda") — this card only touches row actions.
- **Importado (entrada|conta|diário)**: same kebab as any category; the reassurance line above ("lançamentos continuam com a categoria") is what tells the owner their imported entries are not lost — no special case in code.
- **Disabled**: Economia/Resgate show no Excluir item (omitted, not greyed — the row's existing "Cofrinhos" chip already explains the row is special).
- **Overflow**: long names still truncate in the row; the menu doesn't repeat the name except in the two labelled items above, so a long name never breaks menu width.
- **Offline / request fails**: optimistic hide reverts, toast.error per the copy above, nothing else changes.

## Keyboard / screen reader

- Kebab is a real `button`, reachable by Tab after the row button; Enter/Space opens the menu (radix dropdown-menu default); arrow keys move between items; Esc closes and returns focus to the kebab.
- Destructive item carries no extra `aria-*`; its red text is not the only signal — the label itself says `Excluir`.

## Acceptance

- [ ] Every row (top-level, subcategory, Importado) shows a 44×44 kebab with Editar + Excluir (Nova subcategoria/Novo cofrinho only on top-level, not Economia/Resgate).
- [ ] Economia and Resgate rows have no Excluir in their kebab.
- [ ] Excluir never shows a confirm dialog; it fires the undo toast immediately.
- [ ] Toast description mentions child count (when any) and always states entries keep the category.
- [ ] Deleting a parent archives its children too (existing `archiveLater` behavior, copy updated).
- [ ] Undo within 5 s restores the row(s) with no request sent.
- [ ] Kebab, menu and items are reachable and operable by keyboard alone; focus returns to the kebab on close.
- [ ] No ghost "+" icon remains on any row at 375px or 1440px.

## Orchestrator notes (override the text above where they differ)

- `Economia`'s kebab: `Editar` and `Novo cofrinho em Economia`, no `Excluir`. `Resgate` never appears in this list (`GET /api/categories` leaves it out).
- A cofrinho (child of Economia) has `Editar` and `Excluir`; its toast is `Cofrinho excluído`, and the `cofrinho-not-empty` error reads `Resgate tudo antes de excluir.`
- The edit sheet's `Arquivar` button becomes `Excluir` (same icon slot, `Trash2`), same flow as the menu item.
- The chevron on the row goes away; the kebab is the only trailing element.
