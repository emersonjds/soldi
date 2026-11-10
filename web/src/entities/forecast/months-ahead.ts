import type { Schemas } from "@/shared/api/client";
import { addMonths } from "@/shared/lib/date";
import { cents, type Tier } from "@/shared/lib/tier";

export type Forecast = Schemas["Forecast"];
export type ForecastDay = Schemas["ForecastDay"];
export type MonthAhead = { month: string; lowest: Tier | null; redDays: number };

/** The `count` months from today's: the tier of each one's lowest day and its red days; `lowest` null before the opening date. */
export const monthsAhead = ({ today, days }: Forecast, count: number): MonthAhead[] =>
  Array.from({ length: count }, (_, offset) => {
    const month = addMonths(today.slice(0, 7), offset);
    const inMonth = days.filter((day) => day.date.startsWith(month));
    if (inMonth.length === 0) return { month, lowest: null, redDays: 0 };
    const low = inMonth.reduce((lowest, day) =>
      cents(day.projected_balance) < cents(lowest.projected_balance) ? day : lowest,
    );
    return { month, lowest: low.projected_tier, redDays: inMonth.filter((day) => day.projected_tier === "red").length };
  });

/** Nothing lands ahead: every day holds the first day's balance, and it is not red (a red one shows its tier). */
export const isFlat = ({ days }: Forecast) =>
  days.length > 0 &&
  days[0].projected_tier !== "red" &&
  days.every((day) => cents(day.projected_balance) === cents(days[0].projected_balance));
