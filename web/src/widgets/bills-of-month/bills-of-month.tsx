"use client";

import { useId, useRef, useState } from "react";

import Link from "next/link";

import { Check, ChevronDown, ChevronRight, Clock } from "lucide-react";
import { toast } from "sonner";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  type Bill,
  type BillOfMonth,
  billTitle,
  payDateFor,
  useBills,
  usePayBill,
  useUnpayBill,
} from "@/entities/bill/bill-queries";
import { BillStatus } from "@/entities/bill/bill-status";
import { billKey } from "@/entities/month/forecast-alert";
import { ALL_BILLS_PAID, dueDays, nextDue } from "@/entities/month/schedule";
import { useTransactions } from "@/entities/transaction/transaction-queries";
import { TransactionSheet } from "@/features/add-transaction/transaction-sheet";
import { FaturaSheet } from "@/features/card-fatura/fatura-sheet";
import { EditBillSheet, useArchiveLater } from "@/features/edit-bill/edit-bill-sheet";
import { PayBillSheet } from "@/features/pay-bill/pay-bill-sheet";
import { cn } from "@/lib/utils";
import { problemMessage, type Schemas } from "@/shared/api/client";
import { type Currency, useCurrency } from "@/shared/lib/currency";
import { addMonths, dayMonth, monthAbbrev, monthName, shortDay, todayISO } from "@/shared/lib/date";
import { formatMoney } from "@/shared/lib/money";
import { cents, fromCents } from "@/shared/lib/tier";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { DashCard } from "@/shared/ui/dash-card";
import { Money } from "@/shared/ui/money";

/** `05` in the viewed month, `10/10` for a bill carried from an earlier one (D17). */
const chipDay = (date: string, month: string) => (date.startsWith(month) ? date.slice(8) : dayMonth(date));

const paidOf = (bills: BillOfMonth[]) =>
  `${bills.filter((bill) => bill.paid).length} de ${bills.length} ${bills.length === 1 ? "paga" : "pagas"}`;

const overdueOf = (bills: BillOfMonth[]) => bills.filter((bill) => bill.overdue && !bill.paid).length;

/** Clock + `1 vencida`: never color alone. */
const Overdue = ({ count, lead = "" }: { count: number; lead?: string }) => (
  <span className="inline-flex items-center gap-1 whitespace-nowrap text-expense">
    {lead}
    <Clock className="size-3.5 shrink-0" aria-hidden />
    {count === 1 ? "1 vencida" : `${count} vencidas`}
  </span>
);

type Kind = "fixed" | "variable" | "card";

const GROUPS: { kind: Kind; name: string }[] = [
  { kind: "fixed", name: "Valor fixo" },
  { kind: "variable", name: "Valor variável" },
  { kind: "card", name: "Faturas de cartão" },
];

const kindOf = (bill: BillOfMonth): Kind => {
  if (bill.is_card) return "card";
  return bill.variable ? "variable" : "fixed";
};

/** `2 de 3 pagas · falta R$ X · 1 vencida`, or a tick once every bill of the group is paid. */
const Summary = ({ bills, currency }: { bills: BillOfMonth[]; currency: Currency }) => {
  const unpaid = bills.filter((bill) => !bill.paid);
  if (unpaid.length === 0)
    return (
      <span className="flex items-center gap-1 text-income-text">
        <Check className="size-3.5 shrink-0" aria-hidden />
        {paidOf(bills)}
      </span>
    );
  const left = fromCents(unpaid.reduce((sum, bill) => sum + cents(bill.amount), 0));
  const late = overdueOf(bills);
  return (
    <span className="flex flex-wrap items-center gap-x-1 text-muted-foreground">
      <span className="whitespace-nowrap">{paidOf(bills)}</span>{" "}
      <span className="whitespace-nowrap">
        · falta {unpaid.some((bill) => bill.variable) && "≈ "}
        {formatMoney(left, currency)}
      </span>
      {late > 0 && (
        <>
          {" "}
          <Overdue count={late} lead="· " />
        </>
      )}
    </span>
  );
};

const unpaidLabel = (count: number) => {
  if (count === 0) return "nenhuma conta a pagar";
  return count === 1 ? "1 conta a pagar" : `${count} contas a pagar`;
};

/** The earlier month a carried row is still unpaid in (D17), or null for the viewed month's own row. */
const carriedFrom = (bill: BillOfMonth, month: string) =>
  bill.due_date.startsWith(month) ? null : monthName(bill.due_date, month);

