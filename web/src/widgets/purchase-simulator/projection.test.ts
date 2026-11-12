import { describe, expect, it } from "vitest";

import { forecastFixture, SETTINGS } from "@/test/stub-api";

import { draftRows } from "./draft-rows";
import { projectMonths } from "./projection";

const SIX = draftRows({ kind: "daily", amount: "2400.00", date: "2026-11-10", plan: "installments", count: 6 });

const forecast = (march: string) =>
  forecastFixture("2026-11-10", "2026-11-10", "2027-10-31", [
    ["2026-11-10", "3000.00"],
    ["2027-03-15", march],
    ["2027-03-25", "3000.00"],
  ]);

describe("projectMonths", () => {
  it("runs from today's month to the last parcela's, month-ends before and after, the lowest day after", () => {
    const months = projectMonths(forecast("1500.00"), SIX, SETTINGS);

    expect(months.map(({ month }) => month)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
    ]);
    expect(months[0]).toMatchObject({ endBefore: "3000.00", endAfter: "2600.00", index: 1, parcela: 40_000 });
    expect(months[4]).toMatchObject({
      endBefore: "3000.00",
      endAfter: "1000.00",
      low: { date: "2027-03-15", projected_balance: "-500.00" },
      red: true,
      alreadyRed: false,
      index: 5,
    });
    expect(months[5]).toMatchObject({ endAfter: "600.00", red: false });
  });

  it("tells a month already red without the purchase apart from one it turns red", () => {
    const march = projectMonths(forecast("-100.00"), SIX, SETTINGS)[4];

    expect(march).toMatchObject({ red: false, alreadyRed: true, low: { projected_balance: "-2100.00" } });
  });

  it("is today's month alone for a purchase today, and no parcela in a month before the first", () => {
    const once = draftRows({ kind: "daily", amount: "10.00", date: "2026-11-10", plan: "once", count: 1 });
    expect(projectMonths(forecast("1500.00"), once, SETTINGS)).toHaveLength(1);

    const later = draftRows({ kind: "daily", amount: "10.00", date: "2026-12-10", plan: "once", count: 1 });
    expect(projectMonths(forecast("1500.00"), later, SETTINGS)[0]).toMatchObject({ index: 0, parcela: 0 });
  });
});
