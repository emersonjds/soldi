# Usability audit: everyday flows against the market benchmark (SOL-146)

2026-11-14. Real stack (developer @ 4e8ebdb, `web/out` served by soldi-server, PostgreSQL 17 in Docker), light theme, 375x812 and 1440x900 (plus 1024x900 for the Categorias form). Yardstick: the 10 rules and the anti-patterns in [2026-11-14-market-benchmark.md](2026-11-14-market-benchmark.md) (cited as R1..R10, AP). Screenshots in [2026-11-14-audit/](2026-11-14-audit/), named `<screen>-<width>.png`.

Seed: account "Ana Souza", opening 2026-10-01 with R$ 3.500,00; contas fixas Aluguel, Internet, Luz, Plano de saúde; card Nubank (fecha 3, vence 10); 38 entries over Out/Nov across Entrada/Conta/Diário with subcategories, an open-ended Salário, a Notebook in 10 parcelas on the card, a Spotify subscription on the card, two cofrinhos (Reserva de emergência, Viagem Japão). First access was driven through the UI with a fresh account at each width.

Tap counts: typing (amount, names) counts as zero taps, as in the benchmark; a scroll needed to reach a button is noted separately.

## Tap counts today

| Task | Taps today | Path | Benchmark best |
|---|---|---|---|
| Log a Diário spend in an existing sub | **4** | Lançar → Alimentação → Mercado → Salvar Lançamento (Diário is the default tab, keypad focused) | Toshl 4 |
| Log in a new sub | **8 + 1 scroll** | Lançar → Alimentação → Ver todas → Nova categoria → Subcategoria → pick Alimentação again (not prefilled) → scroll ~700 px → Criar Categoria → Salvar Lançamento. Comes back with the new sub selected (good). | Revolut/Toshl: "+" in the list, ~4 |
| Add a card | **8** (375) / 7 (1440 sidebar) | Ajustes → Contas fixas → Nova Conta Fixa → Cartão de crédito switch → (type Fecha dia) → Dia chip → Categoria select (open + pick, "Escolha uma categoria") → Salvar Conta Fixa | Mobills ~4 from the card list |
| Add a conta fixa | **5** (category silently "Casa") / 7 with the right category | Ajustes → Contas fixas → Nova Conta Fixa → Dia chip → Salvar Conta Fixa | Organizze "Repetir > fixo > mensal" 3 inside the form |
| Find last month's spending by category | **2** | Para onde vai → Mês anterior | ok |
| Open an entry to edit it | **2** | entry → Editar (action sheet first) | Nubank 1 (R7) |

## Owner's complaints (verbatim, high)

| # | Complaint | Evidence | Rule broken | Simplest fix |
|---|---|---|---|---|
| O1 | Categorias & Subcategorias header copy "Organize seus lançamentos por tipo de fluxo financeiro com paleta de cores e ícones do design system Soldi." is useless. | `categorias-375.png`, `categorias-1440.png` | AP jargon; talks about the design system, not the user's task | Replace with one task line: "Toque num grupo para editar. Use + para criar uma subcategoria." |
| O2 | Lançar's category chip row with a check badge should be a visible list where each group has a + to add a subcategory right there. | `lancar-diario-375.png` (row clipped after Saúde; Família, Lazer hidden off-screen, no scroll affordance; check badge on the chip), `lancar-diario-sub-375.png` (Sub row has no +), `fluxo-b-1-sem-mais-na-sub-375.png` | R1, R2, AP check badges, AP list behind "Ver todas" | Render groups as a visible list (icon + name, subs as chips under the chosen group) with a "+ Nova" chip at the end of each Sub row that opens the short create sheet with the parent prefilled; drop the check badge, show the pick as the selected style only. |
| O3 | "Nova Categoria" scrolls down to a side form instead of opening the form. | `categorias-nova-1440.png` (button only moves focus into the always-open docked form; Criar Categoria at y≈1410 below the 900 px fold), `categorias-depois-nova-1024.png` (at 1024 it does open a dialog: two behaviours for one button) | AP scroll-to-form, AP Save below the fold | Remove the docked side form; "Nova Categoria" and every "+ Adicionar subcategoria" open the same sheet/dialog at every width, with a sticky Criar. |

## Findings per screen

Severity: H high, M medium, L low.

### First access (sign-up → onboarding → tour)

