import type { KeyboardEvent } from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { addMonths } from "@/shared/lib/date";

const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });

/** `2026-11` → `Novembro 2026`. */
const monthLabel = (month: string) => {
  const [year, index] = month.split("-").map(Number);
  const name = monthName.format(Date.UTC(year, index - 1, 1));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
};

/** `hero` on the indigo gradient, `surface` on a card or the top bar. */
const TONE = {
  hero: { pill: "bg-white/10", button: "hover:bg-white/10 focus-visible:outline-white" },
  surface: { pill: "bg-muted ring-1 ring-border", button: "hover:bg-accent focus-visible:outline-ring" },
};

type Tone = keyof typeof TONE;

type SwitcherProps = {
  legend: string;
  label: string;
  previousLabel: string;
  nextLabel: string;
  atStart: boolean;
  atEnd?: boolean;
  onShift: (delta: number) => void;
  tone?: Tone;
  className?: string;
};

/** `‹ label ›` in a pill; the arrow keys move too. */
export const Switcher = ({
  legend,
  label,
  previousLabel,
  nextLabel,
  atStart,
  atEnd = false,
  onShift,
  tone = "hero",
  className,
}: SwitcherProps) => {
  const previous = () => !atStart && onShift(-1);
  const next = () => !atEnd && onShift(1);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") previous();
    if (event.key === "ArrowRight") next();
  };
  const button = cn(
    "flex size-11 items-center justify-center rounded-full transition-colors focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-40",
    TONE[tone].button,
  );

  return (
    <fieldset
      onKeyDown={onKeyDown}
      className={cn("mx-auto flex w-fit items-center gap-2 rounded-full p-1 lg:mx-0", TONE[tone].pill, className)}
    >
      <legend className="sr-only">{legend}</legend>
      <button type="button" aria-label={previousLabel} className={button} disabled={atStart} onClick={previous}>
        <ChevronLeft className="size-5" />
      </button>
      <span aria-live="polite" className="min-w-36 text-center font-semibold text-base tabular-nums">
        {label}
      </span>
      <button type="button" aria-label={nextLabel} className={button} disabled={atEnd} onClick={next}>
        <ChevronRight className="size-5" />
      </button>
    </fieldset>
  );
};

/** The month `Switcher`: `YYYY-MM` in and out, never before `minMonth` (the opening balance's month). */
export const MonthSwitcher = ({
  month,
  minMonth,
  onMonthChange,
  tone,
  className,
}: {
  month: string;
  minMonth?: string;
  onMonthChange: (month: string) => void;
  tone?: Tone;
  className?: string;
}) => (
  <Switcher
    legend="Mês"
    label={monthLabel(month)}
    previousLabel="Mês anterior"
    nextLabel="Próximo mês"
    atStart={minMonth !== undefined && month <= minMonth}
    onShift={(delta) => onMonthChange(addMonths(month, delta))}
    tone={tone}
    className={className}
  />
);
