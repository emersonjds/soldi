"use client";

import { useState } from "react";

import { CalendarDays } from "lucide-react";
import { ptBR } from "react-day-picker/locale";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { todayISO } from "@/shared/lib/date";

const toDate = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/** A `YYYY-MM-DD` date on a 44px button reading `dd/MM/yyyy`, picked on a pt-BR calendar; `min` and `max` default to SOL-30's 2000..2100 bound. */
export const DateField = ({
  id,
  label,
  placeholder = "Escolher data",
  value,
  onChange,
  min = "2000-01-01",
  max = "2100-12-31",
  className,
}: {
  id?: string;
  label: string;
  /** Read while `value` is empty. */
  placeholder?: string;
  value: string;
  onChange: (date: string) => void;
  min?: string;
  max?: string;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const selected = value ? toDate(value) : undefined;
  const shown = selected && new Intl.DateTimeFormat("pt-BR").format(selected);

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        aria-label={shown ? `${label}, ${shown}` : label}
        className={cn(
          "flex min-h-11 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-left text-base tabular-nums transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          className,
        )}
      >
        <CalendarDays className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        {shown ?? <span className="text-muted-foreground">{placeholder}</span>}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={8}
        aria-label={label}
        className="max-h-(--radix-popover-content-available-height) w-auto overflow-y-auto p-0"
      >
        <Calendar
          mode="single"
          required
          autoFocus
          locale={ptBR}
          captionLayout="dropdown"
          selected={selected}
          defaultMonth={selected}
          startMonth={toDate(min)}
          endMonth={toDate(max)}
          disabled={[{ before: toDate(min) }, { after: toDate(max) }]}
          onSelect={(date) => {
            onChange(todayISO(date));
            setOpen(false);
          }}
          className="[--cell-size:min(--spacing(11),calc((100vw_-_32px)/7))]"
        />
      </PopoverContent>
    </Popover>
  );
};