- **M** Eleven screens before the first log: Criar conta, 4 onboarding steps (Moeda, Saldo, Contas fixas, Tudo pronto), 4 tour cards, then Lançar. Two different "Passo 1 de 4" sequences back to back read as a loop. `acesso-2-onboarding-boas-vindas-375.png`, `acesso-6-tour-1-375.png`. R10. Fix: drop the Moeda step (BRL default, change in Ajustes) and fold the tour into one dismissible card on Mês. Taps to first log today: 11.
- **M** Contas fixas step shows 26 flat chips "Casa › Água", "Casa › Aluguel"... with no grouping; placeholders "Aluguel" and "10" look like typed values. `acesso-4-onboarding-contas-375.png`. R9, AP long single forms. Fix: group chips under their parent (or a select) and use empty placeholders.
- **L** Name is never asked; Mês greets "Olá, novo-375-1794709513318" (e-mail local part). `acesso-8-mes-vazio-375.png`. Fix: optional "Como quer ser chamado?" on Criar conta, or greet without name.
- **L** Empty Mês after the tour shows only the hero; nothing says "lance seu primeiro gasto". `acesso-8-mes-vazio-375.png`. R10. Fix: one empty-state line with a Lançar button under the hero.

### Mês

- **M** Truncation at 375: "Fatur..." (Fatura Nubank) in Contas do Mês, "Notebook · N..." (card name), "Economia › Res...", "Alimentação › C...". `mes-fold-375.png`, `mes-375.png`. ui-ux truncation-strategy. Fix: let the name wrap to two lines; move "Vencido" under the amount.
- **M** Lançamentos opens with future "Previsto · 20 nov" and "15 nov" above "Hoje"; every day repeats "Saldo ao final: … Folga". `mes-375.png`. R8 (one number, then what is coming, then detail). Fix: start at Hoje; put Previsto under a collapsed "Próximos" header; show the day balance only on the last row of the day.
- **L** Card shows as "Nubank · Conta fixa · venceu dia 10/11" in Lançamentos. `mes-375.png`. Fix: label it "Fatura Nubank".
- **L** Próximos meses: Nov and Dez both "7.500" and no "R$" on the tiles. `mes-375.png`. Fix: add the currency symbol; check the December number.
- **L** "Confortá-vel" hyphenated in the Termômetro legend at both widths. `mes-375.png`, `mes-fold-1440.png`. Fix: "Conforto" or allow the label to wrap without hyphens.

### Lançar (Entrada, Conta, Diário)

- **H** O2 above. Chip row hides 2 of 7 Diário groups at 375; Conta clips "Economi". `lancar-diario-375.png`, `lancar-conta-375.png`.
- **H** New sub costs 8 taps and a 700 px scroll; the parent chosen in Lançar is not prefilled in the create form, and the parent list starts with bill groups (Assinaturas, Cartão, Casa...) under a Diário entry. `fluxo-b-2-nova-sub-375.png`, `fluxo-b-2b-pai-escolhido-375.png`, `fluxo-b-3-volta-ao-lancar-375.png`. R2. Fix: "+ Nova" on the Sub row → name only, parent and kind inherited, sticky Criar; 4 taps.
- **M** Parcelado is not a word on the form: a card purchase in 10x is Recorrente → Mensal → Quantas vezes "Outro" → 10, with the per-parcela amount, not the total. `lancar-diario-recorrente-375.png`. R6, AP jargon. Fix: one "Repetir" control with "Todo mês" and "Parcelado em Nx" (total amount, split shown).
- **M** Turning Recorrente on puts Frequência, Quantas vezes and the summary behind the sticky Salvar bar; only a sliver of the first chip shows. `lancar-diario-recorrente-375.png`, `lancar-entrada-recorrente-375.png`. ui-ux fixed-element-offset. Fix: bottom padding equal to the bar and scroll the revealed block into view.
- **M** Silent defaults: Diário opens on "Gasto", Entrada on "Salário", Conta on "Casa", all already checked. A rushed save lands in the wrong category. `lancar-diario-375.png`, `lancar-entrada-375.png`, `lancar-conta-375.png`. R4 (defaults must be the right ones). Fix: default to the last used category of that tab, shown as the selected item, never a generic catch-all.
- **L** Title is "Novo Registro" at 375 and "Novo Lançamento" at 1440; subtitle "Cadastre uma movimentação pontual ou recorrente" is jargon. `lancar-diario-375.png`, `lancar-diario-sub-1440.png`. Fix: one title "Lançar"; drop the subtitle.
- **L** "Alimenta-ção" hyphenates under its chip even at 1440 where there is room. `lancar-diario-sub-1440.png`. Fix: no hyphenation, wider chip label or 2-line wrap on word boundary.
- **L** Ver todas lists groups in usage order with bill groups (Educação, Saúde) mixed into Diário; "Nova categoria" sits at the very bottom (good, Revolut pattern) but there is no "+" per group. `lancar-ver-todas-375.png`. R1, R2. Fix: alphabetical groups with recents on top, "+ subcategoria" on each group row.
- **L** Personalizar (pin up to 8) duplicates what usage ordering already does and adds a third control next to Ver todas. `lancar-personalizar-375.png`. R1 (recents only sort). Fix: drop it once the full list is the picker.

