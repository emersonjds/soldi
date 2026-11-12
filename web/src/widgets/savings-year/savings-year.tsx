"use client";

import { type ReactNode, useId, useState } from "react";

import Link from "next/link";

import {
  BadgeCheck,
  CalendarDays,
  Download,
  MoreHorizontal,
  Pencil,
  PiggyBank,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSavingsYear } from "@/entities/report/report-query";
import { useSettings } from "@/entities/settings/settings-query";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { commaDecimal, downloadCsv } from "@/shared/lib/csv";
import { useCurrency } from "@/shared/lib/currency";
import { monthName, todayISO } from "@/shared/lib/date";
import { formatMoney } from "@/shared/lib/money";
import { formatPct } from "@/shared/lib/percent";
import { cents } from "@/shared/lib/tier";
import { Money } from "@/shared/ui/money";
import { Switcher } from "@/shared/ui/month-switcher";
import { PageError } from "@/shared/ui/page-state";
import { PageHero } from "@/widgets/month-header/month-header";

type Month = Schemas["SavingsMonth"];

const LEVELS = [
  { legend: "< 5%", word: "faixa baixa", dot: "bg-tier-red", pill: "bg-tier-red-soft text-tier-red-foreground" },
  { legend: "5% – 15%", word: "faixa média", dot: "bg-tier-yellow", pill: "bg-muted" },
  {
    legend: "> 15%",
    word: "faixa alta",
    dot: "bg-tier-green",
    pill: "bg-tier-green-soft text-tier-green-foreground",
  },
];

const FORECAST = { word: "previsto", dot: "bg-muted-foreground/40", pill: "bg-muted text-muted-foreground" };

/** Below 5 red, 5 to 15 inclusive amber, above 15 green. */
const levelOf = (pct: string) => {
  const value = Number(pct);
  if (value < 5) return LEVELS[0];
  return value <= 15 ? LEVELS[1] : LEVELS[2];
};

const card = "flex min-w-0 flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6";

const caption = "font-semibold text-[11px] text-muted-foreground uppercase leading-4 tracking-[0.12em]";

const Dot = ({ className }: { className: string }) => (
  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", className)} />
);

/** `2026-11` → `Novembro`. */
const monthTitle = (month: string) => {
  const name = monthName(`${month}-01`, month);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
};

const saved = (month: Month) => cents(month.saved) > 0;

/** Saving months in a row, ending at the last closed-or-current month, or the one before while it has not saved. */
const streak = (past: Month[]) => {
  if (past.length === 0) return 0;
  const run = saved(past[past.length - 1]) ? past : past.slice(0, -1);
  const broken = run.findLastIndex((month) => !saved(month));
  return run.length - broken - 1;
};

/** `Em andamento (fechamento em 25 dias)`, or `Fecha hoje` on the month's last day. */
const closing = (today: string) => {
  const [year, month, day] = today.split("-").map(Number);
  const left = new Date(year, month, 0).getDate() - day;
  if (left === 0) return "Fecha hoje";
  return `Em andamento (fechamento em ${left} ${left === 1 ? "dia" : "dias"})`;
};

const adjustHref = (month: string) => `/para-onde-vai?m=${month}&g=economia`;

const situation = (month: Month, current: string) => {
  if (month.forecast) return "Previsto";
  return month.month === current ? "Atual" : "";
};

const exportCsv = (year: number, months: Month[], current: string) => {
  const lines = months.map((month) =>
    [
      month.month,
      commaDecimal(month.income),
      commaDecimal(month.deposited),
      commaDecimal(month.withdrawn),
      month.rate_pct ? commaDecimal(month.rate_pct) : "",
      situation(month, current),
    ].join(";"),
  );
  downloadCsv(`soldi-economia-${year}.csv`, ["Mês;Entradas;Guardado;Resgatado;% Guardado;Situação", ...lines]);
};

