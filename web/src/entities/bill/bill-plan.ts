import { addMonths, lastDay } from "@/shared/lib/date";

import type { Bill } from "./bill-queries";

const monthsBetween = (from: string, to: string) =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));

/** Mirror of the server's parcela: `month` holds parcela `installments − months(month → lastMonth)`; null outside 1..N. */
export const installmentOf = (month: string, lastMonth: string, installments: number) => {
  const installment = installments - monthsBetween(month, lastMonth);
  return installment >= 1 && installment <= installments ? installment : null;
};

/** The `last_month` of a parcelado bill with `paid` parcelas behind; the next is this month while its due date is ahead (D17). */
export const lastMonthOf = (today: string, dueDay: number, installments: number, paid: number) => {
  const thisMonth = today.slice(0, 7);
  const due = `${thisMonth}-${String(Math.min(dueDay, lastDay(thisMonth))).padStart(2, "0")}`;
  const first = due >= today ? thisMonth : addMonths(thisMonth, 1);
  return `${addMonths(first, installments - paid - 1)}-01`;
};

export const hasEnded = (bill: Pick<Bill, "last_month">, today: string) =>
  bill.last_month != null && bill.last_month.slice(0, 7) < today.slice(0, 7);
