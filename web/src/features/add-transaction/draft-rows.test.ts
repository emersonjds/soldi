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

  it("lands a spend on a card on its fatura's due date, each parcela on its own", () => {
    const card = { closing_day: 3, due_day: 10 };
    expect(draftRows({ kind: "daily", amount: "50.00", date: "2026-11-02", plan: "once", count: 12, card })).toEqual([
      { date: "2026-11-10", cents: -5000 },
    ]);
    const parcelas = draftRows({
      kind: "daily",
      amount: "90.00",
      date: "2026-11-03",
      plan: "installments",
      count: 3,
      card,
    });
    expect(parcelas.map((row) => row.date)).toEqual(["2026-12-10", "2027-01-10", "2027-02-10"]);
  });
});
