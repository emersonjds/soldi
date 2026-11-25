import { cn } from "@/lib/utils";

import { LogoMark } from "./logo-mark";

export const Wordmark = ({ className, stacked = false }: { className?: string; stacked?: boolean }) => (
  <span
    role="img"
    aria-label="Soldi"
    className={cn(
      "font-wordmark text-wordmark text-2xl font-bold",
      stacked ? "flex flex-col items-center gap-[0.15em]" : "inline-flex items-center gap-[0.35em]",
      className,
    )}
  >
    <LogoMark className={stacked ? "size-[1.4em]" : "size-[1.1em]"} />
    <span aria-hidden="true">soldi</span>
  </span>
);
