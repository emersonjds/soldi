"use client";

import { type ReactNode, useId, useState } from "react";

import Link from "next/link";

import { CalendarDays, CreditCard } from "lucide-react";

import { splitOf } from "@/entities/month/split";
import { useYearReport } from "@/entities/report/report-query";
import { useSettings } from "@/entities/settings/settings-query";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { monthLong, todayISO } from "@/shared/lib/date";
import { formatPct } from "@/shared/lib/percent";
import { cents } from "@/shared/lib/tier";
import { CategoryIcon, categoryBg } from "@/shared/ui/category-icon";
import { Money } from "@/shared/ui/money";
import { Switcher } from "@/shared/ui/month-switcher";
import { PageError } from "@/shared/ui/page-state";
import { SplitBar } from "@/shared/ui/split-bar";
import { PageHero } from "@/widgets/month-header/month-header";

type Report = Schemas["YearReport"];

const card = "flex min-w-0 flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6";

const title = "font-semibold text-lg leading-6";

const capitalized = (text: string) => text[0].toUpperCase() + text.slice(1);

/** `2026-03` → `março`. */
const monthOnly = (month: string) => monthLong(month).split(" de ")[0];

/** SOL-103 §5: January looks back at the year that just closed, unless the account opened this year. */
export const defaultYear = (today: string, openingYear: number) => {
  const thisYear = Number(today.slice(0, 4));
  return today.slice(5, 7) === "01" && openingYear < thisYear ? thisYear - 1 : thisYear;
};

/** `Janeiro a novembro de 2026`, or `Novembro de 2026` for one month. */
export const period = (first: string, last: string) =>
  capitalized(first === last ? monthLong(last) : `${monthOnly(first)} a ${monthLong(last)}`);

const Card = ({ heading, note, children }: { heading: string; note?: string; children: ReactNode }) => {
  const id = useId();
  return (
    <section aria-labelledby={id} className={card}>
      <header className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <h2 id={id} className={title}>
          {heading}
        </h2>
        {note && <p className="text-muted-foreground text-sm">{note}</p>}
      </header>
      {children}
    </section>
  );
};

const Bar = ({ width, className }: { width: string; className: string }) => (
  <span aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
    <span className={cn("block h-full rounded-full", className)} style={{ width }} />
  </span>
);

const Split = ({ totals }: { totals: Report["totals"] }) => {
  const split = splitOf(totals);
  if (!split) return null;
  const income = split.base === "income";
  return (
    <div className="flex flex-col gap-3 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm leading-5">
        <h3 className="font-medium">Para onde foi a entrada do ano</h3>
        <p className="font-bold tabular-nums">
          Total: <Money amount={income ? totals.income : totals.outflow} />
        </p>
      </div>
      <SplitBar label={income ? "Entradas" : "Saídas"} segments={split.segments} />
    </div>
  );
};

const Summary = ({ data, first, last }: { data: Report; first: string; last: string }) => (
  <Card heading="Resumo do ano">
    <p className="-mt-3 text-muted-foreground text-sm">{period(first, last)}</p>
    <dl className="grid gap-4 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-1">
        <dt className="text-muted-foreground text-sm">Entradas</dt>
        <dd>
          <Money amount={data.totals.income} income size="figure" />
        </dd>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <dt className="text-muted-foreground text-sm">Gastos</dt>
        <dd>
          <Money amount={data.spent} outflow size="figure" />
        </dd>
      </div>
    </dl>
    <Split totals={data.totals} />
  </Card>
);

