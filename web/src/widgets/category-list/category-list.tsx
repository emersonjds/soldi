"use client";

import { useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown, type LucideIcon, PiggyBank, Plus, ReceiptText, Search, ShoppingBag, Tags } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { categoriesQuery, ofKind, useArchiveCategory } from "@/entities/category/categories-query";
import { CategorySheet, KIND_NAMES } from "@/entities/category/category-sheet";
import { cn } from "@/lib/utils";
import { hasProblem, problemMessage, type Schemas } from "@/shared/api/client";
import { plain } from "@/shared/lib/text";
import { CategoryIcon, categoryBg } from "@/shared/ui/category-icon";
import { PageError, SkeletonRows } from "@/shared/ui/page-state";

type Kind = Schemas["CategoryKind"];
type Category = Schemas["Category"];

const TABS: [kind: Kind, label: string, icon: LucideIcon][] = [
  ["daily", "Diário", ShoppingBag],
  ["bill", "Contas", ReceiptText],
  ["income", "Entradas", ArrowDown],
];

/** `?k=`'s kind; Diário when absent or unknown. */
export const kindParam = (value: string | null): Kind => TABS.find(([kind]) => kind === value)?.[0] ?? "daily";

const topsOf = (list: Category[]) =>
  list.filter((category) => !list.some((parent) => parent.id === category.parent_id));

const subcategories = (count: number) => `${count} ${count === 1 ? "subcategoria" : "subcategorias"}`;

const tab =
  "h-auto min-h-11 flex-1 gap-2 whitespace-normal rounded-xl px-2 py-2 text-sm data-[state=on]:bg-secondary data-[state=on]:text-primary sm:text-base";

const row =
  "flex w-full min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring";

type Editing = { category?: Category; parentId?: string };

const deletedTitle = (parent?: Category) => {
  if (!parent) return "Categoria excluída";
  return parent.is_savings ? "Cofrinho excluído" : "Subcategoria excluída";
};

type ListProps = { kind: Kind; onKindChange: (kind: Kind) => void };

/** Ajustes › Categorias: a tab per kind and a card per group; every create and edit opens `CategorySheet`. */
export const CategoryList = ({ kind, onKindChange }: ListProps) => {
  const categories = useQuery(categoriesQuery);
  const archive = useArchiveCategory();
  const [editing, setEditing] = useState<Editing>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const [archiving, setArchiving] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const all = (categories.data ?? []).filter((category) => !archiving.includes(category.id));

  const restore = (ids: string[]) => setArchiving((current) => current.filter((id) => !ids.includes(id)));
  const edit = (next: Editing) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditing(next);
    setSheetOpen(true);
  };

  // ponytail: no unarchive endpoint, so the DELETE waits for the toast; closing the tab inside those 5 s keeps it.
  const archiveLater = (category: Category) => {
    const list = categories.data ?? [];
    const children = list.filter((each) => each.parent_id === category.id);
    const parent = list.find((each) => each.id === category.parent_id);
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
              : (problemMessage(error) ?? "Não foi possível excluir a categoria."),
          );
        },
      });
    };
    toast(deletedTitle(parent), {
      description:
        children.length > 0
          ? `${subcategories(children.length)} também; lançamentos continuam com a categoria.`
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
    if (!categories.data)
      return (
        <div className="bg-card rounded-2xl p-4 shadow-sm">
          <SkeletonRows count={4} />
        </div>
      );

    const visible = ofKind(all, kind);
    const tops = topsOf(visible);
    if (tops.length === 0)
      return (
        <div className="bg-card flex flex-col items-center gap-3 rounded-2xl px-4 py-10 text-center shadow-sm">
          <span className="bg-secondary text-primary flex size-12 items-center justify-center rounded-full">
            <Tags className="size-6" aria-hidden />
          </span>
          <p className="text-muted-foreground">{`Nenhuma categoria de ${KIND_NAMES[kind]} ainda.`}</p>
          <Button type="button" onClick={() => edit({})} className="min-h-11 rounded-xl px-4 text-base">
            <Plus className="size-5" />
            Criar categoria
          </Button>
        </div>
      );

    const query = plain(search.trim());
    const matches = (category: Category) => plain(category.name).includes(query);
    const groups = tops.flatMap((parent) => {
      const children = visible.filter((child) => child.parent_id === parent.id);
      if (matches(parent)) return [{ parent, children }];
      const hits = children.filter(matches);
      return hits.length > 0 ? [{ parent, children: hits }] : [];
    });
    if (groups.length === 0)
      return (
        <p className="bg-card text-muted-foreground rounded-2xl px-4 py-10 text-center shadow-sm">
          Nenhuma categoria encontrada.
        </p>
      );

    return (
      <ul aria-label={`Categorias de ${KIND_NAMES[kind]}`} className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {groups.map(({ parent, children }) => (
          <li
            key={parent.id}
            aria-label={parent.name}
            className="bg-card flex min-w-0 flex-col gap-1 rounded-2xl p-3 shadow-sm"
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={`Editar ${parent.name}`}
                onClick={() => edit({ category: parent })}
                className={`${row} min-h-14 py-1`}
              >
                <CategoryIcon icon={parent.icon} color={parent.color} />
                <span className="min-w-0 flex-1 text-base font-semibold break-words">{parent.name}</span>
                {parent.is_savings && (
                  <span className="bg-secondary text-primary inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium">
                    <PiggyBank className="size-3.5" aria-hidden />
                    Cofrinhos
                  </span>
                )}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`${parent.is_savings ? "Novo cofrinho" : "Nova subcategoria"} em ${parent.name}`}
                onClick={() => edit({ parentId: parent.id })}
                className="text-primary size-11 shrink-0 rounded-full"
              >
                <Plus className="size-5" />
              </Button>
            </div>
            {children.length > 0 && (
              <ul aria-label={`Subcategorias de ${parent.name}`} className="flex flex-col pl-13">
                {children.map((child) => (
                  <li key={child.id}>
                    <button
                      type="button"
                      aria-label={`Editar ${child.name}`}
                      onClick={() => edit({ category: child })}
                      className={`${row} min-h-11 py-2`}
                    >
                      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", categoryBg(parent.color))} />
                      <span className="min-w-0 flex-1 text-sm break-words">{child.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[22px] leading-7 font-bold lg:text-[28px] lg:leading-9">Categorias</h1>
        <Button
          type="button"
          aria-disabled={!categories.data}
          onClick={() => categories.data && edit({})}
          className="min-h-11 shrink-0 rounded-xl px-4 text-base aria-disabled:opacity-50"
        >
          <Plus className="size-5" />
          Nova categoria
        </Button>
      </div>
      <div className="relative">
        <Search aria-hidden className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          type="search"
          aria-label="Buscar categoria"
          placeholder="Buscar categoria..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="bg-card h-11 rounded-xl pl-9 text-base md:text-base"
        />
      </div>
      <ToggleGroup
        type="single"
        spacing={0}
        value={kind}
        onValueChange={(value) => {
          if (value) onKindChange(kindParam(value));
        }}
        className="bg-card grid w-full grid-cols-3 gap-1 rounded-2xl p-1 shadow-sm"
      >
        {TABS.map(([each, text, Icon]) => (
          <ToggleGroupItem key={each} value={each} className={tab}>
            <Icon aria-hidden className="size-4 shrink-0" />
            {text}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {body()}
      <CategorySheet
        kind={kind}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        category={editing.category}
        parentId={editing.parentId}
        onArchive={archiveLater}
        onKindChange={onKindChange}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
          setEditing({});
        }}
      />
    </div>
  );
};
