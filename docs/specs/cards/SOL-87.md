# SOL-87 — Cofrinhos as in Stitch

Spec: `docs/specs/2026-11-11-stitch-fidelity.md` §6. Plan: `docs/specs/plans/SOL-79.md`, card 8.

## Decisions taken during review

- **Foco atual tie.** The API has no creation date for a cofrinho. When two cofrinhos share the nearest deadline, the badge goes to the first one in API order (`done`, then name), not to the one created first. Adding `created_at` to the contract for a tie-break was not worth a contract change.
- **Installments count as automatic contributions.** `next_contribution` reads any series feeding the cofrinho, so a parcelado deposit also shows `Aporte automático: … todo dia dd` with the next parcela's amount.
- **No `Sem meta` badge.** §6.3 lists only Foco atual, Longo prazo, Em andamento and Meta batida. A cofrinho without a target wears `Longo prazo`, since it has no finish line.
- **Month switcher on `/economia`.** `+R$ x este mês.` follows the month, so the page gets the shell's month switcher: in the top bar from 1024 px, and in a card under the app bar below 1024 px (§1.4, "as today").
- **Movimentos lists the latest 200.** The movements endpoint takes only `limit` (1..200) with no cursor, so the hero's Movimentos sheet asks for 200. Listing more needs paging in the contract.
