import { describe, expect, it } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { FORECAST_MONTH, FORECAST_TRANSACTIONS } from "@/test/stub-api";

import { causeOf, forecastAlert } from "./forecast-alert";

const day = (
  date: string,
  projected: string,
  tier: Schemas["Tier"],
  when: "past" | "today" | "future" = "future",
): Schemas["Day"] => ({
  date,
  income: "0.00",
  withdrawn: "0.00",
  bills: "0.00",
  daily: "0.00",
  balance: projected,
  tier,
  projected_balance: projected,
  projected_tier: tier,
  is_today: when === "today",
  is_future: when === "future",
});

const [CARTAO, FINANCIAMENTO] = FORECAST_MONTH.bills_of_month;

describe("forecastAlert", () => {
  it("finds the owner's November: red on the 23rd, worst on the 28th, back on the 30th", () => {
    expect(forecastAlert(FORECAST_MONTH.days)).toEqual({
      firstRed: { date: "2026-11-23", balance: "-675.00", today: false },
      lowest: { date: "2026-11-28", balance: "-2916.00" },
      recoversOn: "2026-11-30",
    });
  });

  it("keeps the earliest of two equal lowest days and ignores a redder past", () => {
    const days = [
      day("2026-11-09", "-9000.00", "red", "past"),
      day("2026-11-10", "100.00", "yellow", "today"),
      day("2026-11-28", "-2916.00", "red"),
      day("2026-11-29", "-2916.00", "red"),
    ];

    expect(forecastAlert(days)?.lowest).toEqual({ date: "2026-11-28", balance: "-2916.00" });
  });

  it("reads today as the first red day", () => {
    const days = [day("2026-11-10", "-675.00", "red", "today"), day("2026-11-11", "0.00", "yellow")];

    expect(forecastAlert(days)).toEqual({
      firstRed: { date: "2026-11-10", balance: "-675.00", today: true },
      lowest: { date: "2026-11-10", balance: "-675.00" },
      recoversOn: "2026-11-11",
    });
  });

  it("has no recovery when the month ends red", () => {
    const days = [day("2026-11-10", "100.00", "yellow", "today"), day("2026-11-30", "-600.00", "red")];

    expect(forecastAlert(days)?.recoversOn).toBeNull();
  });

  it("says nothing when only light red lies ahead, or the month is past", () => {
    expect(
      forecastAlert([day("2026-11-09", "-9000.00", "red", "past"), day("2026-11-10", "-100.00", "light_red", "today")]),
    ).toBeNull();
    expect(forecastAlert([day("2026-10-31", "-9000.00", "red", "past")])).toBeNull();
  });
});

describe("causeOf", () => {
  it("picks the owner's Cartão on the 23rd over Seguro, and Financiamento on the 28th", () => {
    expect(causeOf("2026-11-23", FORECAST_TRANSACTIONS, FORECAST_MONTH.bills_of_month)).toBe(CARTAO.bill_id);
    expect(causeOf("2026-11-28", FORECAST_TRANSACTIONS, FORECAST_MONTH.bills_of_month)).toBe(FINANCIAMENTO.bill_id);
  });

  it("on a tie prefers the conta fixa, then a Saída over a Diário; income never counts", () => {
    const [salario, feira, seguro] = FORECAST_TRANSACTIONS;
    const on = "2026-11-12";
    const diario = { ...feira, id: "diario", date: on, amount: "100.00" };
    const saida = { ...seguro, id: "saida", date: on, amount: "100.00" };
    const entrada = { ...salario, id: "entrada", date: on, amount: "900.00" };
    const conta = { ...CARTAO, bill_id: "conta", amount: "100.00", lands_on: on };

    expect(causeOf(on, [diario, saida, entrada], [conta])).toBe("conta");
    expect(causeOf(on, [diario, saida, entrada], [])).toBe("saida");
  });

  it("has no cause on a day without outflow", () => {
    expect(causeOf("2026-11-10", FORECAST_TRANSACTIONS, FORECAST_MONTH.bills_of_month)).toBeNull();
  });
});
