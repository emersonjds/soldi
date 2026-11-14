"use client";

import { useId } from "react";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const input = "h-12 text-base md:text-base";

export const asDay = (text: string) =>
  /^\d{1,2}$/.test(text) && Number(text) >= 1 && Number(text) <= 31 ? Number(text) : 0;

const DAY_CHIPS = ["05", "10", "15", "20"];

export const DayField = ({
  id,
  label,
  value,
  error,
  onChange,
  autoFocus,
  placeholder = "10",
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) => (
  <Input
    id={id}
    inputMode="numeric"
    placeholder={placeholder}
    value={value}
    autoFocus={autoFocus}
    onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 2))}
    className={`${input} min-w-0 tabular-nums`}
    aria-label={label}
    aria-invalid={Boolean(error)}
  />
);

export const ClosingDay = ({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) => {
  const id = useId();
  return (
    <Field className="gap-1.5" data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>Fecha dia</FieldLabel>
      <DayField id={id} label="Fecha dia" value={value} error={error} onChange={onChange} />
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
};

const chip = "min-h-11 rounded-xl px-1 font-medium text-sm leading-4 transition-colors";

/** Chips for the usual days, then any day 1–31. */
export const DueDay = ({
  value,
  error,
  onChange,
  label,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
  label: string;
}) => {
  const id = useId();
  const day = asDay(value);
  return (
    <Field className="gap-1.5" data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="grid grid-cols-5 gap-2">
        {DAY_CHIPS.map((chosen) => {
          const pressed = day === Number(chosen);
          return (
            <button
              key={chosen}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange(String(Number(chosen)))}
              className={cn(
                chip,
                pressed ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary",
              )}
            >
              Dia {chosen}
            </button>
          );
        })}
        <DayField id={id} label={label} value={value} error={error} onChange={onChange} />
      </div>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
};
