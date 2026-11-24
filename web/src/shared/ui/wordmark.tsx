import { cn } from "@/lib/utils";

export const Wordmark = ({ className }: { className?: string }) => (
  <span className={cn("inline-flex items-center gap-1.5 text-2xl font-bold tracking-tight", className)}>
    Soldi
    <span aria-hidden className="bg-brand size-2 rounded-full" />
  </span>
);
