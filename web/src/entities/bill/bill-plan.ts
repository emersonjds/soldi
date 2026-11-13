import { addMonths, lastDay } from "@/shared/lib/date";

import type { Bill } from "./bill-queries";

const monthsBetween = (from: string, to: string) =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));

/** Mirror of the server's parcela: `month` holds parcela `installments − months(month → lastMonth)`; null outside 1..N. */
export const installmentOf = (month: string, lastMonth: string, installments: number) => {
  const installment = installments - monthsBetween(month, lastMonth);
  return installment >= 1 && installment <= installments ? installment : null;
};

/** `YYYY-MM` of the next parcela: this month while its due date is ahead, else the next (D17 `active_since`). */
export const firstMonth = (today: string, dueDay: number) => {
  const month = today.slice(0, 7);
  const due = `${month}-${String(Math.min(dueDay, lastDay(month))).padStart(2, "0")}`;
  return due >= today ? month : addMonths(month, 1);
};

/** The `last_month` of a parcelado bill with `paid` parcelas behind. */
export const lastMonthOf = (today: string, dueDay: number, installments: number, paid: number) =>
  `${addMonths(firstMonth(today, dueDay), installments - paid - 1)}-01`;

export const hasEnded = (bill: Pick<Bill, "last_month">, today: string) =>
  bill.last_month != null && bill.last_month.slice(0, 7) < today.slice(0, 7);
