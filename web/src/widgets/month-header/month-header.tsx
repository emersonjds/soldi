import type { KeyboardEvent } from "react";

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
  /** `YYYY-MM` of the opening balance; nothing exists before it. */
  minMonth?: string;
  balance: string;
  tier: Tier;
  onMonthChange: (month: string) => void;
};

const switcherButton =
  "flex size-11 items-center justify-center rounded-full transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white disabled:pointer-events-none disabled:opacity-40";

export const MonthHeader = ({ month, minMonth, balance, tier, onMonthChange }: MonthHeaderProps) => {
  const atStart = minMonth !== undefined && month <= minMonth;
  const previous = () => !atStart && onMonthChange(shiftMonth(month, -1));
  const next = () => onMonthChange(shiftMonth(month, 1));
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") previous();
    if (event.key === "ArrowRight") next();
  };

  return (
    <section
      aria-label="Saldo hoje"
      className="-mx-4 -mt-4 rounded-b-3xl bg-linear-to-br from-hero-from to-hero-to px-4 pt-6 pb-14 text-hero-foreground lg:mx-0 lg:mt-0 lg:rounded-3xl lg:px-8 lg:pt-8 lg:pb-24"
    >
      <fieldset
        onKeyDown={onKeyDown}
        className="mx-auto flex w-fit items-center gap-2 rounded-full bg-white/10 p-1 lg:mx-0"
      >
        <legend className="sr-only">Mês</legend>
        <button
          type="button"
          aria-label="Mês anterior"
          className={switcherButton}
          disabled={atStart}
          onClick={previous}
        >
          <ChevronLeft className="size-5" />
        </button>
        <span aria-live="polite" className="min-w-36 text-center font-semibold text-base">
          {monthLabel(month)}
        </span>
        <button type="button" aria-label="Próximo mês" className={switcherButton} onClick={next}>
          <ChevronRight className="size-5" />
        </button>
      </fieldset>
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
};
