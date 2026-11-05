import type { Schemas } from "@/shared/api/client";

export type Tier = Schemas["Tier"];

export const TIER_ORDER: readonly Tier[] = ["red", "light_red", "yellow", "light_green", "green"];

export const TIER_LABEL: Record<Tier, string> = {
  red: "Crítico",
  light_red: "Atenção",
  yellow: "Apertado",
  light_green: "Confortável",
  green: "Folga",
};

/** Literal class names: Tailwind only ships classes it finds spelled out. */
export const TIER_STYLE: Record<Tier, { pill: string; dot: string }> = {
  red: { pill: "bg-tier-red-soft text-tier-red-foreground", dot: "bg-tier-red" },
  light_red: {
    pill: "bg-tier-light-red-soft text-tier-light-red-foreground",
    dot: "bg-tier-light-red",
  },
  yellow: {
    pill: "bg-tier-yellow-soft text-tier-yellow-foreground",
    dot: "bg-tier-yellow",
  },
  light_green: {
    pill: "bg-tier-light-green-soft text-tier-light-green-foreground",
    dot: "bg-tier-light-green",
  },
  green: {
    pill: "bg-tier-green-soft text-tier-green-foreground",
    dot: "bg-tier-green",
  },
};
