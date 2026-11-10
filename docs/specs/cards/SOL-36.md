# SOL-36 — My account (Minha conta)

Owner, 2026-11-09: "crie uma área de configurações do usuário, isso não existe hoje, quando eu clicar sobre meu nome". Account deletion is SOL-43; forgot-password by e-mail is SOL-37.

## API (auth slice)

| Method | Path | Body | Answer |
|---|---|---|---|
| `PATCH` | `/api/me` | `{ "name": string }` | 200 `User`. Name trimmed, 1 to 60 characters, no NUL; 422 `name` otherwise. |
| `POST` | `/api/me/password` | `{ "current_password", "new_password" }` | 204. `new_password` follows sign-up rules (`check_password`, 8 to 128). Wrong current password: 422 rule `wrong-password`. Every **other** session of the user is deleted; the current one stays. Same rate limiter as sign-in. |
| `POST` | `/api/auth/sign-out-everywhere` | — | 204, deletes **all** the user's sessions and clears the cookie like `sign-out`. |

All three need a session (401 without), touch only the caller's row and sessions, and keep the Origin check. OpenAPI documented; `web/openapi.json` regenerated.

## Web

- Route `/ajustes/conta`, title `Minha conta`, `BackLink` to Ajustes (model: `ajustes/saldo-inicial/page.tsx` + `features/edit-settings/opening-form.tsx`).
- Section `Perfil`: `Nome` (input, prefilled) + `Salvar` → toast `Nome salvo`; `E-mail` shown read-only with hint `Para trocar o e-mail, fale com o suporte.`
- Section `Senha`: `Senha atual`, `Nova senha` (hint `Mínimo de 8 caracteres`), button `Trocar senha` → toast `Senha trocada. Os outros aparelhos foram desconectados.` and fields clear. Errors: `wrong-password` → `Senha atual incorreta`; other → `Não foi possível trocar a senha.`; a new password under 8 characters is caught before sending.
- Section `Sessão`: `Sair` (existing `SignOutButton`) and `Sair de todos os aparelhos` (alert dialog `Sair de todos os aparelhos?` / `Você vai precisar entrar de novo em cada um.` / `Sair de todos`), then goes to `/entrar`.
- The sidebar footer's name block (avatar, name, e-mail, version) becomes a link to `/ajustes/conta` (`aria-label="Minha conta"`), the sign-out icon stays beside it; the mobile top-bar avatar link goes to `/ajustes/conta` instead of `/ajustes`.
- Ajustes › group `Conta` gets the item `Minha conta` (hint `Nome, e-mail e senha`, icon `UserRound`) above `Sair`.
- 375px first, 44px targets, inputs 16px, `autocomplete` `current-password` / `new-password` / `name`.

## Acceptance

- Name change shows in the sidebar at once.
- Wrong current password keeps the user signed in and shows the copy; right one signs out other sessions only (proved by a second session getting 401).
- `Sair de todos os aparelhos` invalidates every session, the current included.
- Another user's data is never read or written.
