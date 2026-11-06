"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Pencil, ReceiptText, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { categoriesQuery, categoryLabel } from "@/entities/category/categories-query";
import { ScopeRadio } from "@/entities/transaction/scope-radio";
import {
  type Scope,
  type Transaction,
  useCreateTransaction,
  useDeleteTransaction,
} from "@/entities/transaction/transaction-queries";
import { TransactionSheet } from "@/features/add-transaction/transaction-sheet";
import { EditBillSheet } from "@/features/edit-bill/edit-bill-sheet";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { shortDay, todayISO, yesterdayISO } from "@/shared/lib/date";
import { BrandButton } from "@/shared/ui/brand-button";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { Money } from "@/shared/ui/money";
import { TierPill } from "@/shared/ui/tier-pill";

const KIND_LABEL: Record<Schemas["CategoryKind"], string> = { income: "Entrada", bill: "Saída", daily: "Diário" };

const dayLabel = ({ date, is_future }: Schemas["Day"]) => {
  const short = shortDay(date);
  if (is_future) return `Agendado · ${short}`;
  if (date === todayISO()) return `Hoje, ${short}`;
  if (date === yesterdayISO()) return `Ontem, ${short}`;
  return short;
};

type Entry = { label: string; caption: string };

/** `Economia › Reserva` with `Guardado` for money put away, `Resgate › Reserva` with `Resgatado` for money taken back. */
const entryOf = (transaction: Transaction, categories: Schemas["Category"][] = []): Entry => {
  const { category } = transaction;
  const byId = (id?: string | null) => categories.find((each) => each.id === id);
  if (transaction.kind === "income" && category.is_savings) {
    const from = byId(transaction.cofrinho_id)?.name;
    return { label: from ? `${category.name} › ${from}` : category.name, caption: "Resgatado" };
  }
  const label = categoryLabel(category, categories);
  if (category.is_savings || byId(category.parent_id)?.is_savings) return { label, caption: "Guardado" };
  return { label, caption: KIND_LABEL[transaction.kind] };
};

const titleOf = (transaction: Transaction, entry: Entry) => transaction.note || entry.label;

/** Days that have entries, newest first. */
const groupByDay = (days: Schemas["Day"][], transactions: Transaction[]) => {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const groups = new Map<string, Transaction[]>();
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  for (const transaction of sorted) {
    const day = byDate.get(transaction.date);
    if (!day) continue;
    groups.set(day.date, [...(groups.get(day.date) ?? []), transaction]);
  }
  return [...groups].map(([date, entries]) => ({ day: byDate.get(date) as Schemas["Day"], entries }));
};

const Row = ({ transaction, entry, onOpen }: { transaction: Transaction; entry: Entry; onOpen: () => void }) => (
  <li>
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-16 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
    >
      <CategoryIcon icon={transaction.category.icon} color={transaction.category.color} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-base">{titleOf(transaction, entry)}</span>
        <span className="flex items-center gap-1 text-muted-foreground text-xs">
          {transaction.series && <Repeat className="size-4" aria-hidden />}
          {entry.caption}
          {transaction.series && (
            <>
              <span aria-hidden>{` · ${transaction.series.position}/${transaction.series.total}`}</span>
              <span className="sr-only">{`${transaction.series.position} de ${transaction.series.total}`}</span>
            </>
          )}
        </span>
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
  const categories = useQuery(categoriesQuery).data;
  const describe = (transaction: Transaction) => entryOf(transaction, categories);
  const [selected, setSelected] = useState<Transaction>();
  const [acting, setActing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [scope, setScope] = useState<Scope>("this");
  const create = useCreateTransaction();
  const remove = useDeleteTransaction();
  const groups = groupByDay(view.days, transactions);

  const open = (transaction: Transaction) => {
    setSelected(transaction);
    setConfirming(false);
    setScope("this");
    setActing(true);
  };

  const edit = () => {
    setActing(false);
    setEditing(true);
  };

  // Desfazer would re-create a member outside its series.
  const destroy = (transaction: Transaction) => {
    setActing(false);
    remove.mutate(
      { id: transaction.id, scope: transaction.series ? scope : undefined },
      {
        onSuccess: () => {
          if (transaction.series) return toast(scope === "following" ? "Série excluída" : "Lançamento excluído");
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
          });
        },
        onError: () => toast.error("Não foi possível excluir o lançamento."),
      },
    );
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
              {dayLabel(day)}
              {!day.is_future && <TierPill tier={day.tier} amount={day.balance} size="sm" />}
            </h3>
            <ul className="flex flex-col">
              {entries.map((transaction) => (
                <Row
                  key={transaction.id}
                  entry={describe(transaction)}
                  transaction={transaction}
                  onOpen={() => open(transaction)}
                />
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
          <SheetTitle className="pr-12 font-bold text-lg">
            {selected && titleOf(selected, describe(selected))}
          </SheetTitle>
          <SheetDescription>
            {selected && `${describe(selected).caption} · ${describe(selected).label}`}
          </SheetDescription>
          {confirming && selected?.series ? (
            <>
              <ScopeRadio legend="Excluir quais?" series={selected.series} value={scope} onChange={setScope} />
              <Button variant="destructive" className="mt-2 min-h-12 text-base" onClick={() => destroy(selected)}>
                Excluir
              </Button>
              <Button variant="ghost" className="min-h-12 text-base" onClick={() => setActing(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" className="mt-2 min-h-12 justify-start gap-3 text-base" onClick={edit}>
                <Pencil className="size-5" />
                Editar
              </Button>
              <Button
                variant="ghost"
                className="min-h-12 justify-start gap-3 text-base text-destructive hover:text-destructive"
                onClick={() => selected && (selected.series ? setConfirming(true) : destroy(selected))}
              >
                <Trash2 className="size-5" />
                Excluir
              </Button>
            </>
          )}
        </SheetContent>
      </Sheet>
      <TransactionSheet
        open={editing}
        onOpenChange={setEditing}
        transaction={selected}
        billSheet={(props) => <EditBillSheet open {...props} />}
      />
    </section>
  );
};
