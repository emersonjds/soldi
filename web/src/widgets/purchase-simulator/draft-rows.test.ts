import { describe, expect, it } from "vitest";

import { draftRows } from "./draft-rows";

describe("draftRows", () => {
  it("is one negative row for a purchase à vista", () => {
    expect(draftRows({ amount: "6700.00", date: "2026-11-10", count: 1 })).toEqual([
      { date: "2026-11-10", cents: -670_000 },
    ]);
  });

  it("splits the amount on each parcela, the last taking the remainder", () => {
    const parcelas = draftRows({ amount: "1000.01", date: "2026-11-10", count: 10 });
    expect(parcelas.map((row) => row.cents)).toEqual([...Array(9).fill(-10_000), -10_001]);
    expect(parcelas[9].date).toBe("2027-08-10");
  });

  it("lands a spend on a card on its fatura's due date, each parcela on its own", () => {
    const card = { closing_day: 3, due_day: 10 };
    expect(draftRows({ amount: "50.00", date: "2026-11-02", count: 1, card })).toEqual([
      { date: "2026-11-10", cents: -5000 },
    ]);
    const parcelas = draftRows({ amount: "90.00", date: "2026-11-03", count: 3, card });
    expect(parcelas.map((row) => row.date)).toEqual(["2026-12-10", "2027-01-10", "2027-02-10"]);
  });
});
