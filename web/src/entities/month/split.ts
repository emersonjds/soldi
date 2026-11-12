import type { Schemas } from "@/shared/api/client";
import { cents, fromCents } from "@/shared/lib/tier";
import type { SplitSegment } from "@/shared/ui/split-bar";

export type Split = {
  /** `income` while nothing passed it, else the outflow (`bills + daily`). */
  base: "income" | "outflow";
  segments: SplitSegment[];
};

/**
 * Spec 2026-11-10 §2.1 in whole cents: the deposits (`saved + withdrawn`) are inside `bills`.
 * Guardado is the month's net saving; a resgate is money back, so it joins Livre restante.
 * Null without an entrada (SOL-79 §2.4).
 */
export const splitOf = (totals: Schemas["MonthView"]["totals"]): Split | null => {
  const income = cents(totals.income);
  const saved = cents(totals.saved);
  const withdrawn = cents(totals.withdrawn);
  const free = cents(totals.performance) + withdrawn;
  if (income === 0) return null;

  const segments: SplitSegment[] = [
    { label: "Contas fixas", amount: fromCents(cents(totals.bills) - saved - withdrawn), tone: "bills" },
    ...(saved > 0 ? [{ label: "Guardado", amount: totals.saved, tone: "saved" } satisfies SplitSegment] : []),
    { label: "Gastos diários", amount: totals.daily, tone: "daily" },
    ...(free > 0 ? [{ label: "Livre restante", amount: fromCents(free), tone: "free" } satisfies SplitSegment] : []),
  ];
  return { base: free < 0 ? "outflow" : "income", segments };
};
