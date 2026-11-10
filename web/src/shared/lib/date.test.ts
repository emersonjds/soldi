import { describe, expect, it } from "vitest";

import { dayMonth, monthYear } from "./date";

describe("monthYear", () => {
  it("writes a deadline as the month and year", () => {
    expect(monthYear("2027-06-30")).toBe("jun 2027");
    expect(monthYear("2026-12-01")).toBe("dez 2026");
  });

  it("writes a date as DD/MM", () => {
    expect(dayMonth("2026-11-02")).toBe("02/11");
  });
});
