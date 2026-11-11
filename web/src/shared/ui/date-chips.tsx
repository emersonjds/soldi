import { Check } from "lucide-react";

import { todayISO, yesterdayISO } from "@/shared/lib/date";
import { DateField } from "@/shared/ui/date-field";

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
        <DateField
          label="Outra data"
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          className="w-auto rounded-full border-0 bg-muted px-4 font-medium"
        />
      </div>
    </fieldset>
  );
};
