import { cn } from "@/lib/utils";
import { TIER_LABEL, TIER_ORDER, TIER_STYLE, type Tier } from "@/shared/lib/tier";

/** Five segments from Crítico to Folga; the current one is full color, taller and named in bold. */
export const ThermometerStrip = ({ tier, className }: { tier: Tier; className?: string }) => (
  <div className={className}>
    <meter
      className="sr-only"
      aria-label="Termômetro"
      min={1}
      max={5}
      value={TIER_ORDER.indexOf(tier) + 1}
      aria-valuetext={TIER_LABEL[tier]}
    />
    <div aria-hidden className="grid grid-cols-5 gap-1">
      {TIER_ORDER.map((segment) => {
        const current = segment === tier;
        return (
          <div key={segment} className="flex min-w-0 flex-col items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "w-full rounded-full transition-[height,opacity] duration-200 motion-reduce:transition-none",
                TIER_STYLE[segment].dot,
                current ? "h-2.5" : "h-1.5 opacity-35",
              )}
            />
            <span
              className={cn(
                "max-w-full truncate text-[11px] leading-4",
                current ? cn("font-bold", TIER_STYLE[segment].text) : "font-medium text-muted-foreground",
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
