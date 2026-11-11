import type { ReactNode } from "react";

import { Thermometer, TrendingDown, TrendingUp } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { type Split, splitOf } from "@/entities/month/split";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { useCurrency } from "@/shared/lib/currency";
import { formatMoney, positiveAmount } from "@/shared/lib/money";
import { wholeShare } from "@/shared/lib/percent";
import { cents } from "@/shared/lib/tier";
import { BrandButton } from "@/shared/ui/brand-button";
import { IncomeIllustration } from "@/shared/ui/illustrations";
import { Money } from "@/shared/ui/money";
import { SkeletonRows } from "@/shared/ui/page-state";
import { SplitBar } from "@/shared/ui/split-bar";
import { ThermometerStrip } from "@/shared/ui/thermometer-strip";
import { TierPill } from "@/shared/ui/tier-pill";

type MonthView = Schemas["MonthView"];

const eyebrow = "font-semibold text-[11px] text-hero-foreground/80 uppercase leading-4 tracking-[0.12em]";

const SplitLine = ({ line }: { line: Split["line"] }) => {
  const currency = useCurrency();
  if (line.kind === "even") return <p className="text-muted-foreground text-sm">Entradas e saídas empatadas</p>;
  if (line.kind === "over")
    return (
      <p className="flex items-center gap-2 font-medium text-expense text-sm">
        <TrendingDown className="size-4 shrink-0" aria-hidden />
        Saídas passaram as entradas em {formatMoney(line.amount, currency)}
      </p>
    );
  return (
    <p className="flex items-center gap-2 font-medium text-income-text text-sm">
      <TrendingUp className="size-4 shrink-0" aria-hidden />
      Sobram {line.pct}% das entradas
    </p>
  );
};

/**
 * C1: today's balance, the projection and where the income went (spec 2026-11-10 §2.1), with `children` (the
 * red-day alert) under the figures. The split sits on a card panel: its colors are validated on white.
 */
export const MonthHero = ({
  view,
  onLaunchIncome,
  children,
  className,
}: {
  view: MonthView;
  onLaunchIncome: () => void;
  children?: ReactNode;
  className?: string;
}) => {
  const split = splitOf(view.totals);
  return (
    <section
      aria-label="Saldo hoje"
      className={cn(
        "flex flex-col gap-4 rounded-3xl bg-linear-to-br from-hero-from to-hero-to p-4 text-hero-foreground lg:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex flex-col gap-1">
          <p className={eyebrow}>Saldo hoje</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Money amount={view.balance_today} size="hero" className="text-hero-foreground" />
            <TierPill tier={view.balance_today_tier} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <p className={eyebrow}>Projetado fim do mês</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Money amount={view.projected_balance} size="figure" className="text-hero-foreground" />
            <TierPill tier={view.projected_tier} size="sm" />
          </div>
        </div>
      </div>
      {children}
      <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 text-card-foreground">
        <h2 className="font-semibold text-base leading-6">Para onde foi a entrada</h2>
        {split ? (
          <>
            <p className="-mt-3 text-muted-foreground text-sm">
              {split.base === "income" ? "Entradas" : "Saídas"}{" "}
              <Money amount={split.base === "income" ? view.totals.income : view.totals.outflow} />
            </p>
            <SplitBar label={split.base === "income" ? "Entradas" : "Saídas"} segments={split.segments} />
            <SplitLine line={split.line} />
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <div aria-hidden className="flex w-full justify-center">
              <IncomeIllustration />
            </div>
            <p className="text-muted-foreground">Nenhuma entrada neste mês</p>
            <BrandButton className="w-auto px-6" onClick={onLaunchIncome}>
              Lançar entrada
            </BrandButton>
          </div>
        )}
      </div>
    </section>
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

/** C1 while the month loads: the figure and the bar. */
export const HeroSkeleton = ({ className }: { className?: string }) => (
  <div aria-busy="true" className={cn("flex flex-col gap-4 rounded-3xl bg-card p-4 shadow-sm lg:p-6", className)}>
    <Skeleton data-testid="hero-figure-skeleton" className="h-14 w-2/3 max-w-xs" />
    <Skeleton data-testid="hero-bar-skeleton" className="h-3 w-full" />
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
