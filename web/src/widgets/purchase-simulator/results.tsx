"use client";

import { useCallback, useState } from "react";

import Link from "next/link";

import { useQueries, useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Eye, PiggyBank, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { ChartContainer } from "@/components/ui/chart";
import { useCategories } from "@/entities/category/categories-query";
import { CategorySheet } from "@/entities/category/category-sheet";
import { useForecast } from "@/entities/forecast/forecast-query";
import type { DraftRow } from "@/entities/forecast/months-ahead";
import { monthQuery } from "@/entities/month/month-query";
import { settingsQuery } from "@/entities/settings/settings-query";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { useCurrency } from "@/shared/lib/currency";
import { monthShort, monthSlashYear } from "@/shared/lib/date";
import { formatMoney } from "@/shared/lib/money";
import type { Count } from "@/shared/lib/simulation-history";
import { cents, fromCents } from "@/shared/lib/tier";
import { BrandButton } from "@/shared/ui/brand-button";
import { Money } from "@/shared/ui/money";
import { PageError } from "@/shared/ui/page-state";

import { type MonthProjection, projectedUntil, projectMonths } from "./projection";

/** `2027-03` → `Março`. */
export const monthOnly = (month: string) => monthSlashYear(month).slice(0, -5);
const monthTitle = (month: string) => monthSlashYear(month).replace("/", " ");
const list = new Intl.ListFormat("pt-BR", { type: "conjunction" });
const COUNTS: Count[] = [6, 10, 12];
const card = "flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6";
const eyebrow = "font-semibold text-xs uppercase tracking-wider";

/** The month's two largest outflows landing by `day`, its red day. */
const outflowsOf = (day: string, view?: Schemas["MonthView"]) =>
  (view?.bills_of_month ?? [])
    .filter((bill) => bill.lands_on && bill.lands_on <= day)
    .sort((a, b) => cents(b.amount) - cents(a.amount))
    .slice(0, 2)
    .map((bill) => bill.name);

type Props = {
  rows: DraftRow[];
  count: number;
  total: string;
  /** The draft's category: the cofrinho's name. */
  name: string;
  onRetest: (count: Count) => void;
};

export const Results = ({ rows, count, total, name, onRetest }: Props) => {
  const forecast = useForecast();
  const settings = useQuery(settingsQuery);
  const economia = useCategories("bill").data?.find((category) => category.is_savings);
  const [saving, setSaving] = useState(false);
  const currency = useCurrency();
  const money = (amount: string) => formatMoney(amount, currency);
  const months = forecast.data && settings.data ? projectMonths(forecast.data, rows, settings.data) : [];
  const reds = months.filter((month) => month.red);
  const views = useQueries({ queries: reds.map((month) => monthQuery(month.month)) });
  const outflows = (month: string) => {
    const at = reds.findIndex((red) => red.month === month);
    return at < 0 ? [] : outflowsOf(reds[at].low.date, views[at].data);
  };
  const focusVerdict = useCallback((heading: HTMLHeadingElement | null) => {
    if (!heading) return;
    heading.focus();
    if (!window.matchMedia("(min-width: 1024px)").matches) heading.scrollIntoView({ block: "start" });
  }, []);

  if (forecast.isError || settings.isError)
    return (
      <PageError
        message="Não foi possível carregar a projeção."
        onRetry={() => Promise.all([forecast.refetch(), settings.refetch()])}
      />
    );
  if (!forecast.data || !settings.data) return null;
  if (months.length === 0)
    return <PageError message="Sem meses para projetar agora. Tente de novo." onRetry={() => forecast.refetch()} />;

  const first = reds[0];
  const until = projectedUntil(forecast.data, rows);
  const fits = until
    ? `Até ${monthSlashYear(until)}, nenhum mês fica no vermelho.`
    : "Cabe no orçamento: nenhum mês fica no vermelho.";
  const next = COUNTS.find((each) => each > count);
  const body = () => {
    if (!first) return null;
    const roomy = months.filter((month) => month.month < first.month && month.index > 0 && !month.alreadyRed);
    const names = outflows(first.month);
    const opening =
      roomy.length > 0
        ? `A compra cabe com folga em ${list.format(roomy.map((month) => monthOnly(month.month)))}, mas a`
        : "A";
    const scheduled = names.length > 0 ? ` (${list.format(names)})` : "";
    return `${opening} soma da ${first.index}ª parcela (${money(fromCents(first.parcela))}) com as despesas já agendadas${scheduled} deixará seu saldo negativo em ${money(fromCents(-cents(first.low.projected_balance)))} no dia ${Number(first.low.date.slice(8))} de ${monthOnly(first.month)}.`;
  };

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Veredito do orçamento"
        className={cn("flex flex-col gap-4 rounded-2xl p-4 lg:p-6", first ? "bg-expense-soft" : "bg-income-soft")}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {first ? (
              <TriangleAlert aria-hidden className="mt-1 size-6 shrink-0 text-expense-text" />
            ) : (
              <CircleCheck aria-hidden className="mt-1 size-6 shrink-0 text-income-text" />
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <p className={cn(eyebrow, first ? "text-expense-text" : "text-income-text")}>
                {first ? "VEREDITO DO ORÇAMENTO • ALERTA CRÍTICO" : "VEREDITO DO ORÇAMENTO • CABE NO ORÇAMENTO"}
              </p>
              <h2 ref={focusVerdict} tabIndex={-1} className="font-bold text-xl leading-7 outline-none lg:text-2xl">
                {first
                  ? `Em ${monthOnly(first.month)} você fica no vermelho: ${money(first.low.projected_balance)}`
                  : fits}
              </h2>
            </div>
          </div>
          <span
            className={cn(
              "rounded-full bg-card px-3 py-1 font-semibold text-sm",
              first ? "text-expense-text" : "text-income-text",
            )}
          >
            {first ? "Déficit Projetado" : "Sem déficit"}
          </span>
        </div>
        {first && <p className="rounded-xl bg-card p-4 text-expense-text text-sm leading-6">{body()}</p>}
        {until && <p className="text-sm">{`As parcelas depois de ${monthSlashYear(until)} ficam fora da projeção.`}</p>}
        {months
          .filter((month) => month.alreadyRed)
          .map((month) => (
            <p key={month.month} className="text-sm">
              {`${monthOnly(month.month)} já estava no vermelho sem a compra; com ela, o menor saldo vai a ${money(month.low.projected_balance)}.`}
            </p>
          ))}
      </section>

      <section aria-labelledby="purchase-curve-title" className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="purchase-curve-title" className="font-semibold text-lg">
              {`Curva de Saldo Projetado (${months.length} ${months.length === 1 ? "Mês" : "Meses"})`}
            </h2>
            <p className="text-muted-foreground text-sm">Comparativo do saldo ao fechar cada mês</p>
          </div>
          <ul aria-hidden className="flex flex-wrap gap-3 text-xs">
            <li className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-4 border-muted-foreground border-t-2 border-dashed" />
              Cenário Atual
            </li>
            <li className="flex items-center gap-1.5">
              <span className="w-4 border-primary border-t-2" />
              Com Nova Compra
            </li>
            <li className="flex items-center gap-1.5 text-expense-text">
              <span className="size-2 rounded-full bg-expense" />
              Alerta Vermelho
            </li>
          </ul>
        </div>
        <ChartContainer config={{}} aria-hidden className="aspect-[2/1] w-full overflow-hidden">
          <LineChart
            data={months.map((month) => ({
              label: monthShort(month.month),
              before: cents(month.endBefore),
              after: cents(month.endAfter),
              alert: month.red ? cents(month.low.projected_balance) : null,
            }))}
            margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
          >
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis hide domain={["auto", "auto"]} />
            <ReferenceLine
              y={0}
              ifOverflow="extendDomain"
              stroke="var(--color-expense)"
              label={{ value: `${money("0")} (Linha Zero)`, position: "insideTopLeft", fill: "var(--color-expense)" }}
            />
            <Line
              dataKey="before"
              stroke="var(--color-muted-foreground)"
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line dataKey="after" stroke="var(--color-primary)" strokeWidth={2} isAnimationActive={false} />
            <Line
              dataKey="alert"
              stroke="none"
              dot={{ r: 5, fill: "var(--color-expense)" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      </section>

      <section aria-labelledby="purchase-months-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 id="purchase-months-title" className="font-semibold text-lg">
            Projeção Mensal Comparativa (Antes vs. Depois)
          </h2>
          <p className="text-muted-foreground text-xs">{`Vencimento no dia ${Number(rows[0].date.slice(8))} de cada mês`}</p>
        </div>
        <ul aria-labelledby="purchase-months-title" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {months.map((month) => (
            <MonthCard key={month.month} month={month} count={count} outflows={outflows(month.month)} />
          ))}
        </ul>
      </section>

      {first && (
        <section aria-labelledby="purchase-actions-title" className={cn(card, "lg:flex-row lg:items-center")}>
          <div className="flex flex-1 flex-col gap-1">
            <h2 id="purchase-actions-title" className="font-semibold text-lg">
              O que você gostaria de fazer agora?
            </h2>
            <p className="text-muted-foreground text-sm">
              Explore alternativas seguras para viabilizar sua compra sem entrar no cheque especial.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button asChild variant="outline" className="h-11 text-base">
              <Link href={`/mes?m=${first.month}`}>
                <Eye aria-hidden />
                {`Ver Detalhe de ${monthOnly(first.month)}`}
              </Link>
            </Button>
            {next && (
              <Button variant="outline" className="h-11 text-base" onClick={() => onRetest(next)}>
                <SlidersHorizontal aria-hidden />
                {`Testar em ${next}x`}
              </Button>
            )}
            <BrandButton onClick={() => setSaving(true)}>
              <PiggyBank aria-hidden />
              Criar Cofrinho para juntar à vista
            </BrandButton>
          </div>
          <CategorySheet
            kind="bill"
            open={saving}
            onOpenChange={setSaving}
            parentId={economia?.id}
            initial={{ name, target: total }}
          />
        </section>
      )}
    </div>
  );
};

const MonthCard = ({ month, count, outflows }: { month: MonthProjection; count: number; outflows: string[] }) => (
  <li
    className={cn(
      "flex min-w-0 flex-col gap-3 rounded-2xl bg-card p-3 shadow-sm lg:p-4",
      month.red && "border-expense border-r-4 bg-expense-soft",
    )}
  >
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h3 className="flex items-center gap-1.5 font-semibold">
        {month.red && <CircleAlert aria-hidden className="size-4 shrink-0 text-expense-text" />}
        {monthTitle(month.month)}
      </h3>
      {(month.red || month.alreadyRed) && (
        <span className="rounded-full bg-card px-2 py-0.5 font-bold text-expense-text text-xs">CRÍTICO</span>
      )}
    </div>
    <dl className="grid gap-1 text-sm">
      <div className="flex flex-wrap justify-between gap-x-2">
        <dt className="text-muted-foreground">{month.red ? "Saldo Atual Original:" : "Saldo Atual:"}</dt>
        <dd>
          <Money amount={month.endBefore} />
        </dd>
      </div>
      <div className="flex flex-wrap justify-between gap-x-2 font-semibold">
        <dt>{month.red ? "Saldo com Compra:" : "Saldo Projetado:"}</dt>
        <dd>
          <Money amount={month.endAfter} />
        </dd>
      </div>
    </dl>
    <p className="mt-auto flex flex-wrap justify-between gap-x-2 text-primary text-xs">
      <span>{`Parcela ${month.index}/${count}${month.red && outflows.length > 0 ? ` (+ ${outflows.join("/")})` : ""}`}</span>
      {month.index === 0 ? <span>Sem alteração</span> : <Money amount={fromCents(month.parcela)} outflow />}
    </p>
  </li>
);
