import { CalendarClock } from "lucide-react";

/** The Diário previsto's mark: a dashed outline, never a fill or a tier color, so it never reads as a real entry. */
export const EstimateIcon = () => (
  <span
    aria-hidden
    className="border-muted-foreground text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-full border border-dashed"
  >
    <CalendarClock className="size-5" />
  </span>
);
