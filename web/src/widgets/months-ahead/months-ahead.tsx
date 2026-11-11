"use client";

import { ArrowRight, CalendarRange } from "lucide-react";

import { useForecast } from "@/entities/forecast/forecast-query";
import { MonthChips } from "@/entities/forecast/month-chips";
import { isFlat, monthsAhead } from "@/entities/forecast/months-ahead";
import { cn } from "@/lib/utils";

type Props = { viewing: string; onOpen: (month: string) => void };

type MonthsAheadProps = Props & {
  /** `Posso comprar?`: Lançar with Simular on. */
  onSimulate: () => void;
  className?: string;
};

/**
 * `Próximos meses`: today's month and the next 11, always, each by its lowest balance and tier (D16). Nothing renders while loading or when nothing lands ahead (D25).
 */
export const MonthsAhead = ({ viewing, onOpen, onSimulate, className }: MonthsAheadProps) => {
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
      {forecast.data ? (
        <MonthChips months={monthsAhead(forecast.data, 12)} current={viewing} onOpen={onOpen} />
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
