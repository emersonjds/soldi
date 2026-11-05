import type { KeyboardEvent, ReactNode } from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { useCurrency } from "@/shared/lib/currency";
import { formatMoney } from "@/shared/lib/money";
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
  onMonthChange: (month: string) => void;
} & (
  | { balance: string; tier: Tier; title?: never }
  /** Compact: the screen's title over the switcher, no balance. */
  | { title: string; balance?: never; tier?: never }
);

const switcherButton =
  "flex size-11 items-center justify-center rounded-full transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white disabled:pointer-events-none disabled:opacity-40";

const frame =
  "-mx-4 -mt-4 rounded-b-3xl bg-linear-to-br from-hero-from to-hero-to px-4 text-hero-foreground lg:mx-0 lg:mt-0 lg:rounded-3xl lg:px-8";

type SwitcherProps = {
  legend: string;
  label: string;
  previousLabel: string;
  nextLabel: string;
  atStart: boolean;
  onShift: (delta: number) => void;
};

/** `‹ label ›` in a pill; the arrow keys move too. */
const Switcher = ({ legend, label, previousLabel, nextLabel, atStart, onShift }: SwitcherProps) => {
  const previous = () => !atStart && onShift(-1);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") previous();
    if (event.key === "ArrowRight") onShift(1);
  };

  return (
    <fieldset
      onKeyDown={onKeyDown}
      className="mx-auto flex w-fit items-center gap-2 rounded-full bg-white/10 p-1 lg:mx-0"
    >
      <legend className="sr-only">{legend}</legend>
      <button type="button" aria-label={previousLabel} className={switcherButton} disabled={atStart} onClick={previous}>
        <ChevronLeft className="size-5" />
      </button>
      <span aria-live="polite" className="min-w-36 text-center font-semibold text-base tabular-nums">
        {label}
      </span>
      <button type="button" aria-label={nextLabel} className={switcherButton} onClick={() => onShift(1)}>
        <ChevronRight className="size-5" />
      </button>
    </fieldset>
  );
};

/** The short indigo header of Para onde vai and Economia. */
const CompactHeader = ({ title, children }: { title: string; children: ReactNode }) => (
  <section
    aria-label={title}
    className={`${frame} flex flex-col items-center gap-4 pt-5 pb-6 lg:flex-row lg:justify-between lg:py-8`}
  >
    <h1 className="font-bold text-[22px] leading-7 lg:text-[28px] lg:leading-9">{title}</h1>
    {children}
  </section>
);

export const MonthHeader = ({ month, minMonth, balance, tier, title, onMonthChange }: MonthHeaderProps) => {
  const currency = useCurrency();
  const switcher = (
    <Switcher
      legend="Mês"
      label={monthLabel(month)}
      previousLabel="Mês anterior"
      nextLabel="Próximo mês"
      atStart={minMonth !== undefined && month <= minMonth}
      onShift={(delta) => onMonthChange(shiftMonth(month, delta))}
    />
  );

  if (title !== undefined) return <CompactHeader title={title}>{switcher}</CompactHeader>;

  return (
    <section aria-label="Saldo hoje" className={`${frame} pt-6 pb-14 lg:pt-8 lg:pb-24`}>
      {switcher}
      <div className="mt-8 flex flex-col items-center gap-3 lg:flex-row lg:items-end lg:gap-4">
        <div className="flex flex-col items-center gap-1 lg:items-start">
          <p className="font-semibold text-[11px] text-white/80 uppercase leading-4 tracking-[0.12em]">Saldo hoje</p>
          <p className="font-bold text-[34px] tabular-nums leading-10 tracking-[-0.02em] lg:text-5xl">
            {formatMoney(balance, currency)}
          </p>
        </div>
        <TierPill tier={tier} className="lg:mb-1.5" />
      </div>
    </section>
  );
};

type YearHeaderProps = {
  year: number;
  /** The year of the opening balance; nothing exists before it. */
  minYear?: number;
  title: string;
  onYearChange: (year: number) => void;
};

export const YearHeader = ({ year, minYear, title, onYearChange }: YearHeaderProps) => (
  <CompactHeader title={title}>
    <Switcher
      legend="Ano"
      label={String(year)}
      previousLabel="Ano anterior"
      nextLabel="Próximo ano"
      atStart={minYear !== undefined && year <= minYear}
      onShift={(delta) => onYearChange(year + delta)}
    />
  </CompactHeader>
);
