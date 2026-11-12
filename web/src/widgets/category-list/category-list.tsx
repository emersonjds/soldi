"use client";

import { type ReactNode, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import {
  type LucideIcon,
  MoreVertical,
  Pencil,
  PieChart,
  PiggyBank,
  Plus,
  PlusCircle,
  Receipt,
  Search,
  Shapes,
  ShoppingBag,
  Tags,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { categoriesQuery, ofKind, useArchiveCategory } from "@/entities/category/categories-query";
import { CategoryPanel, CategorySheet } from "@/entities/category/category-sheet";
import { useCategoryReport } from "@/entities/report/report-query";
import { useTransactions } from "@/entities/transaction/transaction-queries";
import { useIsXl } from "@/hooks/use-xl";
import { cn } from "@/lib/utils";
import { hasProblem, type Schemas } from "@/shared/api/client";
import { monthShort } from "@/shared/lib/date";
import { formatPct } from "@/shared/lib/percent";
import { plain } from "@/shared/lib/text";
import { cents, fromCents } from "@/shared/lib/tier";
import { CategoryIcon, categoryBg } from "@/shared/ui/category-icon";
import { Money } from "@/shared/ui/money";
import { PageError, PageLoading } from "@/shared/ui/page-state";

type Kind = Schemas["CategoryKind"];
type Category = Schemas["Category"];

const TABS: [kind: Kind, label: string, icon: LucideIcon][] = [
  ["daily", "Gastos Diários", ShoppingBag],
  ["bill", "Contas Fixas", Receipt],
  ["income", "Entradas & Receitas", Wallet],
];

const KIND_NAMES: Record<Kind, string> = { daily: "Diário", bill: "Fixa", income: "Entrada" };

/** `?k=`'s kind; Diário when absent or unknown. */
export const kindParam = (value: string | null): Kind => TABS.find(([kind]) => kind === value)?.[0] ?? "daily";

const topsOf = (list: Category[]) =>
  list.filter((category) => !list.some((parent) => parent.id === category.parent_id));

const subcategories = (count: number) => `${count} ${count === 1 ? "subcategoria" : "subcategorias"}`;

const tab =
  "h-auto min-h-11 flex-1 gap-2 whitespace-normal rounded-xl px-2 py-2 text-sm data-[state=on]:bg-secondary data-[state=on]:text-primary sm:text-base";

const row =
  "flex w-full min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring";

type Editing = { category?: Category; parentId?: string };

const item = "min-h-11 text-base";

const deletedTitle = (parent?: Category) => {
  if (!parent) return "Categoria excluída";
  return parent.is_savings ? "Cofrinho excluído" : "Subcategoria excluída";
};

type ActionsProps = { category: Category; onEdit: (kebab: HTMLButtonElement | null) => void; onDelete: () => void };

/** The card's kebab: Editar and Excluir, which Economia never offers. Editar leaves the focus to the form. */
const RowActions = ({ category, onEdit, onDelete }: ActionsProps) => {
  const kebab = useRef<HTMLButtonElement>(null);
  const editing = useRef(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={kebab}
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Mais ações de ${category.name}`}
          className="size-11 shrink-0 rounded-full text-muted-foreground"
        >
          <MoreVertical className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto max-w-72"
        onCloseAutoFocus={(event) => {
          if (editing.current) event.preventDefault();
          editing.current = false;
        }}
      >
        <DropdownMenuItem
          className={item}
          onSelect={() => {
            editing.current = true;
            onEdit(kebab.current);
          }}
        >
          <Pencil />
          Editar
        </DropdownMenuItem>
        {!category.is_savings && (
          <DropdownMenuItem variant="destructive" className={item} onSelect={onDelete}>
            <Trash2 />
            Excluir
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const Tile = ({ label, icon: Icon, children }: { label: string; icon: LucideIcon; children: ReactNode }) => (
  <section aria-label={label} className="flex min-w-0 flex-col gap-3 rounded-2xl bg-card p-5 shadow-sm">
    <div className="flex items-center justify-between gap-2">
      <span className="font-semibold text-muted-foreground text-xs tracking-wider">{label}</span>
      <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-primary">
        <Icon aria-hidden className="size-4" />
      </span>
    </div>
    {children}
  </section>
);

/** Estrutura Ativa across kinds and, when the month has outflow, its largest group. */
const Tiles = ({ all, month }: { all: Category[]; month: string }) => {
  const report = useCategoryReport(month);
  const tops = topsOf(all);
  const top = report.data?.groups.find((group) => group.kind !== "income" && cents(group.amount) > 0);
  const children = top?.children.flatMap((id) => all.find((each) => each.id === id)?.name ?? []).join(" & ");
  const linked = all.length - tops.length;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Tile label="ESTRUTURA ATIVA" icon={Shapes}>
        <p className="flex items-baseline gap-2">
          <span className="font-bold text-2xl">{tops.length}</span>
          <span>{tops.length === 1 ? "categoria principal" : "categorias principais"}</span>
        </p>
        <span className="self-start rounded-full bg-secondary px-2.5 py-1 font-medium text-primary text-xs">
          {`${subcategories(linked)} ${linked === 1 ? "vinculada" : "vinculadas"}`}
        </span>
      </Tile>
      {top && (
        <Tile label="MAIOR CONCENTRAÇÃO" icon={PieChart}>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="max-w-full truncate font-bold text-2xl">{top.name}</span>
            {children && <span className="text-muted-foreground">({children})</span>}
          </p>
          <div className="flex items-center gap-3">
            <div aria-hidden className="h-2 flex-1 rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${top.pct}%` }} />
            </div>
            <span className="text-muted-foreground text-xs">{`${formatPct(top.pct)} dos gastos de ${monthShort(month)}`}</span>
          </div>
        </Tile>
      )}
    </div>
  );
};

