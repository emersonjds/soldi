import { describe, expect, it } from "vitest";

import { TIER_LABEL, TIER_ORDER, TIER_STYLE, tierOf } from "./tier";

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
    });
    expect(new Set(TIER_ORDER.map((tier) => TIER_STYLE[tier].dot)).size).toBe(5);
  });

  it("places a balance with the server's lower bounds", () => {
    const bounds = { tier_red: "-500.00", tier_zero: "0", tier_yellow: "1000.5", tier_green: "2000.00" };
    expect(tierOf("-500.01", bounds)).toBe("red");
    expect(tierOf("-500", bounds)).toBe("light_red");
    expect(tierOf("-0.01", bounds)).toBe("light_red");
    expect(tierOf("0.00", bounds)).toBe("yellow");
    expect(tierOf("1000.49", bounds)).toBe("yellow");
    expect(tierOf("1000.50", bounds)).toBe("light_green");
    expect(tierOf("2000", bounds)).toBe("green");
  });
});
