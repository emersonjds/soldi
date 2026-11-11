import type { Schemas } from "@/shared/api/client";
import { cents } from "@/shared/lib/tier";

type Day = Schemas["Day"];

export type ForecastAlert = {
  firstRed: { date: string; balance: string; today: boolean };
  lowest: { date: string; balance: string };
};

/** D16 from today on: the first red day and the lowest point (earliest on ties). */
export const forecastAlert = (days: Day[]): ForecastAlert | null => {
  const ahead = days.filter((day) => day.is_today || day.is_future);
  const firstRed = ahead.find((day) => day.projected_tier === "red");
  if (!firstRed) return null;
  const lowest = ahead.reduce((low, day) => (cents(day.projected_balance) < cents(low.projected_balance) ? day : low));
  return {
    firstRed: { date: firstRed.date, balance: firstRed.projected_balance, today: firstRed.is_today },
    lowest: { date: lowest.date, balance: lowest.projected_balance },
  };
};

/** A bill row's identity: one bill can be listed twice, carried from an earlier month (D17). */
export const billKey = (bill: Schemas["BillOfMonth"]) => `${bill.bill_id}@${bill.due_date}`;

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
      .map((bill) => ({ id: billKey(bill), amount: cents(bill.amount), rank: 0 })),
    ...transactions.flatMap((transaction) =>
      transaction.date === date && transaction.kind !== "income"
        ? [{ id: transaction.id, amount: cents(transaction.amount), rank: RANK[transaction.kind] }]
        : [],
    ),
  ];
  const [largest] = outflows.sort((a, b) => b.amount - a.amount || a.rank - b.rank);
  return largest ? largest.id : null;
};

/** The banner's cause (SOL-79 §2.2): the names of the day's two largest outflows, open bills landing on it and Saídas or Diários dated on it, by cents. */
export const topOutflows = (date: string, transactions: Schemas["Transaction"][], bills: Schemas["BillOfMonth"][]) =>
  [
    ...bills
      .filter((bill) => !bill.paid && bill.lands_on === date)
      .map((bill) => ({ name: bill.name, amount: cents(bill.amount) })),
    ...transactions
      .filter((transaction) => transaction.date === date && transaction.kind !== "income")
      .map((transaction) => ({
        name: transaction.note || transaction.category.name,
        amount: cents(transaction.amount),
      })),
  ]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 2)
    .map(({ name }) => name);
