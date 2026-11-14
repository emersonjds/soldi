# Soldi Security Charter

## Principles

### I. Each user's money data is theirs alone

Every read and every write MUST be scoped to the user of the current session, taken from the session and never from the request body, path or query. Rows that point at other rows (a category, a bill, a card, a cofrinho) MUST point through keys that include the owner, so the database itself refuses a link to someone else's row. Never add an endpoint that reads or writes across users, and always answer "not found" for a row the caller does not own.

- Why: Soldi holds people's income, bills, card spending and savings. One query that forgets the owner, or one id an attacker can swap, exposes or rewrites another person's finances.

### II. Identity rides only on a server-side session

Always identify a signed-in user by an opaque random session token of at least 256 bits, stored only as a hash, sent only in an `HttpOnly`, `Secure`, `SameSite=Lax` host-only cookie, and revocable by deleting its row. Never put a session or reset token in JavaScript-readable storage, a URL query string or a log. Changing or resetting a password MUST end the other sessions.

- Why: a stolen or guessable session is a full account takeover. Hashing the stored token means a database leak does not hand out live sessions, and revocation lets a user cut off a lost device.

### III. Passwords are never recoverable and never reveal an account

Always hash passwords with argon2id and never store, log or return them. Sign-in MUST spend the same work and give the same answer for an unknown e-mail and a wrong password. Any action that changes or deletes an account MUST confirm the current password, unless it is a password reset proven by a reset link.

- Why: weak or fast hashes turn a database leak into every user's password, and different answers or timings tell an attacker which e-mails have accounts.

### IV. Reset and verification links are short-lived, single-use secrets

Always generate reset and e-mail verification tokens from a secure random source (at least 256 bits), store only their hash, expire them (one hour for a reset, one day for a verification), spend them in a single use, and void every older link when a new one is issued or the password changes. Always carry the token in the URL fragment so it never reaches server logs, the Referer header or monitoring. Requesting a reset MUST answer the same whether or not the e-mail has an account.

- Why: a reset link is a password in disguise. A long-lived, reusable or logged link lets whoever sees it take the account.

### V. Guessing and abuse always have a budget, and the budget is not a weapon

Always rate limit every endpoint that checks a password, creates an account or sends an e-mail, by client address and by target account. The limiter MUST NOT let one attacker lock other people out of signing in or recovering their account, and MUST NOT fail closed for everyone when it is flooded. Endpoints that write user data MUST stay bounded in how much one account can create.

- Why: without a budget, passwords are guessed and inboxes are flooded; with a careless budget, the protection itself becomes a way to deny service to a victim or to every user.

### VI. Browser writes come only from Soldi's own origin

Always refuse a state-changing request that a browser sends from another site, and never enable CORS for the API. The session cookie MUST stay `SameSite=Lax` or stricter.

- Why: a cross-site form or script could otherwise make a signed-in user's browser create, edit or delete their entries, or sign them into an attacker's account.

### VII. All input is untrusted until validated

Always validate every field at the API boundary (type, length, range, format, no NUL characters), reject unknown fields, and bound list sizes. Always pass values to the database as bound parameters and never build SQL from strings. Always escape user-supplied text placed in HTML, including e-mails.

- Why: unchecked input is how injection, oversized payloads and malformed data reach the database or a victim's inbox.

### VIII. Money is exact

Always store and compute amounts as `NUMERIC(12,2)` and `Decimal`, carry them as strings in JSON, and never let a floating-point number touch an amount.

- Why: rounding drift silently corrupts balances and projections, and a user can no longer trust what the product shows.

### IX. Personal and money data never leak through errors, logs or monitoring

Never send amounts, e-mails, names, notes, tokens, cookies, request bodies or user ids to logs, error responses or Sentry. Server errors MUST answer with a generic message while the cause stays in the server's own log. Monitoring MUST strip request data, user data and UI breadcrumbs before an event leaves.

- Why: logs and error trackers are read by more people and kept longer than the database; a leak there exposes users' finances and identities without anyone breaking in.

### X. Secrets live only in the environment, and a hosted run fails closed without them

Never commit a secret (API keys, database URLs, DSNs with credentials, test account passwords). Always load secrets from the environment or the CI secret store, and a hosted run MUST refuse to start when a required secret or setting is missing or blank rather than fall back to an unsafe default.

- Why: a secret in git history is permanent, and a silent fallback (such as printing reset links to a log) quietly exposes users in production.

### XI. The browser holds no secrets and is told how to protect the page

Always send security headers on every response: HSTS, frame denial, no MIME sniffing, a strict referrer policy and a Content Security Policy. Never keep tokens in browser storage, and always clear any per-user data kept in the browser at sign-out and account deletion.

- Why: a single injected script in a finance dashboard can read and change everything the user sees; headers are the safety net when another control slips.

### XII. Dependencies and the delivery pipeline are pinned and watched

Always install from frozen lockfiles, pin CI actions and base images by digest, run the production image as a non-root user, and check both Rust and web dependencies for known advisories in CI. Never ship a build tool or unused package as a runtime dependency.

- Why: most breaches through software arrive in someone else's code; pinning stops silent swaps, and checking advisories catches known holes before users meet them.

## Baseline discipline

Lagune holds this charter, every principle, every time. A principle is not suspended because a control looks small, familiar, or unlikely to be hit. This is not a judgement call.

### Only the controls the project needs

Lagune recommends and applies only the controls this project's context calls for. A control the project does not need is never added for completeness, and a generic checklist is not thoroughness. Every later phase acts on what the system actually does, never on what it might hypothetically do.

- Why: effort spent on risks the project does not have buries the risks it does have. Fewer, right-sized controls are easier to apply, prove, and keep true than a checklist no one finishes.

### Prefer the simplest vetted control

When a control is needed, reach for the safest option already proven, in order: a control this project already has, then a platform or framework built-in, then a well-maintained vetted library, and only then custom code. Never hand-roll a security primitive (cryptography, escaping, authentication, sessions) that a vetted standard already provides. A new dependency is new attack surface, justified and not assumed. Code, an endpoint, or a feature the project does not use is attack surface too, so removing it is itself a control.

- Why: hand-rolled security is where subtle, unaudited bugs live, and a second control duplicating an existing one is the one that gets forgotten and drifts. Boring, standard controls are easier to audit and harder to get wrong, and less surface is less to defend.

### When a control seems skippable

A control is held even when a reason to skip it feels reasonable:

- "Too small to need a control": small gaps are where breaches start.
- "Already handled elsewhere": assumed coverage is exactly how gaps hide.
- "Unlikely to be hit": attackers target the path no one is watching.
- "It works, ship it": working and safe are different claims, and the charter requires both.

## Governance

- This charter guides every security decision in each Lagune phase, and every change to it is reviewed and approved by the maintainer (Emerson Silva). Product and architecture decisions that touch a principle are recorded in `docs/specs/decisions.md`, and a decision that conflicts with a principle amends this charter first.
- It holds only what a deterministic check cannot capture, so it never repeats a control that linters or automated tools already enforce (sqlx compile-time checked queries, `unsafe_code = "forbid"`, `cargo deny`, Biome, typecheck).
- Amendments follow semantic versioning: MAJOR when a principle is removed or redefined, MINOR when one is added or materially expanded, PATCH for wording.

Version: 1.0.0 | Ratified: 2026-11-14
