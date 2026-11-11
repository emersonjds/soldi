import { cn } from "@/lib/utils";
import { TIER_LABEL, TIER_ORDER, TIER_STYLE, type Tier } from "@/shared/lib/tier";

const MARKER_PLACE = [
  "left-0",
  "left-1/2 -translate-x-1/2",
  "left-1/2 -translate-x-1/2",
  "left-1/2 -translate-x-1/2",
  "right-0",
];

/**
 * Five segments from Crítico to Folga; the current one is full color, taller and named in bold. With `marker` (the
 * Mês card) the labels wear their tier color below 1024, and from 1024 `Você está aqui` sits above the current one.
 */
export const ThermometerStrip = ({
  tier,
  marker = false,
  className,
}: {
  tier: Tier;
  marker?: boolean;
  className?: string;
}) => (
  <div className={className}>
    <meter
      className="sr-only"
      aria-label="Termômetro"
      min={1}
      max={5}
      value={TIER_ORDER.indexOf(tier) + 1}
      aria-valuetext={TIER_LABEL[tier]}
    />
    <div aria-hidden className={cn("grid grid-cols-5 gap-1", marker && "lg:pt-7")}>
      {TIER_ORDER.map((segment, index) => {
        const current = segment === tier;
        return (
          <div key={segment} className="relative flex min-w-0 flex-col items-center gap-2">
            {marker && current && (
              <span
                className={cn(
                  "absolute bottom-full mb-1 hidden whitespace-nowrap rounded-md px-1.5 py-0.5 font-bold text-[10px] leading-4 shadow-xs lg:block",
                  TIER_STYLE[segment].pill,
                  MARKER_PLACE[index],
                )}
              >
                {`Você está aqui: ${TIER_LABEL[segment]}`}
              </span>
            )}
            <span
              aria-hidden
              className={cn(
                "h-2.5 w-full rounded-full transition-[scale,opacity] duration-200 motion-reduce:transition-none",
                TIER_STYLE[segment].dot,
                !current && "scale-y-60 opacity-35",
              )}
            />
            <span
              className={cn(
                "max-w-full hyphens-auto break-words text-center text-[11px] leading-3.5",
                current ? "font-bold" : "font-medium",
                marker && [TIER_STYLE[segment].label, "lg:text-muted-foreground"],
                !marker && (current ? "text-foreground" : "text-muted-foreground"),
              )}
            >
              {TIER_LABEL[segment]}
            </span>
          </div>
        );
      })}
    </div>
  </div>
);
