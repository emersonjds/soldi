import type { Schemas } from "@/shared/api/client";

type Bill = Schemas["BillOfMonth"];

/** One entry per due date, oldest first, with how many of its bills are still unpaid; a D17 bill keeps its own month's date. */
export const dueDays = (bills: Bill[]) => {
  const unpaid = new Map<string, number>();
  for (const bill of bills) unpaid.set(bill.due_date, (unpaid.get(bill.due_date) ?? 0) + (bill.paid ? 0 : 1));
  return [...unpaid].map(([date, count]) => ({ date, unpaid: count })).sort((a, b) => a.date.localeCompare(b.date));
};

/** The earliest unpaid bill due on `today` or later. */
export const nextDue = (bills: Bill[], today: string) =>
  bills.filter((bill) => !bill.paid && bill.due_date >= today).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

export const whenDue = (date: string, today: string) => {
  const days = (Date.parse(date) - Date.parse(today)) / 86_400_000;
  return days === 1 ? "amanhã" : `em ${days} dias`;
};

/** Spec 2026-11-10 §3.4: the next bill due, or that every bill is paid. */
export const subtitleOf = (bills: Bill[], today: string) => {
  if (bills.every((bill) => bill.paid)) return "Todas as contas do mês pagas";
  const next = nextDue(bills, today);
  if (!next) return null;
  if (next.due_date === today) return `Vence hoje: ${next.name}`;
  return `Próxima: ${next.name} · dia ${next.due_date.slice(8)} · ${whenDue(next.due_date, today)}`;
};

/**
 * Spec 2026-11-10 §3.3: the next 3 scheduled days, today and the 6 days before it; the last 7 days of a past month.
 * Keeps the order it was given.
 */
export const visibleDays = <Day extends { date: string }>(days: Day[], today: string, expanded: boolean) => {
  if (expanded) return days;
  const dates = days.map(({ date }) => date).sort();
  const past = dates.every((date) => date.slice(0, 7) < today.slice(0, 7));
  const shown = new Set([
    ...dates.filter((date) => date > today).slice(0, 3),
    today,
    ...dates.filter((date) => date < today).slice(past ? -7 : -6),
  ]);
  return days.filter(({ date }) => shown.has(date));
};