/** Spec 2026-11-11: desktop says since when a bill is late or whether it was paid on time; mobile keeps the date. */
const Caption = ({ bill, paidOn }: { bill: BillOfMonth; paidOn?: string }) => {
  const day = bill.due_date.slice(8);
  const late = bill.overdue && !bill.paid;
  let desktop = `Vence dia ${day}`;
  if (bill.paid) {
    let timing = "";
    if (paidOn) timing = paidOn <= bill.due_date ? " · Pago no prazo" : " · Pago com atraso";
    desktop = `${bill.due_date <= todayISO() ? "Venceu" : "Vence"} dia ${day}${timing}`;
  }
  return (
    <>
      <span
        className={cn("hidden items-center gap-1 text-xs lg:flex", late ? "text-expense" : "text-muted-foreground")}
      >
        {late ? (
          <>
            <Clock className="size-3.5 shrink-0" aria-hidden />
            Atrasada desde {shortDay(bill.due_date)}
          </>
        ) : (
          desktop
        )}
      </span>
      <span
        className={cn(
          "flex items-center gap-1 whitespace-nowrap text-xs lg:hidden",
          late ? "text-expense" : "text-muted-foreground",
        )}
      >
        {late && <Clock className="size-3.5 shrink-0" aria-hidden />}
        {late ? "Venceu" : "Vence"} dia {dayMonth(bill.due_date)}
      </span>
    </>
  );
};

/** A card or a variable bill opens Pagar instead of booking its amount (D44). */
const payLabel = (bill: BillOfMonth, label: string) =>
  bill.is_card || bill.variable ? `Pagar ${label}` : `Marcar ${label} como paga`;

/** A 24 px circle inside a 44 px target; the fill and the tick scale in 150 ms (spec §4.7). */
const RoundCheck = ({
  bill,
  label,
  onToggle,
  busy,
}: {
  bill: BillOfMonth;
  label: string;
  onToggle: () => void;
  busy: boolean;
}) => (
  <button
    type="button"
    aria-pressed={bill.paid}
    aria-label={bill.paid ? `Desmarcar ${label}` : payLabel(bill, label)}
    onClick={onToggle}
    disabled={busy}
    className="group/check -ml-2 hidden size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60 lg:flex"
  >
    <span
      className={cn(
        "flex size-6 items-center justify-center rounded-full border-2 motion-safe:transition-[background-color,border-color,scale] motion-safe:duration-150",
        bill.paid && "border-income bg-income text-primary-foreground",
        !bill.paid && "scale-90 group-hover/check:border-income",
        !bill.paid &&
          (bill.overdue ? "border-expense bg-expense text-primary-foreground" : "border-muted-foreground/50"),
      )}
    >
      {bill.overdue && !bill.paid ? (
        <span aria-hidden className="font-bold text-sm leading-none">
          !
        </span>
      ) : (
        <Check
          className={cn("size-4 motion-safe:transition-[scale] motion-safe:duration-150", !bill.paid && "scale-0")}
          strokeWidth={3}
          aria-hidden
        />
      )}
    </span>
  </button>
);

