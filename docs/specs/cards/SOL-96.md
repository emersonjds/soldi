# SOL-96 — Verified e-mail badge and verification flow (P11)

Phase 2 of SOL-79. Go decided in `docs/specs/2026-11-11-stitch-fidelity.md` §12. The panel (product, finance, ux, architect) decided; decisions are final. No reversal. Plan: `docs/specs/plans/SOL-93-96.md`, tasks 13–14.

Stitch: FIDELITY 14.16 (`E-mail Cadastrado` · `emerson@soldi.app` · `verified Verificado`, `ajustes-desktop`). Shipped screen: Ajustes › Minha Conta & Segurança (`widgets/settings/account-section.tsx`, spec §10.6). Mail: `crates/soldi-server/src/mail.rs` (Resend, `send_password_reset`); flow model: password reset (SOL-37, `auth/service.rs` `request_password_reset` / `confirm_password_reset`).

## Panel outcome

Votes:

- **product:** the badge must mean the user proved the inbox. A `Verificar e-mail` action in Minha Conta for unverified accounts; no nag elsewhere.
- **ux:** verified: the Stitch badge. Unverified: muted `Não verificado` and a `Verificar e-mail` link button in the same tile. The link lands on `/verificar-email`, which works signed in or out.
- **finance:** no money.
- **architect:** mirror password reset exactly: `users.email_verified_at`, table `email_verifications` with only the SHA-256 of the token, 24 h expiry, single use (`DELETE … RETURNING`), a new request voids older links under an advisory lock, mail sent after the response in a tracked task, per-user and per-IP budgets. `User.email_verified: bool` (the web needs no timestamp). Confirming a password reset also proves the inbox, so it sets `email_verified_at` too (one statement).

Winner: as above.

Trade-offs:

- No mail at sign-up: nothing gates on verification yet, and sign-up stays one write. Add it when verification gates something.
- The confirm endpoint is unauthenticated (the link may open in another browser); the token alone decides, as with reset.

Rejected: a `purpose` column on `password_resets` (one table, two lifetimes and two limits; less readable), a signed stateless token (no single use without state), verification required to sign in (not asked).

## Rules

- **V1.** `POST /api/me/email-verification` (session required): already verified → 422 `email-already-verified` (`"Este e-mail já foi verificado."`). Otherwise 202; after answering, in one transaction, lock `email_verifications:{user_id}`, delete the user's pending rows, insert the new hash; then mail `{public_url}/verificar-email#token={token}` (fragment: the token never reaches server logs or `Referer`).
- **V2.** Budgets, checked in this order before the already-verified check: `EMAIL_VERIFY_IP` 10 per hour by client IP (`limits::client_ip`), then `EMAIL_VERIFY_USER` 3 per hour by user id. The first one over its budget answers 429 with `Retry-After` and leaves the later one unspent.
- **V3.** `POST /api/auth/email-verification/confirm { token }` (no session): budget `EMAIL_VERIFY_CONFIRM_IP` 20 per hour by client IP. In one transaction `DELETE FROM email_verifications WHERE token_hash = $1 AND expires_at > now() RETURNING user_id`; none → 422 `invalid-verification-link` (`"Este link de verificação é inválido ou expirou."`). Else `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now())`, delete the user's other pending rows. 204. Signs nobody in, ends no session.
- **V4.** Token: `domain::new_reset_token()`; stored as `domain::hash_token(&token)`; expiry `now() + 24 hours` by column default.
- **V5.** `confirm_password_reset` also sets `email_verified_at = COALESCE(email_verified_at, now())` and deletes the user's pending `email_verifications` rows. A refused confirm (invalid token, weak password) leaves `email_verified_at` untouched.
- **V6.** E-mail never changes in Soldi (`UpdateMe` is name only), so verification never resets.
- **V7.** Mail (`mail.rs`, `email_verification(to, link)`), link HTML-escaped like the reset. No name: the account owner chose it and, with no verification at sign-up, the address may belong to someone else, so the greeting carries no attacker-chosen text:
  - subject `Confirme seu e-mail no Soldi`;
  - text `Olá!\n\nConfirme que este e-mail é seu para concluir a verificação da sua conta no Soldi. Use o link abaixo em até 24 horas:\n\n{link}\n\nSe não foi você, ignore este e-mail.\n`;
  - `Mailer::Log` logs `email verification link for a user` with the link, never the address.

