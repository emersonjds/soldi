"use client";

import { useId, useRef, useState } from "react";

import { Check, ChevronRight, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { plain } from "@/shared/lib/text";
import { CategoryIcon, categoryBg } from "@/shared/ui/category-icon";
import { PageError } from "@/shared/ui/page-state";
import { ResponsiveSheet } from "@/shared/ui/responsive-sheet";

import { categoryLabel, topsOf } from "./categories-query";
import { CategoryChips, useCategoryChips } from "./category-chips";
import { CategorySheet } from "./category-sheet";

type Kind = Schemas["CategoryKind"];
type Category = Schemas["Category"];
type Entry = Schemas["Transaction"];

const row =
  "flex w-full min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring";

const card = "flex min-w-0 flex-col gap-2 rounded-2xl bg-card p-4 shadow-sm";

/**
 * The `Categoria` field and its one sheet: search, `Mais usadas`, every group of `kind` with its subcategories (D26),
 * a `+` per group that creates inside it and `Novo grupo`. `onChoose` may get another kind's category, unless `kindLocked`;
 * the caller follows it.
 */
export const CategoryPicker = ({
  kind,
  chosen,
  onChoose,
  entries,
  error,
  onNewCard,
  kindLocked = false,
  label = "Categoria",
}: {
  kind: Kind;
  chosen: Category | undefined;
  onChoose: (category: Category) => void;
  /** The current month's entries, which rank `Mais usadas`. */
  entries: Entry[] | undefined;
  error?: string;
  /** Given, the card group's `+` calls it instead of the subcategory form. */
  onNewCard?: () => void;
  /** Every flow stays on `kind`: no `Quando acontece`, no `Usar esta categoria`. */
  kindLocked?: boolean;
  label?: string;
}) => {
  const categories = useCategoryChips(kind);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState<{ parentId?: string } | null>(null);
  const labelId = useId();
  const valueId = useId();
  const errorId = useId();
  const fieldRef = useRef<HTMLButtonElement>(null);
  /** The `+` or `Novo grupo` that opened the category form, focused again when it closes. */
  const opener = useRef<HTMLElement | null>(null);
  const visible = categories.data ?? [];

  const show = (next: boolean) => {
    setOpen(next);
    if (!next) setSearch("");
  };

  const pick = (category: Category) => {
    onChoose(category);
    setCreating(null);
    show(false);
  };

  const create = (parentId?: string) => (event: { currentTarget: HTMLElement }) => {
    opener.current = event.currentTarget;
    setCreating({ parentId });
  };

  const newGroup = (
    <button
      type="button"
      onClick={create()}
      className="flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold text-base text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex size-8 items-center justify-center rounded-full border-2 border-primary/40 border-dashed">
        <Plus aria-hidden className="size-4" />
      </span>
      Novo grupo
    </button>
  );

  const list = () => {
    const tops = topsOf(visible);
    if (tops.length === 0)
      return (
        <p className="rounded-2xl bg-card px-4 py-10 text-center text-muted-foreground shadow-sm">
          Nenhuma categoria ainda
        </p>
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
      return <p className="py-8 text-center text-base text-muted-foreground">Nenhuma categoria encontrada.</p>;
    return groups.map(({ parent, children }) => {
      const header = (
        <>
          <CategoryIcon icon={parent.icon} color={parent.color} />
          <span className="min-w-0 flex-1 truncate font-semibold text-base">{parent.name}</span>
          {chosen?.id === parent.id && <Check aria-hidden className="size-5 shrink-0 text-primary" />}
        </>
      );
      const cardGroup = parent.is_card_group && onNewCard;
      return (
        <section key={parent.id} aria-label={parent.name} className={card}>
          <div className="flex items-center gap-1">
            {parent.kind === kind ? (
              <button
                type="button"
                aria-pressed={chosen?.id === parent.id}
                onClick={() => pick(parent)}
                className={cn(row, "min-h-12 py-1")}
              >
                {header}
              </button>
            ) : (
              <div className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-2">{header}</div>
            )}
            {cardGroup && (
              <Button
                type="button"
                variant="outline"
                onClick={onNewCard}
                className="min-h-11 shrink-0 rounded-full text-primary text-sm"
              >
                <Plus aria-hidden className="size-4" />
                Novo cartão
              </Button>
            )}
            {!cardGroup && !parent.is_savings && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Adicionar subcategoria em ${parent.name}`}
                onClick={create(parent.id)}
                className="size-11 shrink-0 rounded-full text-primary"
              >
                <Plus className="size-5" />
              </Button>
            )}
          </div>
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              aria-pressed={chosen?.id === child.id}
              onClick={() => pick(child)}
              className={cn(row, "min-h-11 bg-muted/50 py-2")}
            >
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", categoryBg(parent.color))} />
              <span className="min-w-0 flex-1 truncate text-base">{child.name}</span>
              {chosen?.id === child.id && <Check aria-hidden className="size-5 shrink-0 text-primary" />}
            </button>
          ))}
        </section>
      );
    });
  };

  const body = () => {
    if (categories.isError)
      return <PageError message="Não foi possível carregar as categorias." onRetry={() => categories.refetch()} />;
    if (!categories.data)
      return (
        <>
          <CategoryChips kind={kind} chosen={chosen} onChoose={pick} entries={entries} />
          {["a", "b", "c"].map((slot) => (
            <Skeleton key={slot} className="h-28 rounded-2xl" />
          ))}
        </>
      );
    return (
      <>
        <CategoryChips kind={kind} chosen={chosen} onChoose={pick} entries={entries} search={search} />
        <hr className="border-border" />
        {list()}
        {newGroup}
      </>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="flex items-center gap-2 font-semibold text-sm">
        <span aria-hidden className="size-1.5 rounded-full bg-primary" />
        {label}
      </span>
      <button
        ref={fieldRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        onClick={() => show(true)}
        className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-input px-3 text-left text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
      >
        {chosen && <CategoryIcon icon={chosen.icon} color={chosen.color} className="size-8 [&_svg]:size-4" />}
        <span id={valueId} className={cn("min-w-0 flex-1 truncate", !chosen && "text-muted-foreground")}>
          {chosen ? categoryLabel(chosen, categories.data) : "Escolher categoria"}
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      </button>
      {error && (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <ResponsiveSheet
        open={open}
        onOpenChange={show}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          fieldRef.current?.focus();
        }}
        title="Categoria"
        description="Busque, toque ou crie a categoria do lançamento."
      >
        <div className="flex h-12 items-center gap-2 rounded-xl border border-input px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <Search aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          <input
            type="search"
            aria-label="Buscar categoria"
            placeholder="Buscar categoria"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
        </div>
        {body()}
        <CategorySheet
          kind={kind}
          parentId={creating?.parentId}
          open={creating !== null}
          onOpenChange={(next) => !next && setCreating(null)}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // Gone once a save closed the picker too, which focuses the field instead.
            if (opener.current?.isConnected) opener.current.focus();
          }}
          onKindChange={kindLocked ? undefined : () => undefined}
          onSaved={pick}
          onUseExisting={kindLocked ? undefined : pick}
        />
      </ResponsiveSheet>
    </div>
  );
};
