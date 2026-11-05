"use client";

import { useState } from "react";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Schemas } from "@/shared/api/client";
import { PageError } from "@/shared/ui/page-state";

import { useCategories } from "./categories-query";
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

/** `Resgate` is written by the Cofrinhos screen only, never picked by hand. */
const pickable = (list: Category[]) => list.filter((category) => !(category.kind === "income" && category.is_savings));

export const useCategoryChips = (kind: Kind) => {
  const categories = useCategories(kind);
  return { ...categories, data: categories.data && grouped(pickable(categories.data), FIRST[kind]) };
};

/** One kind's categories as a select-like field that opens a searchable picker, beside `+` to create one; every size. */
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
      <CategorySheet kind={kind} open={creating} onOpenChange={setCreating} onSaved={onChoose} />
    </div>
  );
};
