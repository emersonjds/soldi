# SOL-53 — Limite de tentativas

Found in SOL-36: the API documents 429 on sign-in and sign-up but nothing returns it, so passwords can be guessed as fast as the server answers.

## Rule

A fixed-window counter in the server process (one Railway instance; `ponytail:` note on the ceiling — a second instance needs a shared store). Each limited request spends one unit of every key it maps to; any key over its budget answers 429 rule `rate-limited` with `Retry-After` = seconds until that key's window ends, and nothing else runs (no argon2, no DB, no e-mail).

| Route | Keys and budgets |
|---|---|
| `POST /api/auth/sign-in` | client IP: 20 per 15 min · lowercased e-mail: 10 per 15 min |
| `POST /api/auth/sign-up` | client IP: 10 per hour |
| `POST /api/me/password` | user id: 10 per 15 min |
| `POST /api/auth/password-reset` (SOL-37) | client IP: 10 per hour · lowercased e-mail: 3 per hour |

- Client IP: the first address in `X-Forwarded-For` (Railway's edge sets it), else the socket peer address. Malformed header → peer address.
- A successful sign-in does not reset the counters (simpler, and 10 per 15 min is generous for a person).
- Expired windows are dropped lazily on access; a sweep every 10 minutes removes keys untouched for an hour so memory stays bounded.
- Budgets are constants in one place; tests use the real budgets (the counter is pure and takes `now` as a parameter so window expiry is testable without sleeping).

## Web

Sign-in and sign-up already show `Muitas tentativas. Espere um pouco e tente de novo.` on 429. The password form (SOL-36) gets the same copy.

## Acceptance

- 11th sign-in for one e-mail within 15 min → 429 with `Retry-After`, even with the right password; a different e-mail from the same IP still works until the IP budget.
- 21st sign-in from one IP → 429.
- Window end → allowed again (unit test with injected time).
- 429 never touches the database or argon2 (the counter runs before the handler body).
- Other users and other IPs are unaffected.
