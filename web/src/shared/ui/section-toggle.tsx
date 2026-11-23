import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/** SOL-158: the chevron at the right of a card's header that collapses or expands it. */
export const SectionToggle = ({
  open,
  onOpenChange,
  label,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  className?: string;
}) => (
  <button
    type="button"
    aria-label={label}
    aria-expanded={open}
    onClick={() => onOpenChange(!open)}
    className={cn(
      "-my-2.5 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
      className,
    )}
  >
    <ChevronDown
      aria-hidden
      className={cn("size-5 motion-safe:transition-transform motion-safe:duration-150", open && "rotate-180")}
    />
  </button>
);
