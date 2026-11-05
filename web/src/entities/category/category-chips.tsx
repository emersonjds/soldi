"use client";

import { useState } from "react";

import { Check, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsSm } from "@/hooks/use-sm";
import type { Schemas } from "@/shared/api/client";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { PageError } from "@/shared/ui/page-state";

import { categoryLabel, useCategories } from "./categories-query";
import { CategorySelect } from "./category-select";
import { CategorySheet } from "./category-sheet";

type Kind = Schemas["CategoryKind"];
type Category = Schemas["Category"];

/** The category that comes first and preselected; the API sorts by name. */
const FIRST: Record<Kind, string> = { income: "Salário", bill: "Aluguel", daily: "Mercado" };

/** Top-level categories, `FIRST` leading, each followed by its children; a child of an unknown parent stands alone. */
const grouped = (list: Category[], first: string) => {
  const isTop = (category: Category) => !list.some((parent) => parent.id === category.parent_id);
  const tops = list.filter(isTop);
  const ordered = [...tops.filter((top) => top.name === first), ...tops.filter((top) => top.name !== first)];
  return ordered.flatMap((top) => [top, ...list.filter((child) => child.parent_id === top.id)]);
};

export const useCategoryChips = (kind: Kind) => {
  const categories = useCategories(kind);
  return { ...categories, data: categories.data && grouped(categories.data, FIRST[kind]) };
};

/** One kind's categories: a select-like sheet picker beside `+` below 640px, an icon grid of radios with a `+` tile from there. */
export const CategoryChips = ({
  kind,
  chosen,
  onChoose,
}: {
  kind: Kind;
  chosen: Category | undefined;
  onChoose: (category: Category) => void;
}) => {
  const categories = useCategoryChips(kind);
  const [creating, setCreating] = useState(false);
  const isSm = useIsSm();

  if (categories.isError)
    return <PageError message="Não foi possível carregar as categorias." onRetry={() => categories.refetch()} />;
  if (!categories.data)
    return (
      <div className="flex gap-4">
        <Skeleton className="size-12 rounded-full" />
        <Skeleton className="size-12 rounded-full" />
        <Skeleton className="size-12 rounded-full" />
      </div>
    );

  const list = categories.data;
  const create = <CategorySheet kind={kind} open={creating} onOpenChange={setCreating} onSaved={onChoose} />;

  if (!isSm)
    return (
      <div className="flex gap-2">
        <CategorySelect categories={list} chosen={chosen} onChoose={onChoose} />
        <Button
          type="button"
          variant="outline"
          aria-label="Nova categoria"
          onClick={() => setCreating(true)}
          className="size-12 shrink-0 rounded-xl border-dashed text-muted-foreground"
        >
          <Plus className="size-5" />
        </Button>
        {create}
      </div>
    );

  return (
    <div className="grid grid-cols-6 gap-x-2 gap-y-3 pt-1 pb-2">
      {list.map((category) => (
        <label
          key={category.id}
          className="group relative flex min-w-0 cursor-pointer flex-col items-center gap-1.5 rounded-xl py-1 text-center text-muted-foreground text-xs has-checked:font-semibold has-checked:text-primary has-focus-visible:outline-2 has-focus-visible:outline-ring"
        >
          <input
            type="radio"
            name="category"
            className="sr-only"
            checked={chosen?.id === category.id}
            onChange={() => onChoose(category)}
          />
          <CategoryIcon
            icon={category.icon}
            color={category.color}
            className="size-12 opacity-60 transition-opacity group-has-checked:opacity-100 group-has-checked:ring-2 group-has-checked:ring-primary group-has-checked:ring-offset-2 group-has-checked:ring-offset-background"
          />
          <span className="w-full truncate">{categoryLabel(category, list)}</span>
          <span
            aria-hidden
            className="absolute top-0 right-3 hidden size-5 items-center justify-center rounded-full bg-primary text-primary-foreground group-has-checked:flex"
          >
            <Check className="size-3" />
          </span>
        </label>
      ))}
      <Button
        type="button"
        variant="ghost"
        onClick={() => setCreating(true)}
        className="h-auto min-w-0 flex-col justify-start gap-1.5 rounded-xl px-0 py-1 font-medium text-muted-foreground text-xs"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40 border-dashed">
          <Plus className="size-5" />
        </span>
        Nova categoria
      </Button>
      {create}
    </div>
  );
};
