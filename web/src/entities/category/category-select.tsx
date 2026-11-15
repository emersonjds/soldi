"use client";

import { type Ref, useState } from "react";

import { Command as CommandPrimitive } from "cmdk";
import { Plus, Search } from "lucide-react";

import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { ResponsiveSheet } from "@/shared/ui/responsive-sheet";

import { categoryLabel } from "./categories-query";

type Category = Schemas["Category"];

/** `Ver todas`: a link that opens a sheet to search and tap any category of `kind`, or create one; a parent of another kind is a heading only (D26). */
export const CategorySelect = ({
  ref,
  kind,
  categories,
  chosen,
  onChoose,
  onCreate,
  onCloseAutoFocus,
}: {
  ref?: Ref<HTMLButtonElement>;
  kind: Schemas["CategoryKind"];
  /** Parents each followed by their children. */
  categories: Category[];
  chosen: Category | undefined;
  onChoose: (category: Category) => void;
  onCreate: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}) => {
  const [open, setOpen] = useState(false);
  const labelOf = (category: Category) => categoryLabel(category, categories);
  const foreign = (category?: Category) => Boolean(category && category.kind !== kind);
  const item = (category: Category) => {
    const label = labelOf(category);
    const child = label !== category.name;
    return (
      <CommandItem
        key={category.id}
        value={label}
        aria-label={label}
        data-checked={chosen?.id === category.id}
        onSelect={() => {
          onChoose(category);
          setOpen(false);
        }}
        className={cn(
          "min-h-12 gap-3 rounded-xl! px-3 text-base [&>svg:last-child]:size-5 [&>svg:last-child]:text-primary",
          child ? "pl-5" : "mt-1 font-semibold first:mt-0",
        )}
      >
        {child && (
          <span aria-hidden className="-mr-1 text-muted-foreground">
            └
          </span>
        )}
        <CategoryIcon
          icon={category.icon}
          color={category.color}
          className={child ? "size-7 [&_svg]:size-4" : "size-8 [&_svg]:size-4"}
        />
        <span className="min-w-0 flex-1 truncate">{category.name}</span>
      </CommandItem>
    );
  };

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="-mr-2 inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-primary text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Ver todas
      </button>
      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        title="Categoria"
        description="Busque e toque na categoria do lançamento."
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <Command defaultValue={chosen && labelOf(chosen)} className="gap-3 rounded-none! bg-transparent p-0">
          <div className="flex h-12 items-center gap-2 rounded-xl border border-input px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <Search aria-hidden className="size-5 shrink-0 text-muted-foreground" />
            <CommandPrimitive.Input
              placeholder="Buscar categoria"
              className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </div>
          <CommandList className="max-h-[55dvh]">
            <CommandEmpty className="py-8 text-base text-muted-foreground">Nenhuma categoria encontrada.</CommandEmpty>
            {categories.map((category) => {
              if (!foreign(category))
                return foreign(categories.find((each) => each.id === category.parent_id)) ? null : item(category);
              return (
                <CommandGroup
                  key={category.id}
                  heading={
                    <>
                      <CategoryIcon icon={category.icon} color={category.color} className="size-8 [&_svg]:size-4" />
                      <span className="min-w-0 flex-1 truncate">{category.name}</span>
                    </>
                  }
                  className="mt-1 p-0 **:[[cmdk-group-heading]]:flex **:[[cmdk-group-heading]]:min-h-12 **:[[cmdk-group-heading]]:items-center **:[[cmdk-group-heading]]:gap-3 **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:text-base **:[[cmdk-group-heading]]:text-foreground"
                >
                  {categories.filter((child) => child.parent_id === category.id).map(item)}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onCreate();
          }}
          className="flex min-h-12 items-center gap-3 rounded-xl px-3 font-semibold text-base text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex size-8 items-center justify-center rounded-full border-2 border-primary/40 border-dashed">
            <Plus aria-hidden className="size-4" />
          </span>
          Nova categoria
        </button>
      </ResponsiveSheet>
    </>
  );
};
