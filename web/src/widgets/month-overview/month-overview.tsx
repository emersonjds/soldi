import type { ReactNode } from "react";

import { ArrowDown, ArrowUp, CircleCheck, Gauge, TrendingDown, TrendingUp } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { splitOf } from "@/entities/month/split";
import { useMe } from "@/entities/user/session";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { useCurrency } from "@/shared/lib/currency";
import { formatMoney } from "@/shared/lib/money";
import { wholeShare } from "@/shared/lib/percent";
import { cents, fromCents, TIER_STYLE, type Tier } from "@/shared/lib/tier";
import { Money } from "@/shared/ui/money";
import { SplitBar } from "@/shared/ui/split-bar";
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
        <span className="text-muted-foreground text-xs">{label}</span>
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
const amount = "whitespace-nowrap font-bold text-sm leading-5 tracking-tight sm:text-base";

/** Below 1024 only: Entradas, Saídas (bills + daily) and Projetado, overlapping the indigo hero. */
const MonthSummary = ({ view, onLaunch }: { view: MonthView; onLaunch: (kind: "income" | "bill") => void }) => (
  <section
    aria-label="Resumo do mês"
    className="relative mx-2 -mt-10 grid grid-cols-3 gap-2 rounded-2xl bg-card p-4 shadow-sm sm:mx-4 lg:hidden"
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

/** The split of the month's entrada (spec 2026-11-10 §2.1), from 1024 and only with an entrada. */
const Split = ({ totals }: { totals: MonthView["totals"] }) => {
  const split = splitOf(totals);
  if (!split) return null;
  const income = split.base === "income";
  return (
    <div className="hidden flex-col gap-3 pt-2 lg:flex">
      <div className="flex items-center justify-between gap-4 text-sm leading-5">
        <h2 className="font-medium">Para onde foi a entrada deste mês</h2>
        <p className="font-bold tabular-nums">
          Total: <Money amount={income ? totals.income : totals.outflow} />
        </p>
      </div>
      <SplitBar label={income ? "Entradas" : "Saídas"} segments={split.segments} />
    </div>
  );
};

/**
 * C1 (SOL-79 §2.3). Below 1024 the indigo hero: the greeting, `switcher`, today's balance and the summary over its
 * edge. From 1024 a white card: today's balance, the Projetado box and the split.
 */
export const MonthHero = ({
  view,
  onLaunch,
  switcher,
  className,
}: {
  view: MonthView;
  onLaunch: (kind: "income" | "bill") => void;
  switcher?: ReactNode;
  className?: string;
}) => {
  const first = useMe().data?.name.trim().split(/\s+/)[0] ?? "";
  return (
    <section aria-label="Saldo hoje" className={cn("flex flex-col", className)}>
      <div className="flex flex-col gap-4 rounded-3xl bg-linear-to-br from-hero-from to-hero-to px-4 pt-5 pb-14 text-hero-foreground lg:gap-6 lg:bg-none lg:bg-card lg:p-6 lg:text-card-foreground lg:shadow-sm">
        <div className="flex items-center gap-2 lg:hidden">
          {first && (
            <span aria-hidden className={cn(circle, "bg-white/15 font-semibold text-lg")}>
              {first.charAt(0).toUpperCase()}
            </span>
          )}
          <p className="font-semibold text-xl leading-7">{first ? `Olá, ${first}` : "Olá"}</p>
        </div>
        <div className="lg:hidden">{switcher}</div>
        <div className="flex flex-col items-center gap-4 lg:flex-row lg:justify-between">
          <div className="flex flex-col items-center gap-2 lg:items-start lg:gap-1">
            <p className="font-semibold text-[11px] text-hero-foreground/80 uppercase leading-4 tracking-[0.12em] lg:text-muted-foreground">
              Saldo hoje<span className="hidden lg:inline"> em conta</span>
            </p>
            <div className="flex flex-col items-center gap-3 lg:flex-row lg:flex-wrap lg:items-baseline">
              <Money
                amount={view.balance_today}
                size="display"
                className={cn(
                  "text-hero-foreground",
                  view.balance_today.startsWith("-") ? "lg:text-expense" : "lg:text-foreground",
                )}
              />
              <TierPill tier={view.balance_today_tier} />
            </div>
          </div>
          <div className="hidden items-center gap-3 rounded-xl bg-muted px-4 py-2.5 lg:flex">
            <div className="flex flex-col">
              <span className="font-medium text-muted-foreground text-xs leading-4">Projetado no fim do mês</span>
              <Money amount={view.projected_balance} className="font-bold text-lg leading-7" />
            </div>
            <TierPill tier={view.projected_tier} size="sm" />
          </div>
        </div>
        <Split totals={view.totals} />
      </div>
      <MonthSummary view={view} onLaunch={onLaunch} />
    </section>
  );
};

const WORD: Record<Tier, string> = {
  red: "vermelho",
  light_red: "vermelho",
  yellow: "amarelo",
  light_green: "verde",
  green: "verde",
};

const share = "font-bold text-foreground";

/** C2 (SOL-79 §2.5); absent on a month with no entrada and no saída (D25). */
export const ThermometerCard = ({ view, className }: { view: MonthView; className?: string }) => {
  const currency = useCurrency();
  const { income, outflow, performance } = view.totals;
  const base = cents(income);
  const result = cents(performance);
  if (base === 0 && cents(outflow) === 0) return null;
  const spent = base > 0 ? `${wholeShare(cents(outflow), base)}%` : null;
  return (
    <section
      aria-labelledby="thermometer-title"
      className={cn("flex flex-col gap-5 rounded-2xl bg-card p-4 shadow-sm lg:p-6", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="thermometer-title" className="flex items-center gap-3 font-semibold text-lg leading-6">
          <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-primary">
            <Gauge className="size-5" aria-hidden />
          </span>
          Termômetro do Mês
        </h2>
        {spent && (
          <>
            <span className="hidden font-semibold text-muted-foreground text-xs lg:inline">{spent} Gasto</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-bold text-xs lg:hidden",
                TIER_STYLE[view.balance_today_tier].pill,
              )}
            >
              {spent} Comprometido
            </span>
          </>
        )}
      </div>
      <dl className="hidden grid-cols-3 gap-2 rounded-xl bg-muted p-3 text-sm lg:grid">
        <div className="flex min-w-0 flex-col">
          <dt className="text-muted-foreground text-xs">Entradas</dt>
          <dd>
            <Money amount={income} className="font-bold text-income-text" />
          </dd>
        </div>
        <div className="flex min-w-0 flex-col">
          <dt className="text-muted-foreground text-xs">Saídas</dt>
          <dd>
            <Money amount={outflow} className="font-bold" />
          </dd>
        </div>
        <div className="flex min-w-0 flex-col">
          <dt className="text-muted-foreground text-xs">Resultado</dt>
          <dd>
            {result < 0 ? (
              <span className="whitespace-nowrap font-bold text-expense tabular-nums">
                - {formatMoney(fromCents(-result), currency)}
              </span>
            ) : (
              <Money amount={performance} income className="font-bold" />
            )}
          </dd>
        </div>
      </dl>
      <ThermometerStrip tier={view.balance_today_tier} marker />
      <p className="flex items-start gap-2.5 rounded-xl bg-muted p-3 text-muted-foreground text-sm leading-6">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-income lg:hidden" aria-hidden />
        <span>
          {spent ? (
            <>
              <span className="lg:hidden">
                Você comprometeu <strong className={share}>{spent}</strong> da renda líquida.
              </span>
              <span className="hidden lg:inline">
                Você comprometeu <strong className={share}>{spent}</strong> das receitas líquidas.
              </span>
            </>
          ) : (
            <span>Nenhuma entrada ainda este mês.</span>
          )}{" "}
          <span>
            Com as contas em aberto, o caixa fecha o mês no{" "}
            <strong className={cn("font-bold", TIER_STYLE[view.projected_tier].label)}>
              {WORD[view.projected_tier]}
            </strong>
            .
          </span>
        </span>
      </p>
    </section>
  );
};

/** C1 while the month loads: the hero and the summary. */
export const HeroSkeleton = ({ className }: { className?: string }) => (
  <div aria-busy="true" className={cn("flex flex-col gap-4", className)}>
    <Skeleton data-testid="hero-figure-skeleton" className="h-40 w-full rounded-3xl" />
    <Skeleton data-testid="hero-bar-skeleton" className="h-20 w-full rounded-2xl" />
  </div>
);
