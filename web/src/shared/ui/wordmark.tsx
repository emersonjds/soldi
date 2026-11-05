import { cn } from "@/lib/utils";

export const Wordmark = ({ className }: { className?: string }) => (
  <span className={cn("inline-flex items-center gap-1.5 font-bold text-2xl tracking-tight", className)}>
    Soldi
    <span aria-hidden className="size-2 rounded-full bg-brand" />
  </span>
);
