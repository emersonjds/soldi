import { describe, expect, it } from "vitest";

import { FORECAST, FORECAST_FLAT, FORECAST_LATE_OPENING, forecastFixture, SETTINGS } from "@/test/stub-api";

import { type DraftRow, draftVerdict, isFlat, monthsAhead, withDraft } from "./months-ahead";

describe("monthsAhead", () => {
  it("gives the owner's next six months by their lowest tier and red days", () => {
    expect(monthsAhead(FORECAST, 6)).toEqual([
      { month: "2026-11", lowest: "red", low: "-2916.00", redDays: 7 },
      { month: "2026-12", lowest: "red", low: "-7577.00", redDays: 9 },
      { month: "2027-01", lowest: "red", low: "-7577.00", redDays: 31 },
      { month: "2027-02", lowest: "red", low: "-7577.00", redDays: 28 },
      { month: "2027-03", lowest: "red", low: "-7577.00", redDays: 31 },
      { month: "2027-04", lowest: "red", low: "-7577.00", redDays: 30 },
    ]);
    expect(monthsAhead(FORECAST, 12).at(-1)?.month).toBe("2027-10");
  });

  it("takes the tier of the lowest day, not the last", () => {
    const rising = forecastFixture("2026-11-10", "2026-11-10", "2027-10-31", [
      ["2026-11-10", "1842.10"],
      ["2026-12-05", "2500.00"],
    ]);
    expect(monthsAhead(rising, 3)).toEqual([
      { month: "2026-11", lowest: "light_green", low: "1842.10", redDays: 0 },
      { month: "2026-12", lowest: "light_green", low: "1842.10", redDays: 0 },
      { month: "2027-01", lowest: "green", low: "2500.00", redDays: 0 },
    ]);
  });

  it("finds the low on the month's last day, and in a month with one forecast day", () => {
    const dip = forecastFixture("2026-11-10", "2026-11-10", "2026-12-01", [
      ["2026-11-10", "100.00"],
      ["2026-11-30", "-0.40"],
      ["2026-12-01", "50.00"],
    ]);
    expect(monthsAhead(dip, 2).map(({ month, low }) => [month, low])).toEqual([
      ["2026-11", "-0.40"],
      ["2026-12", "50.00"],
    ]);
  });

  it("leaves the months before the opening date without a tier", () => {
    expect(monthsAhead(FORECAST_LATE_OPENING, 3).map(({ lowest, low }) => [lowest, low])).toEqual([
      [null, null],
      [null, null],
      ["light_green", "1000.00"],
    ]);
  });
});

describe("isFlat", () => {
  it("is true when nothing lands ahead, false otherwise", () => {
    expect(isFlat(FORECAST_FLAT)).toBe(true);
    expect(isFlat(FORECAST)).toBe(false);
  });

  it("is false for a flat red balance: it shows its tier", () => {
    expect(isFlat(forecastFixture("2026-11-10", "2026-11-10", "2027-10-31", [["2026-11-10", "-800.00"]]))).toBe(false);
  });

  it("is false without days: an opening after the horizon has nothing to teach", () => {
    expect(isFlat({ today: "2026-11-10", days: [] })).toBe(false);
  });
});

describe("withDraft", () => {
  it("lowers every day on and after the draft and recolors it", () => {
    const after = withDraft(FORECAST.days, [{ date: "2026-11-12", cents: -100_000 }], SETTINGS);
    const on = (date: string) => after.find((day) => day.date === date);

    expect(on("2026-11-11")).toMatchObject({ projected_balance: "6150.00", projected_tier: "green" });
    expect(on("2026-11-12")).toMatchObject({ projected_balance: "5150.00", projected_tier: "green" });
    expect(on("2026-11-30")).toMatchObject({ projected_balance: "-509.00", projected_tier: "red" });
  });

  it("shifts every day for a draft dated before the forecast starts", () => {
    const after = withDraft(FORECAST_FLAT.days, [{ date: "2026-11-05", cents: -5_000 }], SETTINGS);
    expect(after.every((day) => day.projected_balance === "1792.10")).toBe(true);
  });
});

describe("draftVerdict", () => {
  const verdictOf = (rows: DraftRow[], forecast = FORECAST) =>
    draftVerdict(forecast.days, withDraft(forecast.days, rows, SETTINGS));

  it("names the first day the draft turns red and its balance after the draft", () => {
    expect(verdictOf([{ date: "2026-11-10", cents: -670_000 }])).toEqual({
      kind: "turns-red",
      date: "2026-11-10",
      balance: "-550.00",
    });
  });

  it("says when red days were already there", () => {
    expect(verdictOf([{ date: "2026-11-24", cents: -10_000 }])).toEqual({ kind: "already-red" });
  });

  it("is clear when no day is red", () => {
    expect(verdictOf([{ date: "2026-11-10", cents: -5_000 }], FORECAST_FLAT)).toEqual({ kind: "clear" });
  });
});
