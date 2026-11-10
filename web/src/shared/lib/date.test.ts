import { describe, expect, it } from "vitest";

import { addMonths, dayMonth, monthName, monthYear } from "./date";

describe("monthYear", () => {
  it("writes a deadline as the month and year", () => {
    expect(monthYear("2027-06-30")).toBe("jun 2027");
    expect(monthYear("2026-12-01")).toBe("dez 2026");
  });

  it("writes a date as DD/MM", () => {
    expect(dayMonth("2026-11-02")).toBe("02/11");
  });

  it("names a month, with its year when it is not the viewed one's", () => {
    expect(monthName("2026-10-10", "2026-11")).toBe("outubro");
    expect(monthName("2025-12-05", "2026-01")).toBe("dezembro de 2025");
    expect(monthName("2026-03", "2026-03")).toBe("março");
  });

  it("adds months across a year", () => {
    expect(addMonths("2026-11", 0)).toBe("2026-11");
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-12", 11)).toBe("2027-11");
  });
});
