"use client";

import { type ReactNode, useId, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Plus } from "lucide-react";
import { Pie, PieChart } from "recharts";

import { Button } from "@/components/ui/button";
import { ChartContainer } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { categoriesQuery, useCategoryLabel } from "@/entities/category/categories-query";
import { type CategoryShare, useCategoryReport } from "@/entities/report/report-query";
import { useTransactions } from "@/entities/transaction/transaction-queries";
import { TransactionSheet } from "@/features/add-transaction/transaction-sheet";
import { EditBillSheet } from "@/features/edit-bill/edit-bill-sheet";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { shortDay, todayISO } from "@/shared/lib/date";
import { formatDelta, formatPct, wholeShare } from "@/shared/lib/percent";
import { cents, fromCents } from "@/shared/lib/tier";
import { CategoryIcon, categoryBg, categoryFill } from "@/shared/ui/category-icon";
import { DashCard } from "@/shared/ui/dash-card";
import { IncomeIllustration, LedgerIllustration } from "@/shared/ui/illustrations";
import { Money } from "@/shared/ui/money";
import { PageError, PageLoading } from "@/shared/ui/page-state";

type Tab = "outflow" | "income";

type Group = Schemas["CategoryGroup"];

const card = "flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6";

const caption = "font-semibold text-[11px] text-muted-foreground uppercase leading-4 tracking-[0.12em]";

const COPY: Record<Tab, { center: string; of: string; empty: string; Illustration: () => ReactNode }> = {
  outflow: {
    center: "Saídas do mês",
    of: "das saídas",
    empty: "Nenhum gasto neste mês ainda.",
    Illustration: LedgerIllustration,
  },
  income: {
    center: "Entradas do mês",
    of: "das entradas",
    empty: "Nenhuma entrada neste mês ainda.",
    Illustration: IncomeIllustration,
  },
};

type Kind = Schemas["CategoryKind"];

/** Spending that grew is bad news, income that grew is good news; no change stays neutral. */
const DeltaBadge = ({ delta_pct, kind }: { delta_pct?: string | null; kind: Kind }) => {
  if (delta_pct === null || delta_pct === undefined) return null;
  const label = formatDelta(delta_pct);
  const rose = !delta_pct.startsWith("-");
  const good = kind === "income" ? rose : !rose;
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
  groups: Group[];
  total: string;
  label: string;
  active?: string;
  onSelect: (id: string) => void;
};

