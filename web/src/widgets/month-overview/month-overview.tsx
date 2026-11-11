import type { ReactNode } from "react";

import { ArrowDown, ArrowUp, Thermometer, TrendingDown, TrendingUp } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { useCurrency } from "@/shared/lib/currency";
import { formatMoney, positiveAmount } from "@/shared/lib/money";
import { wholeShare } from "@/shared/lib/percent";
import { cents } from "@/shared/lib/tier";
import { Money } from "@/shared/ui/money";
import { SkeletonRows } from "@/shared/ui/page-state";
import { ThermometerStrip } from "@/shared/ui/thermometer-strip";
import { TierPill } from "@/shared/ui/tier-pill";

type MonthView = Schemas["MonthView"];

const figure = "flex min-w-0 flex-col items-center gap-1 text-center";

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
  action: string;
  onClick?: () => void;
  children: ReactNode;
}) => {
  const body = (
    <>
      {icon}
      <div className="flex min-w-0 flex-col items-center gap-1">
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
        "min-h-11 cursor-pointer rounded-xl p-1 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
      )}
    >
      {body}
    </button>
  );
};

const circle = "flex size-10 shrink-0 items-center justify-center rounded-full";
const amount = "whitespace-nowrap font-bold text-sm leading-5 tracking-tight sm:text-base xl:text-lg";

/** Entradas, Saídas (bills + daily) and Projetado, overlapping the hero. */
const MonthSummary = ({ view, onLaunch }: { view: MonthView; onLaunch: (kind: "income" | "bill") => void }) => (
  <section
    aria-label="Resumo do mês"
    className="relative mx-2 -mt-10 grid grid-cols-3 gap-2 rounded-2xl bg-card p-4 shadow-sm sm:mx-4 lg:gap-4 lg:p-5"
  >
    <Figure
      label="Entradas"
      action="Lançar entrada"
      onClick={() => onLaunch("income")}
      icon={
        <span className={cn(circle, "bg-income-soft text-income")}>
          <ArrowUp className="size-5" aria-hidden />
        </span>
      }
    >
      <Money amount={view.totals.income} className={cn(amount, "text-income-text")} />
    </Figure>
    <Figure
      label="Saídas"
      action="Lançar saída"
      onClick={() => onLaunch("bill")}
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
      action="Projetado"
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

/** C1, as it was in 0.23.0 (SOL-69): today's balance on the indigo hero, `children` (the red-day alert) under it, and the summary overlapping its edge. */
export const MonthHero = ({
  view,
  onLaunch,
  children,
  className,
}: {
  view: MonthView;
  onLaunch: (kind: "income" | "bill") => void;
  children?: ReactNode;
  className?: string;
}) => {
  const currency = useCurrency();
  return (
    <div className={cn("flex flex-col", className)}>
      <section
        aria-label="Saldo hoje"
        className="rounded-3xl bg-linear-to-br from-hero-from to-hero-to px-4 pt-6 pb-14 text-hero-foreground lg:px-8 lg:pt-8"
      >
        <div className="flex flex-col items-center gap-3 lg:flex-row lg:items-end lg:gap-4">
          <div className="flex flex-col items-center gap-1 lg:items-start">
            <p className="font-semibold text-[11px] text-white/80 uppercase leading-4 tracking-[0.12em]">Saldo hoje</p>
            <p className="font-bold text-[34px] tabular-nums leading-10 tracking-[-0.02em] lg:text-5xl">
              {formatMoney(view.balance_today, currency)}
            </p>
          </div>
          <TierPill tier={view.balance_today_tier} className="lg:mb-1.5" />
        </div>
        {children}
      </section>
      <MonthSummary view={view} onLaunch={onLaunch} />
    </div>
  );
};

const Insight = ({ totals, projected }: { totals: MonthView["totals"]; projected: string }) => {
  const income = cents(totals.income);
  return (
    <>
      {income === 0 ? (
        "Nenhuma entrada ainda este mês."
      ) : (
        <>
          Você comprometeu{" "}
          <strong className="font-bold text-foreground">{wholeShare(cents(totals.outflow), income)}%</strong> da renda.
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

const card = "rounded-2xl bg-card p-4 shadow-sm lg:p-6";

/** C1 while the month loads: the hero and the summary. */
export const HeroSkeleton = ({ className }: { className?: string }) => (
  <div aria-busy="true" className={cn("flex flex-col gap-4", className)}>
    <Skeleton data-testid="hero-figure-skeleton" className="h-40 w-full rounded-3xl" />
    <Skeleton data-testid="hero-bar-skeleton" className="h-20 w-full rounded-2xl" />
  </div>
);

/** C2 while the month loads: the strip. */
export const StripSkeleton = ({ className }: { className?: string }) => (
  <div aria-busy="true" className={cn(card, "flex flex-col gap-5", className)}>
    <Skeleton className="h-6 w-1/2" />
    <Skeleton data-testid="strip-skeleton" className="h-3 w-full" />
  </div>
);

/** C3 and C4 while they load: `rows` list rows. */
export const RowsSkeleton = ({ rows, className }: { rows: number; className?: string }) => (
  <div className={cn(card, className)}>
    <SkeletonRows count={rows} />
  </div>
);
