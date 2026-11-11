"use client";

import { useCategoryReport } from "@/entities/report/report-query";
import { wholeShare } from "@/shared/lib/percent";
import { cents } from "@/shared/lib/tier";
import { CategoryIcon, categoryBg } from "@/shared/ui/category-icon";
import { DashCard } from "@/shared/ui/dash-card";
import { Money } from "@/shared/ui/money";
import { PageError } from "@/shared/ui/page-state";

/** C6: the month's four largest outflow groups (spec 2026-11-10 §2); nothing while loading or without outflow (D25). */
export const SpendingGlance = ({ month, className }: { month: string; className?: string }) => {
  const report = useCategoryReport(month);
  const failed = report.isError && !report.data;
  if (!failed && (!report.data || cents(report.data.outflow_total) === 0)) return null;
  return (
    <DashCard
      title="Para onde vai"
      action={{ href: `/para-onde-vai?m=${month}`, label: "Ver tudo" }}
      className={className}
    >
      {report.data ? (
        <ul className="flex flex-col gap-4">
          {report.data.groups
            .filter((group) => group.kind !== "income")
            .slice(0, 4)
            .map((group) => (
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
                      {wholeShare(cents(group.amount), cents(report.data.outflow_total))}%
                    </span>
                  </span>
                </span>
              </li>
            ))}
        </ul>
      ) : (
        <PageError message="Não foi possível carregar os gastos." onRetry={() => report.refetch()} />
      )}
    </DashCard>
  );
};
