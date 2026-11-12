"use client";

import type { ReactNode } from "react";

import type { LucideIcon } from "lucide-react";

import { useSettings } from "@/entities/settings/settings-query";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { PageError } from "@/shared/ui/page-state";

type SectionProps = {
  id: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  danger?: boolean;
  children: ReactNode;
};

/** One Ajustes card: an anchor target with its icon, title and subtitle. */
export const SettingsSection = ({ id, icon: Icon, title, subtitle, badge, danger, children }: SectionProps) => (
  <section
    id={id}
    aria-labelledby={`${id}-title`}
    className="flex scroll-mt-24 flex-col gap-6 rounded-2xl bg-card p-4 shadow-sm lg:p-6"
  >
    <header className="flex flex-wrap items-start gap-3">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          danger ? "bg-destructive/10 text-destructive" : "bg-secondary text-primary",
        )}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 id={`${id}-title`} className="font-bold text-lg leading-6">
          {title}
        </h2>
        {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
      </div>
      {badge}
    </header>
    {children}
  </section>
);

/** Renders `children` with the settings once loaded; nothing while loading, a retry when they fail. */
export const WithSettings = ({ children }: { children: (settings: Schemas["Settings"]) => ReactNode }) => {
  const settings = useSettings();
  if (settings.isError)
    return <PageError message="Não foi possível carregar os ajustes." onRetry={() => settings.refetch()} />;
  return settings.data ? children(settings.data) : null;
};
