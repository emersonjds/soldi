import { cn } from "@/lib/utils";

export type Tier = "red" | "light-red" | "yellow" | "light-green" | "green";

export const TIER_LABEL: Record<Tier, string> = {
  red: "Crítico",
  "light-red": "Atenção",
  yellow: "Apertado",
  "light-green": "Confortável",
  green: "Folga",
};

const TIER_STYLE: Record<Tier, { pill: string; dot: string }> = {
  red: { pill: "bg-tier-red-soft text-tier-red-foreground", dot: "bg-tier-red" },
  "light-red": { pill: "bg-tier-light-red-soft text-tier-light-red-foreground", dot: "bg-tier-light-red" },
  yellow: { pill: "bg-tier-yellow-soft text-tier-yellow-foreground", dot: "bg-tier-yellow" },
  "light-green": { pill: "bg-tier-light-green-soft text-tier-light-green-foreground", dot: "bg-tier-light-green" },
  green: { pill: "bg-tier-green-soft text-tier-green-foreground", dot: "bg-tier-green" },
};

/** Color never travels alone: the label always goes with it. */
export const TierBadge = ({ tier, className }: { tier: Tier; className?: string }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold text-sm",
      TIER_STYLE[tier].pill,
      className,
    )}
  >
    <span aria-hidden className={cn("size-2 rounded-full", TIER_STYLE[tier].dot)} />
    {TIER_LABEL[tier]}
  </span>
);
