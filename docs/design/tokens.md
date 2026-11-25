# Design tokens — from the approved Stitch design (2026-11-05)

Source: `docs/design/stitch/*.png` (approved by the owner) and the `tailwind.config` embedded in `docs/design/stitch/*.html`. Stitch project `projects/3056615737483773672` ("Soldi Finance App UI"). Screens: `mes-mobile-home`, `mes-dashboard`, `lancar-bottom-sheet-mobile`, `lancar-modal-desktop`, `para-onde-vai-mobile-analytics`, `para-onde-vai-analytics`, `economia-mobile-anual`, `economia-anual`.

The `designer` agent maps these onto the template's shadcn semantic tokens in `web/src/styles/presets/soldi.css` (light only). Raw hex lives only there; components use the semantic names.

## Color

"Mel, pêssego e menta" palette (D51, SOL-181). Contrast pairs are asserted in `web/src/app/palette.test.ts`.

| Role | Light | Notes |
|------|-------|-------|
| background | `#FFFFFF` | app background |
| card | `#FFFFFF` | radius 16px, shadow `0 4px 16px rgb(31 35 40 / .06)` |
| secondary / muted | `#F3F4F2` | inputs, chips, segmented control track, the auth page behind the sheet from `lg` |
| accent | `#ECEDEA` | hover over a surface or a chip |
| foreground | `#1F2328` | primary text; 15.80:1 on white, 14.32:1 on secondary, 13.68:1 on brand-soft |
| muted-foreground | `#5F6670` | captions; 5.80:1 on white, 5.26:1 on secondary, 5.02:1 on brand-soft |
| primary / brand / ring | `#357A6D` | the one accent: links, active nav, primary buttons, "Lançar", focus ring; white on it 5.05:1 |
| brand-hover | `#2C6A5E` | hover; white on it 6.31:1; brand text on brand-soft (5.46:1, `#357A6D` there is 4.37:1) |
| brand-soft | `#E6F1EE` | active sidebar item, brand tint surfaces |
| hero / hero-foreground / hero-chip | `#FFFFFF` / `#1F2328` / `#F3F4F2` | flat hero (`bg-hero text-hero-foreground`, secondary text `/80`): `Mês` hero below 1024 (from 1024 the card), `Para onde vai` header, auth and onboarding top and the `lg` page behind their sheet; `hero-chip` = avatar and month-switcher pill on the hero. Per palette below |
| logo-1..5 | `#F2D38A` `#F2B48C` `#8CC5B0` `#5FA894` `#357A6D` | the five dots of the logo mark. Per palette below |
| income | `#16A34A` on `#DCFCE7` | entradas, "Pago" |
| income-text | `#15803D` on white, 5.02:1 | income amounts (`Money income`), the Entradas total, a cofrinho's gain; `income` stays for fills and icons (3.30:1 on white) |
| expense | `#DC2626` on `#FEE2E2` | saídas, "Vencido", negative projected |
| destructive | `#BA1A1A` | delete, "Sair" |
| border / input | `#E6E7EA` | dividers, outlines |
| shadow | `rgb(31 35 40 / a)` | same alphas as before, `sm`/default `.06`, `lg` `.12` |
| split-daily | `#0891B2` | `SplitBar` Diário segment only (D21); 3:1 on white |

## Palettes (D52)

Picked per device in Ajustes (`localStorage` `soldi-palette`, `data-palette` on `<html>`). `web/src/styles/presets/palettes.css` holds one `:root[data-theme-preset="soldi"][data-palette="<value>"]` block per row; no value = the `soldi.css` default. Each block sets `brand`, `primary`, `ring`, `sidebar-primary`, `sidebar-ring`, `chart-1` = brand; `brand-hover`, `sidebar-accent-foreground` = brand ink; `brand-soft`, `sidebar-accent` = soft; `hero`, `hero-foreground`, `hero-chip`; `wordmark`; `logo-1..5`. Tiers, income/expense, categories, neutrals and the white page never change. `palette.test.ts` holds every row to 4.5:1 for white on brand and brand ink, brand ink on soft, hero-foreground on hero and wordmark on white.

