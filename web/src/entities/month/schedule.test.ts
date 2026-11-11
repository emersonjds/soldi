import { describe, expect, it } from "vitest";

import type { Schemas } from "@/shared/api/client";

import { dueDays, nextDue, visibleDays } from "./schedule";

const bill = (name: string, due_date: string, rest: Partial<Schemas["BillOfMonth"]> = {}): Schemas["BillOfMonth"] => ({
  bill_id: `id-${name}`,
  name,
  icon: "home",
  color: "cat-1",
  amount: "100.00",
  due_date,
  paid: false,
  overdue: false,
  ...rest,
});

const dated = (...dates: string[]) => dates.map((date) => ({ date }));
const datesOf = (days: { date: string }[]) => days.map(({ date }) => date);

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

describe("visibleDays", () => {
  const today = "2026-11-15";
  /** Newest first, as the ledger lists them: 4 scheduled days, today, 8 days before. */
  const november = dated(
    "2026-11-28",
    "2026-11-24",
    "2026-11-20",
    "2026-11-16",
    "2026-11-15",
    "2026-11-14",
    "2026-11-12",
    "2026-11-10",
    "2026-11-08",
    "2026-11-06",
    "2026-11-04",
    "2026-11-02",
    "2026-11-01",
  );

  it("keeps the next 3 scheduled days, today and the 6 days before it, in the given order", () => {
    expect(datesOf(visibleDays(november, today, false))).toEqual([
      "2026-11-24",
      "2026-11-20",
      "2026-11-16",
      "2026-11-15",
      "2026-11-14",
      "2026-11-12",
      "2026-11-10",
      "2026-11-08",
      "2026-11-06",
      "2026-11-04",
    ]);
  });

  it("keeps every day when expanded", () => {
    expect(visibleDays(november, today, true)).toEqual(november);
  });

  it("keeps 6 days before today when today has nothing", () => {
    const days = november.filter(({ date }) => date !== today);
    expect(datesOf(visibleDays(days, today, false))).toEqual([
      "2026-11-24",
      "2026-11-20",
      "2026-11-16",
      "2026-11-14",
      "2026-11-12",
      "2026-11-10",
      "2026-11-08",
      "2026-11-06",
      "2026-11-04",
    ]);
  });

  it("keeps the last 7 days of a past month", () => {
    expect(datesOf(visibleDays(november, "2026-12-03", false))).toEqual([
      "2026-11-28",
      "2026-11-24",
      "2026-11-20",
      "2026-11-16",
      "2026-11-15",
      "2026-11-14",
      "2026-11-12",
    ]);
  });

  it("keeps the first 3 scheduled days of a future month", () => {
    expect(datesOf(visibleDays(november, "2026-10-20", false))).toEqual(["2026-11-04", "2026-11-02", "2026-11-01"]);
  });

  it("keeps a short month whole", () => {
    const days = dated("2026-11-20", "2026-11-15", "2026-11-03");
    expect(visibleDays(days, today, false)).toEqual(days);
    expect(visibleDays([], today, false)).toEqual([]);
  });
});
