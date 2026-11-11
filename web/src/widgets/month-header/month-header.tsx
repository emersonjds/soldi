import type { ReactNode } from "react";

import { useCurrency } from "@/shared/lib/currency";
import { formatMoney } from "@/shared/lib/money";
import type { Tier } from "@/shared/lib/tier";
import { Switcher } from "@/shared/ui/month-switcher";
import { TierPill } from "@/shared/ui/tier-pill";

type MonthHeaderProps = {
  /** Under the balance; the compact variant ignores it. */
  children?: ReactNode;
} & (
  | { balance: string; tier: Tier; title?: never }
  /** Compact: the screen's title, no balance. */
  | { title: string; balance?: never; tier?: never }
);

const frame = "rounded-3xl bg-linear-to-br from-hero-from to-hero-to px-4 text-hero-foreground lg:px-8";

/** The short indigo header of Para onde vai and Economia. */
const CompactHeader = ({ title, children }: { title: string; children?: ReactNode }) => (
  <section
    aria-label={title}
    className={`${frame} flex flex-col items-center gap-4 pt-5 pb-6 lg:flex-row lg:justify-between lg:py-8`}
  >
    <h1 className="font-bold text-[22px] leading-7 lg:text-[28px] lg:leading-9">{title}</h1>
    {children}
  </section>
);

export const MonthHeader = ({ balance, tier, title, children }: MonthHeaderProps) => {
  const currency = useCurrency();

  if (title !== undefined) return <CompactHeader title={title} />;

  return (
    <section aria-label="Saldo hoje" className={`${frame} pt-6 pb-14 lg:pt-8 lg:pb-24`}>
      <div className="flex flex-col items-center gap-3 lg:flex-row lg:items-end lg:gap-4">
        <div className="flex flex-col items-center gap-1 lg:items-start">
          <p className="font-semibold text-[11px] text-white/80 uppercase leading-4 tracking-[0.12em]">Saldo hoje</p>
          <p className="font-bold text-[34px] tabular-nums leading-10 tracking-[-0.02em] lg:text-5xl">
            {formatMoney(balance, currency)}
          </p>
        </div>
        <TierPill tier={tier} className="lg:mb-1.5" />
      </div>
      {children}
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
