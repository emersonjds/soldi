"use client";

import { useState } from "react";

import { ArrowRight, CalendarRange } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useForecast } from "@/entities/forecast/forecast-query";
import { MonthChips } from "@/entities/forecast/month-chips";
import { isFlat, monthsAhead } from "@/entities/forecast/months-ahead";
import { cn } from "@/lib/utils";

const HORIZONS = [
  { value: "6", label: "6 meses" },
  { value: "12", label: "12 meses" },
];

const toggle =
  "h-11 rounded-xl! font-semibold text-base text-muted-foreground data-[state=on]:bg-brand data-[state=on]:text-brand-foreground data-[state=on]:shadow-sm";

type Props = { viewing: string; onOpen: (month: string) => void };

type MonthsAheadProps = Props & {
  /** `Posso comprar?`: Lançar with Simular on. */
  onSimulate: () => void;
  className?: string;
};

/**
 * `Próximos meses`: today's month and the next 5 or 11, each by its lowest balance and tier (D16); the toggle asks
 * nothing new. Nothing renders while loading or when nothing lands ahead (D25).
 */
export const MonthsAhead = ({ viewing, onOpen, onSimulate, className }: MonthsAheadProps) => {
  const [count, setCount] = useState("6");
  const forecast = useForecast();
  const failed = forecast.isError && !forecast.data;
  if (!failed && (!forecast.data || isFlat(forecast.data))) return null;
  return (
    <section
      aria-labelledby="months-ahead-title"
      className={cn("flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <h2 id="months-ahead-title" className="flex items-center gap-3 font-semibold text-lg leading-6">
          <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-primary">
            <CalendarRange className="size-5" aria-hidden />
          </span>
          Próximos meses
        </h2>
        <button
          type="button"
          onClick={onSimulate}
          className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary text-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Posso comprar?
          <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
      <ToggleGroup
        type="single"
        spacing={0}
        value={count}
        onValueChange={(value: string) => value && setCount(value)}
        aria-label="Horizonte"
        className="grid w-full grid-cols-2 rounded-2xl bg-muted p-1"
      >
        {HORIZONS.map((horizon) => (
          <ToggleGroupItem key={horizon.value} value={horizon.value} className={toggle}>
            {horizon.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {forecast.data ? (
        <MonthChips months={monthsAhead(forecast.data, Number(count))} current={viewing} onOpen={onOpen} />
      ) : (
        <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-sm">
          Não foi possível carregar.
          <button
            type="button"
            onClick={() => forecast.refetch()}
            className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            Tentar de novo
          </button>
        </p>
      )}
    </section>
  );
};
