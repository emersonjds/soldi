"use client";

import { ListTree, Shapes } from "lucide-react";

import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { Schemas } from "@/shared/api/client";
import { BrandButton } from "@/shared/ui/brand-button";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { PageError, PageLoading } from "@/shared/ui/page-state";

import { useCategories } from "./categories-query";

const option =
  "flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring";

/** Step 1 of creating: a top-level category or a subcategory. */
export const ChooseKind = ({ onCategory, onSubcategory }: { onCategory: () => void; onSubcategory: () => void }) => (
  <div className="grid gap-3 sm:grid-cols-2">
    {(
      [
        ["Categoria", "Nova, com ícone e cor próprios.", Shapes, onCategory],
        ["Subcategoria", "Dentro de uma categoria já existente.", ListTree, onSubcategory],
      ] as const
    ).map(([label, helper, Icon, onClick]) => (
      <button key={label} type="button" className={option} onClick={onClick}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
          <Icon aria-hidden className="size-5" />
        </span>
        <span className="flex flex-col">
          <span className="font-semibold text-base">{label}</span>
          <span className="text-muted-foreground text-sm">{helper}</span>
        </span>
      </button>
    ))}
  </div>
);

/** Step 2: the kind's top-level categories, searchable; no parent means a top-level one after all. */
export const ChooseParent = ({
  kind,
  onPick,
}: {
  kind: Schemas["CategoryKind"];
  onPick: (parentId?: string) => void;
}) => {
  const categories = useCategories(kind);
  if (categories.isError)
    return <PageError message="Não foi possível carregar as categorias." onRetry={() => categories.refetch()} />;
  if (!categories.data) return <PageLoading />;
  const parents = categories.data.filter((each) => !each.parent_id);
  if (!parents.length)
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <p className="text-muted-foreground">Nenhuma categoria para agrupar ainda.</p>
        <BrandButton type="button" onClick={() => onPick()}>
          Criar categoria
        </BrandButton>
      </div>
    );

  return (
    <Command className="bg-transparent p-0 [&_[data-slot=input-group]]:h-12! [&_[data-slot=input-group]]:rounded-xl!">
      <CommandInput placeholder="Buscar categoria" className="text-base" />
      <CommandList className="mt-2">
        <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
        {parents.map((parent) => (
          <CommandItem
            key={parent.id}
            value={parent.name}
            onSelect={() => onPick(parent.id)}
            className="min-h-11 gap-3 rounded-xl text-base"
          >
            <CategoryIcon icon={parent.icon} color={parent.color} className="size-8" />
            {parent.name}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
};
