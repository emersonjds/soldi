import { afterEach, describe, expect, it, vi } from "vitest";

import { applyPalette, PALETTE_KEY, PALETTES, paletteBootScript } from "./palettes";

const boot = () => new Function(paletteBootScript)();

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.palette;
});

describe("palettes", () => {
  it("lists the eight palettes with Mel e menta first, keyed in soldi-palette", () => {
    expect(PALETTES.map(({ value }) => value)).toEqual([
      "mel",
      "violeta",
      "ameixa",
      "indigo",
      "petroleo",
      "berinjela",
      "marinho",
      "floresta",
    ]);
    expect(PALETTES[1]).toEqual({
      value: "violeta",
      name: "Violeta original",
      hero: "#2a2775",
      brand: "#5341cd",
      soft: "#edecff",
    });
    expect(PALETTE_KEY).toBe("soldi-palette");
  });

  it("sets data-palette on <html>, and removes it for Mel e menta", () => {
    applyPalette("marinho");
    expect(document.documentElement.dataset.palette).toBe("marinho");

    applyPalette("mel");
    expect(document.documentElement.dataset.palette).toBeUndefined();
  });
});

describe("boot script", () => {
  it("applies a stored palette from the allowed list", () => {
    localStorage.setItem("soldi-palette", "floresta");
    boot();
    expect(document.documentElement.dataset.palette).toBe("floresta");
  });

  it("does nothing for an unknown value, the default or nothing stored", () => {
    for (const stored of ["roxo", "mel", null]) {
      if (stored) localStorage.setItem("soldi-palette", stored);
      boot();
      expect(document.documentElement.dataset.palette).toBeUndefined();
    }
  });

  it("does nothing when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(boot).not.toThrow();
    expect(document.documentElement.dataset.palette).toBeUndefined();
  });
});
