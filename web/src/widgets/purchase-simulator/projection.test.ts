import { describe, expect, it } from "vitest";

import { forecastFixture, SETTINGS } from "@/test/stub-api";

import { draftRows } from "./draft-rows";
import { projectedUntil, projectMonths } from "./projection";

const SIX = draftRows({ amount: "2400.00", date: "2026-11-10", count: 6 });
const NUBANK = { closing_day: 5, due_day: 15 };

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
    const once = draftRows({ amount: "10.00", date: "2026-11-10", count: 1 });
    expect(projectMonths(forecast("1500.00"), once, SETTINGS)).toHaveLength(1);

    const later = draftRows({ amount: "10.00", date: "2026-12-10", count: 1 });
    expect(projectMonths(forecast("1500.00"), later, SETTINGS)[0]).toMatchObject({ index: 0, parcela: 0 });
  });

  it("gives the remainder cent to the last parcela of an uneven split", () => {
    const ten = draftRows({ amount: "1000.01", date: "2026-11-10", count: 10 });
    const months = projectMonths(forecast("1500.00"), ten, SETTINGS);

    expect(months).toHaveLength(10);
    expect(months[8]).toMatchObject({ index: 9, parcela: 10_000 });
    expect(months[9]).toMatchObject({ month: "2027-08", index: 10, parcela: 10_001, endAfter: "1999.99" });
  });

  it("puts each card parcela in its fatura's month, today's month untouched", () => {
    const three = draftRows({ amount: "900.00", date: "2026-11-10", count: 3, card: NUBANK });
    const months = projectMonths(forecast("1500.00"), three, SETTINGS);

    expect(months.map(({ month, index }) => [month, index])).toEqual([
      ["2026-11", 0],
      ["2026-12", 1],
      ["2027-01", 2],
      ["2027-02", 3],
    ]);
    expect(months[0].endAfter).toBe("3000.00");
    expect(months[3]).toMatchObject({ parcela: 30_000, endAfter: "2100.00" });
  });

  it("stops at the forecast's last month when a fatura lands after it", () => {
    const twelve = draftRows({ amount: "1200.00", date: "2026-11-10", count: 12, card: NUBANK });

    expect(twelve[11].date).toBe("2027-11-15");
    expect(projectMonths(forecast("1500.00"), twelve, SETTINGS).at(-1)?.month).toBe("2027-10");
  });
});

describe("projectedUntil", () => {
  it("is the forecast's last month when a parcela lands after it, null when every one lands inside", () => {
    const twelve = draftRows({ amount: "1200.00", date: "2026-11-10", count: 12, card: NUBANK });

    expect(projectedUntil(forecast("1500.00"), twelve)).toBe("2027-10");
    expect(projectedUntil(forecast("1500.00"), SIX)).toBeNull();
  });
});
