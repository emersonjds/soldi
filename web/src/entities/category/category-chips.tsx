"use client";

import { Check } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { Schemas } from "@/shared/api/client";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { PageError } from "@/shared/ui/page-state";

import { useCategories } from "./categories-query";

type Kind = Schemas["CategoryKind"];

/** The chip that comes first and preselected; the API sorts by name. */
const FIRST: Record<Kind, string> = { income: "Salário", bill: "Aluguel", daily: "Mercado" };

export const useCategoryChips = (kind: Kind) => {
  const categories = useCategories(kind);
  const list = categories.data ?? [];
  const first = list.filter((category) => category.name === FIRST[kind]);
  return {
    ...categories,
    data: categories.data && [...first, ...list.filter((category) => !first.includes(category))],
  };
};

/** Icon chips of one kind, scrolling sideways; a radio group under the hood. */
export const CategoryChips = ({
  kind,
  chosen,
  onChoose,
}: {
  kind: Kind;
  chosen: Schemas["Category"] | undefined;
  onChoose: (category: Schemas["Category"]) => void;
}) => {
  const categories = useCategoryChips(kind);

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

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pt-1 pb-2">
      {categories.data.map((category) => (
        <label
          key={category.id}
          className="group relative flex w-20 shrink-0 cursor-pointer flex-col items-center gap-1.5 rounded-xl py-1 text-center text-muted-foreground text-xs has-checked:font-semibold has-checked:text-primary has-focus-visible:outline-2 has-focus-visible:outline-ring"
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
          <span
            aria-hidden
            className="absolute top-0 right-3 hidden size-5 items-center justify-center rounded-full bg-primary text-primary-foreground group-has-checked:flex"
          >
            <Check className="size-3" />
          </span>
          <span className="w-full truncate">{category.name}</span>
        </label>
      ))}
    </div>
  );
};
