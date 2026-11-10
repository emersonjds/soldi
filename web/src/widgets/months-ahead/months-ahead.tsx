"use client";

import { useState } from "react";

import { CalendarRange } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useForecast } from "@/entities/forecast/forecast-query";
import { MonthChips } from "@/entities/forecast/month-chips";
import { isFlat, monthsAhead } from "@/entities/forecast/months-ahead";
import { cn } from "@/lib/utils";

const HORIZONS = [
  { value: "6", label: "6 meses" },
  { value: "12", label: "12 meses" },
];

const SLOTS = Array.from({ length: 12 }, (_, index) => `slot-${index}`);

const toggle =
  "h-11 rounded-xl! font-semibold text-base text-muted-foreground data-[state=on]:bg-brand data-[state=on]:text-brand-foreground data-[state=on]:shadow-sm";

type Props = { viewing: string; onOpen: (month: string) => void };

const Body = ({ count, viewing, onOpen }: Props & { count: number }) => {
  const forecast = useForecast();
  if (forecast.isError)
    return (
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
    );
  if (!forecast.data)
    return (
      <div className="grid grid-cols-3 gap-2">
        {SLOTS.slice(0, count).map((slot) => (
          <Skeleton key={slot} data-testid="chip-skeleton" className="h-16 rounded-xl" />
        ))}
      </div>
    );
  const flat = isFlat(forecast.data);
  return (
    <>
      <MonthChips months={monthsAhead(forecast.data, count)} neutral={flat} current={viewing} onOpen={onOpen} />
      {flat && <p className="text-muted-foreground text-sm">Lance seus próximos meses para ver a cor deles aqui.</p>}
    </>
  );
};

/** `Próximos meses`: today's month and the next 5 or 11, each by its lowest tier (D16); the toggle asks nothing new. */
export const MonthsAhead = ({ viewing, onOpen, className }: Props & { className?: string }) => {
  const [count, setCount] = useState("6");
  return (
    <section
      aria-labelledby="months-ahead-title"
      className={cn("flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6", className)}
    >
      <h2 id="months-ahead-title" className="flex items-center gap-3 font-semibold text-lg leading-6">
        <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-primary">
          <CalendarRange className="size-5" aria-hidden />
        </span>
        Próximos meses
      </h2>
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
      <Body count={Number(count)} viewing={viewing} onOpen={onOpen} />
    </section>
  );
};
