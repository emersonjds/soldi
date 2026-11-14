"use client";

import { useId, useState } from "react";

import { Check } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Schemas } from "@/shared/api/client";
import { plain } from "@/shared/lib/text";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { PageError } from "@/shared/ui/page-state";

import { categoryLabel, useCategories } from "./categories-query";
import { pinnedFirst, usePins } from "./category-pins";
import { PinSheet } from "./pin-sheet";

type Kind = Schemas["CategoryKind"];
type Category = Schemas["Category"];
type Entry = Schemas["Transaction"];

const CIRCLES = 8;

/** The category that comes first and preselected; the API sorts by name. */
const FIRST: Record<Kind, string> = { income: "Salário", bill: "Casa", daily: "Gasto" };

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
  usePins();
  return { ...categories, data: categories.data && grouped(pickable(categories.data), FIRST[kind]) };
};

/** A child stands for its parent; a child of an unknown parent stands alone. */
const topOf = (category: Category, list: Category[]) => list.find((each) => each.id === category.parent_id) ?? category;

/** The parents used in `entries` first (a child's use counts for its parent), by count, a tie by the latest date; then `tops` in its order. */
const ranked = (tops: Category[], entries: Entry[], list: Category[]) => {
  const usage = new Map<string, { count: number; latest: string }>();
  for (const { category, date } of entries) {
    const id = topOf(category, list).id;
    const seen = usage.get(id);
    usage.set(id, { count: (seen?.count ?? 0) + 1, latest: seen && seen.latest > date ? seen.latest : date });
  }
  const score = (category: Category) => usage.get(category.id) ?? { count: 0, latest: "" };
  return [...tops].sort((a, b) => score(b).count - score(a).count || score(b).latest.localeCompare(score(a).latest));
};

const name = "line-clamp-2 hyphens-auto text-center text-xs leading-4 wrap-break-word";

/**
 * `Mais usadas`: one kind's parents as a scrolling row of up to eight circles, the most used this month first.
 * A choice outside the eight takes the last slot; `search` narrows the row.
 */
export const CategoryChips = ({
  kind,
  chosen,
  onChoose,
  entries,
  search = "",
}: {
  kind: Kind;
  chosen: Category | undefined;
  onChoose: (category: Category) => void;
  /** The current month's entries, which rank the row; `undefined` while loading, `[]` keeps the preset order. */
  entries: Entry[] | undefined;
  search?: string;
}) => {
  const categories = useCategoryChips(kind);
  const pins = usePins();
  const [customizing, setCustomizing] = useState(false);
  const labelId = useId();

  if (categories.isError)
    return <PageError message="Não foi possível carregar as categorias." onRetry={() => categories.refetch()} />;
  // A first failed attempt, or no network, falls back to the shipped ranking while the pins wait.
  const pinsWait = !(pins.isFetched || pins.failureCount > 0 || pins.fetchStatus === "paused");
  if (!categories.data || !entries || pinsWait)
    return (
      <div className="flex gap-2">
        {["a", "b", "c", "d", "e", "f", "g", "h"].map((slot) => (
          <Skeleton key={slot} className="size-12 rounded-full" />
        ))}
      </div>
    );

  const list = categories.data;
  const parent = chosen && topOf(chosen, list);
  const tops = list.filter((category) => topOf(category, list) === category);
  const top = pinnedFirst(ranked(tops, entries, list), pins.data ?? []).slice(0, CIRCLES);
  const full = !parent || top.some((each) => each.id === parent.id) ? top : [...top.slice(0, CIRCLES - 1), parent];
  const query = plain(search.trim());
  const row = full.filter((each) => plain(each.name).includes(query));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className="flex items-center gap-2 font-semibold text-sm">
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          Mais usadas
        </span>
        <button
          type="button"
          onClick={() => setCustomizing(true)}
          className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-muted-foreground text-sm outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Personalizar
        </button>
      </div>
      <ToggleGroup
        type="single"
        value={parent?.id ?? ""}
        onValueChange={(id: string) => {
          const top = row.find((each) => each.id === id) ?? parent;
          if (!top) return;
          // A parent of another kind is never chosen: its first child of the kind is.
          const next = list.find((each) => each.kind === kind && (each.id === top.id || each.parent_id === top.id));
          onChoose(next ?? top);
        }}
        aria-labelledby={labelId}
        className="flex w-full snap-x snap-mandatory items-start gap-2 overflow-x-auto p-1"
      >
        {row.map((category) => (
          <ToggleGroupItem
            key={category.id}
            value={category.id}
            aria-label={categoryLabel(category, list)}
            className="group/chip h-auto min-h-11 w-16 shrink-0 snap-start flex-col justify-start gap-1 whitespace-normal rounded-xl px-0 py-1 font-medium text-foreground data-[state=on]:bg-transparent data-[state=on]:font-semibold data-[state=on]:text-primary"
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
      <PinSheet kind={kind} tops={tops} open={customizing} onOpenChange={setCustomizing} />
    </div>
  );
};
