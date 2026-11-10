import type { DraftRow } from "@/entities/forecast/months-ahead";
import type { Schemas } from "@/shared/api/client";
import { repeatDates } from "@/shared/lib/date";
import { installmentCents } from "@/shared/lib/installments";
import { cents } from "@/shared/lib/tier";

export type Plan = "once" | "repeat" | "installments";

type Draft = { kind: Schemas["CategoryKind"]; amount: string; date: string; plan: Plan; count: number };

/** What Lançar would write, in signed cents: one row, `count` copies (Repetir) or `count` parcelas (Parcelar). */
export const draftRows = ({ kind, amount, date, plan, count }: Draft): DraftRow[] => {
  const sign = kind === "income" ? 1 : -1;
  if (plan === "once") return [{ date, cents: sign * cents(amount) }];
  const dates = [date, ...repeatDates(date, count)];
  const parts = plan === "installments" ? installmentCents(cents(amount), count) : dates.map(() => cents(amount));
  return dates.map((on, index) => ({ date: on, cents: sign * parts[index] }));
};