const TopMonths = ({ months }: { months: Report["top_months"] }) => {
  if (months.length < 2) return null;
  const top = cents(months[0].spent);
  return (
    <Card heading="Meses com mais gastos">
      <ol className="flex flex-col gap-2">
        {months.map((month, index) => (
          <li key={month.month}>
            <Link
              href={`/para-onde-vai?m=${month.month}`}
              className="flex min-h-11 flex-col justify-center gap-1.5 rounded-lg py-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="text-muted-foreground tabular-nums">{index + 1}º</span>{" "}
                <span className="grow font-medium">{capitalized(monthOnly(month.month))}</span>{" "}
                <Money amount={month.spent} outflow className="ml-auto font-semibold" />
                <span aria-hidden className="text-muted-foreground">
                  ›
                </span>
              </span>
              <Bar width={`${(cents(month.spent) * 100) / top}%`} className="bg-expense" />
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
};

const Groups = ({
  heading,
  note,
  groups,
  income = false,
}: {
  heading: string;
  note: string;
  groups: Report["spending"];
  income?: boolean;
}) => {
  if (groups.length === 0) return null;
  return (
    <Card heading={heading} note={note}>
      <ol className="flex flex-col gap-4">
        {groups.map((group) => (
          <li key={group.category_id} className="flex flex-col gap-1.5">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <CategoryIcon icon={group.icon} color={group.color} className="size-8" />
              <span className="grow font-medium">
                {group.name} <span className="text-muted-foreground">({formatPct(group.pct)})</span>
              </span>
              <Money amount={group.amount} income={income} outflow={!income} className="ml-auto font-semibold" />
            </span>
            <Bar width={`${group.pct}%`} className={categoryBg(group.color)} />
          </li>
        ))}
      </ol>
    </Card>
  );
};

const OnCard = ({ data }: { data: Report }) => {
  if (cents(data.card_spent) === 0) return null;
  return (
    <Card heading="No cartão de crédito">
      <div className="flex flex-col gap-1">
        <Money amount={data.card_spent} outflow size="figure" />
        <p className="text-sm">{formatPct(data.card_pct ?? "0")} dos seus gastos no ano</p>
        <p className="text-muted-foreground text-sm">Pela data da compra, não da fatura.</p>
      </div>
      {data.cards.length > 1 && (
        <ul className="flex flex-col gap-3">
          {data.cards.map((each) => (
            <li key={each.card_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <CreditCard aria-hidden className="size-5 text-muted-foreground" />
              <span className="grow font-medium">{each.name}</span>
              <Money amount={each.amount} outflow className="ml-auto font-semibold" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const nothing = ({ income, outflow, withdrawn }: Report["totals"]) =>
  cents(income) === 0 && cents(outflow) === 0 && cents(withdrawn) === 0;

const Body = ({ data }: { data: Report }) => {
  if (!data.first_month || !data.last_month || nothing(data.totals))
    return <p className="py-6 text-center text-muted-foreground">Nada para mostrar em {data.year}.</p>;
  return (
    <>
      <Summary data={data} first={data.first_month} last={data.last_month} />
      <div className="grid gap-6 xl:grid-cols-2">
        <TopMonths months={data.top_months} />
        <Groups heading="Onde você mais gastou" note="Por grupo, no ano" groups={data.spending} />
        <Groups heading="Maiores entradas" note="Por categoria, no ano" groups={data.income} income />
        <OnCard data={data} />
      </div>
    </>
  );
};

/** SOL-103: the year's Entradas and Gastos by purchase date (D31), one card per insight, each only with content. */
export const YearReview = () => {
  const today = todayISO();
  const thisYear = Number(today.slice(0, 4));
  const [picked, setPicked] = useState<number | null>(null);
  const settings = useSettings();
  const openingYear = settings.data && Number(settings.data.opening_date.slice(0, 4));
  const year = picked ?? (openingYear === undefined ? undefined : defaultYear(today, openingYear));
  const report = useYearReport(year);
  const shown = year ?? thisYear;

  const body = () => {
    if (report.data) return <Body data={report.data} />;
    if (!report.isError) return null;
    return (
      <div className={card}>
        <PageError message="Não foi possível carregar o ano." onRetry={() => report.refetch()} />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHero eyebrow="RETROSPECTIVA" title="Meu ano" subtitle="O que entrou, o que saiu e para onde foi.">
        <Switcher
          legend="Ano"
          label={
            <>
              <CalendarDays aria-hidden className="size-4 max-lg:hidden" />
              {shown}
            </>
          }
          previousLabel="Ano anterior"
          nextLabel="Próximo ano"
          atStart={shown <= (openingYear ?? thisYear)}
          atEnd={shown >= thisYear}
          onShift={(delta) => setPicked(shown + delta)}
        />
      </PageHero>
      {body()}
    </div>
  );
};
