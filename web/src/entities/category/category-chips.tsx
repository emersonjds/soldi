"use client";

import { Check } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { Schemas } from "@/shared/api/client";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { PageError } from "@/shared/ui/page-state";

import { useCategories } from "./categories-query";
import { CreateCategoryButton } from "./create-category-sheet";

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

/** One kind's categories as rows below 640px and an icon grid from there, `Nova categoria` last; a radio group. */
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
    <div className="flex flex-col gap-1 pt-1 pb-2 sm:grid sm:grid-cols-6 sm:gap-x-2 sm:gap-y-3">
      {categories.data.map((category) => (
        <label
          key={category.id}
          className="group relative flex min-h-14 min-w-0 cursor-pointer items-center gap-3 rounded-xl px-3 text-base has-checked:bg-muted has-checked:font-semibold has-focus-visible:outline-2 has-focus-visible:outline-ring sm:min-h-0 sm:flex-col sm:gap-1.5 sm:px-0 sm:py-1 sm:text-center sm:text-muted-foreground sm:text-xs sm:has-checked:bg-transparent sm:has-checked:text-primary"
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
            className="size-10 transition-opacity sm:size-12 sm:opacity-60 sm:group-has-checked:opacity-100 sm:group-has-checked:ring-2 sm:group-has-checked:ring-primary sm:group-has-checked:ring-offset-2 sm:group-has-checked:ring-offset-background"
          />
          <span className="min-w-0 flex-1 truncate sm:w-full sm:flex-none">{category.name}</span>
          <span
            aria-hidden
            className="hidden size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground group-has-checked:flex sm:absolute sm:top-0 sm:right-3 sm:size-5"
          >
            <Check className="size-4 sm:size-3" />
          </span>
        </label>
      ))}
      <CreateCategoryButton kind={kind} onCreated={onChoose} />
    </div>
  );
};
