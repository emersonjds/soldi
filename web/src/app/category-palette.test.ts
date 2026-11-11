import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

const preset = readFileSync("src/styles/presets/soldi.css", "utf8");
const palette = new Map([...preset.matchAll(/--(cat-\d+): (#[0-9a-f]{6});/g)].map(([, name, hex]) => [name, hex]));
const card = preset.match(/--card: (#[0-9a-f]{6});/)?.[1] ?? "";
const glyph = "#ffffff";

type Rgb = [number, number, number];
type Matrix = [Rgb, Rgb, Rgb];

const linear = (hex: string): Rgb => {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return [r, g, b];
};

const luminance = (hex: string) => {
  const [r, g, b] = linear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (one: string, other: string) => {
  const [high, low] = [luminance(one), luminance(other)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
};

const multiply = (matrix: Matrix, [r, g, b]: Rgb): Rgb => {
  const [x, y, z] = matrix.map((row) => row[0] * r + row[1] * g + row[2] * b);
  return [x, y, z];
};

const oklab = (rgb: Rgb) => {
  const [l, m, s] = multiply(
    [
      [0.4122214708, 0.5363325363, 0.0514459929],
      [0.2119034982, 0.6806995451, 0.1073969566],
      [0.0883024619, 0.2817188376, 0.6299787005],
    ],
    rgb,
  ).map(Math.cbrt);
  return multiply(
    [
      [0.2104542553, 0.793617785, -0.0040720468],
      [1.9779984951, -2.428592205, 0.4505937099],
      [0.0259040371, 0.7827717662, -0.808675766],
    ],
    [l, m, s],
  );
};

// Machado, Oliveira & Fernandes (2009), severity 1.0, the model the dataviz palette validator uses.
const VISION: Record<string, (rgb: Rgb) => Rgb> = {
  normal: (rgb) => rgb,
  protan: (rgb) =>
    multiply(
      [
        [0.152286, 1.052583, -0.204868],
        [0.114503, 0.786281, 0.099216],
        [-0.003882, -0.048116, 1.051998],
      ],
      rgb,
    ),
  deutan: (rgb) =>
    multiply(
      [
        [0.367322, 0.860646, -0.227968],
        [0.280085, 0.672501, 0.047413],
        [-0.01182, 0.04294, 0.968881],
      ],
      rgb,
    ),
  tritan: (rgb) =>
    multiply(
      [
        [1.255528, -0.076749, -0.178779],
        [-0.078411, 0.930809, 0.147602],
        [0.004733, 0.691367, 0.3039],
      ],
      rgb,
    ),
};

/** OKLab distance (0..1) between two colors as a viewer with that vision sees them. */
const distance = (one: string, other: string, vision = "normal") => {
  const unit = (channel: number) => Math.min(1, Math.max(0, channel));
  const clamp = ([r, g, b]: Rgb): Rgb => [unit(r), unit(g), unit(b)];
  const [a, b] = [one, other].map((hex) => oklab(clamp(VISION[vision](linear(hex)))));
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};

const pairs = (names: string[]) => names.flatMap((name, index) => names.slice(index + 1).map((other) => [name, other]));
const hex = (name: string) => palette.get(name) ?? "";
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => `cat-${from + index}`);

/** A new account's Diário holds 15 categories painted cat-1..cat-15 (crates/soldi-server/src/categories/domain.rs). */
const SEEDED_KIND = range(1, 15);

describe("category palette", () => {
  it("ships the 24 tokens", () => {
    expect([...palette.keys()]).toEqual(range(1, 24));
  });

  it.each(range(1, 24))("%s reaches 3:1 against the card and under its white glyph", (name) => {
    expect(contrast(hex(name), card)).toBeGreaterThanOrEqual(3);
    expect(contrast(hex(name), glyph)).toBeGreaterThanOrEqual(3);
  });

  it("keeps every two of the 24 tokens at least 0.05 apart in OKLab", () => {
    for (const [one, other] of pairs(range(1, 24))) {
      expect(distance(hex(one), hex(other)), `${one} ${other}`).toBeGreaterThanOrEqual(0.05);
    }
  });

  it.each(["protan", "deutan"])(
    "keeps the 15 colors of a seeded kind at least 0.03 apart under %s vision",
    (vision) => {
      for (const [one, other] of pairs(SEEDED_KIND)) {
        expect(distance(hex(one), hex(other), vision), `${one} ${other}`).toBeGreaterThanOrEqual(0.03);
      }
    },
  );

  it("keeps the 12 defaults at least 0.05 apart under tritan vision", () => {
    for (const [one, other] of pairs(range(1, 12))) {
      expect(distance(hex(one), hex(other), "tritan"), `${one} ${other}`).toBeGreaterThanOrEqual(0.05);
    }
  });
});
