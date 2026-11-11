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
}: {
  title: ReactNode;
  /** Drawn before the title, out of its name. */
  icon?: ReactNode;
  /** The region's name when `title` is not plain text. */
  label?: string;
  action?: { href: string; label: string; arrow?: boolean };
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
        <h2 id={id} className="flex items-center gap-2 font-semibold text-foreground text-lg leading-6">
          {icon}
          {title}
        </h2>
        {action && (
          <CardAction className="self-center">
            <Link
              href={action.href}
              className="-my-2.5 -mr-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-medium text-primary text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              {action.label}
              {action.arrow && <span aria-hidden>→</span>}
            </Link>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
};
