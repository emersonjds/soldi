import type { Schemas } from "@/shared/api/client";
import { cents } from "@/shared/lib/tier";

type Day = Schemas["Day"];

export type ForecastAlert = {
  firstRed: { date: string; balance: string; today: boolean };
  lowest: { date: string; balance: string };
  recoversOn: string | null;
};

/** D16 from today on: the first red day, the lowest point (earliest on ties), the first day after it out of red. */
export const forecastAlert = (days: Day[]): ForecastAlert | null => {
  const ahead = days.filter((day) => day.is_today || day.is_future);
  const firstRed = ahead.find((day) => day.projected_tier === "red");
  if (!firstRed) return null;
  const lowest = ahead.reduce((low, day) => (cents(day.projected_balance) < cents(low.projected_balance) ? day : low));
  const recovery = ahead.find((day) => day.date > lowest.date && day.projected_tier !== "red");
  return {
    firstRed: { date: firstRed.date, balance: firstRed.projected_balance, today: firstRed.is_today },
    lowest: { date: lowest.date, balance: lowest.projected_balance },
    recoversOn: recovery?.date ?? null,
  };
};

const RANK = { bill: 1, daily: 2 } as const;

/** The day's largest outflow, only when its projected balance fell from the day before; ties go conta fixa, Saída, Diário, then list order. */
export const causeOf = (
  date: string,
  days: Day[],
  transactions: Schemas["Transaction"][],
  bills: Schemas["BillOfMonth"][],
): string | null => {
  const index = days.findIndex((day) => day.date === date);
  if (index > 0 && cents(days[index].projected_balance) >= cents(days[index - 1].projected_balance)) return null;
  const outflows = [
    ...bills
      .filter((bill) => bill.lands_on === date)
      .map((bill) => ({ id: bill.bill_id, amount: cents(bill.amount), rank: 0 })),
    ...transactions.flatMap((transaction) =>
      transaction.date === date && transaction.kind !== "income"
        ? [{ id: transaction.id, amount: cents(transaction.amount), rank: RANK[transaction.kind] }]
        : [],
    ),
  ];
  const [largest] = outflows.sort((a, b) => b.amount - a.amount || a.rank - b.rank);
  return largest ? largest.id : null;
};
