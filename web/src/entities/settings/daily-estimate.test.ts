import { describe, expect, it } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { forecastFixture, MONTH, SETTINGS } from "@/test/stub-api";

import { activeEstimate, includesEstimate } from "./daily-estimate";

const ON: Schemas["Settings"] = { ...SETTINGS, daily_estimate: "50.00", daily_estimate_on: true };
const OFF: Schemas["Settings"] = { ...ON, daily_estimate_on: false };

const lastDay = (rest: Partial<Schemas["Day"]>): Schemas["MonthView"] => ({
  ...MONTH,
  days: [...MONTH.days.slice(0, -1), { ...MONTH.days[MONTH.days.length - 1], ...rest }],
});

describe("activeEstimate", () => {
  it("is null when never set or off, the value when on", () => {
    expect(activeEstimate(SETTINGS)).toBeNull();
    expect(activeEstimate(OFF)).toBeNull();
    expect(activeEstimate(ON)).toBe("50.00");
  });
});

describe("includesEstimate", () => {
  it("counts a month whose last day is still ahead", () => {
    expect(includesEstimate(ON, lastDay({ is_future: true, is_today: false }))).toBe(true);
    expect(includesEstimate(ON, lastDay({ is_future: false, is_today: true }))).toBe(false);
    expect(includesEstimate(ON, lastDay({ is_future: false, is_today: false }))).toBe(false);
    expect(includesEstimate(OFF, lastDay({ is_future: true }))).toBe(false);
  });

  it("counts a forecast that runs past today", () => {
    const ahead = forecastFixture("2026-11-10", "2026-11-10", "2026-11-12", [["2026-11-10", "100.00"]]);
    const onlyToday = forecastFixture("2026-11-10", "2026-11-10", "2026-11-10", [["2026-11-10", "100.00"]]);

    expect(includesEstimate(ON, ahead)).toBe(true);
    expect(includesEstimate(ON, onlyToday)).toBe(false);
    expect(includesEstimate(SETTINGS, ahead)).toBe(false);
  });
});