const Rate = ({ month }: { month: Month }) => {
  if (!month.rate_pct) return <span className="text-muted-foreground">—</span>;
  const level = month.forecast ? FORECAST : levelOf(month.rate_pct);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold text-sm tabular-nums",
        level.pill,
      )}
    >
      <Dot className={level.dot} />
      <span className="sr-only">{level.word}</span>
      {formatPct(month.rate_pct)}
    </span>
  );
};

const RowMenu = ({ month }: { month: Month }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Ações de ${monthTitle(month.month)}`}
        className="size-11 rounded-full text-muted-foreground"
      >
        <MoreHorizontal className="size-5" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-auto">
      <DropdownMenuItem asChild className="min-h-11 text-base">
        <Link href={`/mes?m=${month.month}`}>Abrir no Mês</Link>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

const TableMonth = ({ month, current, today }: { month: Month; current: boolean; today: string }) => {
  const currency = useCurrency();
  const name = monthTitle(month.month);
  return (
    <TableRow className={cn(month.forecast && "text-muted-foreground", current && "bg-primary/5")}>
      <TableCell
        className={cn(
          "relative py-4 pl-6 font-medium text-base",
          current && "text-primary before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary",
        )}
      >
        <span className="flex items-center gap-2">
          {name}
          {current && (
            <span className="rounded-md bg-primary px-2 py-0.5 font-semibold text-[10px] text-primary-foreground">
              MÊS ATUAL
            </span>
          )}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <Money amount={month.income} className="font-semibold" />
        {month.forecast && <span className="block text-xs">(Previsto)</span>}
      </TableCell>
      <TableCell className="text-right">
        {current ? (
          <Link
            href={adjustHref(month.month)}
            aria-label={`Ajustar o guardado de ${name}: ${formatMoney(month.deposited, currency)}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-card px-3 font-semibold text-primary shadow-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Money amount={month.deposited} />
            <Pencil aria-hidden className="size-4" />
          </Link>
        ) : (
          <Money amount={month.deposited} className="font-semibold" />
        )}
      </TableCell>
      <TableCell className="text-right">
        {cents(month.withdrawn) > 0 ? (
          <Money amount={month.withdrawn} outflow className="font-semibold text-expense-text" />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-center">
        <Rate month={month} />
      </TableCell>
      <TableCell className={cn("whitespace-normal text-sm", current && "text-primary", month.forecast && "italic")}>
        {current ? closing(today) : situation(month, "")}
      </TableCell>
      <TableCell className="pr-6 text-right">
        <RowMenu month={month} />
      </TableCell>
    </TableRow>
  );
};

