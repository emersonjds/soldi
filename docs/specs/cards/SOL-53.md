# SOL-53 — Limite de tentativas

Found in SOL-36: the API documents 429 on sign-in and sign-up but nothing returns it, so passwords can be guessed as fast as the server answers.

## Rule

A fixed-window counter in the server process (one Railway instance; `ponytail:` note on the ceiling — a second instance needs a shared store). Each limited request spends one unit of its keys in the order listed; the first key over its budget answers 429 rule `rate-limited` with `Retry-After` = seconds until that key's window ends (never 0), later keys are not spent, and nothing else runs (no argon2, no DB, no e-mail).

| Route | Keys and budgets |
|---|---|
| `POST /api/auth/sign-in` | client IP: 20 per 15 min · lowercased e-mail + client IP: 10 per 15 min · lowercased e-mail (any IP): 50 per 15 min |
| `POST /api/auth/sign-up` | client IP: 10 per hour |
| `POST /api/me/password` | user id: 10 per 15 min |
| `POST /api/auth/password-reset` (SOL-37) | client IP: 10 per hour · lowercased e-mail: 3 per hour |

- Client IP: the last entry of the last `X-Forwarded-For` header line, else the socket peer address. Railway's edge appends the address it saw, so that entry is the real client; earlier entries are client-supplied and can be forged. Malformed → peer address. IPv4-mapped IPv6 (`::ffff:1.2.3.4`) counts as IPv4; IPv6 is keyed by its /64, since one host owns a whole /64.
- A loopback client (local runs, e2e) gets no IP key; behind Railway the client is never loopback.
- CGNAT shares the IP budget among everyone behind one address; acceptable for v1.
- The e-mail + IP budget is what an attacker spends guessing one account from one place; the global e-mail budget (50) caps a distributed guess without letting one IP lock the owner out (the owner signing in from another IP still has their own 10).
- Sign-in e-mail longer than 254 bytes after trim → 422 field `email` before the limiter, so junk e-mails never become keys.
- A successful sign-in does not reset the counters (simpler, and 10 per 15 min is generous for a person).
- An expired window resets on its next hit; every 10 minutes the next hit sweeps all expired windows out of the map.
- The map holds at most 100 000 keys. A new key when full sweeps expired windows at once; still full → 429 (fail closed, `Retry-After` = that budget's window). Known keys keep counting.
- Budgets are constants in one place; tests use the real budgets (the counter is pure and takes `now` as a parameter so window expiry is testable without sleeping).

## Web

Sign-in and sign-up already show `Muitas tentativas. Espere um pouco e tente de novo.` on 429. The password form (SOL-36) gets the same copy.

## Acceptance

- 11th sign-in for one e-mail from one IP within 15 min → 429 with `Retry-After`, even with the right password; the same e-mail from another IP still works until 50 across all IPs; a different e-mail from the same IP still works until the IP budget.
- 21st sign-in from one IP → 429.
- Window end → allowed again (unit test with injected time).
- 429 never touches the database or argon2 (the counter runs before the handler body).
- Other users and other IPs are unaffected.
