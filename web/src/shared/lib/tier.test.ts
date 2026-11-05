import { describe, expect, it } from "vitest";

import { TIER_LABEL, TIER_ORDER, TIER_STYLE } from "./tier";

describe("tier", () => {
  it("names the five tiers from worst to best as the sheet does", () => {
    expect(TIER_ORDER.map((tier) => TIER_LABEL[tier])).toEqual([
      "Crítico",
      "Atenção",
      "Apertado",
      "Confortável",
      "Folga",
    ]);
  });

  it("maps every tier to its own token classes", () => {
    expect(TIER_STYLE.light_red).toEqual({
      pill: "bg-tier-light-red-soft text-tier-light-red-foreground",
      dot: "bg-tier-light-red",
      text: "text-tier-light-red-foreground",
    });
    expect(new Set(TIER_ORDER.map((tier) => TIER_STYLE[tier].dot)).size).toBe(5);
  });
});
