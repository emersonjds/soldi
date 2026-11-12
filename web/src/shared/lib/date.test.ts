import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  dayMonth,
  isMonth,
  isoWeekStart,
  monthName,
  monthYear,
  repeatDates,
  slashDate,
  weekdayName,
} from "./date";

describe("week dates", () => {
  it("adds days across a year, names the weekday and finds the ISO week's Monday in UTC", () => {
    expect(addDays("2026-12-31", 7)).toBe("2027-01-07");
    expect(addDays("2026-11-12", -3)).toBe("2026-11-09");
    expect(weekdayName("2026-11-12")).toBe("quinta-feira");
    expect(isoWeekStart("2026-11-15")).toBe("2026-11-09");
    expect(isoWeekStart("2026-11-09")).toBe("2026-11-09");
    expect(slashDate("2026-12-24")).toBe("24/12/2026");
  });
});

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

  it("dates the copies of a repeat like the server, clamped to short months", () => {
    expect(repeatDates("2027-01-31", 4)).toEqual(["2027-02-28", "2027-03-31", "2027-04-30"]);
    expect(repeatDates("2028-01-31", 2)).toEqual(["2028-02-29"]);
    expect(repeatDates("2026-11-05", 1)).toEqual([]);
  });
});

describe("isMonth", () => {
  it("takes YYYY-MM from 2000 to 2100 only", () => {
    expect(isMonth("2026-11")).toBe(true);
    expect(isMonth("2000-01")).toBe(true);
    expect(isMonth("2100-12")).toBe(true);
    expect(isMonth("1999-12")).toBe(false);
    expect(isMonth("2101-01")).toBe(false);
    expect(isMonth("9999-01")).toBe(false);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth(null)).toBe(false);
  });
});
