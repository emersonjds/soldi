import type { Schemas } from "@/shared/api/client";
import type { Tier } from "@/shared/ui/tier-badge";

// ponytail: client-side tier for the opening balance only; SOL-3 takes the tier from GET /api/months.
export const tierOf = (balance: string, settings: Schemas["Settings"]): Tier => {
  const value = Number(balance);
  if (value < Number(settings.tier_red)) return "red";
  if (value < Number(settings.tier_zero)) return "light-red";
  if (value < Number(settings.tier_yellow)) return "yellow";
  if (value < Number(settings.tier_green)) return "light-green";
  return "green";
};
