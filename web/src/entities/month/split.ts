import type { Schemas } from "@/shared/api/client";
import { cents, fromCents } from "@/shared/lib/tier";
import type { SplitSegment } from "@/shared/ui/split-bar";

export type Split = {
  /** `income` while nothing passed it, else the outflow (`bills + daily`). */
  base: "income" | "outflow";
  segments: SplitSegment[];
};

/**
 * Spec 2026-11-10 §2.1 in whole cents: the deposits (`saved + withdrawn`) are inside `bills`,
 * `performance = income − bills − daily`. Null without an entrada (SOL-79 §2.4).
 */
export const splitOf = (totals: Schemas["MonthView"]["totals"]): Split | null => {
  const income = cents(totals.income);
  const bills = cents(totals.bills);
  const deposits = cents(totals.saved) + cents(totals.withdrawn);
  const performance = cents(totals.performance);
  if (income === 0) return null;

  const segments: SplitSegment[] = [
    { label: "Contas fixas", amount: fromCents(bills - deposits), tone: "bills" },
    ...(deposits > 0 ? [{ label: "Guardado", amount: fromCents(deposits), tone: "saved" } satisfies SplitSegment] : []),
    { label: "Gastos diários", amount: totals.daily, tone: "daily" },
    ...(performance > 0
      ? [{ label: "Livre restante", amount: totals.performance, tone: "free" } satisfies SplitSegment]
      : []),
  ];
  return { base: performance < 0 ? "outflow" : "income", segments };
};
