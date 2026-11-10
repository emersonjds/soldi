import { describe, expect, it } from "vitest";

import { draftRows } from "./draft-rows";

describe("draftRows", () => {
  it("is one negative row for a purchase and positive for an Entrada", () => {
    expect(draftRows({ kind: "bill", amount: "6700.00", date: "2026-11-10", plan: "once", count: 12 })).toEqual([
      { date: "2026-11-10", cents: -670_000 },
    ]);
    expect(draftRows({ kind: "income", amount: "10.00", date: "2026-11-10", plan: "once", count: 12 })[0].cents).toBe(
      1000,
    );
  });

  it("copies the amount on each repeat and splits it on each parcela", () => {
    expect(draftRows({ kind: "daily", amount: "50.00", date: "2027-01-31", plan: "repeat", count: 2 })).toEqual([
      { date: "2027-01-31", cents: -5000 },
      { date: "2027-02-28", cents: -5000 },
    ]);
    const parcelas = draftRows({
      kind: "bill",
      amount: "1000.01",
      date: "2026-11-10",
      plan: "installments",
      count: 10,
    });
    expect(parcelas.map((row) => row.cents)).toEqual([...Array(9).fill(-10_000), -10_001]);
    expect(parcelas[9].date).toBe("2027-08-10");
  });
});
