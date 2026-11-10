# SOL-43 — Excluir minha conta

LGPD (art. 18, VI): the user can have their data deleted. Asked in SOL-36's thread; split into its own card.

## API

`DELETE /api/me` with body `{ "password": string }` → 204 and the session cookie cleared like `sign-out`.

- Wrong password → 422 rule `wrong-password` (same as `/api/me/password`), nothing deleted. Limited by the `PASSWORD_CHANGE_USER` budget (10 per 15 min per user) — the same guessing surface.
- Right password → in one transaction: `DELETE FROM users WHERE id = $1`. Every table that holds user data must cascade from `users` (sessions, settings, categories, bills, transactions, savings, cofrinhos, import previews, password_resets). Verify each FK is `ON DELETE CASCADE`; where one is not, migration `0018_account_deletion.sql` makes it so (only FK changes, no data change). Categories reference each other (`parent_id … ON DELETE RESTRICT`) and transactions reference categories and bills: the cascade order inside one `DELETE FROM users` must not trip a RESTRICT — test it with a full account (categories with subcategories, cofrinhos, bills with payments, a series, an import).
- After deletion the same e-mail can sign up again as a new account.
- Cross-site check applies (it is a write). 401 without a session.

## Web

- Ajustes › Minha conta gets a last section `Excluir conta` (destructive), text `Apaga sua conta e todos os seus lançamentos, categorias, contas fixas e cofrinhos. Não dá para desfazer.` and a button `Excluir minha conta` (destructive variant).
- The button opens an alert dialog: title `Excluir sua conta?`, the same text, a `Senha` field (`autocomplete="current-password"`) and a confirmation field `Digite EXCLUIR para confirmar`; `Excluir para sempre` stays disabled until the field equals `EXCLUIR` (case-sensitive) and the password is not empty; `Cancelar`.
- Success → query cache cleared (same as sign-out's `useLeave`), navigate to `/entrar` with toast `Sua conta foi excluída.`
- `wrong-password` → `Senha incorreta` under the field, dialog stays open. 429 → `Muitas tentativas. Espere um pouco e tente de novo.`; other → `Não foi possível excluir a conta.`

## Acceptance

- A full account is gone: no row of that user remains in any table (test counts every table by user_id).
- Another user's data untouched.
- Wrong password deletes nothing and keeps the session.
- The e-mail can sign up again.
