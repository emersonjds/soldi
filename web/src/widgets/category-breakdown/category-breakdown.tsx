"use client";

import { useState } from "react";

import { Pie, PieChart } from "recharts";

import { Button } from "@/components/ui/button";
import { ChartContainer } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCategoryLabel } from "@/entities/category/categories-query";
import { type CategoryShare, useCategoryReport } from "@/entities/report/report-query";
import { useTransactions } from "@/entities/transaction/transaction-queries";
import { cn } from "@/lib/utils";
import { shortDay } from "@/shared/lib/date";
import { formatDelta, formatPct } from "@/shared/lib/percent";
import { CategoryIcon, categoryBg, categoryFill } from "@/shared/ui/category-icon";
import { Money } from "@/shared/ui/money";
import { PageError, PageLoading } from "@/shared/ui/page-state";

type Tab = "outflow" | "income";

const card = "flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6";

const caption = "font-semibold text-[11px] text-muted-foreground uppercase leading-4 tracking-[0.12em]";

const COPY: Record<Tab, { center: string; empty: string }> = {
  outflow: { center: "Saídas do mês", empty: "Nenhum gasto neste mês ainda." },
  income: { center: "Entradas do mês", empty: "Nenhuma entrada neste mês ainda." },
};

/** Spending that grew is bad news, income that grew is good news; no change stays neutral. */
const DeltaBadge = ({ share }: { share: CategoryShare }) => {
  if (share.delta_pct === null || share.delta_pct === undefined) return null;
  const label = formatDelta(share.delta_pct);
  const rose = !share.delta_pct.startsWith("-");
  const good = share.kind === "income" ? rose : !rose;
  return (
    <>
      <span
        className={cn(
          "rounded-md px-1.5 font-semibold text-xs tabular-nums leading-5",
          label === "0%" && "bg-muted text-muted-foreground",
          label !== "0%" &&
            (good ? "bg-income-soft text-tier-green-foreground" : "bg-expense-soft text-tier-red-foreground"),
        )}
      >
        {label}
      </span>
      <span className="sr-only"> em relação ao mês anterior</span>
    </>
  );
};

type DonutProps = {
  shares: CategoryShare[];
  total: string;
  label: string;
  selected?: string;
  onSelect: (id: string) => void;
};

const Donut = ({ shares, total, label, selected, onSelect }: DonutProps) => {
  // ponytail: Number() only sizes the slices; every amount on screen is the API string.
  const data = shares.map((share) => ({
    name: share.name,
    value: Number(share.amount),
    fill: categoryFill(share.color),
    fillOpacity: selected && selected !== share.category_id ? 0.3 : 1,
  }));

  return (
    <div className="relative mx-auto aspect-square w-full max-w-56 lg:max-w-64">
      <ChartContainer config={{}} aria-hidden className="aspect-square size-full">
        <PieChart accessibilityLayer={false}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            startAngle={90}
            endAngle={-270}
            innerRadius="72%"
            outerRadius="100%"
            stroke="var(--card)"
            strokeWidth={2}
            cornerRadius={4}
            className="cursor-pointer"
            onClick={(_sector, index) => onSelect(shares[index].category_id)}
          />
        </PieChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
        <span className={caption}>{label}</span>
        <Money amount={total} className="font-bold text-xl leading-7 tracking-[-0.02em] lg:text-2xl" />
      </div>
    </div>
  );
};

const LegendRow = ({ share, pressed, onSelect }: { share: CategoryShare; pressed: boolean; onSelect: () => void }) => {
  const label = useCategoryLabel();
  return (
    <li>
      <button
        type="button"
        aria-pressed={pressed}
        onClick={onSelect}
        className="flex min-h-16 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-secondary"
      >
        <CategoryIcon icon={share.icon} color={share.color} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium text-base">{label(share)}</span>
          <span className="flex items-center gap-2 text-muted-foreground text-sm tabular-nums">
            {formatPct(share.pct, 0)}
            <DeltaBadge share={share} />
          </span>
        </span>
        <Money amount={share.amount} className="font-bold text-base" />
      </button>
    </li>
  );
};

