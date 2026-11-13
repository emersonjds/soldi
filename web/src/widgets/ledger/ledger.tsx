"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CreditCard, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCards } from "@/entities/bill/bill-queries";
import { categoriesQuery, categoryLabel } from "@/entities/category/categories-query";
import { billKey } from "@/entities/month/forecast-alert";
import { visibleDays } from "@/entities/month/schedule";
import { ScopeRadio } from "@/entities/transaction/scope-radio";
import { SeriesAllDialog } from "@/entities/transaction/series-all-dialog";
import { OPEN_LABEL } from "@/entities/transaction/series-step";
import {
  type Scope,
  type Transaction,
  useCreateTransaction,
  useDeleteTransaction,
} from "@/entities/transaction/transaction-queries";
import { TransactionSheet } from "@/features/add-transaction/transaction-sheet";
import { EditBillSheet } from "@/features/edit-bill/edit-bill-sheet";
import { cn } from "@/lib/utils";
import { problemMessage, type Schemas } from "@/shared/api/client";
import { dayMonth, monthName, shortDay, todayISO, yesterdayISO } from "@/shared/lib/date";
import { TIER_STYLE } from "@/shared/lib/tier";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { Money } from "@/shared/ui/money";
import { TierPill } from "@/shared/ui/tier-pill";

const KIND_LABEL: Record<Schemas["CategoryKind"], string> = { income: "Entrada", bill: "Saída", daily: "Diário" };

const dayLabel = ({ date, is_future }: Schemas["Day"]) => {
  const short = shortDay(date);
  if (is_future) return `Previsto · ${short}`;
  if (date === todayISO()) return `Hoje, ${short}`;
  if (date === yesterdayISO()) return `Ontem, ${short}`;
  return short;
};

/** `card`: the name of the card the entry went on (D28). */
type Entry = { label: string; caption: string; card?: string };

/** Money put in a cofrinho: a bill under Economia or one of its children. */
const isSaved = ({ kind, category }: Transaction, categories: Schemas["Category"][] = []) =>
  kind === "bill" &&
  (category.is_savings || categories.some((each) => each.id === category.parent_id && each.is_savings));

/** `Economia › Reserva` with `Guardado` for money put away, `Resgate › Reserva` with `Resgatado` for money taken back. */
const entryOf = (transaction: Transaction, categories: Schemas["Category"][] = []): Entry => {
  const { category } = transaction;
  const byId = (id?: string | null) => categories.find((each) => each.id === id);
  if (transaction.kind === "income" && category.is_savings) {
    const from = byId(transaction.cofrinho_id)?.name;
    return { label: from ? `${category.name} › ${from}` : category.name, caption: "Resgatado" };
  }
  const label = categoryLabel(category, categories);
  if (isSaved(transaction, categories)) return { label, caption: "Guardado" };
  return { label, caption: KIND_LABEL[transaction.kind] };
};

const titleOf = (transaction: Transaction, entry: Entry) => transaction.note || entry.label;

/** Same rule as the day balance: only income adds; a deposit into a cofrinho takes from it. */
const addsToBalance = (transaction: Transaction) => transaction.kind === "income";

type Day = Schemas["Day"];
type Due = Schemas["BillOfMonth"];

/** Days with entries or an unpaid bill landed on them, newest first. */
// ponytail: days × entries scan, 31 days a month.
const groupByDay = (days: Day[], transactions: Transaction[], bills: Due[]) =>
  days
    .map((day) => ({
      date: day.date,
      day,
      entries: transactions.filter((transaction) => transaction.date === day.date),
      due: bills.filter((bill) => bill.lands_on === day.date),
    }))
    .filter(({ entries, due }) => entries.length > 0 || due.length > 0)
    .reverse();

/** A day ahead, or today once an unpaid bill landed on it. */
const isForecast = (day: Day) => day.is_future || day.projected_balance !== day.balance;

const Cause = () => <span className="text-expense text-xs">Motivo da queda</span>;

