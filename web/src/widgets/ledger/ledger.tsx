"use client";

import { useState } from "react";

import { Pencil, ReceiptText, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useCategoryLabel } from "@/entities/category/categories-query";
import {
  type Transaction,
  useCreateTransaction,
  useDeleteTransaction,
} from "@/entities/transaction/transaction-queries";
import { TransactionSheet } from "@/features/add-transaction/transaction-sheet";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { shortDay, todayISO, yesterdayISO } from "@/shared/lib/date";
import { BrandButton } from "@/shared/ui/brand-button";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { Money } from "@/shared/ui/money";
import { TierPill } from "@/shared/ui/tier-pill";

const KIND_LABEL: Record<Schemas["CategoryKind"], string> = { income: "Entrada", bill: "Saída", daily: "Diário" };

const dayLabel = (date: string) => {
  const short = shortDay(date);
  if (date === todayISO()) return `Hoje, ${short}`;
  if (date === yesterdayISO()) return `Ontem, ${short}`;
  return short;
};

type Label = (category: Pick<Schemas["Category"], "name" | "parent_id">) => string;

const titleOf = (transaction: Transaction, label: Label) => transaction.note || label(transaction.category);

/** Days that have entries and are not in the future, newest first. */
const groupByDay = (days: Schemas["Day"][], transactions: Transaction[]) => {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const groups = new Map<string, Transaction[]>();
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  for (const transaction of sorted) {
    const day = byDate.get(transaction.date);
    if (!day || day.is_future) continue;
    groups.set(day.date, [...(groups.get(day.date) ?? []), transaction]);
  }
  return [...groups].map(([date, entries]) => ({ day: byDate.get(date) as Schemas["Day"], entries }));
};

const Row = ({ transaction, label, onOpen }: { transaction: Transaction; label: Label; onOpen: () => void }) => (
  <li>
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-16 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
    >
      <CategoryIcon icon={transaction.category.icon} color={transaction.category.color} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-base">{titleOf(transaction, label)}</span>
        <span className="text-muted-foreground text-xs">{KIND_LABEL[transaction.kind]}</span>
      </span>
      <Money amount={transaction.amount} income={transaction.kind === "income"} className="font-bold text-base" />
    </button>
  </li>
);

type LedgerProps = {
  view: Schemas["MonthView"];
  transactions: Transaction[];
  onLaunch: () => void;
  className?: string;
};

/** `Lançamentos`: entries grouped by day; a row opens Editar / Excluir, and Excluir can be undone for 5 s. */
export const Ledger = ({ view, transactions, onLaunch, className }: LedgerProps) => {
  const label = useCategoryLabel();
  const [selected, setSelected] = useState<Transaction>();
  const [acting, setActing] = useState(false);
  const [editing, setEditing] = useState(false);
  const create = useCreateTransaction();
  const remove = useDeleteTransaction();
  const groups = groupByDay(view.days, transactions);

  const open = (transaction: Transaction) => {
    setSelected(transaction);
    setActing(true);
  };

  const edit = () => {
    setActing(false);
    setEditing(true);
  };

  const destroy = (transaction: Transaction) => {
    setActing(false);
    remove.mutate(transaction.id, {
      onSuccess: () =>
        toast("Lançamento excluído", {
          duration: 5000,
          action: {
            label: "Desfazer",
            onClick: () =>
              create.mutate({
                date: transaction.date,
                amount: transaction.amount,
                kind: transaction.kind,
                category_id: transaction.category.id,
                note: transaction.note ?? null,
                category: transaction.category,
              }),
          },
        }),
      onError: () => toast.error("Não foi possível excluir o lançamento."),
    });
  };

  return (
    <section
      aria-labelledby="ledger-title"
      className={cn("flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-sm lg:p-6", className)}
    >
      <h2 id="ledger-title" className="font-semibold text-lg leading-6">
        Lançamentos
      </h2>
      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-2 py-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
            <ReceiptText className="size-6" aria-hidden />
          </span>
          <p className="text-muted-foreground">Nenhum lançamento ainda</p>
          <BrandButton className="w-auto px-6" onClick={onLaunch}>
            Lançar agora
          </BrandButton>
        </div>
      ) : (
        groups.map(({ day, entries }) => (
          <div key={day.date}>
            <h3 className="sticky top-14 z-10 -mx-2 flex items-center justify-between gap-2 bg-card/95 px-2 py-2 font-semibold text-muted-foreground text-sm backdrop-blur lg:top-0">
              {dayLabel(day.date)}
              <TierPill tier={day.tier} amount={day.balance} size="sm" />
            </h3>
            <ul className="flex flex-col">
              {entries.map((transaction) => (
                <Row key={transaction.id} label={label} transaction={transaction} onOpen={() => open(transaction)} />
              ))}
            </ul>
          </div>
        ))
      )}

      <Sheet open={acting} onOpenChange={setActing}>
        <SheetContent
          side="bottom"
          className="mx-auto max-w-lg gap-2 rounded-t-3xl px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        >
          <SheetTitle className="pr-12 font-bold text-lg">{selected && titleOf(selected, label)}</SheetTitle>
          <SheetDescription>
            {selected && `${KIND_LABEL[selected.kind]} · ${label(selected.category)}`}
          </SheetDescription>
          <Button variant="ghost" className="mt-2 min-h-12 justify-start gap-3 text-base" onClick={edit}>
            <Pencil className="size-5" />
            Editar
          </Button>
          <Button
            variant="ghost"
            className="min-h-12 justify-start gap-3 text-base text-destructive hover:text-destructive"
            onClick={() => selected && destroy(selected)}
          >
            <Trash2 className="size-5" />
            Excluir
          </Button>
        </SheetContent>
      </Sheet>
      <TransactionSheet open={editing} onOpenChange={setEditing} transaction={selected} />
    </section>
  );
};