const TopFive = ({ shares, className }: { shares: CategoryShare[]; className?: string }) => {
  const label = useCategoryLabel();
  return (
    <section aria-labelledby="top-five-title" className={cn(card, className)}>
      <h2 id="top-five-title" className="font-semibold text-lg leading-6">
        Top 5
      </h2>
      <ol className="flex flex-col gap-4">
        {shares.slice(0, 5).map((share) => (
          <li key={share.category_id} className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{label(share)}</span>
              <span className="font-semibold tabular-nums">{formatPct(share.pct)}</span>
            </span>
            <span aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
              <span
                className={cn("block h-full rounded-full", categoryBg(share.color))}
                style={{ width: `${share.pct}%` }}
              />
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
};

type EntriesProps = { month: string; share: CategoryShare; onClear: () => void; className?: string };

const CategoryEntries = ({ month, share, onClear, className }: EntriesProps) => {
  const label = useCategoryLabel();
  const entries = useTransactions(month, share.category_id);

  return (
    <section aria-labelledby="category-entries-title" className={cn(card, "gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="category-entries-title" className="flex min-w-0 items-center gap-2 font-semibold text-lg leading-6">
          <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", categoryBg(share.color))} />
          <span className="min-w-0 break-words">Lançamentos de {label(share)}</span>
        </h2>
        <Button variant="ghost" className="min-h-11 shrink-0 text-primary" onClick={onClear}>
          Limpar filtro
        </Button>
      </div>
      {entries.isError && (
        <PageError message="Não foi possível carregar os lançamentos." onRetry={() => entries.refetch()} />
      )}
      {!entries.isError && !entries.data && <PageLoading />}
      {entries.data && (
        <ul className="flex flex-col">
          {entries.data.map((entry) => (
            <li key={entry.id} className="flex min-h-16 items-center gap-3 px-2 py-2">
              <CategoryIcon icon={entry.category.icon} color={entry.category.color} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium text-base">{entry.note || label(entry.category)}</span>
                <span className="text-muted-foreground text-xs">{shortDay(entry.date)}</span>
              </span>
              <Money amount={entry.amount} income={entry.kind === "income"} className="font-bold text-base" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export const BreakdownSkeleton = () => (
  <div role="status" aria-label="Carregando" className={cn(card, "items-center gap-6")}>
    <Skeleton className="h-11 w-full rounded-full" />
    <Skeleton className="size-48 rounded-full border-[24px] border-muted bg-transparent" />
    <div className="flex w-full flex-col gap-4">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  </div>
);

const segment =
  "min-h-11 flex-1 rounded-full text-base data-[state=on]:bg-card data-[state=on]:text-primary data-[state=on]:shadow-sm";

/** `Para onde vai`: the month by category, a slice or row picks one category and lists its entries. */
export const CategoryBreakdown = ({ month }: { month: string }) => {
  const report = useCategoryReport(month);
  const [tab, setTab] = useState<Tab>("outflow");
  const [selected, setSelected] = useState<string>();

  if (report.isError)
    return (
      <div className="rounded-2xl bg-card shadow-sm">
        <PageError message="Não foi possível carregar o mês por categoria." onRetry={() => report.refetch()} />
      </div>
    );
  if (!report.data) return <BreakdownSkeleton />;

  const shares = report.data[tab];
  const total = tab === "outflow" ? report.data.outflow_total : report.data.income_total;
  const chosen = shares.find((share) => share.category_id === selected);
  const toggle = (id: string) => setSelected((current) => (current === id ? undefined : id));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
      <section aria-label="Por categoria" className={cn(card, "gap-6")}>
        <ToggleGroup
          type="single"
          spacing={0}
          value={tab}
          onValueChange={(value) => {
            if (value !== "outflow" && value !== "income") return;
            setTab(value);
            setSelected(undefined);
          }}
          className="w-full rounded-full bg-muted p-1"
        >
          <ToggleGroupItem value="outflow" className={segment}>
            Saídas
          </ToggleGroupItem>
          <ToggleGroupItem value="income" className={segment}>
            Entradas
          </ToggleGroupItem>
        </ToggleGroup>
        {shares.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">{COPY[tab].empty}</p>
        ) : (
          <>
            <Donut shares={shares} total={total} label={COPY[tab].center} selected={selected} onSelect={toggle} />
            <ul aria-label="Categorias" className="flex flex-col gap-1">
              {shares.map((share) => (
                <LegendRow
                  key={share.category_id}
                  share={share}
                  pressed={share.category_id === selected}
                  onSelect={() => toggle(share.category_id)}
                />
              ))}
            </ul>
          </>
        )}
      </section>
      <div className="flex flex-col gap-6">
        {chosen && <CategoryEntries month={month} share={chosen} onClear={() => setSelected(undefined)} />}
        {shares.length > 0 && <TopFive shares={shares} className="lg:order-first" />}
      </div>
    </div>
  );
};
