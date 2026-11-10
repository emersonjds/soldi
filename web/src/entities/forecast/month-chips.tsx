import { cn } from "@/lib/utils";
import { monthYear } from "@/shared/lib/date";
import { TIER_LABEL, TIER_STYLE } from "@/shared/lib/tier";

import type { MonthAhead } from "./months-ahead";

const reds = (count: number) => (count === 1 ? "1 dia no vermelho" : `${count} dias no vermelho`);

const nameOf = ({ month, lowest, redDays }: MonthAhead, neutral: boolean) => {
  const name = monthYear(month);
  if (lowest === null) return `${name}: antes do início`;
  if (neutral) return name;
  return redDays > 0 ? `${name}: ${TIER_LABEL[lowest]}, ${reds(redDays)}` : `${name}: ${TIER_LABEL[lowest]}`;
};

const chip = "relative flex min-h-16 w-full flex-col items-start justify-center gap-0.5 rounded-xl px-2 py-2 text-left";

type MonthChipsProps = {
  months: MonthAhead[];
  /** Nothing lands ahead: no tier, no badge. */
  neutral?: boolean;
  /** `YYYY-MM` on screen, ringed. */
  current?: string;
  /** Absent: static chips, as in the Simular preview. */
  onOpen?: (month: string) => void;
};

/** One chip per month, the tier's color with its label (D9) and a red-days badge (white on `tier-red`, 4.83:1). */
export const MonthChips = ({ months, neutral = false, current, onOpen }: MonthChipsProps) => (
  <ul className="grid grid-cols-3 gap-2">
    {months.map((ahead) => {
      const { month, lowest, redDays } = ahead;
      const tiered = lowest !== null && !neutral;
      const style = cn(
        chip,
        tiered ? TIER_STYLE[lowest].pill : "bg-muted text-muted-foreground",
        month === current && "ring-2 ring-primary",
      );
      const body = (
        <>
          <span className="font-semibold text-sm">{monthYear(month)}</span>
          {lowest === null && <span className="text-xs">Antes do início</span>}
          {tiered && <span className="text-xs">{TIER_LABEL[lowest]}</span>}
          {tiered && redDays > 0 && (
            <span
              aria-hidden
              className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-tier-red px-1 font-bold text-white text-xs"
            >
              {redDays}
            </span>
          )}
        </>
      );
      const name = nameOf(ahead, neutral);
      if (!onOpen)
        return (
          <li key={month} aria-label={name} className={style}>
            {body}
          </li>
        );
      return (
        <li key={month}>
          <button
            type="button"
            aria-label={name}
            aria-disabled={lowest === null || undefined}
            aria-current={month === current ? "date" : undefined}
            onClick={lowest === null ? undefined : () => onOpen(month)}
            className={cn(style, "focus-visible:outline-2 focus-visible:outline-ring")}
          >
            {body}
          </button>
        </li>
      );
    })}
  </ul>
);
