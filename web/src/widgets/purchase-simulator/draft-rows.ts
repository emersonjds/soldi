import { faturaDue } from "@/entities/bill/fatura-due";
import type { DraftRow } from "@/entities/forecast/months-ahead";
import { repeatDates } from "@/shared/lib/date";
import { installmentCents } from "@/shared/lib/installments";
import { cents } from "@/shared/lib/tier";

type Draft = {
  amount: string;
  date: string;
  /** 1 for à vista. */
  count: number;
  card?: { closing_day: number; due_day: number };
};

/** The purchase as negative cents per parcela, one a month from `date`; on a card, each lands on its fatura's due date (D28). */
export const draftRows = ({ amount, date, count, card }: Draft): DraftRow[] => {
  const parts = installmentCents(cents(amount), count);
  return [date, ...repeatDates(date, count)].map((on, index) => ({
    date: card ? faturaDue(on, card.closing_day, card.due_day) : on,
    cents: -parts[index],
  }));
};
