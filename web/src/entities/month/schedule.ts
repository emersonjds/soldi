import type { Schemas } from "@/shared/api/client";

type Bill = Schemas["BillOfMonth"];

/** D56: a skipped month is not owed, so no count or total takes it. */
export const countedBills = (bills: Bill[]) => bills.filter((bill) => !bill.skipped);

/** One entry per due date, oldest first, with how many of its bills are still unpaid; a D17 bill keeps its own month's date. */
export const dueDays = (bills: Bill[]) => {
  const unpaid = new Map<string, number>();
  for (const bill of bills)
    unpaid.set(bill.due_date, (unpaid.get(bill.due_date) ?? 0) + (bill.paid || bill.skipped ? 0 : 1));
  return [...unpaid].map(([date, count]) => ({ date, unpaid: count })).sort((a, b) => a.date.localeCompare(b.date));
};

/** The earliest unpaid bill due on `today` or later. */
export const nextDue = (bills: Bill[], today: string) =>
  bills
    .filter((bill) => !bill.paid && !bill.skipped && bill.due_date >= today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

export const whenDue = (date: string, today: string) => {
  const days = (Date.parse(date) - Date.parse(today)) / 86_400_000;
  return days === 1 ? "amanhã" : `em ${days} dias`;
};

export const ALL_BILLS_PAID = "Todas as contas do mês pagas";

/** Spec 2026-11-10 §3.4: the next bill due, or that every bill is paid. */
export const subtitleOf = (bills: Bill[], today: string) => {
  if (bills.every((bill) => bill.paid || bill.skipped)) return ALL_BILLS_PAID;
  const next = nextDue(bills, today);
  if (!next) return null;
  if (next.due_date === today) return `Vence hoje: ${next.name}`;
  return `Próxima: ${next.name} · dia ${next.due_date.slice(8)} · ${whenDue(next.due_date, today)}`;
};