const dueCaption = (bill: Due, month: string) => {
  if (!bill.due_date.startsWith(month)) return `Conta fixa · venceu em ${monthName(bill.due_date, month)}`;
  return bill.overdue ? `Conta fixa · venceu dia ${dayMonth(bill.due_date)}` : "Conta fixa · a pagar";
};

const DueRow = ({ bill, month, cause }: { bill: Due; month: string; cause: boolean }) => (
  <li
    aria-label={bill.due_date.startsWith(month) ? bill.name : `${bill.name} de ${monthName(bill.due_date, month)}`}
    className="flex min-h-16 items-center gap-3 px-2 py-2"
  >
    <CategoryIcon icon={bill.icon} color={bill.color} />
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate font-medium text-base">{bill.name}</span>
      <span className={cn("text-xs", bill.overdue ? "text-expense" : "text-muted-foreground")}>
        {dueCaption(bill, month)}
      </span>
    </span>
    <span className="flex flex-col items-end gap-0.5">
      <Money amount={bill.amount} outflow className="font-bold text-base" />
      {cause && <Cause />}
    </span>
  </li>
);

type RowProps = { transaction: Transaction; entry: Entry; cause: boolean; onOpen: () => void };

const Row = ({ transaction, entry, cause, onOpen }: RowProps) => (
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
          {entry.caption}
          {entry.card && (
            <span className="flex min-w-0 items-center gap-1">
              <CreditCard aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{entry.card}</span>
            </span>
          )}
          {transaction.series && (
            <>
              <span aria-hidden className="rounded-full bg-muted px-2 font-medium text-foreground">
                {`↻ ${KIND_LABEL[transaction.kind]} · ${
                  transaction.series.open_ended
                    ? OPEN_LABEL[transaction.series.every]
                    : `${transaction.series.position}/${transaction.series.total}`
                }`}
              </span>
              <span className="sr-only">
                {transaction.series.open_ended
                  ? OPEN_LABEL[transaction.series.every]
                  : `${transaction.series.position} de ${transaction.series.total}`}
              </span>
            </>
          )}
        </span>
      </span>
      <span className="flex flex-col items-end gap-0.5">
        <Money
          amount={transaction.amount}
          income={addsToBalance(transaction)}
          outflow={!addsToBalance(transaction)}
          className="font-bold text-base"
        />
        {cause && <Cause />}
      </span>
    </button>
  </li>
);

export type LedgerFilter = "all" | "daily" | "bill";

const FILTERS: { value: LedgerFilter; label: string; empty?: string }[] = [
  { value: "all", label: "Todos" },
  { value: "daily", label: "Diário", empty: "Nenhum gasto diário neste mês." },
  { value: "bill", label: "Contas", empty: "Nenhuma conta neste mês." },
];

type LedgerProps = {
  view: Schemas["MonthView"];
  transactions: Transaction[];
  /** The day ringed after a jump from the hero. */
  highlight?: string | null;
  /** Ids (`transaction.id` or `billKey(bill)`) captioned `Motivo da queda`. */
  causes?: ReadonlySet<string>;
  /** The whole month instead of the spec §3.3 cap; the page owns it so a jump can expand before it scrolls. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Contas holds bills and the unpaid contas fixas, not money put in a cofrinho; the page owns it so a jump can reset it before it scrolls. */
  filter: LedgerFilter;
  onFilterChange: (filter: LedgerFilter) => void;
  className?: string;
};

/**
 * `Lançamentos`: entries grouped by day, capped to recent days until expanded in place;
 * a row opens Editar / Excluir, and Excluir can be undone for 5 s.
 */
