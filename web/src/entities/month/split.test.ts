import { describe, expect, it } from "vitest";

import type { Schemas } from "@/shared/api/client";

import { splitOf } from "./split";

type Totals = Schemas["MonthView"]["totals"];

const totals = (
  income: string,
  bills: string,
  daily: string,
  saved: string,
  performance: string,
  withdrawn = "0.00",
): Totals => ({
  income,
  withdrawn,
  bills,
  daily,
  outflow: "0.00",
  performance,
  saved,
});

describe("splitOf", () => {
  it("splits the income into Contas fixas without the saving, Guardado, Gastos diários and Livre restante when money is left", () => {
    expect(splitOf(totals("6000.00", "1800.00", "2580.00", "480.00", "1620.00"))).toEqual({
      base: "income",
      segments: [
        { label: "Contas fixas", amount: "1320.00", tone: "bills" },
        { label: "Guardado", amount: "480.00", tone: "saved" },
        { label: "Gastos diários", amount: "2580.00", tone: "daily" },
        { label: "Livre restante", amount: "1620.00", tone: "free" },
      ],
    });
  });

  it("hides Livre restante and Guardado when the outflow matches the income without saving", () => {
    expect(splitOf(totals("1000.00", "600.00", "400.00", "0.00", "0.00"))).toEqual({
      base: "income",
      segments: [
        { label: "Contas fixas", amount: "600.00", tone: "bills" },
        { label: "Gastos diários", amount: "400.00", tone: "daily" },
      ],
    });
  });

  it("splits the outflow instead, with no Livre restante, when the outflow passes the income", () => {
    expect(splitOf(totals("500.00", "1200.00", "184.31", "200.00", "-884.31"))).toEqual({
      base: "outflow",
      segments: [
        { label: "Contas fixas", amount: "1000.00", tone: "bills" },
        { label: "Guardado", amount: "200.00", tone: "saved" },
        { label: "Gastos diários", amount: "184.31", tone: "daily" },
      ],
    });
  });

  it("nets a resgate out of Guardado and back into Livre restante", () => {
    expect(splitOf(totals("5000.00", "2500.00", "500.00", "700.00", "2000.00", "300.00"))).toEqual({
      base: "income",
      segments: [
        { label: "Contas fixas", amount: "1500.00", tone: "bills" },
        { label: "Guardado", amount: "700.00", tone: "saved" },
        { label: "Gastos diários", amount: "500.00", tone: "daily" },
        { label: "Livre restante", amount: "2300.00", tone: "free" },
      ],
    });
  });

  it("shows no Guardado once the month's deposit was all resgatado", () => {
    expect(splitOf(totals("24624.12", "3000.00", "15514.38", "0.00", "6109.74", "3000.00"))?.segments).toEqual([
      { label: "Contas fixas", amount: "0.00", tone: "bills" },
      { label: "Gastos diários", amount: "15514.38", tone: "daily" },
      { label: "Livre restante", amount: "9109.74", tone: "free" },
    ]);
  });

  it("shows no Guardado and frees the resgate when the month withdrew more than it saved", () => {
    expect(splitOf(totals("3000.00", "1100.00", "400.00", "-400.00", "1500.00", "500.00"))?.segments).toEqual([
      { label: "Contas fixas", amount: "1000.00", tone: "bills" },
      { label: "Gastos diários", amount: "400.00", tone: "daily" },
      { label: "Livre restante", amount: "2000.00", tone: "free" },
    ]);
  });

  it("has nothing to split without an entrada, even with outflow", () => {
    expect(splitOf(totals("0.00", "300.00", "0.00", "0.00", "-300.00"))).toBeNull();
  });

  it("has nothing to split without income and outflow", () => {
    expect(splitOf(totals("0.00", "0.00", "0.00", "0.00", "0.00"))).toBeNull();
  });
});
