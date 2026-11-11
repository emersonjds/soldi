# SOL-84 — Lançar, Stitch fidelity

Build: `docs/specs/2026-11-11-stitch-fidelity.md` §3. This file records what the review decided on top of it.

## Keypad entry

The on-screen keypad (§3.8) enters like a calculator, not bank-style.

- Digits before `,` are reais; after `,` up to two digits are cents. Value = reais + cents padded right with `0`, through `maskAmount` (strings only): `12 , 5` → `12,50`; `3 5` → `35,00`; `1 2 3 4 5 , 6 7` → `12.345,67`.
- Ignored: a second `,`, a third cent, an eleventh real digit (NUMERIC(12,2)).
- `Apagar` removes the last typed key: `12,5` → `12,` → `12` → `1` → empty.
- The typed keys live in the keypad. When the value changes outside it (hardware typing, paste, reset after save, Editar prefill), the next press reseeds the keys from the value: its reais without leading zeros, then `,` and its cents without trailing zeros, if any (`12.50` → `12,5`, `35.00` → `35`, `0.35` → `,35`).
- Hardware keys and paste keep the bank-style right-fill mask.

## Keypad placement

- On touch under 1024px the keypad docks in the pinned footer, right above `Salvar Lançamento` (above `Lançar de verdade` / `Descartar` while simulating), with the whole form scrolling above it; reason: under the note it fell below the fold at 375×812, out of reach.

## Amount size

The hero amount steps down so the widest value (`9.999.999.999,99`) stays inside its `w-48` box at 375 with mirror and caret aligned: `text-[34px]` up to 10 characters, `text-[26px]` up to 13, `text-xl` above; the box clips.

## Editar

Editar keeps the sheet description for screen readers only; `Cadastre…` shows only for a new launch.
