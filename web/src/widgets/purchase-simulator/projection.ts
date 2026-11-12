import { type DraftRow, type Forecast, type ForecastDay, withDraft } from "@/entities/forecast/months-ahead";
import { addMonths } from "@/shared/lib/date";
import { cents, type TierBounds } from "@/shared/lib/tier";

export type MonthProjection = {
  month: string;
  endBefore: string;
  endAfter: string;
  /** The month's lowest day after the purchase: the verdict and the tier read it (D23). */
  low: ForecastDay;
  /** Below zero after the purchase and not before. */
  red: boolean;
  alreadyRed: boolean;
  /** The parcela landing in the month, 1-based; 0 for none. */
  index: number;
  /** That parcela in positive cents. */
  parcela: number;
};

const lowest = (days: ForecastDay[]) =>
  days.reduce((low, day) => (cents(day.projected_balance) < cents(low.projected_balance) ? day : low));

const monthsBetween = (from: string, to: string) =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));

/** Today's month through the last parcela's, at most 12, each before and after `rows`. */
export const projectMonths = ({ today, days }: Forecast, rows: DraftRow[], bounds: TierBounds): MonthProjection[] => {
  const after = withDraft(days, rows, bounds);
  const first = today.slice(0, 7);
  const count = Math.min(12, monthsBetween(first, rows[rows.length - 1].date) + 1);
  return Array.from({ length: count }, (_, offset) => addMonths(first, offset)).flatMap((month) => {
    const at = days.flatMap((day, position) => (day.date.startsWith(month) ? [position] : []));
    if (at.length === 0) return [];
    const before = at.map((position) => days[position]);
    const now = at.map((position) => after[position]);
    const low = lowest(now);
    const negative = cents(low.projected_balance) < 0;
    const wasNegative = cents(lowest(before).projected_balance) < 0;
    const index = rows.findIndex((row) => row.date.startsWith(month)) + 1;
    return [
      {
        month,
        endBefore: before[before.length - 1].projected_balance,
        endAfter: now[now.length - 1].projected_balance,
        low,
        red: negative && !wasNegative,
        alreadyRed: negative && wasNegative,
        index,
        parcela: index ? -rows[index - 1].cents : 0,
      },
    ];
  });
};
