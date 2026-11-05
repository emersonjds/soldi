"use client";

import { useState } from "react";

import { Command as CommandPrimitive } from "cmdk";
import { ChevronDown, Search } from "lucide-react";

import { Command, CommandEmpty, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { ResponsiveSheet } from "@/shared/ui/responsive-sheet";

import { categoryLabel } from "./categories-query";

type Category = Schemas["Category"];

/** The phone picker: a select-like field that opens a bottom sheet to search and tap a category. */
export const CategorySelect = ({
  categories,
  chosen,
  onChoose,
}: {
  /** Parents each followed by their children. */
  categories: Category[];
  chosen: Category | undefined;
  onChoose: (category: Category) => void;
}) => {
  const [open, setOpen] = useState(false);
  const labelOf = (category: Category) => categoryLabel(category, categories);

  return (
    <>
      <button
        type="button"
        role="combobox"
        aria-label="Categoria"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-xl border border-input bg-transparent pr-3 pl-3 text-left text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {chosen ? (
          <>
            <CategoryIcon icon={chosen.icon} color={chosen.color} className="size-6 [&_svg]:size-3.5" />
            <span className="min-w-0 flex-1 truncate font-medium">{labelOf(chosen)}</span>
          </>
        ) : (
          <span className="flex-1 text-muted-foreground">Escolher categoria</span>
        )}
        <ChevronDown aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      </button>
      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        title="Categoria"
        description="Busque e toque na categoria do lançamento."
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
