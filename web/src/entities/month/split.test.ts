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
  it("splits the income into Contas without the saving, Guardado, Diário and Livre when money is left", () => {
    expect(splitOf(totals("6000.00", "1800.00", "2580.00", "480.00", "1620.00"))).toEqual({
      base: "income",
      segments: [
        { label: "Contas", amount: "1320.00", tone: "bills" },
        { label: "Guardado", amount: "480.00", tone: "saved" },
        { label: "Diário", amount: "2580.00", tone: "daily" },
        { label: "Livre", amount: "1620.00", tone: "free" },
      ],
      line: { kind: "free", pct: 27 },
    });
  });

  it("rounds the share left half to even", () => {
    expect(splitOf(totals("200.00", "0.00", "175.00", "0.00", "25.00"))?.line).toEqual({ kind: "free", pct: 12 });
    expect(splitOf(totals("200.00", "0.00", "173.00", "0.00", "27.00"))?.line).toEqual({ kind: "free", pct: 14 });
  });

  it("hides Livre and Guardado and calls it even when the outflow matches the income without saving", () => {
    expect(splitOf(totals("1000.00", "600.00", "400.00", "0.00", "0.00"))).toEqual({
      base: "income",
      segments: [
        { label: "Contas", amount: "600.00", tone: "bills" },
        { label: "Diário", amount: "400.00", tone: "daily" },
      ],
      line: { kind: "even" },
    });
  });

  it("splits the outflow instead, with no Livre, when the outflow passes the income", () => {
    expect(splitOf(totals("500.00", "1200.00", "184.31", "200.00", "-884.31"))).toEqual({
      base: "outflow",
      segments: [
        { label: "Contas", amount: "1000.00", tone: "bills" },
        { label: "Guardado", amount: "200.00", tone: "saved" },
        { label: "Diário", amount: "184.31", tone: "daily" },
      ],
      line: { kind: "over", amount: "884.31" },
    });
  });

  it("counts a resgate back into Guardado, so Guardado is what went into the cofrinhos", () => {
    expect(splitOf(totals("5000.00", "2500.00", "500.00", "700.00", "2000.00", "300.00"))).toEqual({
      base: "income",
      segments: [
        { label: "Contas", amount: "1500.00", tone: "bills" },
        { label: "Guardado", amount: "1000.00", tone: "saved" },
        { label: "Diário", amount: "500.00", tone: "daily" },
        { label: "Livre", amount: "2000.00", tone: "free" },
      ],
      line: { kind: "free", pct: 40 },
    });
  });

  it("keeps the deposit in Guardado and Contas whole when the month withdrew more than it saved", () => {
    expect(splitOf(totals("3000.00", "1100.00", "400.00", "-400.00", "1500.00", "500.00"))?.segments).toEqual([
      { label: "Contas", amount: "1000.00", tone: "bills" },
      { label: "Guardado", amount: "100.00", tone: "saved" },
      { label: "Diário", amount: "400.00", tone: "daily" },
      { label: "Livre", amount: "1500.00", tone: "free" },
    ]);
  });

  it("hides Guardado when a resgate is the month's only cofrinho movement", () => {
    expect(splitOf(totals("2000.00", "1000.00", "500.00", "-300.00", "500.00", "300.00"))?.segments).toEqual([
      { label: "Contas", amount: "1000.00", tone: "bills" },
      { label: "Diário", amount: "500.00", tone: "daily" },
      { label: "Livre", amount: "500.00", tone: "free" },
    ]);
  });

  it("splits the outflow when there is no income yet", () => {
    expect(splitOf(totals("0.00", "300.00", "0.00", "0.00", "-300.00"))).toEqual({
      base: "outflow",
      segments: [
        { label: "Contas", amount: "300.00", tone: "bills" },
        { label: "Diário", amount: "0.00", tone: "daily" },
      ],
      line: { kind: "over", amount: "300.00" },
    });
  });

  it("has nothing to split without income or outflow", () => {
    expect(splitOf(totals("0.00", "0.00", "0.00", "0.00", "0.00"))).toBeNull();
  });
});
