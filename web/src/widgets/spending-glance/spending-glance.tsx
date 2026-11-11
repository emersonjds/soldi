"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useCategoryReport } from "@/entities/report/report-query";
import { formatPct } from "@/shared/lib/percent";
import { CategoryIcon, categoryBg } from "@/shared/ui/category-icon";
import { DashCard } from "@/shared/ui/dash-card";
import { Money } from "@/shared/ui/money";
import { PageError } from "@/shared/ui/page-state";

const Body = ({ month }: { month: string }) => {
  const report = useCategoryReport(month);
  if (report.isError && !report.data)
    return <PageError message="Não foi possível carregar os gastos." onRetry={() => report.refetch()} />;
  if (!report.data)
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} data-testid="bar-skeleton" className="flex flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </div>
    );
  const groups = report.data.groups.filter((group) => group.kind !== "income").slice(0, 4);
  if (groups.length === 0)
    return <p className="py-6 text-center text-muted-foreground">Nenhum gasto neste mês ainda.</p>;
  return (
    <ul className="flex flex-col gap-4">
      {groups.map((group) => (
        <li key={group.category_id} className="flex items-center gap-3">
          <CategoryIcon icon={group.icon} color={group.color} />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium text-base">{group.name}</span>
              <Money amount={group.amount} className="font-semibold" />
            </span>
            <span className="flex items-center gap-3">
              <span aria-hidden className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={`block h-full rounded-full ${categoryBg(group.color)}`}
                  style={{ width: `${group.pct}%` }}
                />
              </span>
              <span className="w-10 text-right text-muted-foreground text-sm tabular-nums">
                {formatPct(group.pct, 0)}
              </span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
};

/** C6: the month's four largest outflow groups (spec 2026-11-10 §2), its own request, skeleton and error. */
export const SpendingGlance = ({ month, className }: { month: string; className?: string }) => (
  <DashCard
    title="Para onde vai"
    action={{ href: `/para-onde-vai?m=${month}`, label: "Ver tudo" }}
    className={className}
  >
    <Body month={month} />
  </DashCard>
);
