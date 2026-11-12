"use client";

import { type ReactNode, useId, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronDown, Download, History, PieChart as PieIcon, Plus } from "lucide-react";
import { Pie, PieChart } from "recharts";

import { Button } from "@/components/ui/button";
import { ChartContainer } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categoriesQuery } from "@/entities/category/categories-query";
import { type CategoryShare, useCategoryReport } from "@/entities/report/report-query";
import { useTransactions } from "@/entities/transaction/transaction-queries";
import { TransactionSheet } from "@/features/add-transaction/transaction-sheet";
import { EditBillSheet } from "@/features/edit-bill/edit-bill-sheet";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { commaDecimal, csvCell, downloadCsv } from "@/shared/lib/csv";
import { addMonths, dayMonth, monthShort, todayISO } from "@/shared/lib/date";
import { formatDelta, formatPct } from "@/shared/lib/percent";
import { plain } from "@/shared/lib/text";
import { cents, fromCents } from "@/shared/lib/tier";
import { CategoryIcon, categoryBg, categoryFill } from "@/shared/ui/category-icon";
import { Money } from "@/shared/ui/money";
import { PageError, PageLoading } from "@/shared/ui/page-state";

type Group = Schemas["CategoryGroup"];

type Report = Schemas["CategoryReport"];

type Transaction = Schemas["Transaction"];

const ALL = "all";

const card = "flex min-w-0 flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6";

const caption = "font-semibold text-[11px] text-muted-foreground uppercase leading-4 tracking-[0.12em]";

const title = "font-semibold text-lg leading-6";

const pill = "rounded-full bg-secondary px-3 py-1 font-semibold text-secondary-foreground text-sm whitespace-nowrap";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** `2026-11` → `out`, the month the deltas compare against. */
const previousShort = (month: string) => monthShort(addMonths(month, -1)).toLowerCase();

const exportCsv = (report: Report) => {
  const groupName = new Map(report.groups.map((group) => [group.category_id, group.name]));
  const lines = report.outflow.map((share) => {
    const parent = share.parent_id ? groupName.get(share.parent_id) : undefined;
    return [
      csvCell(parent ?? share.name),
      csvCell(parent ? share.name : ""),
      commaDecimal(share.amount),
      commaDecimal(share.pct),
    ].join(";");
  });
  downloadCsv(`soldi-para-onde-vai-${report.month}.csv`, ["Grupo;Subcategoria;Valor;Percentual", ...lines]);
};

/** Spending that fell is good news; no change stays neutral. */
const DeltaBadge = ({ delta_pct, previous }: { delta_pct?: string | null; previous: string }) => {
  if (delta_pct === null || delta_pct === undefined) return null;
  const label = formatDelta(delta_pct);
  const flat = label === "0%";
  const fell = delta_pct.startsWith("-");
  return (
    <span
      className={cn(
        "rounded-md px-1.5 font-semibold text-xs tabular-nums leading-5 lg:bg-transparent lg:px-0",
        flat && "bg-muted text-muted-foreground",
        !flat && fell && "bg-income-soft text-tier-green-foreground",
        !flat && !fell && "bg-expense-soft text-tier-red-foreground",
      )}
    >
      {label}
      <span className="max-lg:hidden">{flat ? " estável" : ` vs ${previous}`}</span>
      <span className="sr-only"> em relação ao mês anterior</span>
    </span>
  );
};

type DonutProps = { groups: Group[]; active?: string; onSelect: (id: string) => void; children: ReactNode };

const Donut = ({ groups, active, onSelect, children }: DonutProps) => {
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
      <div className="@container pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
        {children}
      </div>
    </div>
  );
};

const rowButton =
  "w-full rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-secondary";

type CompositionProps = { groups: Group[]; total: string; active?: string; onSelect: (id: string) => void };

