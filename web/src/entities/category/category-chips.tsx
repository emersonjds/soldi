"use client";

import { type RefObject, useId, useRef, useState } from "react";

import { Check, Plus } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Schemas } from "@/shared/api/client";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { PageError } from "@/shared/ui/page-state";

import { categoryLabel, useCategories } from "./categories-query";
import { CategorySelect } from "./category-select";
import { CategorySheet } from "./category-sheet";

type Kind = Schemas["CategoryKind"];
type Category = Schemas["Category"];
type Entry = Schemas["Transaction"];

const ROW = 5;

/** The category that comes first and preselected; the API sorts by name. */
const FIRST: Record<Kind, string> = { income: "Salário", bill: "Aluguel", daily: "Mercado" };

/** Top-level categories, `FIRST` leading, each followed by its children; a child of an unknown parent stands alone. */
const grouped = (list: Category[], first: string) => {
  const isTop = (category: Category) => !list.some((parent) => parent.id === category.parent_id);
  const tops = list.filter(isTop);
  const ordered = [...tops.filter((top) => top.name === first), ...tops.filter((top) => top.name !== first)];
  return ordered.flatMap((top) => [top, ...list.filter((child) => child.parent_id === top.id)]);
};

/** `Resgate` is written by the Cofrinhos screen only, never picked by hand. */
const pickable = (list: Category[]) => list.filter((category) => !(category.kind === "income" && category.is_savings));

export const useCategoryChips = (kind: Kind) => {
  const categories = useCategories(kind);
  return { ...categories, data: categories.data && grouped(pickable(categories.data), FIRST[kind]) };
};

/** The ones used in `entries` first, by count, a tie by the latest date; then `list` in its order. */
const ranked = (list: Category[], entries: Entry[]) => {
  const usage = new Map<string, { count: number; latest: string }>();
  for (const { category, date } of entries) {
    const seen = usage.get(category.id);
    usage.set(category.id, { count: (seen?.count ?? 0) + 1, latest: seen && seen.latest > date ? seen.latest : date });
  }
  const score = (category: Category) => usage.get(category.id) ?? { count: 0, latest: "" };
  return [...list].sort((a, b) => score(b).count - score(a).count || score(b).latest.localeCompare(score(a).latest));
};

/** Six even columns: the five chips and `+`. */
const cell = "w-[calc((100cqw-1.25rem)/6)] shrink-0";

const name = "line-clamp-2 hyphens-auto text-center text-xs leading-4 wrap-break-word";

/**
 * One kind's categories as a row of up to five chips, the most used this month first; `Ver todas` searches every
 * one and `+` creates one. A choice outside the five takes the last slot.
 */
export const CategoryChips = ({
  kind,
  chosen,
  onChoose,
  entries,
  error,
}: {
  kind: Kind;
  chosen: Category | undefined;
  onChoose: (category: Category) => void;
  /** The current month's entries, which rank the row; `undefined` while loading, `[]` keeps the preset order. */
  entries: Entry[] | undefined;
  /** Shown under the row and tied to it. */
  error?: string;
}) => {
  const categories = useCategoryChips(kind);
  const [creating, setCreating] = useState(false);
  const labelId = useId();
  const errorId = useId();
  const chipRow = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const nova = useRef<HTMLButtonElement>(null);
  const picked = useRef(false);

  const pick = (category: Category) => {
    picked.current = true;
    onChoose(category);
  };
  const refocus = (opener: RefObject<HTMLButtonElement | null>) => (event: Event) => {
    event.preventDefault();
    const chip = picked.current && chipRow.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    picked.current = false;
    (chip || opener.current)?.focus();
  };

  if (categories.isError)
    return <PageError message="Não foi possível carregar as categorias." onRetry={() => categories.refetch()} />;
  if (!categories.data || !entries)
    return (
      <div className="flex gap-2">
        {["a", "b", "c", "d", "e"].map((slot) => (
          <Skeleton key={slot} className="size-12 rounded-full" />
        ))}
      </div>
    );

  const list = categories.data;
  const top = ranked(list, entries).slice(0, ROW);
  const row = !chosen || top.some((each) => each.id === chosen.id) ? top : [...top.slice(0, ROW - 1), chosen];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className="font-semibold text-sm">
          Categoria
        </span>
        <CategorySelect ref={more} categories={list} chosen={chosen} onChoose={pick} onCloseAutoFocus={refocus(more)} />
      </div>
      <div ref={chipRow} className="@container flex gap-1">
        <ToggleGroup
          type="single"
          value={chosen?.id ?? ""}
          onValueChange={(id: string) => {
            const picked = row.find((each) => each.id === id);
            if (picked) onChoose(picked);
          }}
          aria-labelledby={labelId}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          className="flex w-auto items-start gap-1"
        >
          {row.map((category) => (
            <ToggleGroupItem
              key={category.id}
              value={category.id}
              aria-label={categoryLabel(category, list)}
              className={`${cell} group/chip h-auto min-h-11 flex-col justify-start gap-1 whitespace-normal rounded-xl px-0 py-1 font-medium text-foreground data-[state=on]:bg-transparent data-[state=on]:font-semibold data-[state=on]:text-primary`}
            >
              <span className="relative">
                <CategoryIcon
                  icon={category.icon}
                  color={category.color}
                  className="size-12 ring-primary ring-offset-2 ring-offset-background group-data-[state=on]/chip:ring-2 [&_svg]:size-6"
                />
                <span
                  aria-hidden
                  className="absolute -top-1 -right-1 hidden size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background group-data-[state=on]/chip:flex"
                >
                  <Check className="size-3!" />
                </span>
              </span>
              <span className={name}>{category.name}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <button
          ref={nova}
          type="button"
          aria-label="Nova categoria"
          onClick={() => setCreating(true)}
          className={`${cell} flex min-h-11 flex-col items-center gap-1 rounded-xl py-1 font-medium text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50`}
        >
          <span className="flex size-12 items-center justify-center rounded-full border-2 border-muted-foreground/40 border-dashed">
            <Plus className="size-5" aria-hidden />
          </span>
          <span className={name}>Nova</span>
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <CategorySheet
        kind={kind}
        open={creating}
        onOpenChange={setCreating}
        onSaved={pick}
        onCloseAutoFocus={refocus(nova)}
      />
    </div>
  );
};
