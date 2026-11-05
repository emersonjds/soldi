import { cn } from "@/lib/utils";
import { TIER_LABEL, TIER_STYLE, type Tier } from "@/shared/lib/tier";

const SIZE = {
  md: "gap-1.5 px-3 py-1 text-sm",
  sm: "gap-1 px-2 py-0.5 text-xs",
} as const;

/** Color never travels alone: the label always goes with it. */
export const TierPill = ({
  tier,
  size = "md",
  className,
}: {
  tier: Tier;
  size?: keyof typeof SIZE;
  className?: string;
}) => (
  <span
    className={cn(
      "inline-flex shrink-0 items-center rounded-full font-semibold leading-5",
      SIZE[size],
      TIER_STYLE[tier].pill,
      className,
    )}
  >
    <span aria-hidden className={cn("size-2 rounded-full", TIER_STYLE[tier].dot)} />
    {TIER_LABEL[tier]}
  </span>
);
