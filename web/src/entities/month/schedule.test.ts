import { describe, expect, it } from "vitest";

import type { Schemas } from "@/shared/api/client";

import { ALL_BILLS_PAID, dueDays, nextDue, subtitleOf } from "./schedule";

const bill = (name: string, due_date: string, rest: Partial<Schemas["BillOfMonth"]> = {}): Schemas["BillOfMonth"] => ({
  bill_id: `id-${name}`,
  name,
  icon: "home",
  color: "cat-1",
  amount: "100.00",
  due_date,
  paid: false,
  overdue: false,
  is_card: false,
  variable: false,
  adjusted: false,
  skipped: false,
  ...rest,
});

describe("dueDays", () => {
  it("gives one day per due date, sorted, counting only the unpaid bills", () => {
    expect(
      dueDays([
        bill("Aluguel", "2026-11-10"),
        bill("Luz", "2026-11-02", { overdue: true }),
        bill("Água", "2026-11-10", { paid: true }),
        bill("Internet", "2026-11-10"),
        bill("Gás", "2026-11-15", { paid: true }),
      ]),
    ).toEqual([
      { date: "2026-11-02", unpaid: 1 },
      { date: "2026-11-10", unpaid: 2 },
      { date: "2026-11-15", unpaid: 0 },
    ]);
  });

  it("keeps a bill carried from October on its own October day, first (D17)", () => {
    expect(
      dueDays([
        bill("Aluguel", "2026-11-10"),
        bill("Aluguel", "2026-10-10", { overdue: true, lands_on: "2026-11-05" }),
      ]),
    ).toEqual([
      { date: "2026-10-10", unpaid: 1 },
      { date: "2026-11-10", unpaid: 1 },
    ]);
  });

  it("has no day without bills", () => {
    expect(dueDays([])).toEqual([]);
  });
});

describe("nextDue", () => {
  const today = "2026-11-05";

  it("is the earliest unpaid bill due today or later", () => {
    expect(
      nextDue(
        [
          bill("Luz", "2026-11-02", { overdue: true }),
          bill("Aluguel", "2026-11-20"),
          bill("Água", "2026-11-08", { paid: true }),
          bill("Internet", "2026-11-12"),
        ],
        today,
      )?.name,
    ).toBe("Internet");
  });

  it("is a bill due today", () => {
    expect(nextDue([bill("Aluguel", "2026-11-20"), bill("Luz", today)], today)?.name).toBe("Luz");
  });

  it("is nothing when the rest is paid or overdue", () => {
    expect(
      nextDue([bill("Luz", "2026-11-02", { overdue: true }), bill("Água", "2026-11-08", { paid: true })], today),
    ).toBeUndefined();
  });

  it("is the month's first bill in a future month, and nothing in a past one", () => {
    const december = [bill("Aluguel", "2026-12-10"), bill("Luz", "2026-12-02")];
    expect(nextDue(december, today)?.name).toBe("Luz");
    expect(nextDue([bill("Luz", "2026-10-02", { overdue: true })], today)).toBeUndefined();
  });
});

describe("a skipped month (D56)", () => {
  const today = "2026-11-05";
  const skipped = bill("Aluguel", "2026-11-10", { skipped: true });

  it("owes nothing on its day and is never the next bill", () => {
    expect(dueDays([skipped, bill("Luz", "2026-11-10")])).toEqual([{ date: "2026-11-10", unpaid: 1 }]);
    expect(nextDue([skipped, bill("Luz", "2026-11-20")], today)?.name).toBe("Luz");
  });

  it("leaves every bill paid when the others are", () => {
    expect(subtitleOf([skipped, bill("Luz", "2026-11-02", { paid: true })], today)).toBe(ALL_BILLS_PAID);
  });

  it("never says every bill is paid when every month is skipped", () => {
    expect(subtitleOf([skipped], today)).not.toBe(ALL_BILLS_PAID);
  });
});
