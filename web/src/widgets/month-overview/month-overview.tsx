import type { ReactNode } from "react";

import { ArrowDown, ArrowUp, Thermometer, TrendingDown, TrendingUp } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { positiveAmount } from "@/shared/lib/money";
import { Money } from "@/shared/ui/money";
import { ThermometerStrip } from "@/shared/ui/thermometer-strip";
import { TierPill } from "@/shared/ui/tier-pill";

type MonthView = Schemas["MonthView"];

const figure =
  "flex min-w-0 flex-col items-center gap-1 text-center lg:flex-row-reverse lg:items-center lg:justify-between lg:gap-4 lg:rounded-2xl lg:bg-card lg:p-6 lg:text-left lg:shadow-sm";

/** With `onClick` the figure is a button that opens Lançar on its kind (`Lançar entrada`, `Lançar saída`). */
const Figure = ({
  icon,
  label,
  action,
  onClick,
  children,
}: {
  icon: ReactNode;
  label: string;
  action?: string;
  onClick?: () => void;
  children: ReactNode;
}) => {
  const body = (
    <>
      {icon}
      <div className="flex min-w-0 flex-col items-center gap-1 lg:items-start">
        <span className="text-muted-foreground text-xs lg:text-sm">{label}</span>
        {children}
      </div>
    </>
  );
  if (!onClick) return <div className={figure}>{body}</div>;
  return (
    <button
      type="button"
      aria-label={action}
      onClick={onClick}
      className={cn(
        figure,
        "min-h-11 cursor-pointer rounded-xl transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring lg:hover:bg-card lg:hover:shadow-md",
      )}
    >
      {body}
    </button>
  );
};

const circle = "flex size-10 shrink-0 items-center justify-center rounded-full lg:size-12 lg:rounded-xl";
const amount = "font-bold text-sm leading-5 sm:text-base lg:text-2xl";

/** Entradas, Saídas (bills + daily) and Projetado, overlapping the hero. */
export const MonthSummary = ({ view, onLaunch }: { view: MonthView; onLaunch?: (kind: "income" | "bill") => void }) => (
  <section
    aria-label="Resumo do mês"
    className="relative -mt-10 grid grid-cols-3 gap-2 rounded-2xl bg-card p-4 shadow-sm lg:-mt-16 lg:gap-6 lg:bg-transparent lg:p-0 lg:px-6 lg:shadow-none"
  >
    <Figure
      label="Entradas"
      action="Lançar entrada"
      onClick={onLaunch && (() => onLaunch("income"))}
      icon={
        <span className={cn(circle, "bg-income-soft text-income")}>
          <ArrowUp className="size-5" aria-hidden />
        </span>
      }
    >
      <Money amount={view.totals.income} className={cn(amount, "text-income")} />
    </Figure>
    <Figure
      label="Saídas"
      action="Lançar saída"
      onClick={onLaunch && (() => onLaunch("bill"))}
      icon={
        <span className={cn(circle, "bg-expense-soft text-expense")}>
          <ArrowDown className="size-5" aria-hidden />
        </span>
      }
    >
      <Money amount={view.totals.outflow} className={amount} />
    </Figure>
    <Figure
      label="Projetado"
      icon={
        <span className={cn(circle, "bg-secondary text-primary")}>
          {view.projected_balance.startsWith("-") ? (
            <TrendingDown className="size-5" aria-hidden />
          ) : (
            <TrendingUp className="size-5" aria-hidden />
          )}
        </span>
      }
    >
      <Money amount={view.projected_balance} className={amount} />
      <TierPill tier={view.projected_tier} size="sm" />
    </Figure>
  </section>
);

const Insight = ({ totals, projected }: { totals: MonthView["totals"]; projected: string }) => {
  const income = Number(totals.income);
  const committed = Math.round((Number(totals.outflow) / income) * 100);
  return (
    <>
      {income === 0 ? (
        "Nenhuma entrada ainda este mês."
      ) : (
        <>
          Você comprometeu <strong className="font-bold text-foreground">{committed}%</strong> da renda.
        </>
      )}{" "}
      Com as contas em aberto, seu mês termina em{" "}
      <Money amount={projected} className={cn("font-bold", !projected.startsWith("-") && "text-foreground")} />.
      {positiveAmount(totals.saved) && (
        <>
          {" "}
          Guardou <Money amount={totals.saved} className="font-bold text-foreground" /> este mês.
        </>
      )}
    </>
  );
};

export const ThermometerCard = ({ view, className }: { view: MonthView; className?: string }) => (
  <section
    aria-labelledby="thermometer-title"
    className={cn("flex flex-col gap-5 rounded-2xl bg-card p-4 shadow-sm lg:p-6", className)}
  >
    <h2 id="thermometer-title" className="flex items-center gap-3 font-semibold text-lg leading-6">
      <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-primary">
        <Thermometer className="size-5" aria-hidden />
      </span>
      Termômetro do Mês
    </h2>
    <ThermometerStrip tier={view.balance_today_tier} />
    <p className="rounded-xl bg-muted p-4 text-muted-foreground text-sm leading-6">
      <Insight totals={view.totals} projected={view.projected_balance} />
    </p>
  </section>
);

export const MonthSkeleton = () => (
  <div role="status" aria-label="Carregando" className="flex flex-col gap-6">
    <Skeleton className="-mx-4 -mt-4 h-60 rounded-none rounded-b-3xl lg:mx-0 lg:mt-0 lg:rounded-3xl" />
    <Skeleton className="-mt-16 h-28 rounded-2xl bg-card shadow-sm" />
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  </div>
);
