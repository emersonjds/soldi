# SOL-27 — Welcome tour: how Soldi works

Owner, 2026-11-05: "ao acessar, monte um step by step de como funciona a ferramenta: saídas, entradas, projeção do fim do mês e a parte de economia".

## Why

The thermometer only makes sense once the user knows the four moving parts. A short tour at first access replaces documentation and sets expectations for the colors.

## Flow (ux; copy final, pt-BR)

Shown once, right after onboarding (and again from `Ajustes › Como funciona`). Four cards with a progress dot row, `Próximo` / `Pular`, last card `Começar`. Each card: one illustration made of the real components (no artwork), a title and two lines.

1. **Entradas** — `Tudo que entra: salário, extras, reembolsos.` Illustration: the Entradas figure in green with `+ R$ 5.000,00`.
2. **Saídas e Diário** — `Contas fixas (aluguel, luz) e gastos do dia a dia (mercado, comida fora). Cada uma com sua categoria para você ver para onde vai.` Illustration: two ledger rows with category icons.
3. **Projeção do fim do mês** — `O Soldi soma o que ainda vai sair (contas em aberto) e mostra como o mês termina antes de acontecer. Verde é folga, vermelho é alerta.` Illustration: the five-segment thermometer strip with the pill `Atenção` on `Projetado`.
4. **Economia** — `Guardar é uma saída em Economia › seu objetivo. O dinheiro sai do mês e aparece nos Cofrinhos com meta e progresso.` Illustration: a cofrinho card at 30%.

Closing: `Começar` goes to `/mes` and opens `Lançar` with the hint `Comece pela sua primeira entrada do mês`.

## Mechanics

- `users.tour_seen_at` (nullable) set by `POST /api/me/tour-seen`; `GET /api/auth/me` returns `tour_seen: bool`. The web shows the tour when `onboarded && !tour_seen`.
- Keyboard: arrows move, Esc skips. Mobile 375 first; cards are full-screen sheets; desktop centered dialog 560px.
- No analytics, no cookies.

## Acceptance

Handler test for the flag; web tests for the four steps, skip and replay from Ajustes; e2e: sign-up → onboarding → tour → `Começar` → `/mes` with `Lançar` open; coverage ≥ 90%.
