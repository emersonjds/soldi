import type { Schemas } from "@/shared/api/client";
import { addMonths } from "@/shared/lib/date";
import { cents, fromCents, type Tier, type TierBounds, tierOf } from "@/shared/lib/tier";

export type Forecast = Schemas["Forecast"];
export type ForecastDay = Schemas["ForecastDay"];
/** `low`: the month's lowest projected balance; it and `lowest` are null before the opening date. */
export type MonthAhead = { month: string; redDays: number } & (
  | { lowest: Tier; low: string }
  | { lowest: null; low: null }
);

/** The `count` months from today's: each one's lowest day, its tier and its red days. */
export const monthsAhead = ({ today, days }: Forecast, count: number): MonthAhead[] =>
  Array.from({ length: count }, (_, offset) => {
    const month = addMonths(today.slice(0, 7), offset);
    const inMonth = days.filter((day) => day.date.startsWith(month));
    if (inMonth.length === 0) return { month, lowest: null, low: null, redDays: 0 };
    const low = inMonth.reduce((lowest, day) =>
      cents(day.projected_balance) < cents(lowest.projected_balance) ? day : lowest,
    );
    return {
      month,
      lowest: low.projected_tier,
      low: low.projected_balance,
      redDays: inMonth.filter((day) => day.projected_tier === "red").length,
    };
  });

/** Nothing lands ahead: every day holds the first day's balance, and it is not red (a red one shows its tier). */
export const isFlat = ({ days }: Forecast) =>
  days.length > 0 &&
  days[0].projected_tier !== "red" &&
  days.every((day) => cents(day.projected_balance) === cents(days[0].projected_balance));

/** A draft entry in signed cents: an outflow is negative. */
export type DraftRow = { date: string; cents: number };

/** `days` with every draft row dated on or before each one added, recolored with the user's bounds. */
export const withDraft = (days: ForecastDay[], rows: DraftRow[], bounds: TierBounds): ForecastDay[] =>
  days.map((day) => {
    const shift = rows.reduce((sum, row) => (row.date <= day.date ? sum + row.cents : sum), 0);
    const balance = fromCents(cents(day.projected_balance) + shift);
    return { ...day, projected_balance: balance, projected_tier: tierOf(balance, bounds) };
  });

export type Verdict = { kind: "turns-red"; date: string } | { kind: "already-red" } | { kind: "clear" };

/** The first day the draft turns red; `already-red` when red days exist but the draft adds none. */
export const draftVerdict = (before: ForecastDay[], after: ForecastDay[]): Verdict => {
  const turned = after.find((day, index) => day.projected_tier === "red" && before[index].projected_tier !== "red");
  if (turned) return { kind: "turns-red", date: turned.date };
  return after.some((day) => day.projected_tier === "red") ? { kind: "already-red" } : { kind: "clear" };
};