const Composition = ({ groups, total, active, onSelect }: CompositionProps) => {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={card}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className={cn(caption, "max-lg:hidden")}>Alocação real</p>
          <h2 id={titleId} className={title}>
            Composição de Gastos
          </h2>
        </div>
        <span className={cn(pill, "lg:hidden")}>{groups.length} Categorias</span>
      </header>
      <Donut groups={groups} active={active} onSelect={onSelect}>
        <span className={caption}>
          <span className="max-lg:hidden">Total gasto</span>
          <span className="lg:hidden">Total de saídas</span>
        </span>
        <Money amount={total} size="figure" className="text-[length:min(1.75rem,10cqi)]" />
        <span className="flex items-center gap-1 font-semibold text-income-text text-sm max-lg:hidden">
          <Check aria-hidden className="size-4" />
          {groups.length} categorias
        </span>
      </Donut>
      <ul aria-label="Legenda" className="grid grid-cols-2 gap-1 max-lg:hidden">
        {groups.slice(0, 4).map((group) => (
          <li key={group.category_id} className="min-w-0">
            <button
              type="button"
              aria-pressed={active === group.category_id}
              onClick={() => onSelect(group.category_id)}
              className={cn(rowButton, "flex min-h-11 items-center gap-2")}
            >
              <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", categoryBg(group.color))} />
              <span className="min-w-0 flex-1 truncate text-sm">{group.name}</span>
              <span className="font-semibold text-sm tabular-nums">{formatPct(group.pct)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

const TopFive = ({ groups }: { groups: Group[] }) => {
  const titleId = useId();
  const top = groups.slice(0, 5);
  const share = fromCents(top.reduce((sum, group) => sum + cents(group.pct), 0));
  return (
    <section aria-labelledby={titleId} className={card}>
      <header className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <div className="flex flex-col gap-1">
          <p className={cn(caption, "max-lg:hidden")}>Concentração</p>
          <h2 id={titleId} className={title}>
            Top <span className="max-lg:hidden">5 Maiores Gastos do Mês</span>
            <span className="lg:hidden">Categorias</span>
          </h2>
        </div>
        <p className="text-muted-foreground text-sm max-lg:hidden">Representa {formatPct(share)} das despesas</p>
        <p className="text-muted-foreground text-sm lg:hidden">Peso relativo</p>
      </header>
      <ol className="flex flex-col gap-4">
        {top.map((group, index) => (
          <li key={group.category_id} className={cn("flex flex-col gap-1.5", index === 4 && "max-lg:hidden")}>
            <span className="flex items-baseline gap-3 text-sm">
              <span className="font-semibold text-muted-foreground tabular-nums max-lg:hidden">#{index + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{group.name}</span>
              <span className="shrink-0 tabular-nums">
                <Money amount={group.amount} className="font-semibold max-lg:hidden" />{" "}
                <span className="text-muted-foreground">({formatPct(group.pct)})</span>
              </span>
            </span>
            <span aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
              <span
                className={cn("block h-full rounded-full", categoryBg(group.color))}
                style={{ width: `${group.pct}%` }}
              />
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
};

type GroupRowProps = {
  group: Group;
  shares: CategoryShare[];
  previous: string;
  open: boolean;
  picked: boolean;
  onOpen: () => void;
  onPick: () => void;
};

const GroupRow = ({ group, shares, previous, open, picked, onOpen, onPick }: GroupRowProps) => {
  const listId = useId();
  const children = shares.filter((share) => share.parent_id === group.category_id);
  const own = cents(group.amount) - children.reduce((sum, child) => sum + cents(child.amount), 0);
  const folds = group.children.length > 0;

  return (
    <li>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-pressed={picked}
          onClick={onPick}
          className={cn(
            rowButton,
            "relative flex min-h-16 min-w-0 flex-1 items-center gap-3",
            picked && "lg:before:absolute lg:before:inset-y-2 lg:before:left-0 lg:before:w-1 lg:before:bg-primary",
          )}
        >
          <CategoryIcon icon={group.icon} color={group.color} />
          <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium text-base">{group.name}</span>
              {picked && (
                <span className="rounded-full bg-primary px-2 font-semibold text-primary-foreground text-xs leading-5 max-lg:hidden">
                  Ativo
                </span>
              )}
            </span>
            <Money amount={group.amount} className="font-bold text-base" />
            <span className="col-span-2 flex flex-wrap items-center gap-x-2 text-muted-foreground text-sm tabular-nums">
              {picked ? (
                <>
                  <span className="text-primary max-lg:hidden">{formatPct(group.pct)} do total gasto</span>
                  <span className="lg:hidden">{formatPct(group.pct)} das despesas</span>
                </>
              ) : (
                <span>{formatPct(group.pct)} das despesas</span>
              )}
              {folds && (
                <span className="max-lg:hidden">{plural(group.children.length, "subcategoria", "subcategorias")}</span>
              )}
              <DeltaBadge delta_pct={group.delta_pct} previous={previous} />
            </span>
          </span>
          {picked && <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary lg:hidden" />}
        </button>
        {folds && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={`${open ? "Ocultar" : "Mostrar"} subcategorias de ${group.name}`}
            onClick={onOpen}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring max-lg:hidden"
          >
            <ChevronDown aria-hidden className={cn("size-5 transition-transform", open && "rotate-180")} />
          </button>
        )}
      </div>
      {folds && (
        <ul
          id={listId}
          hidden={!open}
          className="mt-1 ml-14 flex flex-col rounded-xl bg-muted/60 px-3 py-1 max-lg:hidden"
        >
          {children.map((child) => (
            <li
              key={child.category_id}
              className={cn("flex min-h-11 items-center gap-2", cents(child.amount) === 0 && "text-muted-foreground")}
            >
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", categoryBg(child.color))} />
              <span className="min-w-0 flex-1 truncate text-base">{child.name}</span>
              <Money amount={child.amount} className="font-semibold text-base" />
            </li>
          ))}
          {own > 0 && (
            <li className="flex min-h-11 items-center gap-2 text-muted-foreground">
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

type EntryRowProps = {
  entry: Transaction;
  heading: string;
  note: string;
  status: string;
  reference: boolean;
  className?: string;
};

const EntryRow = ({ entry, heading, note, status, reference, className }: EntryRowProps) => (
  <li className={cn("flex min-h-16 items-center gap-3 px-2 py-2", reference && "text-muted-foreground", className)}>
    {reference ? (
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
        <History className="size-5" />
      </span>
    ) : (
      <CategoryIcon icon={entry.category.icon} color={entry.category.color} />
    )}
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate font-medium text-base">{heading}</span>
      <span className="text-muted-foreground text-xs">{note}</span>
    </span>
    <span className="flex shrink-0 flex-col items-end">
      <Money amount={entry.amount} outflow className={cn("font-bold text-base", !reference && "text-expense")} />
      <span className="text-muted-foreground text-xs">{status}</span>
    </span>
  </li>
);

type EntriesProps = { month: string; group: Group; shares: CategoryShare[] };

/** The picked group's month, narrowed by subcategory, then up to 3 of last month's entries for comparison. */
const CategoryEntries = ({ month, group, shares }: EntriesProps) => {
  const categories = useQuery(categoriesQuery);
  const entries = useTransactions(month);
  const lastMonth = useTransactions(addMonths(month, -1));
  const [sub, setSub] = useState(ALL);
  const [all, setAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const children = shares.filter((share) => share.parent_id === group.category_id);
  const narrowed = children.find((child) => child.category_id === sub);
  const inScope = ({ category }: Transaction) =>
    narrowed
      ? category.id === narrowed.category_id
      : category.id === group.category_id || category.parent_id === group.category_id;
  const shown = entries.data?.filter(inScope);
  const references = lastMonth.data?.filter(inScope).slice(0, 3) ?? [];
  const category = categories.data?.find((each) => each.id === group.category_id);
  const today = todayISO();
  const heading = (entry: Transaction) => {
    const name = entry.note || group.name;
    return entry.category.id === group.category_id ? name : `${name} (${entry.category.name})`;
  };
  const rows = [
    ...(shown ?? []).map((entry) => ({
      entry,
      note: `${dayMonth(entry.date)}${entry.series ? ` · Parcela ${entry.series.position}/${entry.series.total}` : ""}`,
      status: entry.date <= today ? "Saída liquidada" : "Agendada",
      reference: false,
    })),
    ...references.map((entry) => ({
      entry,
      note: `${dayMonth(entry.date)} · Mês anterior (para comparativo)`,
      status: `Referência ${previousShort(month)}`,
      reference: true,
    })),
  ];

  return (
    <section aria-label={`Lançamentos: ${group.name}`} className={cn(card, "gap-3")}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full lg:hidden", categoryBg(group.color))} />
        <CategoryIcon icon={group.icon} color={group.color} className="max-lg:hidden" />
        <h2 className={cn(title, "min-w-0 flex-1 break-words")}>
          <span className="max-lg:hidden">Lançamentos</span>
          <span className="lg:hidden">Transações</span>: {group.name}
        </h2>
        {shown && (
          <span className={pill}>
            <span className="max-lg:hidden">{plural(shown.length, "item", "itens")}</span>
            <span className="lg:hidden">{plural(shown.length, "lançamento", "lançamentos")}</span>
          </span>
        )}
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Total no recorte selecionado:{" "}
          <Money amount={narrowed?.amount ?? group.amount} className="font-semibold text-foreground" />
        </p>
        {children.length > 0 && (
          <Select value={sub} onValueChange={setSub}>
            <SelectTrigger aria-label="Subcategoria" className="min-h-11 w-full text-base sm:w-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as subcategorias</SelectItem>
              {children.map((child) => (
                <SelectItem key={child.category_id} value={child.category_id}>
                  {child.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {entries.isError && (
        <PageError message="Não foi possível carregar os lançamentos." onRetry={() => entries.refetch()} />
      )}
      {!entries.isError && !shown && <PageLoading />}
      {shown && (
        <ul className="flex flex-col">
          {rows.map((row, index) => (
            <EntryRow
              key={row.entry.id}
              heading={heading(row.entry)}
              className={cn(!all && index >= 3 && "max-lg:hidden")}
              {...row}
            />
          ))}
        </ul>
      )}
      {shown && !all && rows.length > 3 && (
        <Button
          variant="ghost"
          className="h-auto min-h-11 w-full whitespace-normal text-base text-primary lg:hidden"
          onClick={() => setAll(true)}
        >
          Ver todas as transações de {group.name}
          <ArrowRight aria-hidden />
        </Button>
      )}
      {category && (
        <Button className="h-auto min-h-11 w-full whitespace-normal text-base" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          Adicionar lançamento em {group.name}
        </Button>
      )}
      <TransactionSheet
        open={adding}
        onOpenChange={setAdding}
        initialKind={group.kind}
        initialCategory={category}
        initialDate={month === today.slice(0, 7) ? undefined : `${month}-01`}
        billSheet={(props) => <EditBillSheet open {...props} />}
      />
    </section>
  );
};

type HeaderRowProps = { report: Report; groups: Group[]; picked?: string; onPick: (id?: string) => void };

/** Desktop only: the page's pill, the month's outflow, the group select and the export. */
const HeaderRow = ({ report, groups, picked, onPick }: HeaderRowProps) => (
  <div className="flex flex-wrap items-center gap-3 max-lg:hidden">
    <h1 className="flex min-h-11 items-center gap-2 rounded-full bg-card px-4 font-semibold text-base shadow-sm">
      <PieIcon aria-hidden className="size-4 text-primary" />
      Para Onde Vai
    </h1>
    <span aria-hidden className="h-6 w-px bg-border" />
    <p className="text-muted-foreground text-sm">Visão analítica de despesas e alocação de capital</p>
    <span className="ml-auto flex min-h-11 items-center gap-2 rounded-full bg-expense-soft px-4 font-semibold text-sm text-tier-red-foreground">
      <span aria-hidden className="size-2 rounded-full bg-expense" />
      Total Saídas: <Money amount={report.outflow_total} />
    </span>
    <Select value={picked ?? ALL} onValueChange={(value) => onPick(value === ALL ? undefined : value)}>
      <SelectTrigger aria-label="Categoria" className="min-h-11 bg-card text-base">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Todas as Categorias</SelectItem>
        {groups.map((group) => (
          <SelectItem key={group.category_id} value={group.category_id}>
            {group.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    <Button
      variant="outline"
      size="icon"
      aria-label="Exportar CSV"
      className="size-11"
      onClick={() => exportCsv(report)}
    >
      <Download aria-hidden />
    </Button>
  </div>
);

/** `Para onde vai`: the month's outflow by group; a slice, legend item, row or the select picks a group's entries. */
export const CategoryBreakdown = ({ month, group: asked }: { month: string; group?: string }) => {
  const report = useCategoryReport(month);
  const categories = useQuery(categoriesQuery);
  const [chosen, setChosen] = useState<string | null>();
  const [open, setOpen] = useState<string[]>([]);
  const detailId = useId();

  if (report.isError)
    return (
      <div className="rounded-2xl bg-card shadow-sm">
        <PageError message="Não foi possível carregar o mês por categoria." onRetry={() => report.refetch()} />
      </div>
    );
  if (!report.data) return null;

  const shares = report.data.outflow;
  const groups = report.data.groups.filter((group) => group.kind !== "income");
  const savingsId = categories.data?.find((each) => each.is_savings && !each.parent_id)?.id;
  const wanted = asked && plain(asked);
  const named =
    groups.find((each) => wanted === "economia" && each.category_id === savingsId) ??
    groups.find((each) => plain(each.name) === wanted);
  const picked = chosen === undefined ? named?.category_id : (chosen ?? undefined);
  const setPicked = (id?: string) => setChosen(id ?? null);
  const group = groups.find((each) => each.category_id === picked);
  const folding = groups.filter((each) => each.children.length > 0).map((each) => each.category_id);
  const previous = previousShort(month);
  const toggle = (id: string) => setPicked(picked === id ? undefined : id);
  const fold = (id: string) =>
    setOpen((current) => (current.includes(id) ? current.filter((each) => each !== id) : [...current, id]));

  return (
    <div className="flex flex-col gap-6">
      <HeaderRow report={report.data} groups={groups} picked={picked} onPick={setPicked} />
      {groups.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Nenhum gasto neste mês ainda.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
          <div className="flex min-w-0 flex-col gap-6">
            <Composition groups={groups} total={report.data.outflow_total} active={picked} onSelect={toggle} />
            <section aria-labelledby={detailId} className={card}>
              <header className="flex items-end justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <p className={cn(caption, "max-lg:hidden")}>Hierarquia</p>
                  <h2 id={detailId} className={title}>
                    Detalhamento<span className="max-lg:hidden"> por Grupo</span>
                  </h2>
                </div>
                <p className="text-muted-foreground text-sm lg:hidden">Toque para filtrar</p>
                {folding.length > 0 && (
                  <Button
                    variant="ghost"
                    className="min-h-11 text-base text-primary max-lg:hidden"
                    onClick={() => setOpen(open.length > 0 ? [] : folding)}
                  >
                    {open.length > 0 ? "Recolher tudo" : "Expandir tudo"}
                  </Button>
                )}
              </header>
              <ul aria-label="Categorias" className="flex flex-col gap-1">
                {groups.map((each) => (
                  <GroupRow
                    key={each.category_id}
                    group={each}
                    shares={shares}
                    previous={previous}
                    open={open.includes(each.category_id)}
                    picked={picked === each.category_id}
                    onOpen={() => fold(each.category_id)}
                    onPick={() => toggle(each.category_id)}
                  />
                ))}
              </ul>
            </section>
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <TopFive groups={groups} />
            {group && <CategoryEntries key={group.category_id} month={month} group={group} shares={shares} />}
          </div>
        </div>
      )}
    </div>
  );
};
