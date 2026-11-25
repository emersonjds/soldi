"use client";

import { PieChart } from "lucide-react";

import { useCategoryReport } from "@/entities/report/report-query";
import { formatPct } from "@/shared/lib/percent";
import { cents } from "@/shared/lib/tier";
import { categoryBg } from "@/shared/ui/category-icon";
import { DashCard } from "@/shared/ui/dash-card";
import { Money } from "@/shared/ui/money";
import { PageError } from "@/shared/ui/page-state";

/** Stitch §2.10: the month's four largest outflow groups; nothing while loading or without outflow (D25). */
export const SpendingGlance = ({ month, className }: { month: string; className?: string }) => {
  const report = useCategoryReport(month);
  const failed = report.isError && !report.data;
  if (!failed && (!report.data || cents(report.data.spent_total) === 0)) return null;
  return (
    <DashCard
      title="Para Onde Vai"
      icon={<PieChart aria-hidden className="text-primary size-5" />}
      action={{ href: `/para-onde-vai?m=${month}`, label: "Ver análise", arrow: true }}
      className={className}
    >
      {report.data ? (
        <ul className="flex flex-col gap-4">
          {report.data.groups
            .filter((group) => group.kind !== "income")
            .slice(0, 4)
            .map((group) => (
              <li key={group.category_id} className="flex flex-col gap-1.5">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="line-clamp-2 text-base font-medium break-words">{group.name}</span>
                  <Money amount={group.amount} className="text-sm font-semibold" />
                </span>
                <span aria-hidden className="bg-muted h-2 overflow-hidden rounded-full">
                  <span
                    className={`block h-full rounded-full ${categoryBg(group.color)}`}
                    style={{ width: `${group.pct}%` }}
                  />
                </span>
                <span className="text-muted-foreground text-right text-xs tabular-nums">{formatPct(group.pct)}</span>
              </li>
            ))}
        </ul>
      ) : (
        <PageError message="Não foi possível carregar os gastos." onRetry={() => report.refetch()} />
      )}
    </DashCard>
  );
};
