import { describe, expect, it } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { FORECAST_MONTH, FORECAST_TRANSACTIONS } from "@/test/stub-api";

import { billKey, causeOf, forecastAlert, topOutflows } from "./forecast-alert";

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
  it("finds the owner's November: red on the 23rd, worst on the 28th", () => {
    expect(forecastAlert(FORECAST_MONTH.days)).toEqual({
      firstRed: { date: "2026-11-23", balance: "-675.00", today: false },
      lowest: { date: "2026-11-28", balance: "-2916.00" },
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
    });
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
    expect(causeOf("2026-11-23", FORECAST_MONTH.days, FORECAST_TRANSACTIONS, FORECAST_MONTH.bills_of_month)).toBe(
      billKey(CARTAO),
    );
    expect(causeOf("2026-11-28", FORECAST_MONTH.days, FORECAST_TRANSACTIONS, FORECAST_MONTH.bills_of_month)).toBe(
      billKey(FINANCIAMENTO),
    );
  });

  it("on a tie prefers the conta fixa, then a Saída over a Diário; income never counts", () => {
    const [salario, feira, seguro] = FORECAST_TRANSACTIONS;
    const on = "2026-11-12";
    const diario = { ...feira, id: "diario", date: on, amount: "100.00" };
    const saida = { ...seguro, id: "saida", date: on, amount: "100.00" };
    const entrada = { ...salario, id: "entrada", date: on, amount: "900.00" };
    const conta = { ...CARTAO, bill_id: "conta", amount: "100.00", lands_on: on };

    expect(causeOf(on, [], [diario, saida, entrada], [conta])).toBe(billKey(conta));
    expect(causeOf(on, [], [diario, saida, entrada], [])).toBe("saida");
  });

  it("has no cause on a day without outflow", () => {
    expect(causeOf("2026-11-10", FORECAST_MONTH.days, FORECAST_TRANSACTIONS, FORECAST_MONTH.bills_of_month)).toBeNull();
  });

  it("names no cause on a red day carried in without a drop, and the largest outflow on a real drop", () => {
    const [, feira] = FORECAST_TRANSACTIONS;
    const carried = [day("2026-11-24", "-675.00", "red", "past"), day("2026-11-25", "-675.00", "red", "today")];
    const dropped = [day("2026-11-24", "-675.00", "red", "past"), day("2026-11-25", "-916.00", "red", "today")];

    expect(causeOf("2026-11-25", carried, [feira], [])).toBeNull();
    expect(causeOf("2026-11-25", dropped, [feira], [])).toBe(feira.id);
  });

  it("names the first day of the month's largest outflow, having no day before it", () => {
    const [, feira] = FORECAST_TRANSACTIONS;

    expect(causeOf("2026-11-25", [day("2026-11-25", "-916.00", "red", "today")], [feira], [])).toBe(feira.id);
  });

  it("counts an overdue bill landing today and ignores a paid one", () => {
    const today = "2026-11-25";
    const days = [day("2026-11-24", "0.00", "yellow", "past"), day(today, "-5000.00", "red", "today")];
    const overdue = { ...CARTAO, bill_id: "atrasada", due_date: "2026-11-20", overdue: true, lands_on: today };
    const paid = { ...FINANCIAMENTO, bill_id: "paga", amount: "9000.00", due_date: today, paid: true, lands_on: null };

    expect(causeOf(today, days, [], [overdue, paid])).toBe("atrasada@2026-11-20");
  });

  it("tells two rows of one bill apart: the carried one is the cause", () => {
    const today = day("2026-11-20", "-2400.00", "red", "today");
    const carried = { ...CARTAO, due_date: "2026-10-23", overdue: true, lands_on: "2026-11-20", amount: "1800.00" };
    const own = { ...CARTAO, lands_on: "2026-11-23" };
    expect(causeOf("2026-11-20", [today], [], [carried, own])).toBe(`${CARTAO.bill_id}@2026-10-23`);
  });
});

describe("topOutflows", () => {
  it("names the owner's two largest outflows on the 23rd: the Cartão bill, then the Seguro Saída", () => {
    expect(topOutflows("2026-11-23", FORECAST_TRANSACTIONS, FORECAST_MONTH.bills_of_month)).toEqual([
      "Cartão",
      "Seguro",
    ]);
  });

  it("keeps two by cents, leaves out income, paid bills and other days, and names an entry without a note by its category", () => {
    const [salario, feira, seguro] = FORECAST_TRANSACTIONS;
    const on = "2026-11-12";
    const entries = [
      { ...salario, id: "entrada", date: on, amount: "9000.00" },
      { ...feira, id: "feira", date: on, amount: "100.10", note: null },
      { ...seguro, id: "seguro", date: on, amount: "100.09" },
      { ...seguro, id: "outro-dia", date: "2026-11-13", amount: "5000.00" },
    ];
    const paid = { ...CARTAO, name: "Paga", amount: "8000.00", lands_on: on, paid: true };
    const open = { ...FINANCIAMENTO, name: "Luz", amount: "99.99", lands_on: on };

    expect(topOutflows(on, entries, [paid, open])).toEqual(["Mercado", "Seguro"]);
    expect(topOutflows(on, [], [open])).toEqual(["Luz"]);
    expect(topOutflows(on, [], [])).toEqual([]);
  });
});
