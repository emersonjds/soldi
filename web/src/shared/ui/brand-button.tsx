import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The violet call to action: one per screen. */
export const BrandButton = ({ className, ...props }: ComponentProps<typeof Button>) => (
  <Button
    className={cn("min-h-12 w-full bg-brand text-base text-brand-foreground hover:bg-brand-hover", className)}
    {...props}
  />
);
