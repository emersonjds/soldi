"use client";

import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/skeleton";
import { useForecast } from "@/entities/forecast/forecast-query";
import { MonthChips } from "@/entities/forecast/month-chips";
import { type DraftRow, draftVerdict, monthsAhead, type Verdict, withDraft } from "@/entities/forecast/months-ahead";
import { settingsQuery } from "@/entities/settings/settings-query";
import { dayMonth } from "@/shared/lib/date";
import { TIER_LABEL } from "@/shared/lib/tier";
import { TierPill } from "@/shared/ui/tier-pill";

const SLOTS = ["d1", "d2", "d3", "d4", "d5", "d6", "d7"];

const dayName = (date: string, today: string) => {
  if (date === today) return "hoje";
  if (date.startsWith(today.slice(0, 7))) return `dia ${Number(date.slice(8))}`;
  return `dia ${dayMonth(date)}`;
};

const verdictLine = (verdict: Verdict, today: string) => {
  if (verdict.kind === "clear") return "Nenhum dia vermelho com essa compra.";
  if (verdict.kind === "already-red") return "Essa compra não cria dia vermelho novo.";
  return `Com essa compra, ${dayName(verdict.date, today)} vira ${TIER_LABEL.red}`;
};

const Body = ({ rows }: { rows: DraftRow[] | null }) => {
  const forecast = useForecast();
  const settings = useQuery(settingsQuery);
  if (!rows) return <p className="text-muted-foreground text-sm">Digite um valor para simular.</p>;
  if (forecast.isError || settings.isError)
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-sm">
        Não foi possível carregar.
        <button
          type="button"
          onClick={() => Promise.all([forecast.refetch(), settings.refetch()])}
          className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Tentar de novo
        </button>
      </p>
    );
  if (!forecast.data || !settings.data)
    return (
      <div className="flex flex-wrap gap-2">
        {SLOTS.map((slot) => (
          <Skeleton key={slot} className="h-6 w-24 rounded-full" />
        ))}
      </div>
    );
  const { today, days } = forecast.data;
  const after = withDraft(days, rows, settings.data);
  const week = after.filter((day) => day.date >= rows[0].date).slice(0, 7);
  const spans = new Set(rows.map((row) => row.date.slice(0, 7))).size > 1;
  return (
    <>
      {week.length > 0 && (
        <ol aria-label="Próximos 7 dias" className="flex flex-wrap gap-2">
          {week.map((day) => (
            <li key={day.date} className="flex items-center gap-1.5 text-sm">
              <span className="font-medium tabular-nums">{dayMonth(day.date)}</span>
              <TierPill tier={day.projected_tier} size="sm" />
            </li>
          ))}
        </ol>
      )}
      <p role="status" className="font-medium text-sm">
        {verdictLine(draftVerdict(days, after), today)}
      </p>
      {spans && (
        <>
          <h3 className="font-semibold text-sm">Meses com essa compra</h3>
          <MonthChips months={monthsAhead({ today, days: after }, 12)} />
        </>
      )}
    </>
  );
};

/** Posso comprar isso? The forecast with the draft applied, nothing written (D16); `rows` null: no valid amount yet. */
export const Simulation = ({ rows }: { rows: DraftRow[] | null }) => (
  <section aria-label="Simulação" className="flex flex-col gap-3 rounded-2xl bg-muted p-4">
    <Body rows={rows} />
  </section>
);
