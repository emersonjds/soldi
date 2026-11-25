"use client";

import { type ReactNode, useState } from "react";

import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ScopeRadio } from "@/entities/transaction/scope-radio";
import { SeriesAllDialog } from "@/entities/transaction/series-all-dialog";
import {
  type Scope,
  type Transaction,
  useCreateTransaction,
  useDeleteTransaction,
} from "@/entities/transaction/transaction-queries";
import { TransactionSheet } from "@/features/add-transaction/transaction-sheet";
import { EditBillSheet } from "@/features/edit-bill/edit-bill-sheet";
import { problemMessage } from "@/shared/api/client";

/** `card`: the name of the card the entry went on (D28). */
export type Entry = { label: string; caption: string; card?: string };

export const titleOf = (transaction: Transaction, entry: Entry) => transaction.note || entry.label;

/**
 * Lista's Editar / Excluir sheet for one lançamento, with the series scope and Desfazer for 5 s.
 * `onClosed`: once the last of its sheets closes, in place of the focus going back to where it was.
 */
export const useEntryActions = (
  onClosed?: () => void,
): {
  open: (transaction: Transaction, entry: Entry) => void;
  actions: ReactNode;
} => {
  const [selected, setSelected] = useState<{ transaction: Transaction; entry: Entry }>();
  const [acting, setActing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [asking, setAsking] = useState(false);
  const [scope, setScope] = useState<Scope>("this");
  const create = useCreateTransaction();
  const remove = useDeleteTransaction();

  const open = (transaction: Transaction, entry: Entry) => {
    setSelected({ transaction, entry });
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
          if (transaction.series) return toast(scope === "this" ? "Lançamento excluído" : "Série excluída");
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
        onError: (error) => toast.error(problemMessage(error) ?? "Não foi possível excluir o lançamento."),
      },
    );
  };

  const closed = (event: Event) => {
    if (!onClosed || acting || editing) return;
    event.preventDefault();
    onClosed();
  };

  const transaction = selected?.transaction;
  const actions = (
    <>
      <Sheet open={acting} onOpenChange={setActing}>
        <SheetContent
          side="bottom"
          onCloseAutoFocus={closed}
          className="mx-auto max-w-lg gap-2 rounded-t-3xl px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        >
          <SheetTitle className="pr-12 text-lg font-bold">
            {selected && titleOf(selected.transaction, selected.entry)}
          </SheetTitle>
          <SheetDescription>{selected && `${selected.entry.caption} · ${selected.entry.label}`}</SheetDescription>
          {confirming && transaction?.series ? (
            <>
              <ScopeRadio
                legend="Excluir quais?"
                mode="delete"
                series={transaction.series}
                date={transaction.date}
                value={scope}
                onChange={setScope}
              />
              <Button
                variant="destructive"
                className="mt-2 min-h-12 text-base"
                onClick={() => (scope === "all" ? setAsking(true) : destroy(transaction))}
              >
                Excluir
              </Button>
              <SeriesAllDialog
                mode="delete"
                position={transaction.series.position}
                total={transaction.series.total}
                open={asking}
                onOpenChange={setAsking}
                onConfirm={() => destroy(transaction)}
              />
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
                className="text-destructive hover:text-destructive min-h-12 justify-start gap-3 text-base"
                onClick={() => transaction && (transaction.series ? setConfirming(true) : destroy(transaction))}
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
        transaction={transaction}
        billSheet={(props) => <EditBillSheet open {...props} />}
        onDelete={() => {
          setScope("this");
          setConfirming(true);
          setActing(true);
        }}
        onCloseAutoFocus={closed}
      />
    </>
  );

  return { open, actions };
};
