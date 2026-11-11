import type { Schemas } from "@/shared/api/client";
import { wholeShare } from "@/shared/lib/percent";
import { cents, fromCents } from "@/shared/lib/tier";
import type { SplitSegment } from "@/shared/ui/split-bar";

export type Split = {
  /** `income` while nothing passed it, else the outflow (`bills + daily`). */
  base: "income" | "outflow";
  segments: SplitSegment[];
  line: { kind: "free"; pct: number } | { kind: "over"; amount: string } | { kind: "even" };
};

/** Spec 2026-11-10 §2.1 in whole cents: `saved` is inside `bills`, `performance = income − bills − daily`. */
export const splitOf = (totals: Schemas["MonthView"]["totals"]): Split | null => {
  const income = cents(totals.income);
  const bills = cents(totals.bills);
  const daily = cents(totals.daily);
  const saved = cents(totals.saved);
  const performance = cents(totals.performance);
  if (income === 0 && bills + daily === 0) return null;

  const segments: SplitSegment[] = [
    { label: "Contas", amount: fromCents(saved > 0 ? bills - saved : bills), tone: "bills" },
    ...(saved > 0 ? [{ label: "Guardado", amount: totals.saved, tone: "saved" } as const] : []),
    { label: "Diário", amount: totals.daily, tone: "daily" },
    ...(performance > 0 ? [{ label: "Livre", amount: totals.performance, tone: "free" } as const] : []),
  ];
  if (performance < 0) return { base: "outflow", segments, line: { kind: "over", amount: fromCents(-performance) } };
  if (performance === 0) return { base: "income", segments, line: { kind: "even" } };
  return { base: "income", segments, line: { kind: "free", pct: wholeShare(performance, income) } };
};