| value | Name (pt-BR) | hero | hero-fg | hero-chip | brand | brand ink | soft | wordmark |
|---|---|---|---|---|---|---|---|---|
| (none) | Mel e menta | `#ffffff` | `#1f2328` | `#f3f4f2` | `#357a6d` | `#2c6a5e` | `#e6f1ee` | `#555f6e` |
| `ameixa` | Ameixa e mel | `#3a2758` | `#ffffff` | `rgb(255 255 255 / 0.12)` | `#5b3d8f` | `#4a2f78` | `#efe9f7` | `#4a3d5c` |
| `indigo` | Índigo e menta | `#1e1b4b` | `#ffffff` | `rgb(255 255 255 / 0.12)` | `#1f7a63` | `#1a6653` | `#e4f2ed` | `#2b2f55` |
| `petroleo` | Petróleo e coral | `#0f3b3d` | `#ffffff` | `rgb(255 255 255 / 0.12)` | `#14706a` | `#105e59` | `#e2f1ef` | `#24414a` |
| `berinjela` | Berinjela e pêssego | `#3d1d3a` | `#ffffff` | `rgb(255 255 255 / 0.12)` | `#8a3a6c` | `#76305c` | `#f6e8f0` | `#4d3348` |
| `marinho` | Marinho e mel | `#13294b` | `#ffffff` | `rgb(255 255 255 / 0.12)` | `#2456a4` | `#1e4a8e` | `#e6eefa` | `#2a3a55` |
| `floresta` | Floresta e terracota | `#1d3d2c` | `#ffffff` | `rgb(255 255 255 / 0.12)` | `#2e6b47` | `#275c3d` | `#e6f1ea` | `#33443a` |

Logo dots (`logo-1..5`, from the warm tones to the brand color):

| palette | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Mel e menta | `#f2d38a` | `#f2b48c` | `#8cc5b0` | `#5fa894` | `#357a6d` |
| ameixa | `#f2cf7a` | `#f0a988` | `#c7a6e0` | `#8f6cc4` | `#5b3d8f` |
| indigo | `#f2d38a` | `#f2b48c` | `#8cc5b0` | `#3f9a80` | `#1f7a63` |
| petroleo | `#f6d07a` | `#f2956f` | `#7fc4bb` | `#3a958c` | `#14706a` |
| berinjela | `#f4cf86` | `#f2b08c` | `#e39bb8` | `#b5628f` | `#8a3a6c` |
| marinho | `#f2c95e` | `#f2a97a` | `#9dbbe6` | `#5a86cc` | `#2456a4` |
| floresta | `#efcf7e` | `#e4a07a` | `#9cc8a6` | `#5f9a72` | `#2e6b47` |

## Split bar (`SplitBar`, "Para onde foi a entrada")

