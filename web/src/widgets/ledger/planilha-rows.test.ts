import { describe, expect, it } from "vitest";

import { cents } from "@/shared/lib/tier";
import { MONTH, PLANILHA_MONTH } from "@/test/stub-api";

import { planilhaMonths, planilhaRows } from "./planilha-rows";

describe("planilhaMonths", () => {
  it("runs from the opening month when it is later than today's month − 12, to today's month + 11", () => {
    const months = planilhaMonths("2026-11-05", "2026-03-10");

    expect(months).toHaveLength(20);
    expect(months[0]).toBe("2026-03");
    expect(months.at(-1)).toBe("2027-10");
  });

  it("starts 12 months back when the opening is older", () => {
    const months = planilhaMonths("2026-11-05", "2025-01-01");

    expect(months).toHaveLength(24);
    expect(months[0]).toBe("2025-11");
    expect(months).toContain("2026-01");
  });

  it("keeps the opening month when the opening is past today's month + 11", () => {
    expect(planilhaMonths("2026-11-05", "2027-12-01")).toEqual(["2027-12"]);
  });
});

describe("planilhaRows", () => {
  const rows = planilhaRows(PLANILHA_MONTH, "2026-03-10");
  const row = (day: number) => rows[day - 1];

  it("has one row per calendar day, even with no day from the API", () => {
    expect(rows).toHaveLength(30);
    expect(planilhaRows({ ...MONTH, month: "2027-02", days: [] }, "2026-03-10")).toHaveLength(28);
  });

  it("puts income plus resgates in Entrada and passes Diário and Saldo through", () => {
    expect(row(2)).toMatchObject({ income: "350.00", outflow: "0.00", landed: [] });
    expect(row(4).day?.daily).toBe("30.25");
    expect(row(10).day?.projected_balance).toBe("-1150.00");
  });

  it("adds the unpaid contas landed on a day to its Saída, trusting lands_on over the due date", () => {
    expect(row(2).outflow).toBe("0.00");
    expect(row(3)).toMatchObject({ outflow: "200.00", landed: [] });
    expect(row(5).outflow).toBe("400.00");
    expect(row(5).landed.map((bill) => bill.name)).toEqual(["Internet"]);
    expect(row(10).outflow).toBe("1850.00");
    expect(row(10).landed.map((bill) => bill.name)).toEqual(["Financiamento"]);
  });

  it("adds up inside the month: Saldo(d) = Saldo(d−1) + Entrada − Saída − Diário", () => {
    for (let index = 1; index < rows.length; index++) {
      const [before, today] = [rows[index - 1], rows[index]];
      const expected =
        cents(before.day?.projected_balance ?? "") +
        cents(today.income) -
        cents(today.outflow) -
        cents(today.day?.daily ?? "");
      expect(cents(today.day?.projected_balance ?? ""), today.date).toBe(expected);
    }
  });

  it("leaves the days before the opening date without a day", () => {
    const opening = planilhaRows(PLANILHA_MONTH, "2026-11-03");

    expect(opening[0]).toEqual({ date: "2026-11-01", day: null, income: "0.00", outflow: "0.00", landed: [] });
    expect(opening[1].day).toBeNull();
    expect(opening[2].day?.date).toBe("2026-11-03");
  });
});
