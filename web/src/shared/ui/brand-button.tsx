import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The brand call to action: one per screen. */
export const BrandButton = ({ className, ...props }: ComponentProps<typeof Button>) => (
  <Button
    className={cn("bg-brand text-brand-foreground hover:bg-brand-hover min-h-12 w-full text-base", className)}
    {...props}
  />
);
