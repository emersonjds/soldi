import { describe, expect, it } from "vitest";

import { FORECAST, FORECAST_FLAT, FORECAST_LATE_OPENING, forecastFixture } from "@/test/stub-api";

import { isFlat, monthsAhead } from "./months-ahead";

describe("monthsAhead", () => {
  it("gives the owner's next six months by their lowest tier and red days", () => {
    expect(monthsAhead(FORECAST, 6)).toEqual([
      { month: "2026-11", lowest: "red", redDays: 7 },
      { month: "2026-12", lowest: "red", redDays: 9 },
      { month: "2027-01", lowest: "red", redDays: 31 },
      { month: "2027-02", lowest: "red", redDays: 28 },
      { month: "2027-03", lowest: "red", redDays: 31 },
      { month: "2027-04", lowest: "red", redDays: 30 },
    ]);
    expect(monthsAhead(FORECAST, 12).at(-1)?.month).toBe("2027-10");
  });

  it("takes the tier of the lowest day, not the last", () => {
    const rising = forecastFixture("2026-11-10", "2026-11-10", "2027-10-31", [
      ["2026-11-10", "1842.10"],
      ["2026-12-05", "2500.00"],
    ]);
    expect(monthsAhead(rising, 3)).toEqual([
      { month: "2026-11", lowest: "light_green", redDays: 0 },
      { month: "2026-12", lowest: "light_green", redDays: 0 },
      { month: "2027-01", lowest: "green", redDays: 0 },
    ]);
  });

  it("leaves the months before the opening date without a tier", () => {
    expect(monthsAhead(FORECAST_LATE_OPENING, 3).map((ahead) => ahead.lowest)).toEqual([null, null, "light_green"]);
  });
});

describe("isFlat", () => {
  it("is true when nothing lands ahead, false otherwise", () => {
    expect(isFlat(FORECAST_FLAT)).toBe(true);
    expect(isFlat(FORECAST)).toBe(false);
    expect(isFlat({ today: "2026-11-10", days: [] })).toBe(true);
  });
});
