import { describe, expect, it } from "vitest";

import { cents } from "@/shared/lib/tier";
import { ESTIMATE_MONTH, MONTH, PLANILHA_MONTH } from "@/test/stub-api";

import { planilhaMonths, planilhaRows, planilhaTotals } from "./planilha-rows";

describe("planilhaTotals (SOL-188)", () => {
  it("sums Entrada, Saída and Diário as the cells show them, and keeps the last day for Saldo", () => {
    const totals = planilhaTotals(planilhaRows(PLANILHA_MONTH, "2026-03-10"), null);

    expect(totals).toMatchObject({ income: "350.00", outflow: "2450.00", daily: "50.00" });
    expect(totals.last).toMatchObject({ date: "2026-11-30", projected_balance: "-1150.00", projected_tier: "red" });
  });

  it("counts a future-dated Entrada", () => {
    const view = {
      ...PLANILHA_MONTH,
      days: PLANILHA_MONTH.days.map((day) => (day.date === "2026-11-27" ? { ...day, income: "700.00" } : day)),
    };

    expect(planilhaTotals(planilhaRows(view, "2026-03-10"), null).income).toBe("1050.00");
  });

  it("uses the Diário previsto exactly when a day's cell does", () => {
    const rows = planilhaRows(ESTIMATE_MONTH, "2026-03-10");

    expect(planilhaTotals(rows, "50.00").daily).toBe("1330.00");
    expect(planilhaTotals(rows, null).daily).toBe("150.00");
  });

  it("adds zero for the days before the opening date", () => {
    expect(planilhaTotals(planilhaRows(PLANILHA_MONTH, "2026-11-03"), null)).toMatchObject({
      income: "0.00",
      outflow: "2450.00",
      daily: "50.00",
    });
  });

  it("never counts a skipped conta", () => {
    const skipped = {
      ...PLANILHA_MONTH.bills_of_month[0],
      bill_id: "skip",
      amount: "99.00",
      lands_on: null,
      skipped: true,
    };
    const view = { ...PLANILHA_MONTH, bills_of_month: [...PLANILHA_MONTH.bills_of_month, skipped] };

    expect(planilhaTotals(planilhaRows(view, "2026-03-10"), null).outflow).toBe("2450.00");
  });

  it("has no last day when no day is on or after the opening date", () => {
    expect(planilhaTotals(planilhaRows({ ...MONTH, month: "2027-02", days: [] }, "2026-03-10"), null).last).toBeNull();
  });
});

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

  it("SOL-173: lists a skipped conta on its due day and never in Saída; an adjusted one counts its own amount", () => {
    const base = PLANILHA_MONTH.bills_of_month[2];
    const view = {
      ...PLANILHA_MONTH,
      bills_of_month: [
        {
          ...base,
          bill_id: "skip",
          name: "Academia",
          amount: "99.00",
          due_date: "2026-11-24",
          lands_on: null,
          skipped: true,
        },
        {
          ...base,
          bill_id: "adj",
          name: "Água",
          amount: "80.50",
          due_date: "2026-11-24",
          lands_on: "2026-11-24",
          adjusted: true,
        },
      ],
    };
    const day = planilhaRows(view, "2026-03-10")[23];

    expect(day.skipped.map((bill) => bill.name)).toEqual(["Academia"]);
    expect(day.landed.map((bill) => bill.name)).toEqual(["Água"]);
    expect(day.outflow).toBe("80.50");
    expect(row(10).skipped).toEqual([]);
  });

  it("SOL-164 S8: puts the Diário previsto in a future day's Diário, the larger of typed and estimate", () => {
    const ahead = planilhaRows(ESTIMATE_MONTH, "2026-03-10");

    expect(ahead.slice(3, 10).map(({ daily }) => daily)).toEqual([
      "30.25",
      "19.75",
      "50.00",
      "50.00",
      "80.00",
      "50.00",
      "50.00",
    ]);
    expect(row(4).daily).toBe("30.25");
    expect(ahead[29].day?.projected_balance).toBe("-2430.00");
  });

  it("SOL-164 R8: adds up with the estimate: Saldo(d) = Saldo(d−1) + Entrada − Saída − Diário", () => {
    const ahead = planilhaRows(ESTIMATE_MONTH, "2026-03-10");
    for (let index = 1; index < ahead.length; index++) {
      const [before, today] = [ahead[index - 1], ahead[index]];
      const expected =
        cents(before.day?.projected_balance ?? "") + cents(today.income) - cents(today.outflow) - cents(today.daily);
      expect(cents(today.day?.projected_balance ?? ""), today.date).toBe(expected);
    }
  });

  it("leaves the days before the opening date without a day", () => {
    const opening = planilhaRows(PLANILHA_MONTH, "2026-11-03");

    expect(opening[0]).toEqual({
      date: "2026-11-01",
      day: null,
      income: "0.00",
      outflow: "0.00",
      daily: "0.00",
      landed: [],
      skipped: [],
    });
    expect(opening[1].day).toBeNull();
    expect(opening[2].day?.date).toBe("2026-11-03");
  });
});
