import type { Schemas } from "@/shared/api/client";
import { addMonths, lastDay } from "@/shared/lib/date";
import { cents, fromCents } from "@/shared/lib/tier";

/** Spec SOL-163 §5: `max(opening month, today's month − 12)` to today's month + 11, as `YYYY-MM`; at least the opening month. */
export const planilhaMonths = (today: string, openingDate: string) => {
  const current = today.slice(0, 7);
  const [, first] = [addMonths(current, -12), openingDate.slice(0, 7)].sort();
  const [, last] = [first, addMonths(current, 11)].sort();
  const months: string[] = [];
  for (let month = first; month <= last; month = addMonths(month, 1)) months.push(month);
  return months;
};

/** A calendar day of the planilha; `day` is null before the opening date. */
export type PlanilhaRow = {
  date: string;
  day: Schemas["Day"] | null;
  /** Entrada: income plus resgates. */
  income: string;
  /** Saída: bills paid plus the unpaid contas landed on the day. */
  outflow: string;
  /** Diário: the cash Diário typed plus the Diário previsto (SOL-164 R8). */
  daily: string;
  /** The unpaid contas landed on the day. */
  landed: Schemas["BillOfMonth"][];
  /** Skipped contas due on the day, listed, never summed (D56). */
  skipped: Schemas["BillOfMonth"][];
};

export const sum = (amounts: string[]) => fromCents(amounts.reduce((total, amount) => total + cents(amount), 0));

export const planilhaRows = (view: Schemas["MonthView"], openingDate: string): PlanilhaRow[] =>
  Array.from({ length: lastDay(view.month) }, (_, index) => {
    const date = `${view.month}-${String(index + 1).padStart(2, "0")}`;
    const day = date < openingDate ? undefined : view.days.find((each) => each.date === date);
    if (!day) return { date, day: null, income: "0.00", outflow: "0.00", daily: "0.00", landed: [], skipped: [] };
    const landed = view.bills_of_month.filter((bill) => bill.lands_on === date);
    const skipped = view.bills_of_month.filter((bill) => bill.skipped && bill.due_date === date);
    return {
      date,
      day,
      income: sum([day.income, day.withdrawn]),
      outflow: sum([day.bills, ...landed.map((bill) => bill.amount)]),
      daily: sum([day.daily, day.previsto]),
      landed,
      skipped,
    };
  });