const Donut = ({ groups, total, label, active, onSelect }: DonutProps) => {
  // ponytail: Number() only sizes the slices; every amount on screen is the API string.
  const data = groups.map((group) => ({
    name: group.name,
    value: Number(group.amount),
    fill: categoryFill(group.color),
    fillOpacity: active && active !== group.category_id ? 0.3 : 1,
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
            onClick={(_sector, index) => onSelect(groups[index].category_id)}
          />
        </PieChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
        <span className={caption}>{label}</span>
        <Money amount={total} size="figure" />
      </div>
    </div>
  );
};

const rowButton =
  "w-full rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-secondary";

type GroupRowProps = {
  group: Group;
  shares: CategoryShare[];
  of: string;
  total: string;
  open: boolean;
  selected?: string;
  onOpen: () => void;
  onSelect: (id: string) => void;
};

const GroupRow = ({ group, shares, of, total, open, selected, onOpen, onSelect }: GroupRowProps) => {
  const listId = useId();
  const children = shares.filter((share) => share.parent_id === group.category_id);
  const own = cents(group.amount) - children.reduce((sum, child) => sum + cents(child.amount), 0);
  const folds = group.children.length > 0;

  return (
    <li>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-pressed={selected === group.category_id}
          onClick={() => onSelect(group.category_id)}
          className={cn(rowButton, "flex min-h-16 min-w-0 flex-1 items-center gap-3")}
        >
          <CategoryIcon icon={group.icon} color={group.color} />
          <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5">
            <span className="truncate font-medium text-base">{group.name}</span>
            <span className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-2 text-muted-foreground text-sm tabular-nums">
              {wholeShare(cents(group.amount), cents(total))}% {of}
              <DeltaBadge delta_pct={group.delta_pct} kind={group.kind} />
            </span>
            <Money amount={group.amount} className="col-start-2 row-start-1 font-bold text-base" />
          </span>
        </button>
        {folds && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={`${open ? "Ocultar" : "Mostrar"} subcategorias de ${group.name}`}
            onClick={onOpen}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ChevronDown aria-hidden className={cn("size-5 transition-transform", open && "rotate-180")} />
          </button>
        )}
      </div>
      {folds && (
        <ul id={listId} hidden={!open} className="ml-7 flex flex-col border-l pl-2">
          {open &&
            children.map((child) => (
              <li key={child.category_id}>
                <button
                  type="button"
                  aria-pressed={selected === child.category_id}
                  onClick={() => onSelect(child.category_id)}
                  className={cn(rowButton, "flex min-h-11 items-center gap-2")}
                >
                  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", categoryBg(child.color))} />
                  <span className="min-w-0 flex-1 truncate text-base">{child.name}</span>
                  <DeltaBadge delta_pct={child.delta_pct} kind={child.kind} />
                  <Money amount={child.amount} className="font-semibold text-base" />
                </button>
              </li>
            ))}
          {open && own > 0 && (
            <li className="flex min-h-11 items-center gap-2 px-2 py-2 text-muted-foreground">
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
              <span className="min-w-0 flex-1 truncate text-base">{group.name} (sem subcategoria)</span>
              <Money amount={fromCents(own)} className="font-semibold text-base" />
            </li>
          )}
        </ul>
      )}
    </li>
  );
};

type TopFiveProps = { shares: CategoryShare[]; groups: Group[]; className?: string };

const TopFive = ({ shares, groups, className }: TopFiveProps) => {
  const label = useCategoryLabel();
  const parents = new Set(groups.filter((group) => group.children.length > 0).map((group) => group.category_id));
  return (
    <DashCard title="Top 5" className={className}>
      <ol className="flex flex-col gap-4">
        {shares.slice(0, 5).map((share) => (
          <li key={share.category_id} className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">
                {label(share)}
                {parents.has(share.category_id) && " (sem subcategoria)"}
              </span>
              <span className="shrink-0 tabular-nums">
                <Money amount={share.amount} className="font-semibold" />{" "}
                <span className="text-muted-foreground">({formatPct(share.pct)})</span>
              </span>
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
    </DashCard>
  );
};

/** A group (its id and its children's) or one subcategory (its own id). */
type Chosen = Pick<CategoryShare, "category_id" | "name" | "parent_id" | "color" | "kind" | "amount"> & {
  ids: string[];
};

type EntriesProps = { month: string; chosen: Chosen; onClear: () => void; className?: string };

const CategoryEntries = ({ month, chosen, onClear, className }: EntriesProps) => {
  const label = useCategoryLabel();
  const categories = useQuery(categoriesQuery);
  const entries = useTransactions(month);
  const [adding, setAdding] = useState(false);
  const name = label(chosen);
  const category = categories.data?.find((each) => each.id === chosen.category_id);
  const shown = entries.data?.filter((entry) => chosen.ids.includes(entry.category.id));

  return (
    <section aria-labelledby="category-entries-title" className={cn(card, "gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="category-entries-title" className="flex min-w-0 items-center gap-2 font-semibold text-lg leading-6">
          <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", categoryBg(chosen.color))} />
          <span className="min-w-0 break-words">Lançamentos de {name}</span>
        </h2>
        <Button variant="ghost" className="min-h-11 shrink-0 text-primary" onClick={onClear}>
          Limpar filtro
        </Button>
      </div>
      {entries.isError && (
        <PageError message="Não foi possível carregar os lançamentos." onRetry={() => entries.refetch()} />
      )}
      {!entries.isError && !shown && <PageLoading />}
      {shown && (
        <>
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 px-2 text-muted-foreground text-sm">
            <span>
              {shown.length} {shown.length === 1 ? "lançamento" : "lançamentos"}
            </span>
            <span>
              Total: <Money amount={chosen.amount} className="font-semibold text-foreground" />
            </span>
          </p>
          <ul className="flex flex-col">
            {shown.map((entry) => (
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
        </>
      )}
      {category && (
        <Button className="h-auto min-h-11 w-full whitespace-normal text-base" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          Adicionar lançamento em {name}
        </Button>
      )}
      <TransactionSheet
        open={adding}
        onOpenChange={setAdding}
        initialKind={chosen.kind}
        initialCategory={category}
        initialDate={month === todayISO().slice(0, 7) ? undefined : `${month}-01`}
        billSheet={(props) => <EditBillSheet open {...props} />}
      />
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

/** `Para onde vai`: the month by top-level group; a slice, group or subcategory row lists its entries. */
export const CategoryBreakdown = ({ month }: { month: string }) => {
  const report = useCategoryReport(month);
  const [tab, setTab] = useState<Tab>("outflow");
  const [selected, setSelected] = useState<string>();
  const [open, setOpen] = useState<string[]>([]);

  if (report.isError)
    return (
      <div className="rounded-2xl bg-card shadow-sm">
        <PageError message="Não foi possível carregar o mês por categoria." onRetry={() => report.refetch()} />
      </div>
    );
  if (!report.data) return <BreakdownSkeleton />;

  const shares = report.data[tab];
  const groups = report.data.groups.filter((group) => (group.kind === "income") === (tab === "income"));
  const total = tab === "outflow" ? report.data.outflow_total : report.data.income_total;
  const { Illustration } = COPY[tab];
  const active = groups.find((group) => group.category_id === selected || group.children.some((id) => id === selected));
  const group = groups.find((each) => each.category_id === selected);
  const child = shares.find((share) => share.category_id === selected);
  const chosen: Chosen | undefined = group
    ? { ...group, ids: [group.category_id, ...group.children] }
    : child && { ...child, ids: [child.category_id] };
  const toggle = (id: string) => setSelected((current) => (current === id ? undefined : id));
  const fold = (id: string) =>
    setOpen((current) => (current.includes(id) ? current.filter((each) => each !== id) : [...current, id]));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
      <DashCard title="Por categoria">
        <div className="flex flex-col gap-6">
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
          {groups.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div
                aria-hidden
                className="pointer-events-none flex w-full select-none justify-center opacity-50 saturate-50"
              >
                <Illustration />
              </div>
              <p className="max-w-xs text-center text-muted-foreground">{COPY[tab].empty}</p>
            </div>
          ) : (
            <>
              <Donut
                groups={groups}
                total={total}
                label={COPY[tab].center}
                active={active?.category_id}
                onSelect={toggle}
              />
              <ul aria-label="Categorias" className="flex flex-col gap-1">
                {groups.map((each) => (
                  <GroupRow
                    key={each.category_id}
                    group={each}
                    shares={shares}
                    of={COPY[tab].of}
                    total={total}
                    open={open.includes(each.category_id)}
                    selected={selected}
                    onOpen={() => {
                      fold(each.category_id);
                      if (selected && each.children.includes(selected)) setSelected(undefined);
                    }}
                    onSelect={toggle}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      </DashCard>
      <div className="flex flex-col gap-6">
        {chosen && <CategoryEntries month={month} chosen={chosen} onClear={() => setSelected(undefined)} />}
        {shares.length > 0 && <TopFive shares={shares} groups={groups} className="lg:order-first" />}
      </div>
    </div>
  );
};