export const Ledger = ({
  view,
  transactions,
  highlight = null,
  causes = new Set<string>(),
  expanded,
  onExpandedChange,
  filter,
  onFilterChange,
  className,
}: LedgerProps) => {
  const categories = useQuery(categoriesQuery).data;
  const cards = useCards({ includeInactive: true }).data;
  const describe = (transaction: Transaction): Entry => ({
    ...entryOf(transaction, categories),
    card: cards?.find(({ id }) => id === transaction.card_id)?.name,
  });
  const [selected, setSelected] = useState<Transaction>();
  const [acting, setActing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [asking, setAsking] = useState(false);
  const [scope, setScope] = useState<Scope>("this");
  const create = useCreateTransaction();
  const remove = useDeleteTransaction();
  const any = groupByDay(view.days, transactions, view.bills_of_month).length > 0;
  const all = groupByDay(
    view.days,
    filter === "all"
      ? transactions
      : transactions.filter((transaction) => transaction.kind === filter && !isSaved(transaction, categories)),
    filter === "daily" ? [] : view.bills_of_month,
  );
  const groups = visibleDays(all, todayISO(), expanded);
  const capped = visibleDays(all, todayISO(), false).length < all.length;

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

  if (!any) return null;

  return (
    <section
      aria-labelledby="ledger-title"
      className={cn(
        "flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-sm lg:grid lg:grid-cols-[auto_1fr_auto] lg:items-center lg:gap-x-4 lg:p-6",
        className,
      )}
    >
      <h2 id="ledger-title" className="font-semibold text-lg leading-6">
        Lançamentos
      </h2>
      <ToggleGroup
        type="single"
        spacing={0}
        value={filter}
        onValueChange={(value: LedgerFilter | "") => value && onFilterChange(value)}
        aria-label="Filtrar lançamentos"
        className="mb-2 rounded-xl bg-muted p-1 lg:mb-0 lg:justify-self-start"
      >
        {FILTERS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className="h-11 rounded-lg! px-4 font-medium text-base text-muted-foreground data-[state=on]:bg-card data-[state=on]:text-primary data-[state=on]:shadow-sm"
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex flex-col gap-2 lg:col-span-3 lg:row-start-2">
        {all.length === 0 && (
          <p className="px-2 py-8 text-center text-muted-foreground">
            {FILTERS.find((option) => option.value === filter)?.empty}
          </p>
        )}
        {groups.map(({ day, entries, due }) => (
          <div
            key={day.date}
            id={`dia-${day.date}`}
            tabIndex={-1}
            className={cn("scroll-mt-28 rounded-xl", highlight === day.date && "ring-2 ring-expense")}
          >
            <h3 className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg bg-muted px-3 py-2 font-semibold text-muted-foreground text-sm lg:top-0">
              {dayLabel(day)}
              <span className="flex items-center gap-1.5">
                <span className="font-medium">{day.is_future ? "Projeção:" : "Saldo ao final:"}</span>
                <Money
                  amount={day.projected_balance}
                  className={cn("font-bold", TIER_STYLE[day.projected_tier].label)}
                />
                <TierPill tier={day.projected_tier} forecast={!day.is_future && isForecast(day)} size="sm" />
              </span>
            </h3>
            <ul className={cn("flex flex-col", day.is_future && "opacity-60")}>
              {entries.map((transaction) => (
                <Row
                  key={transaction.id}
                  entry={describe(transaction)}
                  transaction={transaction}
                  cause={causes.has(transaction.id)}
                  onOpen={() => open(transaction)}
                />
              ))}
              {due.map((bill) => (
                <DueRow key={billKey(bill)} bill={bill} month={view.month} cause={causes.has(billKey(bill))} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      {capped && (
        <Button
          variant="ghost"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
          className="min-h-11 self-center px-4 font-semibold text-primary text-sm lg:col-start-3 lg:row-start-1"
        >
          {expanded ? (
            "Mostrar menos"
          ) : (
            <>
              Ver o mês inteiro
              <ArrowRight aria-hidden />
            </>
          )}
        </Button>
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
              <ScopeRadio
                legend="Excluir quais?"
                mode="delete"
                series={selected.series}
                date={selected.date}
                value={scope}
                onChange={setScope}
              />
              <Button
                variant="destructive"
                className="mt-2 min-h-12 text-base"
                onClick={() => (scope === "all" ? setAsking(true) : destroy(selected))}
              >
                Excluir
              </Button>
              <SeriesAllDialog
                mode="delete"
                position={selected.series.position}
                total={selected.series.total}
                open={asking}
                onOpenChange={setAsking}
                onConfirm={() => destroy(selected)}
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
        onDelete={() => {
          setScope("this");
          setConfirming(true);
          setActing(true);
        }}
      />
    </section>
  );
};
