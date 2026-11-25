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

/** The hero card of the mobile frames: an eyebrow, the page's title and its switcher. */
export const PageHero = ({ eyebrow, title, heading, subtitle, children, className, level = 1 }: PageHeroProps) => {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <section
      aria-label={title}
      className={cn(
        "bg-card text-card-foreground flex flex-col items-center gap-4 rounded-3xl px-4 pt-5 pb-6 text-center shadow-sm lg:flex-row lg:justify-between lg:px-8 lg:py-8 lg:text-left",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        {eyebrow && <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{eyebrow}</p>}
        <Heading className="text-[22px] leading-7 font-bold lg:text-[28px] lg:leading-9">{heading ?? title}</Heading>
        {subtitle && <p className="text-muted-foreground text-sm max-lg:hidden">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
};
