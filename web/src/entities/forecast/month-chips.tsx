import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";
import { type Currency, useCurrency } from "@/shared/lib/currency";
import { monthLong, monthShort } from "@/shared/lib/date";
import { formatMoney, formatWhole } from "@/shared/lib/money";
import { cents, TIER_LABEL, TIER_STYLE } from "@/shared/lib/tier";

import type { MonthAhead } from "./months-ahead";

const nameOf = ({ month, lowest, low }: MonthAhead, neutral: boolean, prior: string | null, currency: Currency) => {
  const name = monthLong(month);
  if (lowest === null) return `${name}: antes do início`;
  if (neutral) return name;
  const parts = [`menor saldo ${formatMoney(low, currency)}`, TIER_LABEL[lowest]];
  if (prior !== null) parts.push(`antes ${formatMoney(prior, currency)}`);
  return `${name}: ${parts.join(", ")}`;
};

/** The low of `month` in `before` when it differs from `low`; months are matched by name, never by position. */
const priorLow = (before: MonthAhead[] | undefined, month: string, low: string) => {
  const prior = before?.find((ahead) => ahead.month === month)?.low ?? null;
  return prior !== null && cents(prior) !== cents(low) ? prior : null;
};

const chip =
  "@container flex min-h-16 w-full min-w-0 flex-col items-start justify-center gap-0.5 rounded-xl px-[6%] py-2 text-left";

type MonthChipsProps = {
  months: MonthAhead[];
  /** Nothing lands ahead: no tier, no amount. */
  neutral?: boolean;
  /** `YYYY-MM` on screen, ringed. */
  current?: string;
  onOpen: (month: string) => void;
  /** The same months without the draft: a moved low reads `antes`. */
  before?: MonthAhead[];
};

/** A 4-column month grid: each month's lowest balance in whole units, its tier dot and its tier word (D22), a red month on `expense-soft`. */
/** A low fills the cell left of its tier dot (0.75rem with the gap) at 0.68em per glyph (Linux hinting draws wider than macOS), capped at `text-sm`. */
const lowFit = "[--low-fit:min(var(--text-sm),calc((100cqi_-_0.75rem)/(var(--glyphs)*0.68)))] text-(length:--low-fit)";
const glyphs = (amount: string): CSSProperties & { "--glyphs": number } => ({ "--glyphs": amount.length });

export const MonthChips = ({ months, neutral = false, current, onOpen, before }: MonthChipsProps) => {
  const currency = useCurrency();
  return (
    <ul className="grid grid-cols-4 gap-2">
      {months.map((ahead) => {
        const { month, lowest, low } = ahead;
        const shown = lowest !== null && !neutral;
        const prior = shown ? priorLow(before, month, low) : null;
        const style = cn(
          chip,
          shown && lowest === "red" ? "bg-expense-soft text-expense-text" : "bg-muted text-foreground",
          month === current && "ring-2 ring-primary",
        );
        const body = (
          <>
            <span className="font-semibold text-sm">{monthShort(month)}</span>
            {lowest === null && <span className="text-muted-foreground text-xs">Antes do início</span>}
            {shown && (
              <>
                <span className="flex w-full min-w-0 items-center gap-1">
                  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", TIER_STYLE[lowest].dot)} />
                  <span
                    style={glyphs(formatWhole(low))}
                    className={cn("min-w-0 whitespace-nowrap font-bold tabular-nums tracking-tight", lowFit)}
                  >
                    {formatWhole(low)}
                  </span>
                </span>
                {prior !== null && (
                  <span className="text-muted-foreground text-xs tabular-nums">antes {formatWhole(prior)}</span>
                )}
                <span className={cn("text-[11px]", lowest !== "red" && "text-muted-foreground")}>
                  {TIER_LABEL[lowest]}
                </span>
              </>
            )}
          </>
        );
        const name = nameOf(ahead, neutral, prior, currency);
        return (
          <li key={month} className="min-w-0">
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
