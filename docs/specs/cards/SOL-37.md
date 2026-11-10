# SOL-37 — Esqueci minha senha

Owner, 2026-11-10: "tem que criar uma mecânica de resetar senha … manda um link, a pessoa reseta e pronto". The link goes only to the account's e-mail: showing it on screen would let anyone who types an e-mail take the account. E-mail is sent through Resend (free tier, 3 000/month, 100/day); domain `getsoldi.app` is verified (region `sa-east-1`), and Railway already has `RESEND_API_KEY` (sending-only, this domain), `SOLDI_MAIL_FROM=Soldi <nao-responda@getsoldi.app>` and `SOLDI_PUBLIC_URL=https://getsoldi.app`.

## API (auth slice)

| Method | Path | Body | Answer |
|---|---|---|---|
| `POST` | `/api/auth/password-reset` | `{ "email" }` | Always 202 with no body, whether or not the account exists (no enumeration). Limited by `limits::PASSWORD_RESET_IP` (10/h) then `PASSWORD_RESET_EMAIL` (3/h) → 429. E-mail > 254 bytes → 422 `email`. |
| `POST` | `/api/auth/password-reset/confirm` | `{ "token", "new_password" }` | 204: password set, **every** session of the user deleted, every pending reset token of the user deleted, all in one transaction. Unknown, expired or used token → 422 rule `invalid-reset-link`. New password follows `check_password`. Limited by IP 20/h (new budget `PASSWORD_RESET_CONFIRM_IP`). |

- Token: 32 random bytes (`getrandom`), sent base64url without padding, stored only as SHA-256 (same as session tokens, `domain::hash_token`), in a new table `password_resets (id, user_id → users ON DELETE CASCADE, token_hash bytea unique, expires_at = now() + 1 hour, created_at)`, migration `0017_password_resets.sql`. Requesting a new link deletes the user's older pending ones.
- The request handler answers 202 at once and does the lookup + insert + send in a `tokio::spawn`ed task, so response time never tells whether the account exists. Failures in that task are logged (`tracing::warn!`, no e-mail address in the log), never surfaced.
- Mail: a `Mailer` held in `AppState` with two implementations — `Resend` (HTTPS `POST https://api.resend.com/emails`, bearer `RESEND_API_KEY`, JSON `{from, to, subject, text, html}`) and a recording fake used by tests that keeps the sent messages for assertions. With no `RESEND_API_KEY` (local), the server logs `password reset link for a user` without the address and with the link, so local runs work. HTTP client: add `reqwest` with `rustls-tls` and `json`, default features off.
- Link: `{SOLDI_PUBLIC_URL}/redefinir-senha?token={token}` (`SOLDI_PUBLIC_URL` default `http://localhost:8080`).
- E-mail (pt-BR): subject `Redefinir sua senha do Soldi`; text and simple HTML: `Olá, {nome}. Recebemos um pedido para redefinir a senha da sua conta no Soldi. Use o link abaixo em até 1 hora: {link}. Se não foi você, ignore este e-mail; sua senha continua a mesma.`

## Web

- `Entrar` gets the link `Esqueci minha senha` under the password field → `/esqueci-senha`.
- `/esqueci-senha` (auth layout, model: `(auth)/entrar`): title `Esqueci minha senha`, field `E-mail`, button `Enviar link`. After 202: `Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha. Ele vale por 1 hora.` and a link `Voltar para Entrar`. 429 → `Muitas tentativas. Espere um pouco e tente de novo.`; other error → `Não foi possível enviar agora. Tente de novo.`
- `/redefinir-senha?token=…`: title `Nova senha`, fields `Nova senha` (hint `Mínimo de 8 caracteres`) and `Repita a nova senha`, button `Salvar nova senha`. Mismatch → `As senhas não são iguais.` before sending. 204 → `/entrar` with toast `Senha redefinida. Entre com a nova senha.` `invalid-reset-link` → `Este link expirou ou já foi usado.` with a link `Pedir outro link` → `/esqueci-senha`. No token in the URL → the same expired message.
- 375px first, inputs 16px, `autocomplete` `email` / `new-password`.

## Acceptance

- Request for an unknown e-mail and for a real one: same 202, same body; only the real one records a message in the fake mailer, with the link containing a token that confirms once.
- Confirm sets the password (sign-in with it works, the old one fails), ends every session, and the same token then gives 422 `invalid-reset-link`; an expired token (expires_at in the past) gives the same.
- A second request deletes the first link.
- 4th request for one e-mail within an hour → 429.
- Another user's tokens and sessions untouched.
