"use client";

import { useState } from "react";

import { TriangleAlert } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useMonth } from "@/entities/month/month-query";
import { cn } from "@/lib/utils";
import { hasProblem } from "@/shared/api/client";
import { lastDay, monthName, weekdayName } from "@/shared/lib/date";
import { toInput } from "@/shared/lib/money";
import { cents, TIER_LABEL, TIER_ORDER, TIER_STYLE } from "@/shared/lib/tier";
import { monthLabel } from "@/shared/ui/month-switcher";
import { PageError } from "@/shared/ui/page-state";
import { TierPill } from "@/shared/ui/tier-pill";

import { isForecast } from "./ledger";
import { type PlanilhaRow, planilhaMonths, planilhaRows } from "./planilha-rows";

const COLUMNS = ["Data", "Entrada", "Saída", "Diário", "Saldo"];

const MONEY = "whitespace-nowrap px-2 text-right";

/** The weekend tint over the card, opaque for the sticky Data cell. */
const WEEKEND_OPAQUE = "bg-[color-mix(in_oklab,var(--color-muted)_50%,var(--color-card))]";

/** The sheet's number format: pt-BR, no symbol, a zero left blank. */
const amountOf = (amount: string) => (cents(amount) === 0 ? null : toInput(amount));

const dayName = (date: string, today: string) => {
  const weekday = weekdayName(date);
  const name = `${weekday[0].toUpperCase()}${weekday.slice(1)}, ${Number(date.slice(8))} de ${monthName(date, date)}`;
  return date === today ? `${name}, hoje` : name;
};

const Row = ({ row: { date, day, income, outflow, landed }, today }: { row: PlanilhaRow; today: string }) => {
  const weekend = ["sábado", "domingo"].includes(weekdayName(date));
  const ahead = day?.is_future && "italic text-muted-foreground";
  return (
    <tr
      aria-current={date === today ? "date" : undefined}
      className={cn(weekend && "bg-muted/50", !day && "text-muted-foreground")}
    >
      <td className={cn("sticky left-0 p-0", weekend ? WEEKEND_OPAQUE : "bg-card")}>
        <button type="button" aria-label={dayName(date, today)} className="flex min-h-11 w-full items-center px-2">
          <span
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-full",
              date === today && "bg-primary text-primary-foreground font-semibold",
            )}
          >
            {Number(date.slice(8))}
          </span>
        </button>
      </td>
      {day ? (
        <>
          <td className={cn(MONEY, ahead)}>{amountOf(income)}</td>
          <td className={cn(MONEY, ahead, landed && "italic")}>
            {amountOf(outflow)}
            {landed && <span className="sr-only"> inclui conta a pagar</span>}
          </td>
          <td className={cn(MONEY, ahead)}>{amountOf(day.daily)}</td>
          <td className={cn(MONEY, "font-semibold", TIER_STYLE[day.projected_tier].pill, isForecast(day) && "italic")}>
            {(day.projected_tier === "red" || day.projected_tier === "light_red") && (
              <TriangleAlert aria-hidden className="mr-1 inline size-[1em] align-[-0.125em]" />
            )}
            {toInput(day.projected_balance)}
            <span className="sr-only"> {TIER_LABEL[day.projected_tier]}</span>
          </td>
        </>
      ) : (
        <>
          <td />
          <td />
          <td />
          <td />
        </>
      )}
    </tr>
  );
};

/** One skeleton row per day of `month`: the block keeps its final size while it loads. */
const SkeletonBody = ({ month }: { month: string }) => (
  <tbody aria-busy="true">
    {Array.from({ length: lastDay(month) }, (_, index) => `${month}-${index + 1}`).map((key) => (
      <tr key={key}>
        <td colSpan={5} className="h-11 px-2">
          <Skeleton className="h-4 w-full" />
        </td>
      </tr>
    ))}
  </tbody>
);

const MonthBody = ({ month, today, openingDate }: { month: string; today: string; openingDate: string }) => {
  const view = useMonth(month);
  if (view.isSuccess)
    return (
      <tbody>
        {planilhaRows(view.data, openingDate).map((row) => (
          <Row key={row.date} row={row} today={today} />
        ))}
      </tbody>
    );
  if (!view.isError) return <SkeletonBody month={month} />;
  return (
    <tbody>
      <tr>
        <td colSpan={5}>
          {hasProblem(view.error, "month-before-opening") ? (
            <p className="text-muted-foreground p-6 text-center">Este mês é anterior ao seu saldo inicial.</p>
          ) : (
            <PageError message={`Não foi possível carregar ${monthLabel(month)}.`} onRetry={() => view.refetch()} />
          )}
        </td>
      </tr>
    </tbody>
  );
};

const MonthBlock = ({ month, today, openingDate }: { month: string; today: string; openingDate: string }) => {
  const [near, setNear] = useState(false);
  const label = monthLabel(month);

  /** Fetches once the table comes within its own width of the scroller's view. */
  const watch = (table: HTMLTableElement) => {
    const observer = new IntersectionObserver((entries) => setNear(entries.some((entry) => entry.isIntersecting)), {
      root: table.parentElement,
      rootMargin: `0px ${table.offsetWidth}px`,
    });
    observer.observe(table);
    return () => observer.disconnect();
  };

  return (
    <table
      ref={near ? undefined : watch}
      aria-label={label}
      className="min-w-[100cqi] shrink-0 snap-start text-[length:clamp(0.75rem,3.6cqi,0.875rem)] tabular-nums @[40rem]:min-w-[calc((100cqi-1rem)/2)] @[64rem]:min-w-[calc((100cqi-2rem)/3)]"
    >
      <thead className="bg-card sticky top-0 z-10">
        <tr>
          <th colSpan={5} scope="colgroup" className="px-2 py-2 text-left text-base font-semibold">
            {label}
          </th>
        </tr>
        <tr className="border-b">
          {COLUMNS.map((column) => (
            <th
              key={column}
              scope="col"
              className={cn(
                "text-muted-foreground px-2 py-1 text-right font-medium",
                column === "Data" && "bg-card sticky left-0 text-left",
              )}
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      {near ? <MonthBody month={month} today={today} openingDate={openingDate} /> : <SkeletonBody month={month} />}
    </table>
  );
};

/** Spec SOL-163 §3–§8: the month view as the owner's sheet, one table per month side by side. */
export const Planilha = ({ today, openingDate }: { today: string; openingDate: string }) => (
  <div className="@container flex flex-col gap-3">
    <div className="flex max-h-[80dvh] snap-x snap-mandatory gap-4 overflow-auto overscroll-x-contain">
      {planilhaMonths(today, openingDate).map((month) => (
        <MonthBlock key={month} month={month} today={today} openingDate={openingDate} />
      ))}
    </div>
    <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
      <span className="italic">Itálico: previsto</span>
      {TIER_ORDER.map((tier) => (
        <TierPill key={tier} tier={tier} size="sm" />
      ))}
    </div>
  </div>
);
