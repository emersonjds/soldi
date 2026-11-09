# Design tokens — from the approved Stitch design (2026-11-05)

Source: `docs/design/stitch/*.png` (approved by the owner) and the `tailwind.config` embedded in `docs/design/stitch/*.html`. Stitch project `projects/3056615737483773672` ("Soldi Finance App UI"). Screens: `mes-mobile-home`, `mes-dashboard`, `lancar-bottom-sheet-mobile`, `lancar-modal-desktop`, `para-onde-vai-mobile-analytics`, `para-onde-vai-analytics`, `economia-mobile-anual`, `economia-anual`.

The `designer` agent maps these onto the template's shadcn semantic tokens in `web/src/styles/presets/soldi.css` (light only). Raw hex lives only there; components use the semantic names.

## Color

| Role | Light | Notes |
|------|-------|-------|
| background | `#FBF8FF` | app background (Stitch `surface`); the brief's `#F4F5FA` is acceptable |
| card | `#FFFFFF` | radius 16px, shadow `0 4px 16px rgba(30,27,75,.08)` |
| surface-container | `#EDECFF` / low `#F4F2FF` / high `#E6E6FF` | inputs, chips, segmented control track |
| foreground | `#151935` | primary text |
| muted-foreground | `#474554` / `#787586` | captions, outlines |
| primary | `#5341CD` | links, active nav, "Ver todas" |
| primary-container (accent) | `#6C5CE7` | FAB, primary buttons, "Lançar", hover `#5A4BD1` |
| header gradient | `#1E1B4B → #312E81` | the month hero on `Mês`, auth top, `Para onde vai` short header |
| income | `#16A34A` on `#DCFCE7` | entradas, "Pago" |
| expense | `#DC2626` on `#FEE2E2` | saídas, "Vencido", negative projected |
| destructive | `#BA1A1A` | delete, "Sair" |
| border | `#C8C4D7` | outline-variant |

Dark: background `#0F1222`, card `#1A1E36`, header `#141734`, foreground `#F0EFFF`, same accent, income, expense and tier colors.

## Thermometer tiers (balance pills, strip, labels)

| Tier | Label | Color | Soft bg |
|------|-------|-------|---------|
| red | Crítico | `#DC2626` | `#FEE2E2` |
| light-red | Atenção | `#F87171` | `#FEE2E2` |
| yellow | Apertado | `#F59E0B` | `#FEF3C7` |
| light-green | Confortável | `#4ADE80` | `#DCFCE7` |
| green | Folga | `#16A34A` | `#DCFCE7` |

The strip under "Termômetro do Mês" shows the five segments and highlights the current one. Color is never alone: the label travels with the pill.

## Category icon circles (40px, white icon)

Mercado `#F59E0B`, Comida fora `#F97316`, Transporte `#3B82F6`, Saúde `#EF4444`, Lazer `#A855F7`, Aluguel `#6366F1`, Luz `#EAB308`, Internet `#06B6D4`, Cartão `#EC4899`, Assinaturas `#8B5CF6`, Salário `#16A34A`, Extra `#22C55E`. Stored as token names `cat-1..cat-12`.

`cat-13..cat-24` (SOL-32), white glyph contrast in parentheses: Verde-azulado `#0D9488` (3.74:1), Framboesa `#BE185D` (6.04:1), Oliva `#6B7A1F` (4.74:1), Azul-petróleo `#075985` (7.56:1), Ameixa `#86198F` (8.24:1), Marrom `#854D0E` (6.85:1), Ardósia `#64748B` (4.76:1), Verde-escuro `#166534` (7.13:1), Vinho `#881337` (9.57:1), Telha `#C2410C` (5.18:1), Anil `#3730A3` (9.93:1), Malva `#9D4E8C` (5.38:1). Each sits at least 0.10 from its nearest palette neighbor in OKLab, twice the closest pair of the first twelve (0.05).

Top-level colors are unique per kind and subcategories wear the parent's (D15).

Icons: Stitch used Material Symbols; the web uses lucide (already in the template) with the names listed in `docs/specs/market-analysis.md`.

## Type (Inter, tabular figures on every amount)

| Token | Size / line / weight |
|-------|---------------------|
| currency-hero / display-hero | 34 / 40 / 700, tracking -0.02em |
| headline-lg | 22 / 28 / 700 |
| headline-md | 18 / 24 / 600 |
| headline-sm | 16 / 24 / 600 |
| body-lg | 16 / 24 / 400 |
| body-md | 14 / 20 / 400 (medium 500) |
| currency-lg | 20 / 28 / 700 |
| currency-md | 16 / 24 / 700 |
| caption-md | 12 / 16 / 500 |
| caption-sm | 11 / 16 / 600, uppercase for section eyebrows |

## Spacing and shape

8px grid (`space-xs 4, sm 8, md 16, lg 24, xl 32`), page gutter 16px mobile and 24px desktop, cards radius 16px, pills radius full, buttons min-height 44px, inputs 16px text.

## Layout

- Mobile: top bar (wordmark, screen title, avatar), indigo hero header, overlapping summary card, stacked cards, bottom tab bar with five items and a raised violet "+" FAB in the center.
- Desktop: left sidebar 240px (wordmark + tagline "Seu mês no verde.", "Lançar" button, nav, user card at bottom), content with breadcrumb and search, hero header card, three summary cards overlapping it, two-column body (main 2/3, aside 1/3).
- `Mês` body: "Contas do Mês" card with filter chips (Todas / Pendentes / Pagas), rows icon + name + "Vence dia dd/mm" + amount + pill ("Pago" green, "Pagar" violet soft, "Vencido" red on a tinted row); "Termômetro do Mês" card with strip and one-sentence insight; "Próximos Lançamentos" list grouped by date with day balance pill.
- `Lançar`: segmented Entrada / Conta / Diário, hero amount, category chips, date chips, note, full-width "Salvar".
- `Para onde vai`: donut with total in the center, legend with percentage and delta vs previous month, Top 5 with bars, transactions of the selected slice.
- `Economia`: year hero with savings total, percentage of income and goal bar; twelve-row table with inline "Guardado".
