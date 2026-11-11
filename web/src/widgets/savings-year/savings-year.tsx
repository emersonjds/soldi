"use client";

import { useState } from "react";

import Link from "next/link";

import { useSavingsYear } from "@/entities/report/report-query";
import { useSettings } from "@/entities/settings/settings-query";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { useCurrency } from "@/shared/lib/currency";
import { monthName, todayISO } from "@/shared/lib/date";
import { formatMoney } from "@/shared/lib/money";
import { formatPct } from "@/shared/lib/percent";
import { DashCard } from "@/shared/ui/dash-card";
import { Money } from "@/shared/ui/money";
import { Switcher } from "@/shared/ui/month-switcher";
import { PageError, SkeletonRows } from "@/shared/ui/page-state";

const TITLE = "Economia do ano";

const LEVELS = [
  { legend: "< 5%", word: "faixa baixa", dot: "bg-tier-red" },
  { legend: "5% a 15%", word: "faixa média", dot: "bg-tier-yellow" },
  { legend: "> 15%", word: "faixa alta", dot: "bg-tier-green" },
];

/** Below 5 red, 5 to 15 inclusive amber, above 15 green. */
const levelOf = (pct: string) => {
  const value = Number(pct);
  if (value < 5) return LEVELS[0];
  return value <= 15 ? LEVELS[1] : LEVELS[2];
};

const Dot = ({ className }: { className: string }) => (
  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", className)} />
);

/** `2026-11` → `Novembro`. */
const monthTitle = (month: string) => {
  const name = monthName(`${month}-01`, month);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
};

const MonthRow = ({ month, current }: { month: Schemas["SavingsMonth"]; current: boolean }) => {
  const currency = useCurrency();
  const name = monthTitle(month.month);
  const share = month.rate_pct ? `${formatPct(month.rate_pct)} das entradas` : "sem entradas";
  const level = month.rate_pct ? levelOf(month.rate_pct) : undefined;
  return (
    <li>
      <Link
        href={`/mes?m=${month.month}`}
        aria-label={`${name} de ${month.month.slice(0, 4)}: guardou ${formatMoney(month.saved, currency)}, ${share}`}
        className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2 font-medium text-base">
            {name}
            {current && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary text-xs">Atual</span>
            )}
          </span>
          <span className="text-muted-foreground text-sm">
            Entradas: <Money amount={month.income} />
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <Money amount={month.saved} className="font-semibold" />
          <span className="flex items-center gap-1.5 text-muted-foreground text-sm tabular-nums">
            {level && (
              <>
                <Dot className={level.dot} />
                <span className="sr-only">{level.word}</span>
              </>
            )}
            {month.rate_pct ? formatPct(month.rate_pct) : "—"}
          </span>
        </span>
      </Link>
    </li>
  );
};

/** §8.2: the year's Economia month by month, between the opening year and this one. */
export const SavingsYear = ({ className }: { className?: string }) => {
  const today = todayISO().slice(0, 7);
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const settings = useSettings();
  const savings = useSavingsYear(year);
  const minYear = settings.data && Number(settings.data.opening_date.slice(0, 4));

  const body = () => {
    if (savings.isError && !savings.data)
      return <PageError message="Não foi possível carregar o ano." onRetry={() => savings.refetch()} />;
    if (!savings.data) return <SkeletonRows count={6} />;
    if (savings.data.months.length === 0)
      return <p className="py-6 text-center text-muted-foreground">Nada para mostrar em {year}.</p>;
    return (
      <>
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">Guardado em {year}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Money amount={savings.data.saved_total} size="figure" />
            {savings.data.rate_pct && (
              <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary text-sm tabular-nums">
                {formatPct(savings.data.rate_pct)} das entradas
              </span>
            )}
          </div>
        </div>
        <ul aria-label="Faixas" className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-sm">
          {LEVELS.map((level) => (
            <li key={level.legend} className="flex items-center gap-1.5">
              <Dot className={level.dot} />
              {level.legend}
            </li>
          ))}
        </ul>
        <ul className="flex flex-col divide-y divide-border">
          {savings.data.months.map((month) => (
            <MonthRow key={month.month} month={month} current={month.month === today} />
          ))}
        </ul>
      </>
    );
  };

  return (
    <DashCard title={TITLE} className={className}>
      <div className="flex flex-col gap-4">
        <Switcher
          legend="Ano"
          label={String(year)}
          previousLabel="Ano anterior"
          nextLabel="Próximo ano"
          atStart={minYear !== undefined && year <= minYear}
          atEnd={year >= thisYear}
          onShift={(delta) => setYear(year + delta)}
          tone="surface"
        />
        {body()}
      </div>
    </DashCard>
  );
};
