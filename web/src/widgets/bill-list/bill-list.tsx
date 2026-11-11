"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Plus, ReceiptText } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { type Bill, useArchiveBill, useBills, useUpdateBill } from "@/entities/bill/bill-queries";
import { categoriesQuery, categoryLabel } from "@/entities/category/categories-query";
import { useMonth } from "@/entities/month/month-query";
import { nextDue, whenDue } from "@/entities/month/schedule";
import { EditBillSheet } from "@/features/edit-bill/edit-bill-sheet";
import type { Schemas } from "@/shared/api/client";
import { monthName, todayISO } from "@/shared/lib/date";
import { wholeShare } from "@/shared/lib/percent";
import { cents, fromCents } from "@/shared/lib/tier";
import { BrandButton } from "@/shared/ui/brand-button";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { DashCard } from "@/shared/ui/dash-card";
import { Money } from "@/shared/ui/money";
import { PageError, PageLoading } from "@/shared/ui/page-state";

const Rows = ({
  label,
  bills,
  onOpen,
  isActive,
  onToggle,
}: {
  label: string;
  bills: Bill[];
  onOpen: (bill: Bill) => void;
  isActive: (bill: Bill) => boolean;
  onToggle: (bill: Bill, active: boolean) => void;
}) => {
  const categories = useQuery(categoriesQuery);
  const categoryOf = (bill: Bill) => categories.data?.find((category) => category.id === bill.category_id);

  return (
    <ul aria-label={label} className="flex flex-col rounded-2xl bg-card p-2 shadow-sm">
      {bills.map((bill) => {
        const category = categoryOf(bill);
        return (
          <li key={bill.id} className="flex items-center">
            <button
              type="button"
              onClick={() => onOpen(bill)}
              className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
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
            <Switch
              aria-label={`Ativa: ${bill.name}`}
              checked={isActive(bill)}
              onCheckedChange={(active) => onToggle(bill, active)}
              className="mx-3 shrink-0 after:-inset-y-3.5"
            />
          </li>
        );
      })}
    </ul>
  );
};

const NextDue = ({ rows, today }: { rows: Schemas["BillOfMonth"][]; today: string }) => {
  const next = nextDue(rows, today);
  return (
    <DashCard title="Próximo vencimento">
      {next ? (
        <p className="flex flex-col gap-1">
          <span className="truncate font-medium text-base" title={next.name}>
            {next.name}
          </span>
          <Money amount={next.amount} className="font-bold text-lg" />
          <span className="text-muted-foreground text-sm">
            Vence {next.due_date === today ? "hoje" : whenDue(next.due_date, today)}
          </span>
        </p>
      ) : (
        <p className="text-muted-foreground">
          {rows.length > 0 && rows.every((row) => row.paid) ? "Todas as contas do mês pagas" : "Nada a vencer este mês"}
        </p>
      )}
    </DashCard>
  );
};

/** Spec SOL-72 §9: the active bills' total against this month's income (never the viewed one), and the next bill due. */
const Summary = ({ active }: { active: Bill[] }) => {
  const today = todayISO();
  const month = today.slice(0, 7);
  const view = useMonth(month);
  const total = active.reduce((sum, bill) => sum + cents(bill.amount), 0);
  const income = view.data ? cents(view.data.totals.income) : 0;
  const name = monthName(`${month}-01`, month);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <DashCard title="Total das contas fixas">
        <p className="flex flex-col">
          <Money amount={fromCents(total)} size="figure" />
          <span className="text-muted-foreground text-sm">
            {active.length === 1 ? "1 conta ativa" : `${active.length} contas ativas`}
          </span>
        </p>
        {view.data && total > 0 && (
          <p className="mt-3 text-sm">
            {income > 0
              ? `Comprometem ${wholeShare(total, income)}% das entradas de ${name}`
              : `Sem entradas em ${name} ainda.`}
          </p>
        )}
      </DashCard>
      {view.data && <NextDue rows={view.data.bills_of_month} today={today} />}
    </div>
  );
};

/** Ajustes › Contas fixas: active bills, then the paused ones; a row opens the edit sheet. */
export const BillList = () => {
  const bills = useBills({ includeInactive: true });
  const archive = useArchiveBill();
  const update = useUpdateBill();
  const [toggled, setToggled] = useState<Record<string, boolean | undefined>>({});
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

  // mutateAsync: mutate's own callbacks fire only for the latest call, and two rows can be toggled at once.
  const toggle = (bill: Bill, active: boolean) => {
    setToggled((current) => ({ ...current, [bill.id]: active }));
    update
      .mutateAsync({ id: bill.id, active })
      .then(
        () =>
          toast(active ? "Conta reativada" : "Conta pausada", {
            duration: 5000,
            action: { label: "Desfazer", onClick: () => toggle(bill, !active) },
          }),
        () => toast.error("Não foi possível salvar."),
      )
      .finally(() => setToggled((current) => ({ ...current, [bill.id]: undefined })));
  };
  const isActive = (bill: Bill) => toggled[bill.id] ?? bill.active;

  if (bills.isError)
    return <PageError message="Não foi possível carregar as contas." onRetry={() => bills.refetch()} />;
  if (!bills.data) return <PageLoading />;

  const visible = bills.data.filter((bill) => !archiving.includes(bill.id));
  const active = visible.filter((bill) => bill.active);
  const paused = visible.filter((bill) => !bill.active);

  return (
    <div className="flex flex-col gap-6">
      {visible.length > 0 && <Summary active={active} />}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-card px-4 py-10 text-center shadow-sm">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
            <ReceiptText className="size-6" aria-hidden />
          </span>
          <p className="text-muted-foreground">Nenhuma conta fixa ainda</p>
        </div>
      ) : (
        active.length > 0 && (
          <Rows label="Contas ativas" bills={active} onOpen={edit} isActive={isActive} onToggle={toggle} />
        )
      )}
      {paused.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 font-semibold text-[11px] text-muted-foreground uppercase leading-4 tracking-[0.12em]">
            Pausadas
          </h2>
          <Rows label="Pausadas" bills={paused} onOpen={edit} isActive={isActive} onToggle={toggle} />
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
