"use client";

import { useState } from "react";

import { MoreVertical, Pencil, PiggyBank, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useArchiveCategory, useCategories } from "@/entities/category/categories-query";
import { CategorySheet } from "@/entities/category/category-sheet";
import { hasProblem, type Schemas } from "@/shared/api/client";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { PageError, PageLoading } from "@/shared/ui/page-state";

type Kind = Schemas["CategoryKind"];
type Category = Schemas["Category"];

export const KIND_LABELS: [kind: Kind, label: string][] = [
  ["income", "Entrada"],
  ["bill", "Saída"],
  ["daily", "Diário"],
];

/** `?k=`'s kind; Diário when absent or unknown. */
export const kindParam = (value: string | null): Kind => KIND_LABELS.find(([kind]) => kind === value)?.[0] ?? "daily";

const segment =
  "min-h-11 flex-1 rounded-full text-base data-[state=on]:bg-card data-[state=on]:text-primary data-[state=on]:shadow-sm";

const row =
  "flex w-full min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring";

type Editing = { open: boolean; category?: Category; parentId?: string };

const item = "min-h-11 text-base";

const deletedTitle = (parent?: Category) => {
  if (!parent) return "Categoria excluída";
  return parent.is_savings ? "Cofrinho excluído" : "Subcategoria excluída";
};

type ActionsProps = { category: Category; onEdit: () => void; onAdd?: () => void; onDelete: () => void };

/** The row's kebab: Editar, the parent's `Nova subcategoria`/`Novo cofrinho` and Excluir, which Economia never offers. */
const RowActions = ({ category, onEdit, onAdd, onDelete }: ActionsProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Mais ações de ${category.name}`}
        className="size-11 shrink-0 rounded-full text-muted-foreground"
      >
        <MoreVertical className="size-5" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-auto max-w-72">
      <DropdownMenuItem className={item} onSelect={onEdit}>
        <Pencil />
        Editar
      </DropdownMenuItem>
      {onAdd && (
        <DropdownMenuItem className={item} onSelect={onAdd}>
          <Plus />
          {`${category.is_savings ? "Novo cofrinho" : "Nova subcategoria"} em ${category.name}`}
        </DropdownMenuItem>
      )}
      {!category.is_savings && (
        <DropdownMenuItem variant="destructive" className={item} onSelect={onDelete}>
          <Trash2 />
          Excluir
        </DropdownMenuItem>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
);

/** Ajustes › Categorias: one kind at a time, each parent with its subcategories under it; a row opens the edit sheet. */
export const CategoryList = ({ kind, onKindChange }: { kind: Kind; onKindChange: (kind: Kind) => void }) => {
  const categories = useCategories(kind);
  const archive = useArchiveCategory();
  const [editing, setEditing] = useState<Editing>({ open: false });
  const [archiving, setArchiving] = useState<string[]>([]);
  const label = KIND_LABELS.find(([each]) => each === kind)?.[1];

  const restore = (ids: string[]) => setArchiving((current) => current.filter((id) => !ids.includes(id)));

  // ponytail: no unarchive endpoint, so the DELETE waits for the toast; closing the tab inside those 5 s keeps it.
  const archiveLater = (category: Category) => {
    const all = categories.data ?? [];
    const children = all.filter((each) => each.parent_id === category.id);
    const parent = all.find((each) => each.id === category.parent_id);
    const ids = [category.id, ...children.map((child) => child.id)];
    setArchiving((current) => [...current, ...ids]);
    let undone = false;
    const commit = () => {
      if (undone) return;
      archive.mutate(category.id, {
        onError: (error) => {
          restore(ids);
          toast.error(
            hasProblem(error, "cofrinho-not-empty")
              ? "Resgate tudo antes de excluir."
              : "Não foi possível excluir a categoria.",
          );
        },
      });
    };
    const count = `${children.length} ${children.length === 1 ? "subcategoria" : "subcategorias"}`;
    toast(deletedTitle(parent), {
      description:
        children.length > 0
          ? `${count} também; lançamentos continuam com a categoria.`
          : "Lançamentos continuam com a categoria.",
      duration: 5000,
      action: {
        label: "Desfazer",
        onClick: () => {
          undone = true;
          restore(ids);
        },
      },
      onAutoClose: commit,
      onDismiss: commit,
    });
  };

  const body = () => {
    if (categories.isError)
      return <PageError message="Não foi possível carregar as categorias." onRetry={() => categories.refetch()} />;
    if (!categories.data) return <PageLoading />;

    const visible = categories.data.filter((category) => !archiving.includes(category.id));
    const tops = visible.filter((category) => !visible.some((parent) => parent.id === category.parent_id));
    if (tops.length === 0)
      return (
        <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
            <Tags className="size-6" aria-hidden />
          </span>
          <p className="text-muted-foreground">Nenhuma categoria aqui ainda</p>
        </div>
      );

    return (
      <ul aria-label={`Categorias de ${label}`} className="flex flex-col divide-y">
        {tops.map((parent) => {
          const children = visible.filter((child) => child.parent_id === parent.id);
          return (
            <li key={parent.id} className="py-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Editar ${parent.name}`}
                  onClick={() => setEditing({ open: true, category: parent })}
                  className={`${row} min-h-14 py-2`}
                >
                  <CategoryIcon icon={parent.icon} color={parent.color} />
                  <span className="min-w-0 flex-1 truncate font-medium text-base">{parent.name}</span>
                  {parent.is_savings && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-medium text-primary text-xs">
                      <PiggyBank className="size-3.5" aria-hidden />
                      <span className="hidden sm:inline">Cofrinhos</span>
                    </span>
                  )}
                </button>
                <RowActions
                  category={parent}
                  onEdit={() => setEditing({ open: true, category: parent })}
                  onAdd={() => setEditing({ open: true, parentId: parent.id })}
                  onDelete={() => archiveLater(parent)}
                />
              </div>
              {children.length > 0 && (
                <ul aria-label={`Subcategorias de ${parent.name}`} className="mb-1 ml-7 flex flex-col border-l pl-2">
                  {children.map((child) => (
                    <li key={child.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Editar ${child.name}`}
                        onClick={() => setEditing({ open: true, category: child })}
                        className={`${row} min-h-12 py-1.5`}
                      >
                        <CategoryIcon icon={child.icon} color={child.color} className="size-8" />
                        <span className="min-w-0 flex-1 truncate text-base">{child.name}</span>
                      </button>
                      <RowActions
                        category={child}
                        onEdit={() => setEditing({ open: true, category: child })}
                        onDelete={() => archiveLater(child)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-bold text-[22px] leading-7">Categorias</h1>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Nova categoria"
          onClick={() => setEditing({ open: true })}
          className="size-11 rounded-full text-primary"
        >
          <Plus className="size-5" />
        </Button>
      </div>
      <ToggleGroup
        type="single"
        spacing={0}
        value={kind}
        onValueChange={(value) => {
          if (value) onKindChange(kindParam(value));
        }}
        className="w-full rounded-full bg-muted p-1"
      >
        {KIND_LABELS.map(([each, text]) => (
          <ToggleGroupItem key={each} value={each} className={segment}>
            {text}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <section aria-label={label} className="rounded-2xl bg-card p-2 shadow-sm">
        {body()}
      </section>
      <CategorySheet
        kind={kind}
        open={editing.open}
        onOpenChange={(open) => setEditing((current) => ({ ...current, open }))}
        category={editing.category}
        parentId={editing.parentId}
        onArchive={archiveLater}
        onKindChange={onKindChange}
      />
    </div>
  );
};
