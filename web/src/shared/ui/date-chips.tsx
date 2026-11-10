import { CalendarDays, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { todayISO, yesterdayISO } from "@/shared/lib/date";

const chip =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full bg-muted px-4 font-medium text-base transition-colors aria-pressed:bg-secondary aria-pressed:text-primary focus-visible:outline-2 focus-visible:outline-ring";

/** Hoje, Ontem or any day; `value`, `min` and `max` are `YYYY-MM-DD`, and a chip outside them is left out. */
export const DateChips = ({
  legend,
  value,
  onChange,
  min,
  max,
}: {
  legend: string;
  value: string;
  onChange: (date: string) => void;
  min?: string;
  max?: string;
}) => {
  const today = todayISO();
  const yesterday = yesterdayISO();
  const pick = (date: string, label: string) =>
    (!min || min <= date) &&
    (!max || date <= max) && (
      <button type="button" className={chip} aria-pressed={value === date} onClick={() => onChange(date)}>
        {value === date && <Check className="size-4" aria-hidden />}
        {label}
      </button>
    );

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-semibold text-sm">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {pick(today, "Hoje")}
        {pick(yesterday, "Ontem")}
        <label className={cn(chip, "has-focus-visible:outline-2 has-focus-visible:outline-ring")}>
          <CalendarDays className="size-4 shrink-0" aria-hidden />
          <span className="sr-only">Outra data</span>
          <input
            type="date"
            value={value}
            min={min}
            max={max}
            onChange={(event) => event.target.value && onChange(event.target.value)}
            onClick={(event) => event.currentTarget.showPicker?.()}
            className="w-34 bg-transparent text-base outline-none"
          />
        </label>
      </div>
    </fieldset>
  );
};
