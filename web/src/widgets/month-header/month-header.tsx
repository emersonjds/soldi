import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeroProps = {
  eyebrow?: ReactNode;
  title: string;
  /** Drawn in place of `title`, which stays the band's name. */
  heading?: ReactNode;
  subtitle?: string;
  children?: ReactNode;
  className?: string;
  level?: 1 | 2;
};

/** The indigo band of the mobile frames: an eyebrow, the page's title and its switcher. */
export const PageHero = ({ eyebrow, title, heading, subtitle, children, className, level = 1 }: PageHeroProps) => {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <section
      aria-label={title}
      className={cn(
        "flex flex-col items-center gap-4 rounded-3xl bg-linear-to-br from-hero-from to-hero-to px-4 pt-5 pb-6 text-center text-hero-foreground lg:flex-row lg:justify-between lg:px-8 lg:py-8 lg:text-left",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        {eyebrow && <p className="font-semibold text-hero-foreground/70 text-xs uppercase tracking-wider">{eyebrow}</p>}
        <Heading className="font-bold text-[22px] leading-7 lg:text-[28px] lg:leading-9">{heading ?? title}</Heading>
        {subtitle && <p className="text-hero-foreground/80 text-sm max-lg:hidden">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
};
