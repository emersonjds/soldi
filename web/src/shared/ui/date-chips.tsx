import { Check } from "lucide-react";

import { useIsLg } from "@/hooks/use-lg";
import { cn } from "@/lib/utils";
import { shortDay, todayISO, yesterdayISO } from "@/shared/lib/date";
import { DateField } from "@/shared/ui/date-field";

const chip =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full bg-muted px-4 font-medium text-base transition-colors aria-pressed:bg-secondary aria-pressed:text-primary focus-visible:outline-2 focus-visible:outline-ring";

/** Hoje (`Hoje (5 nov)` from 1024px), Ontem or any day; `value`, `min` and `max` are `YYYY-MM-DD`, and a chip outside them is left out. */
export const DateChips = ({
  legend,
  legendClassName,
  value,
  onChange,
  min,
  max,
}: {
  legend: string;
  legendClassName?: string;
  value: string;
  onChange: (date: string) => void;
  min?: string;
  max?: string;
}) => {
  const today = todayISO();
  const yesterday = yesterdayISO();
  const isLg = useIsLg();
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
      <legend className={cn("mb-2 font-semibold text-sm", legendClassName)}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {pick(today, isLg ? `Hoje (${shortDay(today)})` : "Hoje")}
        {pick(yesterday, "Ontem")}
        <DateField
          label="Outra data"
          placeholder="Outra data"
          value={value === today || value === yesterday ? "" : value}
          onChange={onChange}
          min={min}
          max={max}
          className="w-auto rounded-full border-0 bg-muted px-4 font-medium"
        />
      </div>
    </fieldset>
  );
};
