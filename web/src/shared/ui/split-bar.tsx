import { cn } from "@/lib/utils";
import { useCurrency } from "@/shared/lib/currency";
import { formatMoney } from "@/shared/lib/money";
import { formatPct, wholeShare } from "@/shared/lib/percent";
import { cents, fromCents } from "@/shared/lib/tier";

import { Money } from "./money";

/** Spec §4.1: Guardado wears Economia's own color (D15); Livre is the empty track. */
const TONE = {
  bills: "bg-primary",
  saved: "bg-cat-11",
  daily: "bg-split-daily",
  free: "border border-border bg-muted",
};

export type SplitSegment = { label: string; amount: string; tone: keyof typeof TONE };

/**
 * A 12 px bar of the segments above zero, sized by their cents, with a legend of amounts and shares to one decimal,
 * half to even. The base is the sum of the segments; the image label reads the whole split as one sentence.
 */
export const SplitBar = ({
  label,
  segments,
  className,
}: {
  /** Names the base in the summary: `Entradas R$ 6.000,00: contas 30%, …`. */
  label: string;
  segments: SplitSegment[];
  className?: string;
}) => {
  const currency = useCurrency();
  const shown = segments
    .map((segment) => ({ ...segment, value: cents(segment.amount) }))
    .filter(({ value }) => value > 0);
  const base = shown.reduce((sum, { value }) => sum + value, 0);
  const rows = shown.map((segment) => ({
    ...segment,
    share: formatPct((wholeShare(segment.value * 10, base) / 10).toFixed(1)),
  }));
  const summary = `${label} ${formatMoney(fromCents(base), currency)}: ${rows
    .map((row) => `${row.label.toLowerCase()} ${row.share}`)
    .join(", ")}`;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div role="img" aria-label={summary} className="flex h-3 overflow-hidden rounded-full bg-muted">
        {rows.map((row) => (
          <span
            key={row.label}
            className={cn("basis-0 motion-safe:transition-[flex-grow] motion-safe:duration-200", TONE[row.tone])}
            style={{ flexGrow: row.value }}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {rows.map((row) => (
          <li key={row.label} className="flex items-start gap-2">
            <span aria-hidden className={cn("mt-1 size-2.5 shrink-0 rounded-full", TONE[row.tone])} />
            <span className="flex min-w-0 flex-col text-muted-foreground text-xs leading-4">
              <span>{row.label}</span>
              <Money amount={row.amount} className="font-medium text-foreground text-sm leading-5" />
              <span className="tabular-nums">{row.share}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
