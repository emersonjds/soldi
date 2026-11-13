import { describe, expect, it } from "vitest";

import { hasEnded, installmentOf, lastMonthOf } from "./bill-plan";

describe("installmentOf", () => {
  it("counts the parcela back from the last month", () => {
    expect(installmentOf("2026-12-01", "2027-01-01", 6)).toBe(5);
    expect(installmentOf("2027-01-01", "2027-01-01", 6)).toBe(6);
    expect(installmentOf("2026-08-01", "2027-01-01", 6)).toBe(1);
  });

  it("has no parcela before the first or after the last month", () => {
    expect(installmentOf("2027-02-01", "2027-01-01", 6)).toBeNull();
    expect(installmentOf("2026-07-01", "2027-01-01", 6)).toBeNull();
  });
});

describe("lastMonthOf", () => {
  it("starts the next parcela this month while its due date is ahead", () => {
    expect(lastMonthOf("2026-11-12", 20, 6, 4)).toBe("2026-12-01"); // Nov 5/6, Dec 6/6
    expect(lastMonthOf("2026-11-12", 12, 6, 4)).toBe("2026-12-01"); // due today still counts
    expect(lastMonthOf("2026-11-12", 10, 6, 4)).toBe("2027-01-01"); // Dec 5/6, Jan 6/6
  });

  it("clamps the due day to the month's last day", () => {
    expect(lastMonthOf("2027-02-28", 31, 2, 0)).toBe("2027-03-01");
  });
});

describe("hasEnded", () => {
  it("ends a bill whose last month is behind", () => {
    expect(hasEnded({ last_month: "2026-10-01" }, "2026-11-12")).toBe(true);
    expect(hasEnded({ last_month: "2026-11-01" }, "2026-11-12")).toBe(false);
    expect(hasEnded({ last_month: null }, "2026-11-12")).toBe(false);
    expect(hasEnded({}, "2026-11-12")).toBe(false);
  });
});
