import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Switcher } from "@/shared/ui/month-switcher";

const frame = "rounded-3xl bg-linear-to-br from-hero-from to-hero-to px-4 text-hero-foreground lg:px-8";

/** The short indigo header of Para onde vai and Economia. */
const CompactHeader = ({ title, children, className }: { title: string; children?: ReactNode; className?: string }) => (
  <section
    aria-label={title}
    className={cn(
      frame,
      "flex flex-col items-center gap-4 pt-5 pb-6 lg:flex-row lg:justify-between lg:py-8",
      className,
    )}
  >
    <h1 className="font-bold text-[22px] leading-7 lg:text-[28px] lg:leading-9">{title}</h1>
    {children}
  </section>
);

/** Para onde vai's title; on desktop the top bar already shows it. */
export const MonthHeader = ({ title }: { title: string }) => <CompactHeader title={title} className="lg:sr-only" />;

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
