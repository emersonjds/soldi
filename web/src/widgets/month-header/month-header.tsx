import { ChevronLeft, ChevronRight } from "lucide-react";

import { formatBRL } from "@/shared/lib/money";
import type { Tier } from "@/shared/lib/tier";
import { TierPill } from "@/shared/ui/tier-pill";

const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });

const parse = (month: string) => month.split("-").map(Number);

const monthLabel = (month: string) => {
  const [year, index] = parse(month);
  const name = monthName.format(Date.UTC(year, index - 1, 1));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
};

const shiftMonth = (month: string, delta: number) => {
  const [year, index] = parse(month);
  return new Date(Date.UTC(year, index - 1 + delta, 1)).toISOString().slice(0, 7);
};

type MonthHeaderProps = {
  /** `YYYY-MM` */
  month: string;
  balance: string;
  tier: Tier;
  onMonthChange: (month: string) => void;
};

const switcherButton =
  "flex size-11 items-center justify-center rounded-full transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white";

export const MonthHeader = ({ month, balance, tier, onMonthChange }: MonthHeaderProps) => (
  <section className="-mx-4 -mt-4 rounded-b-3xl bg-linear-to-br from-hero-from to-hero-to px-4 pt-6 pb-10 text-hero-foreground lg:mx-0 lg:mt-0 lg:rounded-3xl lg:px-8 lg:py-8">
    <div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-white/10 p-1 lg:mx-0">
      <button
        type="button"
        aria-label="Mês anterior"
        className={switcherButton}
        onClick={() => onMonthChange(shiftMonth(month, -1))}
      >
        <ChevronLeft className="size-5" />
      </button>
      <span className="min-w-36 text-center font-semibold text-base">{monthLabel(month)}</span>
      <button
        type="button"
        aria-label="Próximo mês"
        className={switcherButton}
        onClick={() => onMonthChange(shiftMonth(month, 1))}
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
    <div className="mt-8 flex flex-col items-center gap-3 lg:flex-row lg:items-end lg:gap-4">
      <div className="flex flex-col items-center gap-1 lg:items-start">
        <p className="font-semibold text-[11px] text-white/80 uppercase leading-4 tracking-[0.12em]">Saldo hoje</p>
        <p className="font-bold text-[34px] tabular-nums leading-10 tracking-[-0.02em] lg:text-5xl">
          {formatBRL(balance)}
        </p>
      </div>
      <TierPill tier={tier} className="lg:mb-1.5" />
    </div>
  </section>
);