### Editing an entry

- **M** Tapping an entry opens an action sheet (title repeated twice, Editar / Excluir), not the entry. `editar-lancamento-375.png`. R7. Fix: tap opens the edit form; Excluir lives inside it. 2 taps → 1.

### Fatura sheet

- **L** Clear and well grouped (Assinaturas, Parcelas, Compras, Próximos meses). No "Pagar fatura" in the sheet although it says "Venceu dia 10/11" in red. `fatura-375.png`, `fatura-1440.png`. Fix: a Pagar button at the bottom of the sheet.

### Para onde vai

- **H** November spending has three different totals: Mês "Saídas R$ 3.050,50" (`mes-fold-375.png`), Meu ano "Novembro R$ 3.321,50" (`meu-ano-375.png`), Para onde vai "Total de saídas R$ 3.821,50" with Economia counted as 13,1% "das despesas" (`para-onde-vai-375.png`). Breaks trust in the one number (R8). Fix: one definition of "gasto do mês" used by all three, with Guardado shown apart.
- **L** "-10%", "-56%" green badges have no label (vs. what?). `para-onde-vai-375.png`. Fix: "vs out" caption once above the list.
- OK: last month by category is 2 taps (`para-onde-vai-outubro-375.png`).

### Meu ano

- **L** Readable; "Gastos - R$ 8.753,25" disagrees with Para onde vai's sums (see above). `meu-ano-375.png`, `meu-ano-1440.png`.

### Economia / cofrinhos

- **L** Heavy copy: "POUPANÇA ATIVA & FUTURO", "Protegido", "Meta Global Consolidada", "Reserva Livre R$ 0,00 sem teto fixado", plus a month switcher and a year switcher on the same screen. `economia-375.png`. AP jargon. Fix: "Guardado", "Meta de todos os cofrinhos", hide Reserva Livre when empty, one period control.

### Posso comprar

- **L** "SIMULADOR PREDITIVO", "Modalidade de pagamento", only 6x/10x/12x presets, and a category is required to simulate. `posso-comprar-375.png`. AP jargon. Fix: "Parcelado em" with a number field; category optional.

### Contas fixas (list + form)

- **M** A card is a "Cartão de crédito" switch inside "Nova conta · Despesa Fixa", and then asks "Categoria: Escolha uma categoria" and "Periodicidade: Mensal (todo mês) Fixo". `fluxo-c-cartao-form-375.png`, `contas-fixas-form-375.png`. R5. Fix: "Novo cartão" as its own short form (nome, fecha dia, vence dia), category defaulted to Cartão as the API already does.
- **M** Conta fixa form preselects "Casa" for any name ("Academia" saved under Casa in 5 taps). `fluxo-d-conta-fixa-preenchida-375.png`. R4. Fix: no preselected category, or infer from the name.
- **L** "Próximo Vencimento: Luz · Amanhã" while Fatura Nubank is overdue; a month switcher and a Status filter sit above a 5-item list. `contas-fixas-375.png`. Fix: show the overdue one first; drop the month switcher here.
- **L** Form copy: "Valor mensal fixo estimado", "Dia do vencimento recorrente", single-option "Despesa Fixa" pill that looks like a tab. `contas-fixas-form-375.png`. Fix: "Valor", "Vence dia", drop the pill.

### Ajustes (all sections)

- **M** At 375 the "Calibragem do Termômetro Financeiro" card squeezes its title and text into a ~90 px column, one word per line ("Calibrage" clipped). `ajustes-375.png`. ui-ux layout. Fix: badge under the title, not beside it.
- **M** One 4.400 px page holds Termômetro, Moeda & Saldo inicial, Organização, Zona de Perigo (bulk delete with CONFIRMAR) and Minha Conta; the dedicated sub-pages exist (`ajustes-termometro`, `ajustes-moeda`, `ajustes-saldo-inicial`, `ajustes-apagar`, `ajustes-conta`) but render the same long page. `ajustes-375.png`, `ajustes-termometro-375.png`. ui-ux content-priority, destructive-nav-separation. Fix: Ajustes as a list of rows linking to each section; Zona de Perigo last.
- **L** Month switcher on Ajustes, Categorias and Contas fixas, where nothing depends on the month for the user's task. `ajustes-375.png`, `categorias-375.png`, `contas-fixas-375.png`. Fix: hide it on settings routes.

