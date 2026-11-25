import type { Schemas } from "@/shared/api/client";
import { cents, fromCents } from "@/shared/lib/tier";
import type { SplitSegment } from "@/shared/ui/split-bar";

export type Split = {
  /** `income` while nothing passed it, else Gastos and Guardado. */
  base: "income" | "spent";
  /** What the bar draws: the sum of the segments above zero. */
  total: string;
  segments: SplitSegment[];
};

/**
 * D54 in whole cents: Gastos, Guardado (net of resgates) and what is left. Null without an
 * entrada (SOL-79 §2.4).
 */
export const splitOf = (totals: Schemas["MonthView"]["totals"]): Split | null => {
  const income = cents(totals.income);
  const saved = cents(totals.saved);
  const free = cents(totals.performance);
  if (income === 0) return null;

  const segments: SplitSegment[] = [
    { label: "Gastos", amount: totals.spent, tone: "bills" },
    ...(saved > 0 ? [{ label: "Guardado", amount: totals.saved, tone: "saved" } satisfies SplitSegment] : []),
    ...(free > 0 ? [{ label: "Livre restante", amount: fromCents(free), tone: "free" } satisfies SplitSegment] : []),
  ];
  const total = fromCents(segments.reduce((sum, segment) => sum + Math.max(cents(segment.amount), 0), 0));
  return { base: free < 0 ? "spent" : "income", total, segments };
};
