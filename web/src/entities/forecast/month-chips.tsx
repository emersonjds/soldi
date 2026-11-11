import { cn } from "@/lib/utils";
import { type Currency, useCurrency } from "@/shared/lib/currency";
import { monthYear } from "@/shared/lib/date";
import { formatMoney, formatWhole } from "@/shared/lib/money";
import { cents, TIER_LABEL, TIER_STYLE } from "@/shared/lib/tier";

import type { MonthAhead } from "./months-ahead";

const reds = (count: number) => (count === 1 ? "1 dia no vermelho" : `${count} dias no vermelho`);

const nameOf = (
  { month, lowest, low, redDays }: MonthAhead,
  neutral: boolean,
  prior: string | null,
  currency: Currency,
) => {
  const name = monthYear(month);
  if (lowest === null) return `${name}: antes do início`;
  if (neutral) return name;
  const parts = [TIER_LABEL[lowest], `menor saldo ${formatMoney(low, currency)}`];
  if (redDays > 0) parts.push(reds(redDays));
  if (prior !== null) parts.push(`antes ${formatMoney(prior, currency)}`);
  return `${name}: ${parts.join(", ")}`;
};

/** The low of `month` in `before` when it differs from `low`; months are matched by name, never by position. */
const priorLow = (before: MonthAhead[] | undefined, month: string, low: string) => {
  const prior = before?.find((ahead) => ahead.month === month)?.low ?? null;
  return prior !== null && cents(prior) !== cents(low) ? prior : null;
};

const chip = "relative flex min-h-16 w-full flex-col items-start justify-center gap-0.5 rounded-xl px-2 py-2 text-left";

type MonthChipsProps = {
  months: MonthAhead[];
  /** Nothing lands ahead: no tier, no amount, no badge. */
  neutral?: boolean;
  /** `YYYY-MM` on screen, ringed. */
  current?: string;
  /** Absent: static chips, as in the Simular preview. */
  onOpen?: (month: string) => void;
  /** The same months without the draft: a moved low reads `antes`. */
  before?: MonthAhead[];
};

/** One chip per month: its lowest balance in whole units, the tier's color with its label (D9) and a red-days badge (white on `tier-red`, 4.83:1). */
export const MonthChips = ({ months, neutral = false, current, onOpen, before }: MonthChipsProps) => {
  const currency = useCurrency();
  return (
    <ul className="grid grid-cols-3 gap-2">
      {months.map((ahead) => {
        const { month, lowest, low, redDays } = ahead;
        const prior = lowest !== null && !neutral ? priorLow(before, month, low) : null;
        const style = cn(
          chip,
          lowest !== null && !neutral ? TIER_STYLE[lowest].pill : "bg-muted text-muted-foreground",
          month === current && "ring-2 ring-primary",
        );
        const body = (
          <>
            <span className="font-semibold text-sm">{monthYear(month)}</span>
            {lowest === null && <span className="text-xs">Antes do início</span>}
            {lowest !== null && !neutral && (
              <>
                <span
                  className={cn(
                    "break-all font-bold tabular-nums",
                    formatWhole(low).replace(/\D/g, "").length >= 7 ? "text-xs" : "text-sm",
                  )}
                >
                  {formatWhole(low)}
                </span>
                {prior !== null && (
                  <span className="text-muted-foreground text-xs tabular-nums">antes {formatWhole(prior)}</span>
                )}
                <span className="text-xs">{TIER_LABEL[lowest]}</span>
                {redDays > 0 && (
                  <span
                    aria-hidden
                    className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-tier-red px-1 font-bold text-white text-xs"
                  >
                    {redDays}
                  </span>
                )}
              </>
            )}
          </>
        );
        const name = nameOf(ahead, neutral, prior, currency);
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
};
