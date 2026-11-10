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

const verdictLine = (verdict: Verdict, today: string, income: boolean) => {
  const subject = income ? "esse lançamento" : "essa compra";
  if (verdict.kind === "clear") return `Nenhum dia vermelho com ${subject}.`;
  if (verdict.kind === "already-red")
    return `${income ? "Esse lançamento" : "Essa compra"} não cria dia vermelho novo.`;
  return `Com ${subject}, ${dayName(verdict.date, today)} vira ${TIER_LABEL.red}`;
};

type Props = {
  rows: DraftRow[] | null;
  /** Repetir or Parcelar on with a count outside 2..60. */
  countInvalid?: boolean;
};

/** Posso comprar isso? The forecast with the draft applied, nothing written (D16); `rows` null: nothing to simulate yet. */
export const Simulation = ({ rows, countInvalid }: Props) => {
  const forecast = useForecast();
  const settings = useQuery(settingsQuery);
  const failed = forecast.isError || settings.isError;
  const ready = rows && !failed && forecast.data && settings.data;
  const after = ready ? withDraft(forecast.data.days, rows, settings.data) : [];
  const week = ready ? after.filter((day) => day.date >= rows[0].date).slice(0, 7) : [];
  const spans = ready && new Set(rows.map((row) => row.date.slice(0, 7))).size > 1;
  let status = "";
  if (!rows) status = countInvalid ? "Escolha de 2 a 60 parcelas para simular." : "Digite um valor para simular.";
  else if (ready) {
    const verdict: Verdict = week.length > 0 ? draftVerdict(forecast.data.days, after) : { kind: "clear" };
    status = verdictLine(verdict, forecast.data.today, rows[0].cents > 0);
  }
  return (
    <section aria-label="Simulação" className="flex flex-col gap-3 rounded-2xl bg-muted p-4">
      {rows && failed && (
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
      )}
      {rows && !failed && !ready && (
        <div className="flex flex-wrap gap-2">
          {SLOTS.map((slot) => (
            <Skeleton key={slot} className="h-6 w-24 rounded-full" />
          ))}
        </div>
      )}
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
      <p role="status" className={rows ? "font-medium text-sm" : "text-muted-foreground text-sm"}>
        {status}
      </p>
      {spans && ready && (
        <>
          <h3 className="font-semibold text-sm">Meses com essa compra</h3>
          <MonthChips months={monthsAhead({ today: forecast.data.today, days: after }, 12)} />
        </>
      )}
    </section>
  );
};
