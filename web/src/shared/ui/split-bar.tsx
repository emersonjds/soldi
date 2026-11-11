import { cn } from "@/lib/utils";
import { useCurrency } from "@/shared/lib/currency";
import { formatMoney } from "@/shared/lib/money";
import { wholeShare } from "@/shared/lib/percent";
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
 * A 12 px bar of the segments above zero, sized by their cents, with a legend of amounts and shares.
 * The base is the sum of the segments; the image label reads the whole split as one sentence.
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
  const rows = shown.map((segment) => ({ ...segment, share: `${wholeShare(segment.value, base)}%` }));
  const summary = `${label} ${formatMoney(fromCents(base), currency)}: ${rows
    .map((row) => `${row.label.toLowerCase()} ${row.share}`)
    .join(", ")}`;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div role="img" aria-label={summary} className="flex h-3 gap-0.5 overflow-hidden rounded-[4px]">
        {rows.map((row) => (
          <span
            key={row.label}
            className={cn("basis-0 motion-safe:transition-[flex-grow] motion-safe:duration-200", TONE[row.tone])}
            style={{ flexGrow: row.value }}
          />
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-sm leading-5">
            <span aria-hidden className={cn("size-3 shrink-0 rounded-[4px]", TONE[row.tone])} />
            <span className="font-medium">{row.label}</span>
            <span className="ml-auto whitespace-nowrap tabular-nums">
              <Money amount={row.amount} /> · {row.share}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
