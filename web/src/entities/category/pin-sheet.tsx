"use client";

import { useId, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Schemas } from "@/shared/api/client";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { PageError } from "@/shared/ui/page-state";
import { ResponsiveSheet, ResponsiveSheetFooter } from "@/shared/ui/responsive-sheet";

import { categoriesQuery, kindsOf } from "./categories-query";
import { mergePins, usePins, useSetPins } from "./category-pins";

type Kind = Schemas["CategoryKind"];
type Category = Schemas["Category"];

export const MAX_PINNED = 8;

const KIND_NAME: Record<Kind, string> = { daily: "Diário", bill: "Saída", income: "Entrada" };

const textButton = "min-h-11 px-3 font-semibold text-sm";

const Lists = ({
  kind,
  tops,
  global,
  onClose,
}: {
  kind: Kind;
  tops: Category[];
  global: string[];
  onClose: () => void;
}) => {
  const all = useQuery(categoriesQuery).data ?? tops;
  const save = useSetPins();
  const [pinned, setPinned] = useState(() => global.flatMap((id) => tops.filter((top) => top.id === id)));
  const fixedId = useId();
  const othersId = useId();
  const isPinned = (category: Category) => pinned.includes(category);
  const others = tops.filter((top) => !isPinned(top)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const full = pinned.length >= MAX_PINNED;
  const move = (from: number, to: number) => {
    const next = [...pinned];
    [next[from], next[to]] = [next[to], next[from]];
    setPinned(next);
  };
  const submit = () =>
    save.mutate(
      mergePins(
        global,
        new Set(tops.map((top) => top.id)),
        pinned.map((top) => top.id),
      ),
      {
        onSuccess: () => {
          onClose();
          toast.success("Categorias personalizadas");
        },
        onError: () => toast.error("Não foi possível salvar a ordem."),
      },
    );
  const label = (category: Category) => (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <CategoryIcon icon={category.icon} color={category.color} className="size-8 shrink-0 [&_svg]:size-4" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-base">{category.name}</span>
        {isPinned(category) && kindsOf(category, all).length > 1 && (
          <span className="text-muted-foreground text-xs">
            Também fixada em{" "}
            {kindsOf(category, all)
              .filter((each) => each !== kind)
              .map((each) => KIND_NAME[each])
              .join(" e ")}
            .
          </span>
        )}
      </span>
    </span>
  );

  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 id={fixedId} className="font-semibold text-sm">
          Fixadas
        </h3>
        {pinned.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma fixada. A lista segue o uso deste mês.</p>
        ) : (
          <ul aria-labelledby={fixedId} className="flex flex-col gap-1">
            {pinned.map((category, index) => (
              <li key={category.id} className="flex items-center gap-1">
                {label(category)}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={`Subir ${category.name}`}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ChevronUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={`Descer ${category.name}`}
                  disabled={index === pinned.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ChevronDown />
                </Button>
                <Button
                  variant="ghost"
                  className={textButton}
                  aria-label={`Desafixar ${category.name}`}
                  onClick={() => setPinned(pinned.filter((each) => each !== category))}
                >
                  Desafixar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h3 id={othersId} className="font-semibold text-sm">
          Outras
        </h3>
        {full && <p className="text-muted-foreground text-sm">Limite de 8 fixadas.</p>}
        <ul aria-labelledby={othersId} className="flex flex-col gap-1">
          {others.map((category) => (
            <li key={category.id} className="flex items-center gap-1">
              {label(category)}
              <Button
                variant="ghost"
                className={textButton}
                aria-label={`Fixar ${category.name}`}
                disabled={full}
                onClick={() => setPinned([...pinned, category])}
              >
                Fixar
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <ResponsiveSheetFooter>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="min-h-11" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="min-h-11" disabled={save.isPending} onClick={submit}>
            Salvar
          </Button>
        </div>
      </ResponsiveSheetFooter>
    </>
  );
};

const Body = ({ kind, tops, onClose }: { kind: Kind; tops: Category[]; onClose: () => void }) => {
  const pins = usePins();
  if (pins.isError)
    return <PageError message="Não foi possível carregar as categorias fixadas." onRetry={() => pins.refetch()} />;
  if (!pins.data) return <Skeleton className="h-40 rounded-xl" />;
  return <Lists kind={kind} tops={tops} global={pins.data} onClose={onClose} />;
};

/** `Personalizar categorias`: pins up to eight of one row's tops, in order (P9). */
export const PinSheet = ({
  kind,
  tops,
  open,
  onOpenChange,
}: {
  kind: Kind;
  /** The row's top-level categories. */
  tops: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <ResponsiveSheet
    open={open}
    onOpenChange={onOpenChange}
    title="Personalizar categorias"
    description="Fixe até 8 categorias no começo da lista, na ordem que preferir."
    showDescription
  >
    <Body kind={kind} tops={tops} onClose={() => onOpenChange(false)} />
  </ResponsiveSheet>
);
