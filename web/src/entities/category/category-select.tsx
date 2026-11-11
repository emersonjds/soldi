"use client";

import { type Ref, useState } from "react";

import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";

import { Command, CommandEmpty, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { ResponsiveSheet } from "@/shared/ui/responsive-sheet";

import { categoryLabel } from "./categories-query";

type Category = Schemas["Category"];

/** `Ver todas`: a link that opens a sheet to search and tap any category. */
export const CategorySelect = ({
  ref,
  categories,
  chosen,
  onChoose,
  onCloseAutoFocus,
}: {
  ref?: Ref<HTMLButtonElement>;
  /** Parents each followed by their children. */
  categories: Category[];
  chosen: Category | undefined;
  onChoose: (category: Category) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) => {
  const [open, setOpen] = useState(false);
  const labelOf = (category: Category) => categoryLabel(category, categories);

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
            })}
          </CommandList>
        </Command>
      </ResponsiveSheet>
    </>
  );
};
