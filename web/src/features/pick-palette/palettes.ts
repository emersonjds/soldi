export type Palette = { value: string; name: string; hero: string; brand: string; soft: string };

export const DEFAULT_PALETTE = "mel";

export const PALETTE_KEY = "soldi-palette";

/** SOL-184: the palettes of `styles/presets/palettes.css`; "mel" is the preset's own tokens. */
export const PALETTES: Palette[] = [
  { value: "mel", name: "Mel e menta", hero: "#ffffff", brand: "#357a6d", soft: "#e6f1ee" },
  { value: "ameixa", name: "Ameixa e mel", hero: "#3a2758", brand: "#5b3d8f", soft: "#efe9f7" },
  { value: "indigo", name: "Índigo e menta", hero: "#1e1b4b", brand: "#1f7a63", soft: "#e4f2ed" },
  { value: "petroleo", name: "Petróleo e coral", hero: "#0f3b3d", brand: "#14706a", soft: "#e2f1ef" },
  { value: "berinjela", name: "Berinjela e pêssego", hero: "#3d1d3a", brand: "#8a3a6c", soft: "#f6e8f0" },
  { value: "marinho", name: "Marinho e mel", hero: "#13294b", brand: "#2456a4", soft: "#e6eefa" },
  { value: "floresta", name: "Floresta e terracota", hero: "#1d3d2c", brand: "#2e6b47", soft: "#e6f1ea" },
];

export const applyPalette = (value: string) => {
  if (value === DEFAULT_PALETTE) delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = value;
};

const allowed = PALETTES.map(({ value }) => value).filter((value) => value !== DEFAULT_PALETTE);

/** Inline in <head>, before paint; the server hashes it for the CSP, so it must stay static. */
export const paletteBootScript = `(function(){try{var p=localStorage.getItem(${JSON.stringify(PALETTE_KEY)});if(${JSON.stringify(allowed)}.indexOf(p)>=0)document.documentElement.dataset.palette=p}catch(e){}})()`;
