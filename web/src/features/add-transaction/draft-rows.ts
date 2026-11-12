import { faturaDue } from "@/entities/bill/fatura-due";
import type { DraftRow } from "@/entities/forecast/months-ahead";
import type { Schemas } from "@/shared/api/client";
import { repeatDates } from "@/shared/lib/date";
import { installmentCents } from "@/shared/lib/installments";
import { cents } from "@/shared/lib/tier";

export type Plan = "once" | "repeat" | "installments";

type Draft = {
  kind: Schemas["CategoryKind"];
  amount: string;
  date: string;
  plan: Plan;
  count: number;
  card?: { closing_day: number; due_day: number };
};

/** What Lançar would write, in signed cents: one row, `count` copies (Repetir) or `count` parcelas (Parcelar); on a card, each lands on its fatura's due date (D28). */
export const draftRows = ({ kind, amount, date, plan, count, card }: Draft): DraftRow[] => {
  const sign = kind === "income" ? 1 : -1;
  const lands = (on: string) => (card ? faturaDue(on, card.closing_day, card.due_day) : on);
  if (plan === "once") return [{ date: lands(date), cents: sign * cents(amount) }];
  const dates = [date, ...repeatDates(date, count)];
  const parts = plan === "installments" ? installmentCents(cents(amount), count) : dates.map(() => cents(amount));
  return dates.map((on, index) => ({ date: lands(on), cents: sign * parts[index] }));
};
