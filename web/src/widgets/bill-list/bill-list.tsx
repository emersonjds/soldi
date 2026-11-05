"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Plus, ReceiptText } from "lucide-react";
import { toast } from "sonner";

import { type Bill, useArchiveBill, useBills } from "@/entities/bill/bill-queries";
import { categoriesQuery, categoryLabel } from "@/entities/category/categories-query";
import { EditBillSheet } from "@/features/edit-bill/edit-bill-sheet";
import { BrandButton } from "@/shared/ui/brand-button";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { Money } from "@/shared/ui/money";
import { PageError, PageLoading } from "@/shared/ui/page-state";

const Rows = ({ label, bills, onOpen }: { label: string; bills: Bill[]; onOpen: (bill: Bill) => void }) => {
  const categories = useQuery(categoriesQuery);
  const categoryOf = (bill: Bill) => categories.data?.find((category) => category.id === bill.category_id);

  return (
    <ul aria-label={label} className="flex flex-col rounded-2xl bg-card p-2 shadow-sm">
      {bills.map((bill) => {
        const category = categoryOf(bill);
        return (
          <li key={bill.id}>
            <button
              type="button"
              onClick={() => onOpen(bill)}
              className="flex min-h-16 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <CategoryIcon icon={category?.icon ?? ""} color={category?.color ?? ""} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium text-base">{bill.name}</span>
                <span className="text-muted-foreground text-xs">
                  Dia {bill.due_day}
                  {category && ` · ${categoryLabel(category, categories.data)}`}
                </span>
              </span>
              <Money amount={bill.amount} className="font-bold text-base" />
            </button>
          </li>
        );
      })}
    </ul>
  );
};

/** Ajustes › Contas fixas: active bills, then the paused ones; a row opens the edit sheet. */
export const BillList = () => {
  const bills = useBills({ includeInactive: true });
  const archive = useArchiveBill();
  const [selected, setSelected] = useState<Bill>();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState<string[]>([]);

  const edit = (bill?: Bill) => {
    setSelected(bill);
    setEditing(true);
  };

  const restore = (id: string) => setArchiving((ids) => ids.filter((each) => each !== id));

  // ponytail: no unarchive endpoint, so the DELETE waits for the toast; closing the tab inside those 5 s keeps the bill.
  const archiveLater = (bill: Bill) => {
    setArchiving((ids) => [...ids, bill.id]);
    let undone = false;
    const commit = () => {
      if (undone) return;
      archive.mutate(bill.id, {
        onError: () => {
          restore(bill.id);
          toast.error("Não foi possível arquivar a conta.");
        },
      });
    };
    toast("Conta arquivada", {
      duration: 5000,
      action: {
        label: "Desfazer",
        onClick: () => {
          undone = true;
          restore(bill.id);
        },
      },
      onAutoClose: commit,
      onDismiss: commit,
    });
  };

  if (bills.isError)
    return <PageError message="Não foi possível carregar as contas." onRetry={() => bills.refetch()} />;
  if (!bills.data) return <PageLoading />;

  const visible = bills.data.filter((bill) => !archiving.includes(bill.id));
  const active = visible.filter((bill) => bill.active);
  const paused = visible.filter((bill) => !bill.active);

  return (
    <div className="flex flex-col gap-6">
      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-card px-4 py-10 text-center shadow-sm">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
            <ReceiptText className="size-6" aria-hidden />
          </span>
          <p className="text-muted-foreground">Nenhuma conta fixa ainda</p>
        </div>
      ) : (
        active.length > 0 && <Rows label="Contas ativas" bills={active} onOpen={edit} />
      )}
      {paused.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 font-semibold text-[11px] text-muted-foreground uppercase leading-4 tracking-[0.12em]">
            Pausadas
          </h2>
          <Rows label="Pausadas" bills={paused} onOpen={edit} />
        </section>
      )}
      <BrandButton className="lg:w-auto lg:self-start lg:px-6" onClick={() => edit()}>
        <Plus className="size-5" />
        Nova conta
      </BrandButton>
      <EditBillSheet open={editing} onOpenChange={setEditing} bill={selected} onArchive={archiveLater} />
    </div>
  );
};
