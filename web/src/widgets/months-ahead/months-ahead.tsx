"use client";

import Link from "next/link";

import { ArrowRight, CalendarRange } from "lucide-react";

import { useForecast } from "@/entities/forecast/forecast-query";
import { MonthChips } from "@/entities/forecast/month-chips";
import { isFlat, monthsAhead } from "@/entities/forecast/months-ahead";
import { activeEstimate, includesEstimate } from "@/entities/settings/daily-estimate";
import { useSettings } from "@/entities/settings/settings-query";
import { cn } from "@/lib/utils";
import { EstimateNote } from "@/shared/ui/estimate-note";

type Props = { viewing: string; onOpen: (month: string) => void };

type MonthsAheadProps = Props & { className?: string };

/**
 * `Próximos meses`: today's month and the next 11, always, each by its lowest balance and tier (D16). Nothing renders while loading or when nothing lands ahead (D25).
 */
export const MonthsAhead = ({ viewing, onOpen, className }: MonthsAheadProps) => {
  const forecast = useForecast();
  const settings = useSettings().data;
  const estimate =
    settings && forecast.data && includesEstimate(settings, forecast.data) ? activeEstimate(settings) : null;
  const failed = forecast.isError && !forecast.data;
  if (!failed && (!forecast.data || isFlat(forecast.data))) return null;
  return (
    <section
      aria-labelledby="months-ahead-title"
      className={cn("bg-card flex flex-col gap-4 rounded-2xl p-4 shadow-sm lg:p-6", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <h2 id="months-ahead-title" className="flex items-center gap-3 text-lg leading-6 font-semibold">
          <span className="bg-secondary text-primary flex size-10 items-center justify-center rounded-full">
            <CalendarRange className="size-5" aria-hidden />
          </span>
          Próximos meses
        </h2>
        <Link
          href="/posso-comprar"
          className="text-primary focus-visible:outline-ring inline-flex min-h-11 items-center gap-1 text-sm font-semibold hover:underline focus-visible:outline-2"
        >
          Posso comprar?
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      {forecast.data ? (
        <div className="flex flex-col gap-1">
          <MonthChips months={monthsAhead(forecast.data, 12)} current={viewing} onOpen={onOpen} />
          {estimate && <EstimateNote estimate={estimate} />}
        </div>
      ) : (
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
          Não foi possível carregar.
          <button
            type="button"
            onClick={() => forecast.refetch()}
            className="text-primary focus-visible:outline-ring inline-flex min-h-11 items-center font-semibold hover:underline focus-visible:outline-2"
          >
            Tentar de novo
          </button>
        </p>
      )}
    </section>
  );
};