### Categorias & Subcategorias

- **H** O1, O3 above.
- **H** The Nova Categoria form is jargon-heavy and long: "Configuração" badge, "Categoria Pai / Subcategoria", "Nome do agrupador", "Tipo de Fluxo", "Cor de Destaque", "Ícone Representativo", "Prévia em tempo real"; Criar below the fold at 375, 1024 and 1440. `lancar-nova-categoria-375.png`, `categorias-nova-375.png`, `categorias-depois-nova-1024.png`. AP jargon ("categoria pai"), AP Save below fold. Fix: "Grupo / Subcategoria", "Nome", "Tipo: Diário · Conta · Entrada", color and icon collapsed to one default row, sticky Criar.
- **M** Two stat cards (Estrutura ativa 15, Maior concentração) and the month switcher push the list to y≈800 at 375; the "15 categorias principais" counts all kinds while the tab shows 7. `categorias-375.png`. R9. Fix: drop the stat cards; tabs first.
- **M** Diário tab shows bill groups (Educação, Saúde) labelled "Fixa · 1 subcategoria" because a Diário sub lives under them. `categorias-375.png`. R9. Fix: show only the Diário subs under a muted parent, without the "Fixa" label.
- **L** "+ Adicionar subcategoria" is at the bottom of each card, after its children; Mobills puts it on the parent row. `categorias-375.png`. R9. Fix: "+" on the group header row.

## Top 15 improvements (ranked by impact x effort)

| Rank | Improvement | Impact | Effort | Fixes |
|---|---|---|---|---|
| 1 | "+ Nova" chip at the end of Lançar's Sub row → name-only sheet, parent and kind inherited, returns selected | H | S | O2, new-sub 8 → 4 taps |
| 2 | Categorias header copy → one task line | H | XS | O1 |
| 3 | "Nova Categoria" and "+ subcategoria" open the same sheet at every width; remove the docked side form | H | S | O3 |
| 4 | Plain-language Nova Categoria form with sticky Criar; color and icon collapsed | H | S | jargon, Save below fold |
| 5 | Lançar groups as a visible list (all groups, subs under the chosen one), no check badge, no hidden off-screen chips | H | M | O2, R1 |
| 6 | One definition of "gasto do mês" across Mês, Para onde vai and Meu ano; Guardado apart | H | M | trust, R8 |
| 7 | Tap an entry opens its edit form (Excluir inside) | M | XS | R7, 2 → 1 tap |
| 8 | Recorrente block clears the sticky Salvar bar and scrolls into view | M | XS | hidden options |
| 9 | "Repetir: Todo mês / Parcelado em Nx" with the total amount | M | M | R6 |
| 10 | "Novo cartão" short form (nome, fecha, vence), category defaulted to Cartão | M | S | R5, card 8 → 5 taps |
| 11 | Defaults: last-used category per tab in Lançar; no preselected "Casa" on Conta fixa | M | S | R4 |
| 12 | Ajustes as a list of rows to its existing sub-pages; fix the squeezed Calibragem card | M | S | layout, destructive separation |
| 13 | Categorias: drop stat cards and month switcher, "+" on the group row, no "Fixa" groups in Diário | M | S | R9 |
| 14 | Onboarding: drop Moeda step, grouped categories in Contas fixas, tour as one card on Mês | M | M | R10, 11 → ~6 screens |
| 15 | Truncation/hyphenation and naming: "Fatura Nubank" wraps, "Alimentação"/"Confortável" not hyphenated, one title "Lançar" | L | XS | polish |

## Shippable cards

1. **Lançar: the list is the picker** — items 1, 5, 8, 11 (and the "Lançar" title from 15). Sub row "+ Nova", visible grouped list without check badge, Recorrente clear of the Salvar bar, last-used defaults.
2. **Categorias that explain themselves** — items 2, 3, 4, 13. Header copy, one create sheet at every width, plain-language form with sticky Criar, list first with "+" on the group row.
3. **Fewer steps for cards, parcelas and edits** — items 7, 9, 10. Tap-to-edit, "Repetir: Todo mês / Parcelado em Nx" with total, "Novo cartão" short form.
4. **Trust and tidy** — items 6, 12, 14, 15. One monthly spend number, Ajustes as a list, shorter onboarding, truncation fixes.

## Limits

- Light theme only (owner rule: no dark mode). 375 and 1440 for every screen; 1024 only for Categorias.
- The audit account was seeded through the API; onboarding with an opening date in the past is API-only (the UI fixes the date to today).
- Mid-session the São Paulo date crossed into 15 Nov on the server clock for some screens; "Hoje" labels may read 14 or 15 nov.
