import { describe, expect, it } from "vitest";

import type { Schemas } from "@/shared/api/client";

import { splitOf } from "./split";

type Totals = Schemas["MonthView"]["totals"];

const totals = (income: string, spent: string, saved: string, performance: string): Totals => ({
  income,
  spent,
  saved,
  performance,
});

describe("splitOf", () => {
  it("splits the income into Gastos, Guardado and Livre restante when money is left", () => {
    expect(splitOf(totals("6000.00", "3900.00", "480.00", "1620.00"))).toEqual({
      base: "income",
      segments: [
        { label: "Gastos", amount: "3900.00", tone: "bills" },
        { label: "Guardado", amount: "480.00", tone: "saved" },
        { label: "Livre restante", amount: "1620.00", tone: "free" },
      ],
    });
  });

  it("hides Livre restante and Guardado when Gastos match the income without saving", () => {
    expect(splitOf(totals("1000.00", "1000.00", "0.00", "0.00"))).toEqual({
      base: "income",
      segments: [{ label: "Gastos", amount: "1000.00", tone: "bills" }],
    });
  });

  it("splits the outflow instead, with no Livre restante, when Gastos and Guardado pass the income", () => {
    expect(splitOf(totals("500.00", "1184.31", "200.00", "-884.31"))).toEqual({
      base: "outflow",
      segments: [
        { label: "Gastos", amount: "1184.31", tone: "bills" },
        { label: "Guardado", amount: "200.00", tone: "saved" },
      ],
    });
  });

  it("shows no Guardado when the month withdrew more than it saved", () => {
    expect(splitOf(totals("3000.00", "1400.00", "-400.00", "2000.00"))?.segments).toEqual([
      { label: "Gastos", amount: "1400.00", tone: "bills" },
      { label: "Livre restante", amount: "2000.00", tone: "free" },
    ]);
  });

  it("has nothing to split without an entrada, even with Gastos", () => {
    expect(splitOf(totals("0.00", "300.00", "0.00", "-300.00"))).toBeNull();
  });
});