const Row = ({
  bill,
  month,
  paidOn,
  onPay,
  onUnpay,
  onAdjust,
  onOpenName,
  busy,
}: {
  bill: BillOfMonth;
  month: string;
  paidOn?: string;
  onPay: () => void;
  onUnpay: () => void;
  onAdjust: () => void;
  /** SOL-119: a card's name area opens its fatura; SOL-153: any other bill's opens Editar conta, disabled while unset. */
  onOpenName?: () => void;
  busy: boolean;
}) => {
  const currency = useCurrency();
  const captionId = useId();
  const late = carriedFrom(bill, month);
  const title = billTitle(bill);
  const label = late ? `${title} de ${late}` : title;
  const estimated = bill.variable && !bill.paid;
  const parcel =
    bill.installments &&
    (bill.installment === bill.installments
      ? "Última parcela"
      : `Parcela ${bill.installment}/${bill.installments} · termina em ${monthAbbrev(addMonths(bill.due_date.slice(0, 7), bill.installments - Number(bill.installment)))}`);
  const amount = (
    <span className="whitespace-nowrap">
      {estimated && <span aria-hidden>≈ </span>}
      <Money
        amount={bill.amount}
        className={cn(
          "text-sm sm:text-base lg:text-lg",
          bill.paid ? "text-muted-foreground" : "font-bold",
          bill.overdue && "text-expense",
        )}
      />
    </span>
  );
  const name = (
    <>
      <CategoryIcon icon={bill.icon} color={bill.color} tintedOnDesktop />
      <span id={captionId} className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="flex max-w-full flex-wrap items-baseline gap-x-1">
          <span
            title={title}
            className={cn(
              "max-w-full truncate font-medium text-base",
              bill.paid && "lg:text-muted-foreground lg:line-through",
            )}
          >
            {title}
          </span>
          {parcel && (
            <>
              {" "}
              <span className="text-muted-foreground text-sm">
                · {[parcel, late && `venceu em ${late}`].filter(Boolean).join(" · ")}
              </span>
            </>
          )}
          {estimated && <span className="whitespace-nowrap text-muted-foreground text-sm"> · valor variável</span>}
        </span>
        <Caption bill={bill} paidOn={paidOn} />
      </span>
    </>
  );
  return (
    <li
      aria-label={label}
      className={cn(
        "-mx-2 flex min-h-16 items-center gap-2 rounded-xl px-2 py-2 sm:gap-3",
        bill.overdue && "bg-expense/10",
      )}
    >
      <RoundCheck bill={bill} label={label} onToggle={bill.paid ? onUnpay : onPay} busy={busy} />
      <button
        type="button"
        aria-label={`${bill.is_card ? "Ver" : "Editar"} ${label}`}
        aria-describedby={captionId}
        onClick={onOpenName}
        disabled={!onOpenName}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-ring sm:gap-3"
      >
        {name}
        {onOpenName && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      </button>
      {bill.paid ? (
        amount
      ) : (
        <button
          type="button"
          aria-label={`${estimated ? "valor estimado " : ""}${formatMoney(bill.amount, currency)}: ajustar pagamento de ${label}`}
          onClick={onAdjust}
          className="min-h-11 shrink-0 rounded-lg px-1 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          {amount}
        </button>
      )}
      <BillStatus bill={bill} label={label} onPay={onPay} onUnpay={onUnpay} busy={busy} />
    </li>
  );
};

/**
 * C3 `Contas a pagar` (spec 2026-11-10 §3.4, 2026-11-11, SOL-153): the paid count, one chip per due day that filters the list
 * (a second tap clears it), the bills in open groups by kind of amount, and a round check that pays or undoes; the amount opens Pagar to adjust.
 */
export const BillsOfMonth = ({ view, className }: { view: Schemas["MonthView"]; className?: string }) => {
  const [chosen, setChosen] = useState<{ month: string; date: string } | null>(null);
  const [closed, setClosed] = useState<Kind[]>([]);
  const [adjusting, setAdjusting] = useState<BillOfMonth>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fatura, setFatura] = useState<BillOfMonth>();
  const [faturaOpen, setFaturaOpen] = useState(false);
  const [editing, setEditing] = useState<Bill>();
  const [editOpen, setEditOpen] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const title = useRef<HTMLSpanElement>(null);
  const saved = useBills({ includeInactive: true });
  const archiveLater = useArchiveLater(
    (id) => setHidden((ids) => [...ids, id]),
    (id) => setHidden((ids) => ids.filter((each) => each !== id)),
  );
  const pay = usePayBill();
  const unpay = useUnpayBill();
  const currency = useCurrency();
  const transactions = useTransactions(view.month);
  const paidOn = new Map(transactions.data?.map((transaction) => [transaction.id, transaction.date]));
  const bills = view.bills_of_month.filter((bill) => !hidden.includes(bill.bill_id));
  const day = chosen?.month === view.month && bills.some((bill) => bill.due_date === chosen.date) ? chosen.date : null;
  const shown = bills.filter((bill) => day === null || bill.due_date === day);
  const late = overdueOf(bills);
  const next = nextDue(bills, todayISO());
  let upcoming =
    next &&
    `Próxima: dia ${next.due_date.slice(8)} · ${next.variable ? "≈ " : ""}${formatMoney(next.amount, currency)}`;
  if (bills.every((bill) => bill.paid)) upcoming = ALL_BILLS_PAID;
  const grouped = new Set(bills.map(kindOf)).size > 1;

  const adjust = (bill: BillOfMonth) => {
    setAdjusting(bill);
    setSheetOpen(true);
  };

  // A fatura and a variable bill are paid only through the sheet (D28, D44).
  const payNow = (bill: BillOfMonth) => {
    if (bill.is_card || bill.variable) return adjust(bill);
    const month = bill.due_date.slice(0, 7);
    pay.mutate(
      { billId: bill.bill_id, month, date: payDateFor(month, bill.due_date) },
      { onError: (error) => toast.error(problemMessage(error) ?? "Não foi possível marcar como paga.") },
    );
  };

  const undo = (bill: BillOfMonth) =>
    unpay.mutate(
      { billId: bill.bill_id, month: bill.due_date.slice(0, 7) },
      {
        onSuccess: () => toast("Pagamento desfeito"),
        onError: (error) => toast.error(problemMessage(error) ?? "Não foi possível desfazer o pagamento."),
      },
    );

  const choose = (date: string) => {
    setChosen(date ? { month: view.month, date } : null);
    if (date) setClosed([]);
  };

  const openName = (bill: BillOfMonth) => {
    if (bill.is_card)
      return () => {
        setFatura(bill);
        setFaturaOpen(true);
      };
    const found = saved.data?.find((each) => each.id === bill.bill_id);
    if (!found) return undefined;
    return () => {
      setEditing(found);
      setEditOpen(true);
    };
  };

  if (bills.length === 0) return null;

  const list = (rows: BillOfMonth[], label?: string) => (
    <ul aria-label={label} className="flex flex-col gap-1">
      {rows.map((bill) => (
        <Row
          key={billKey(bill)}
          bill={bill}
          month={view.month}
          paidOn={paidOn.get(bill.transaction_id ?? "")}
          onPay={() => payNow(bill)}
          onUnpay={() => undo(bill)}
          onAdjust={() => adjust(bill)}
          onOpenName={openName(bill)}
          busy={pay.isPending || unpay.isPending}
        />
      ))}
    </ul>
  );

  return (
    <DashCard
      title={
        <span
          ref={title}
          tabIndex={-1}
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span aria-hidden className="h-4 w-1 rounded-full bg-primary lg:hidden" />
          Contas a pagar
          <span className="inline-flex rounded-full bg-muted px-2 font-medium text-muted-foreground text-xs leading-5">
            {paidOf(bills)}
          </span>
        </span>
      }
      label="Contas a pagar"
      className={className}
    >
      <div className="flex flex-col gap-4">
        <p className="-mt-2 flex flex-wrap gap-x-2 text-muted-foreground text-sm">
          {late > 0 && (
            <>
              <Overdue count={late} />{" "}
            </>
          )}
          {upcoming && <span className="whitespace-nowrap">{upcoming}</span>}
        </p>
        <ToggleGroup
          type="single"
          value={day ?? ""}
          onValueChange={choose}
          aria-label="Filtrar por dia"
          className="hidden min-w-0 overflow-x-auto py-0.5 lg:flex"
        >
          {dueDays(bills).map(({ date, unpaid }) => (
            <ToggleGroupItem
              key={date}
              value={date}
              aria-label={`dia ${chipDay(date, view.month)}, ${unpaidLabel(unpaid)}`}
              className="h-11 gap-1.5 rounded-full! border border-border px-4 font-medium text-base data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              dia {chipDay(date, view.month)}
              {unpaid > 0 && (
                <span aria-hidden className="flex gap-0.5">
                  {Array.from({ length: unpaid }, (_, index) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: identical dots, never reordered.
                      key={index}
                      data-testid="unpaid-dot"
                      className="size-1.5 rounded-full bg-current"
                    />
                  ))}
                </span>
              )}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {grouped
          ? GROUPS.map(({ kind, name }) => {
              const rows = shown.filter((bill) => kindOf(bill) === kind);
              if (rows.length === 0) return null;
              return (
                <Collapsible
                  key={kind}
                  open={!closed.includes(kind)}
                  onOpenChange={(open) =>
                    setClosed((kinds) => (open ? kinds.filter((each) => each !== kind) : [...kinds, kind]))
                  }
                  className="flex flex-col gap-1"
                >
                  <h3>
                    <CollapsibleTrigger className="group/trigger flex min-h-11 w-full flex-col items-start gap-0.5 rounded-lg py-1 text-left text-sm focus-visible:outline-2 focus-visible:outline-ring">
                      <span className="flex w-full items-center justify-between gap-2 font-medium text-base">
                        {name}
                        <ChevronDown
                          className="size-4 shrink-0 text-muted-foreground group-data-[state=open]/trigger:rotate-180 motion-safe:transition-transform motion-safe:duration-150"
                          aria-hidden
                        />
                      </span>
                      <Summary bills={bills.filter((bill) => kindOf(bill) === kind)} currency={currency} />
                    </CollapsibleTrigger>
                  </h3>
                  <CollapsibleContent>{list(rows, name)}</CollapsibleContent>
                </Collapsible>
              );
            })
          : list(shown)}
        <Link
          href="/ajustes/contas"
          className="inline-flex min-h-11 items-center self-start rounded-lg font-medium text-primary text-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Gerenciar contas fixas
        </Link>
      </div>

      <PayBillSheet
        month={adjusting?.due_date.slice(0, 7) ?? view.month}
        bill={adjusting}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
      <EditBillSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        bill={editing}
        onArchive={archiveLater}
        onCloseAutoFocus={(event) => {
          if (!editing || !hidden.includes(editing.id)) return;
          event.preventDefault();
          title.current?.focus();
        }}
      />
      <FaturaSheet
        bill={fatura}
        open={faturaOpen}
        onOpenChange={setFaturaOpen}
        entrySheet={(props) => <TransactionSheet {...props} />}
      />
    </DashCard>
  );
};