type ListProps = { kind: Kind; month: string; onKindChange: (kind: Kind) => void };

/** Configurações › Categorias: tiles, a tab per kind and a card per parent with the month's totals; the form at the side from 1280 px. */
export const CategoryList = ({ kind, month, onKindChange }: ListProps) => {
  const categories = useQuery(categoriesQuery);
  const report = useCategoryReport(month);
  const entries = useTransactions(month);
  const archive = useArchiveCategory();
  const wide = useIsXl();
  const [editing, setEditing] = useState<Editing>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const trigger = useRef<HTMLElement | null>(null);
  const [archiving, setArchiving] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const label = TABS.find(([each]) => each === kind)?.[1];
  const all = (categories.data ?? []).filter((category) => !archiving.includes(category.id));

  const restore = (ids: string[]) => setArchiving((current) => current.filter((id) => !ids.includes(id)));
  /** Below 1280 px the sheet opens; from there the panel starts over on `next` with the focus on the name. */
  const edit = (next: Editing, from: Element | null = document.activeElement) => {
    trigger.current = from instanceof HTMLElement ? from : null;
    setEditing(next);
    if (!wide) return setSheetOpen(true);
    setVersion((current) => current + 1);
    setTimeout(() => document.getElementById("category-name")?.focus());
  };
  /** The panel back to Nova Categoria, the focus back where the edit began. */
  const done = () => {
    setEditing({});
    setVersion((current) => current + 1);
    trigger.current?.focus();
  };

  // ponytail: no unarchive endpoint, so the DELETE waits for the toast; closing the tab inside those 5 s keeps it.
  const archiveLater = (category: Category) => {
    const list = categories.data ?? [];
    const children = list.filter((each) => each.parent_id === category.id);
    const parent = list.find((each) => each.id === category.parent_id);
    const ids = [category.id, ...children.map((child) => child.id)];
    setArchiving((current) => [...current, ...ids]);
    let undone = false;
    const commit = () => {
      if (undone) return;
      archive.mutate(category.id, {
        onError: (error) => {
          restore(ids);
          toast.error(
            hasProblem(error, "cofrinho-not-empty")
              ? "Resgate tudo antes de excluir."
              : "Não foi possível excluir a categoria.",
          );
        },
      });
    };
    toast(deletedTitle(parent), {
      description:
        children.length > 0
          ? `${subcategories(children.length)} também; lançamentos continuam com a categoria.`
          : "Lançamentos continuam com a categoria.",
      duration: 5000,
      action: {
        label: "Desfazer",
        onClick: () => {
          undone = true;
          restore(ids);
        },
      },
      onAutoClose: commit,
      onDismiss: commit,
    });
  };

  const shares = report.data ? [...report.data.outflow, ...report.data.income] : [];
  const amountOf = (id: string) => shares.find((share) => share.category_id === id)?.amount ?? "0";
  /** A group of another kind (D26) totals only the children this tab shows. */
  const totalOf = (parent: Category, children: Category[]) => {
    if (!report.data) return undefined;
    if (parent.kind !== kind) return fromCents(children.reduce((sum, child) => sum + cents(amountOf(child.id)), 0));
    return report.data.groups.find((group) => group.category_id === parent.id)?.amount ?? "0";
  };
  const totalsFailed = report.isError || entries.isError;
  const countOf = (id: string) => entries.data?.filter((entry) => entry.category.id === id).length ?? 0;

  const body = () => {
    if (categories.isError)
      return <PageError message="Não foi possível carregar as categorias." onRetry={() => categories.refetch()} />;
    if (!categories.data) return <PageLoading />;

    const visible = ofKind(all, kind);
    const tops = topsOf(visible);
    if (tops.length === 0)
      return (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-card px-4 py-10 text-center shadow-sm">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
            <Tags className="size-6" aria-hidden />
          </span>
          <p className="text-muted-foreground">Nenhuma categoria aqui ainda</p>
        </div>
      );

    const query = plain(search.trim());
    const matches = (category: Category) => plain(category.name).includes(query);
    const groups = tops.flatMap((parent) => {
      const children = visible.filter((child) => child.parent_id === parent.id);
      const group = { parent, children, count: children.length, total: totalOf(parent, children) };
      if (matches(parent)) return [group];
      const hits = children.filter(matches);
      return hits.length > 0 ? [{ ...group, children: hits }] : [];
    });
    if (groups.length === 0)
      return (
        <p className="rounded-2xl bg-card px-4 py-10 text-center text-muted-foreground shadow-sm">
          Nenhuma categoria encontrada.
        </p>
      );

    return (
      <ul aria-label={`Categorias de ${label}`} className="grid gap-4 lg:grid-cols-2">
        {groups.map(({ parent, children, count, total }) => {
          return (
            <li
              key={parent.id}
              aria-label={parent.name}
              className="flex min-w-0 flex-col gap-3 rounded-2xl bg-card p-4 shadow-sm"
            >
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Editar ${parent.name}`}
                  onClick={() => edit({ category: parent })}
                  className={`${row} min-h-14 py-1`}
                >
                  <CategoryIcon icon={parent.icon} color={parent.color} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold text-base">{parent.name}</span>
                    <span className="text-muted-foreground text-xs">{`${KIND_NAMES[parent.kind]} · ${subcategories(count)}`}</span>
                  </span>
                  {parent.is_savings && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-medium text-primary text-xs">
                      <PiggyBank className="size-3.5" aria-hidden />
                      <span className="hidden sm:inline">Cofrinhos</span>
                    </span>
                  )}
                </button>
                <RowActions
                  category={parent}
                  onEdit={(kebab) => edit({ category: parent }, kebab)}
                  onDelete={() => archiveLater(parent)}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3">
                <span className="text-muted-foreground text-sm">Total no mês</span>
                {total && <Money amount={total} className="font-bold text-base" />}
              </div>
              {children.length > 0 && (
                <ul aria-label={`Subcategorias de ${parent.name}`} className="flex flex-col gap-1">
                  {children.map((child) => {
                    const amount = amountOf(child.id);
                    const entryCount = countOf(child.id);
                    const zero = cents(amount) === 0;
                    return (
                      <li key={child.id}>
                        <button
                          type="button"
                          aria-label={`Editar ${child.name}`}
                          onClick={() => edit({ category: child })}
                          className={`${row} min-h-11 bg-muted/50 py-2`}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              categoryBg(parent.color),
                              zero && "opacity-40",
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm">{child.name}</span>
                          {entryCount > 0 && (
                            <span className="shrink-0 text-muted-foreground text-xs">{`${entryCount} lanç.`}</span>
                          )}
                          {report.data && (
                            <Money
                              amount={amount}
                              className={cn("font-semibold text-sm", zero && "font-normal text-muted-foreground")}
                            />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <button
                type="button"
                onClick={() => edit({ parentId: parent.id })}
                className="mt-auto flex min-h-11 items-center justify-center gap-1 rounded-xl bg-muted/50 font-semibold text-primary text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Plus aria-hidden className="size-4" />
                {parent.is_savings ? "Adicionar cofrinho" : "Adicionar subcategoria"}
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-bold text-[22px] leading-7 lg:text-[28px] lg:leading-9">Categorias & Subcategorias</h1>
          <p className="text-muted-foreground">
            Organize seus lançamentos por tipo de fluxo financeiro com paleta de cores e ícones do design system Soldi.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:shrink-0">
          <div className="relative sm:flex-1">
            <Search aria-hidden className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Buscar categoria"
              placeholder="Buscar categoria..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 rounded-xl bg-card pl-9 text-base md:text-base"
            />
          </div>
          {categories.data && (
            <Button type="button" onClick={() => edit({})} className="min-h-11 rounded-xl px-4 text-base">
              <PlusCircle className="size-5" />
              Nova Categoria
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          {categories.data && <Tiles all={all} month={month} />}
          {categories.data && totalsFailed && (
            <PageError
              message="Não foi possível carregar os totais do mês."
              onRetry={() => {
                void report.refetch();
                void entries.refetch();
              }}
            />
          )}
          <ToggleGroup
            type="single"
            spacing={0}
            value={kind}
            onValueChange={(value) => {
              if (value) onKindChange(kindParam(value));
            }}
            className="grid w-full grid-cols-3 gap-1 rounded-2xl bg-card p-1 shadow-sm"
          >
            {TABS.map(([each, text, Icon]) => (
              <ToggleGroupItem key={each} value={each} className={tab}>
                <Icon aria-hidden className="hidden size-4 shrink-0 sm:block" />
                {`${text} (${topsOf(ofKind(all, each)).length})`}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {body()}
        </div>
        {wide && categories.data && (
          <CategoryPanel
            // A new category follows the tab; an edited one keeps its form when its kind moves it to another (D27).
            key={editing.category ? version : `${version}-${kind}`}
            kind={kind}
            category={editing.category}
            parentId={editing.parentId}
            onKindChange={onKindChange}
            onSaved={done}
            onArchive={(category) => {
              done();
              archiveLater(category);
            }}
          />
        )}
      </div>
      {!wide && (
        <CategorySheet
          kind={kind}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          category={editing.category}
          parentId={editing.parentId}
          onArchive={archiveLater}
          onKindChange={onKindChange}
          onCloseAutoFocus={() => setEditing({})}
        />
      )}
    </div>
  );
};