- **V8.** The token is minted and stored (voiding older links) before the mail is sent; a failed send leaves the user with no working link until the next request. Accepted: the user retries within the budget.
- **V9.** The log mailer is dev-only. When `PORT` or `RAILWAY_ENVIRONMENT` is set the server refuses to boot without an explicit, non-blank `SOLDI_PUBLIC_URL` (`SOLDI_PUBLIC_URL is required when PORT or RAILWAY_ENVIRONMENT is set`). With no `RESEND_API_KEY`, `Mailer::Log` is chosen only when the parsed URL is `http` with host exactly `localhost` or `127.0.0.1` (`mail::public_url`, `Mailer::from_env`); anything else refuses to boot.

## Contract

```jsonc
// User (GET /api/auth/me and every User response)
{ "id": "…", "email": "ana@example.com", "name": "Ana", "onboarded": true, "tour_seen": true,
  "email_verified": false }

// POST /api/me/email-verification            → 202 | 401 | 422 email-already-verified | 429
// POST /api/auth/email-verification/confirm   → 204 | 422 invalid-verification-link | 429
{ "token": "…" }
```

OpenAPI: `ConfirmEmailVerification` schema, both routes (tags `auth`), `User.email_verified` required. Snapshot refreshed.

## Migration `0025_email_verification.sql`

```sql
-- SOL-96 (P11): verified e-mail. Only the SHA-256 of the token in the link is stored.
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;

CREATE TABLE email_verifications (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash bytea NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_verifications_user_idx ON email_verifications (user_id);
```

Revert:

```sql
DROP TABLE email_verifications;
ALTER TABLE users DROP COLUMN email_verified_at;
```

## UI and copy (pt-BR)

**Minha Conta tile `E-MAIL CADASTRADO` (§10.6).**

- Verified: the e-mail, then a badge `Verificado` with `BadgeCheck` (success tone token, icon `aria-hidden`; the word carries the meaning, D22).
- Unverified: the e-mail, muted `Não verificado`, link button `Verificar e-mail` (44 px). Pending: disabled, `Enviando…`.
  - 202: toast `Enviamos um link para {email}. Ele vale por 24 horas.`
  - 429: toast `Muitas tentativas. Tente de novo mais tarde.`
  - 422 `email-already-verified`: refetch the user (badge appears), no toast.
  - other error: toast `Não foi possível enviar o link.`

**Page `/verificar-email`** (`app/(auth)/verificar-email/page.tsx`, `HeroFrame` like `/redefinir-senha`). Reads `#token=` on mount and confirms once.

- Confirming: `Verificando seu e-mail…` with the shipped spinner.
- 204: h1 `E-mail verificado`, `Pronto: seu e-mail está confirmado.`, button `Ir para o Soldi` (`/mes`); the cached user is invalidated.
- No token, 422: h1 `Link inválido ou expirado`, `Peça um novo link em Ajustes › Minha Conta.`, button `Ir para Ajustes` (`/ajustes#conta`).
- 429: `Muitas tentativas. Tente de novo mais tarde.`
- Other error: `Não foi possível verificar agora.` with `Tentar de novo`.

## Acceptance

Backend:

- Request as an unverified user: 202, one recorded mail with a `/verificar-email#token=` link; the table holds only a 32-byte hash.
- Confirm with that token: 204, `GET /api/auth/me` has `email_verified: true`; the same token again: 422 `invalid-verification-link`.
- An expired row (set `expires_at` in the past): 422. Unknown token: 422.
- A second request voids the first link; concurrent requests leave one live link.
- Already verified: 422 `email-already-verified`, no mail.
- Fourth request in an hour for one user: 429. Twenty-first confirm from one IP: 429.
- User B's token verifies only B; A stays unverified and keeps sessions.
- Password reset confirm verifies the e-mail.
- Unauthenticated request endpoint: 401. Account deletion removes the rows (the account-deletion test fills one).

Web (every state):

- Tile verified, unverified, pending, each toast, 422 refetch.
- `/verificar-email`: confirming, success, no token, invalid, 429, other error with retry; the confirm request runs once under React StrictMode.
- 375 and 1440: tile wraps the e-mail and badge without horizontal scroll; buttons 44 px.
