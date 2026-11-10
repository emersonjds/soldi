import { cn } from "@/lib/utils";
import { TIER_LABEL, TIER_STYLE, type Tier } from "@/shared/lib/tier";
import { Money } from "@/shared/ui/money";

const SIZE = {
  md: "gap-1.5 px-3 py-1 text-sm",
  sm: "gap-1 px-2 py-0.5 text-xs",
} as const;

type TierPillProps = {
  tier: Tier;
  /** A balance shown before the label, as on the day headers. */
  amount?: string;
  /** A day ahead: the label reads `Previsto · <tier>`. */
  forecast?: boolean;
  size?: keyof typeof SIZE;
  className?: string;
};

/** Color never travels alone: the label always goes with it. */
export const TierPill = ({ tier, amount, forecast = false, size = "md", className }: TierPillProps) => {
  const label = forecast ? `Previsto · ${TIER_LABEL[tier]}` : TIER_LABEL[tier];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full font-semibold leading-5",
        SIZE[size],
        TIER_STYLE[tier].pill,
        className,
      )}
    >
      <span aria-hidden className={cn("size-2 rounded-full", TIER_STYLE[tier].dot)} />
      {amount === undefined ? (
        label
      ) : (
        <>
          <Money amount={amount} className="font-bold text-current" />
          <span className="font-medium">{label}</span>
        </>
      )}
    </span>
  );
};
