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

export type TierBounds = Pick<Schemas["Settings"], "tier_red" | "tier_zero" | "tier_yellow" | "tier_green">;

/** An API decimal in whole cents: integer math, exact up to 2^53 cents. */
const cents = (amount: string) => {
  const [whole, fraction = ""] = amount.split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  return Number(whole) * 100 + sign * Number(fraction.padEnd(2, "0"));
};

/** The server's rule: each bound is the lowest balance of the next tier up. */
export const tierOf = (balance: string, bounds: TierBounds): Tier => {
  const value = cents(balance);
  if (value < cents(bounds.tier_red)) return "red";
  if (value < cents(bounds.tier_zero)) return "light_red";
  if (value < cents(bounds.tier_yellow)) return "yellow";
  if (value < cents(bounds.tier_green)) return "light_green";
  return "green";
};

/** Strictly rising, as the server demands. */
export const boundsRise = (bounds: TierBounds) =>
  cents(bounds.tier_red) < cents(bounds.tier_zero) &&
  cents(bounds.tier_zero) < cents(bounds.tier_yellow) &&
  cents(bounds.tier_yellow) < cents(bounds.tier_green);
