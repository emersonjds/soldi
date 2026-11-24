import { type ReactNode, useId } from "react";

import Link from "next/link";

import { Card, CardAction, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** A dashboard card (spec 2026-11-10 §4.3): an `h2` title, an optional link to the full screen, the body. */
export const DashCard = ({
  title,
  action,
  children,
  className,
  label,
  icon,
  trailing,
}: {
  title: ReactNode;
  /** Drawn before the title, out of its name. */
  icon?: ReactNode;
  /** The region's name when `title` is not plain text. */
  label?: string;
  action?: { href: string; label: string; arrow?: boolean };
  /** Drawn at the right of the header in place of `action`, such as a `SectionToggle`. */
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
}) => {
  const id = useId();
  return (
    <Card
      role="region"
      aria-labelledby={label ? undefined : id}
      aria-label={label}
      className={cn("rounded-2xl shadow-sm ring-0 lg:[--card-spacing:--spacing(6)]", className)}
    >
      <CardHeader className="items-center">
        <h2 id={id} className="text-foreground flex items-center gap-2 text-lg leading-6 font-semibold">
          {icon}
          {title}
        </h2>
        {action && (
          <CardAction className="self-center">
            <Link
              href={action.href}
              className="text-primary hover:bg-muted focus-visible:outline-ring -my-2.5 -mr-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium focus-visible:outline-2"
            >
              {action.label}
              {action.arrow && <span aria-hidden>→</span>}
            </Link>
          </CardAction>
        )}
        {trailing && !action && <CardAction className="self-center">{trailing}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
};