| Segment | Token |
|---------|-------|
| Contas | `primary` `#357A6D` |
| Guardado | `cat-11` `#16A34A` (Economia's color, D15) |
| Diário | `split-daily` `#0891B2` |
| Livre | `muted` track with a 1px `border` outline |

OKLab ΔE ×100 (Machado 2009, severity 1.0) for Contas–Guardado / Contas–Diário / Guardado–Diário: normal 14.8 / 10.8 / 17.4, protan 14.3 / 11.4 / 16.5, deutan 12.9 / 10.5 / 16.1, tritan 10.7 / 9.8 / 2.7. On white: 5.05, 3.30, 3.68:1. Guardado and Diário sit close under tritan vision (unchanged by D51); the legend labels carry the difference. Amber is out: it reads as the tier `Apertado`. The bar is 12px tall with 4px rounded ends and 2px `card` gaps; widths follow the cents with a 200ms `motion-safe` transition. Text never wears a segment color: the legend is `foreground` beside a 12px swatch, and the bar is `role="img"` with a one-sentence summary.

Soldi ships light only.

## Thermometer tiers (balance pills, strip, labels)

| Tier | Label | Dot / strip | Soft bg | Pill text | Text on soft | Dot on soft (not text) |
|------|-------|-------------|---------|-----------|--------------|------------------------|
| red | Crítico | `#C94A4A` | `#FBE7E7` | `#9B2C2C` | 6.34:1 | 3.88:1 |
| light-red | Atenção | `#DD7A4A` | `#FCEDE3` | `#9A4A1F` | 5.44:1 | 2.64:1 |
| yellow | Apertado | `#D9A93A` | `#FBF3DC` | `#7A5A12` | 5.75:1 | 1.96:1 |
| light-green | Confortável | `#6FAE7F` | `#EAF4EC` | `#2F6B3F` | 5.66:1 | 2.32:1 |
| green | Folga | `#357A6D` | `#E6F1EE` | `#2C6A5E` | 5.46:1 | 4.37:1 |

The five solids stay ≥ 0.05 apart in OKLab for every pair; closest pair ×100: normal 11.6, protan 6.2, deutan 6.7, tritan 10.5. White on the Folga solid is 5.05:1.

Tokens: `--tier-<tier>` (dot, strip), `--tier-<tier>-soft` (pill background), `--tier-<tier>-foreground` (pill text, AA ≥ 4.5:1 on soft). `TIER_STYLE` in `web/src/shared/lib/tier.ts` is the only map; `TierPill` (ledger day headers, Mês header and overview, Simular preview, welcome tour) and the Próximos meses chips all read it. The strong color never carries text: it fills the dot beside the label and the `ThermometerStrip` segments, whose labels sit on the page in `foreground` / `muted-foreground`. The red-days badge on a chip is white on `#DC2626` (4.83:1).

Text on `income-soft` / `expense-soft` (Pago pill, Para onde vai change %, form alerts) uses the tier text tokens: `#2C6A5E` on `#DCFCE7` 5.74:1, `#9B2C2C` on `#FEE2E2` 6.16:1. `income` and `expense` themselves on their soft backgrounds are 3.00:1 and 3.95:1, enough only for icons (3:1), not for text.

The strip under "Termômetro do Mês" shows the five segments and highlights the current one. Color is never alone: the label travels with the pill.

## Category icon circles (40px, white icon)

`cat-1..cat-12` (re-stepped for color blindness in SOL-9, D22), white glyph contrast in parentheses: Mercado `#AB6200` (4.69:1), Comida fora `#F6682E` (3.03:1), Transporte `#2676C8` (4.66:1), Saúde `#A11401` (8.03:1), Lazer `#A855F7` (3.96:1), Aluguel `#4F46E5` (6.29:1), Luz `#B78B00` (3.13:1), Internet `#00A2C7` (3.00:1), Cartão `#FB3194` (3.52:1), Assinaturas `#6A22C8` (7.85:1), Salário `#16A34A` (3.30:1), Extra `#23754C` (5.65:1). Stored as token names `cat-1..cat-12`. Glyph and card are both white, so one ratio covers the glyph on the circle and the circle on the card (WCAG 1.4.11).

`cat-13..cat-24` (SOL-32): Verde-azulado `#0D9488` (3.74:1), Framboesa `#BE185D` (6.04:1), Oliva `#6B7A1F` (4.74:1), Azul-petróleo `#075985` (7.56:1), Ameixa `#86198F` (8.24:1), Marrom `#854D0E` (6.85:1), Ardósia `#64748B` (4.76:1), Verde-escuro `#166534` (7.13:1), Vinho `#881337` (9.57:1), Telha `#C2410C` (5.18:1), Anil `#3730A3` (9.93:1), Malva `#9D4E8C` (5.38:1).

A new account fills a kind from the lowest free token, so its Diário shows 15 categories painted `cat-1..cat-15`; that set, not the twelve owners, is what a user compares. Validator numbers (dataviz `validate_palette.js --pairs all --surface #ffffff` for `cat-1..12`, its ΔE function for the `cat-1..15` rows; OKLab ΔE ×100 under the Machado 2009 simulation at severity 1.0), before → after SOL-9:

| Check | Before | After |
|---|---|---|
| `cat-1..12`, worst pair, protan | 0.3 (Lazer / Assinaturas) | 4.0 (Luz / Salário) |
| `cat-1..12`, worst pair, deutan | 0.9 (Transporte / Lazer) | 3.2 (Comida fora / Luz) |
| `cat-1..12`, worst pair, tritan | 2.7 (Internet / Extra) | 5.3 (Internet / Salário) |
| `cat-1..12`, worst pair, normal vision | 5.1 (Lazer / Assinaturas) | 10.8 (Mercado / Luz) |
| `cat-1..15`, worst pair, protan or deutan | 0.3 (Lazer / Assinaturas) | 3.2 (Mercado / Oliva, Comida fora / Luz) |
| `cat-1..15`, pairs below 6 (protan or deutan) | 12 | 6 |
| `cat-1..15`, worst pair, tritan | 2.6 (Salário / Verde-azulado) | 2.6, both tokens untouched |
| Lowest contrast on white | 1.92:1 (Luz) | 3.00:1 (Internet) |
| Closest pair of all 24, OKLab | 0.0507 (cat-5 / cat-10) | 0.0557 (cat-12 / cat-20) |

The six pairs of `cat-1..15` still below 6 under protan or deutan: Mercado / Oliva 3.2, Comida fora / Luz 3.2, Extra / Framboesa 3.4, Luz / Salário 4.0, Comida fora / Oliva 4.6, Mercado / Extra 5.8. `web/src/app/category-palette.test.ts` locks 3:1, the 0.05 OKLab spread, 3 across `cat-1..15` under protan and deutan, and 5 across `cat-1..12` under tritan.

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

`Money` sizes (spec 2026-11-10 §4.2), parts from `Intl.NumberFormat("pt-BR").formatToParts`:

| `size` | Integer and sign | Symbol and `,cents` | Use |
|--------|------------------|---------------------|-----|
| `row` (default) | inherits | same as the integer | rows, legends, every amount in a list |
| `figure` | 28 / 36 / 700 | 55% of the integer | card figures |
| `hero` | 40 / 48 / 700 at 375, 48 / 56 from `lg` | 55% of the integer | the one headline number |

`figure` and `hero` are bold, `tabular-nums`, tracking -0.02em, one text color for every part, on a shared baseline. Screen readers get one `sr-only` string; the split parts are `aria-hidden`.

## Spacing and shape

8px grid (`space-xs 4, sm 8, md 16, lg 24, xl 32`), page gutter 16px mobile and 24px desktop, cards radius 16px, pills radius full, buttons min-height 44px, inputs 16px text.

## Layout

- Mobile: top bar (wordmark, screen title, avatar), white hero card, overlapping summary card, stacked cards, bottom tab bar with five items and a raised brand "+" FAB in the center.
- Desktop: left sidebar 240px (wordmark + tagline "Seu mês no verde.", "Lançar" button, nav, user card at bottom), content with breadcrumb and search, hero header card, three summary cards overlapping it, two-column body (main 2/3, aside 1/3).
- `Mês` body: "Contas do Mês" card with filter chips (Todas / Pendentes / Pagas), rows icon + name + "Vence dia dd/mm" + amount + pill ("Pago" green, "Pagar" brand soft, "Vencido" red on a tinted row); "Termômetro do Mês" card with strip and one-sentence insight; "Próximos Lançamentos" list grouped by date with day balance pill.
- `Lançar`: segmented Entrada / Conta / Diário, hero amount, category chips, date chips, note, full-width "Salvar".
- `Para onde vai`: a `DashCard` with the donut (total in the center as `Money size="figure"`) and the legend with percentage and delta vs previous month; Top 5 with bars in a second `DashCard`, side by side at 1440; transactions of the selected slice. Empty: the tour illustration, decorative.
- `Economia` is Cofrinhos (SOL-20, D21): the `Guardado` header with `Money size="hero"`, one `DashCard` per cofrinho (two columns at 1440), and `CofrinhoIllustration` in the empty state. The year table (twelve rows with inline "Guardado") is not planned.