const ListMonth = ({ month, current }: { month: Month; current: boolean }) => {
  const currency = useCurrency();
  const name = monthTitle(month.month);
  const share = month.rate_pct ? `${formatPct(month.rate_pct)} das entradas` : "sem entradas";
  const level = month.rate_pct ? levelOf(month.rate_pct) : undefined;
  const withdrawn = cents(month.withdrawn) > 0 ? `resgatou ${formatMoney(month.withdrawn, currency)}, ` : "";
  return (
    <li>
      <Link
        href={current ? adjustHref(month.month) : `/mes?m=${month.month}`}
        aria-label={`${name} de ${month.month.slice(0, 4)}: guardou ${formatMoney(month.deposited, currency)}, ${withdrawn}${share}${level ? `, ${level.word}` : ""}${current ? ", ajustar" : ""}`}
        aria-current={current ? "date" : undefined}
        className={cn(
          "flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-3 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
          current && "bg-primary/5",
        )}
      >
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2 font-medium text-base">
            {name}
            {current && (
              <span className="rounded-full bg-primary px-2 py-0.5 font-semibold text-primary-foreground text-xs uppercase">
                Atual
              </span>
            )}
          </span>
          <span className="text-muted-foreground text-sm">
            Entradas: <Money amount={month.income} />
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="flex items-center gap-1.5">
            <Money amount={month.deposited} className="font-semibold" />
            {current && <Pencil aria-hidden className="size-4 text-muted-foreground" />}
          </span>
          {withdrawn && (
            <span className="text-expense-text text-sm">
              Resgatado <Money amount={month.withdrawn} />
            </span>
          )}
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

const Tile = ({ icon, tone, children }: { icon: ReactNode; tone: string; children: ReactNode }) => (
  <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-sm">
    <span aria-hidden className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", tone)}>
      {icon}
    </span>
    <div className="flex min-w-0 flex-col">{children}</div>
  </div>
);

const YearBody = ({ data, year, today }: { data: Schemas["SavingsYear"]; year: number; today: string }) => {
  const summaryId = useId();
  const detailId = useId();
  const current = today.slice(0, 7);
  const past = data.months.filter((month) => !month.forecast);
  const ascending = data.months.toReversed();
  const run = streak(past.toReversed());
  const best = past.reduce<Month | undefined>(
    (top, month) => (saved(month) && (!top || cents(month.saved) > cents(top.saved)) ? month : top),
    undefined,
  );
  const one = run === 1;

  return (
    <>
      <section aria-labelledby={summaryId} className={card}>
        <h2 id={summaryId} className="sr-only">
          Total do ano
        </h2>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className={cn(caption, "max-lg:hidden")}>TOTAL CONSOLIDADO</p>
            <p className="text-muted-foreground text-sm lg:hidden">Total Guardado no Ano</p>
            <Money amount={data.saved_total} size="figure" />
            {cents(data.withdrawn_total) > 0 && (
              <p className="text-muted-foreground text-sm">
                Guardado <Money amount={data.deposited_total} /> · Resgatado <Money amount={data.withdrawn_total} />
              </p>
            )}
          </div>
          {data.rate_pct && (
            <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary text-sm tabular-nums">
              {cents(data.saved_total) < 0 ? (
                <TrendingDown aria-hidden className="size-4" />
              ) : (
                <TrendingUp aria-hidden className="size-4" />
              )}
              {formatPct(data.rate_pct)} das entradas
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted p-3 max-lg:hidden">
          <div className="flex flex-col gap-1 rounded-lg bg-card p-3">
            <span className="text-muted-foreground text-xs">Entradas no ano</span>
            <Money amount={data.income_total} className="font-semibold" />
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-card p-3">
            <span className="text-muted-foreground text-xs">Meses no Azul</span>
            <span className="font-semibold text-tier-green-foreground tabular-nums">
              {past.filter(saved).length} / {past.length}
            </span>
          </div>
        </div>
      </section>

      {(run > 0 || best) && (
        <div
          className={cn(
            "grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-4 lg:order-last",
            run === 0 && "max-lg:hidden",
          )}
        >
          {run > 0 && (
            <Tile icon={<BadgeCheck className="size-5" />} tone="bg-tier-green-soft text-tier-green-foreground">
              <span className="text-muted-foreground text-sm">Consistência {year}</span>
              <span className="font-semibold text-lg">
                {run} {one ? "Mês" : "Meses"}
                <span className="max-lg:hidden"> {one ? "Consecutivo" : "Consecutivos"}</span>
              </span>
              <span className="text-sm text-tier-green-foreground lg:hidden">
                {one ? "Consecutivo ativo" : "Consecutivos ativos"}
              </span>
            </Tile>
          )}
          {best && (
            <div className="max-lg:hidden">
              <Tile icon={<PiggyBank className="size-5" />} tone="bg-primary/10 text-primary">
                <span className="text-muted-foreground text-sm">Maior Aporte Único</span>
                <span className="font-semibold text-lg">
                  <Money amount={best.saved} /> ({monthTitle(best.month)})
                </span>
              </Tile>
            </div>
          )}
        </div>
      )}

      <section aria-labelledby={detailId} className={cn(card, "lg:px-0")}>
        <header className="flex flex-wrap items-center justify-between gap-3 lg:px-6">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h2 id={detailId} className="font-semibold text-lg leading-6">
                Detalhamento Mensal
              </h2>
              <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground text-xs max-lg:hidden">
                {data.months.length} registros
              </span>
            </div>
            <p className="text-muted-foreground text-sm max-lg:hidden">
              Toque nos valores aportados para ajustar os lançamentos rapidamente.
            </p>
          </div>
          <span className="text-muted-foreground text-sm lg:hidden">{past.length} meses</span>
          <div className="flex flex-wrap items-center gap-3 max-lg:w-full">
            <ul
              aria-label="Faixas"
              className="flex flex-1 flex-wrap justify-between gap-x-4 gap-y-1 rounded-full bg-muted px-3 py-1 text-muted-foreground text-sm"
            >
              {LEVELS.map((level) => (
                <li key={level.legend} className="flex items-center gap-1.5">
                  <Dot className={level.dot} />
                  {level.legend}
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              className="min-h-11 text-base max-lg:hidden"
              onClick={() => exportCsv(year, ascending, current)}
            >
              <Download aria-hidden />
              Exportar
            </Button>
          </div>
        </header>
        <Table className="max-lg:hidden">
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead className="pl-6">MÊS</TableHead>
              <TableHead className="text-right">ENTRADAS</TableHead>
              <TableHead className="text-right">GUARDADO</TableHead>
              <TableHead className="text-right">RESGATADO</TableHead>
              <TableHead className="text-center">% GUARDADO</TableHead>
              <TableHead>STATUS / OBSERVAÇÃO</TableHead>
              <TableHead className="pr-6 text-right">AÇÃO</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ascending.map((month) => (
              <TableMonth key={month.month} month={month} current={month.month === current} today={today} />
            ))}
          </TableBody>
        </Table>
        <ul aria-label="Meses" className="flex flex-col gap-1 lg:hidden">
          {past.map((month) => (
            <ListMonth key={month.month} month={month} current={month.month === current} />
          ))}
        </ul>
      </section>
    </>
  );
};

const hasMoney = (month: Month) =>
  cents(month.income) !== 0 || cents(month.deposited) !== 0 || cents(month.withdrawn) !== 0;

/** Spec 2026-11-11 §7: the year's Economia month by month, between the opening year and this one. */
export const SavingsYear = () => {
  const today = todayISO();
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const settings = useSettings();
  const savings = useSavingsYear(year);
  const minYear = settings.data && Number(settings.data.opening_date.slice(0, 4));
  const data = savings.data;
  const empty = data && !data.months.some(hasMoney);
  const opensThisYear = minYear === undefined || minYear >= thisYear;

  if ((!data && !savings.isError) || (empty && opensThisYear)) return null;

  const body = () => {
    if (savings.isError && !data)
      return (
        <div className={card}>
          <PageError message="Não foi possível carregar o ano." onRetry={() => savings.refetch()} />
        </div>
      );
    if (!data) return null;
    if (empty) return <p className="py-6 text-center text-muted-foreground">Nada para mostrar em {data.year}.</p>;
    return <YearBody data={data} year={data.year} today={today} />;
  };

  return (
    <section aria-label="Economia do ano" className="flex flex-col gap-6">
      <PageHero
        level={2}
        eyebrow={
          <>
            PLANEJAMENTO & METAS<span className="max-lg:hidden"> • Exercício Fiscal</span>
          </>
        }
        title="Evolução e Poupança Anual"
        heading={
          <>
            Evolução e Poupança<span className="max-lg:hidden"> Anual</span>
          </>
        }
        subtitle="Acompanhe aportes regulares e a consistência da sua reserva financeira."
      >
        <Switcher
          legend="Ano"
          label={
            <>
              <CalendarDays aria-hidden className="size-4 max-lg:hidden" />
              {year}
            </>
          }
          previousLabel="Ano anterior"
          nextLabel="Próximo ano"
          atStart={year <= (minYear ?? 2000)}
          atEnd={year >= thisYear}
          onShift={(delta) => setYear(year + delta)}
        />
      </PageHero>
      {body()}
    </section>
  );
};
