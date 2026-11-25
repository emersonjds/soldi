import { cn } from "@/lib/utils";

export const Wordmark = ({ className }: { className?: string }) => (
  <span role="img" aria-label="Soldi" className={cn("font-wordmark text-wordmark text-2xl font-bold", className)}>
    soldi
  </span>
);
