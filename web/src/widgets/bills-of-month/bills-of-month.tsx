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
import { ALL_BILLS_PAID, countedBills, dueDays, nextDue } from "@/entities/month/schedule";
import { type Transaction, useTransactions } from "@/entities/transaction/transaction-queries";
import { TransactionSheet } from "@/features/add-transaction/transaction-sheet";
import { FaturaSheet } from "@/features/card-fatura/fatura-sheet";
import { EditBillSheet, useArchiveLater } from "@/features/edit-bill/edit-bill-sheet";
import { PayBillSheet } from "@/features/pay-bill/pay-bill-sheet";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { type Currency, useCurrency } from "@/shared/lib/currency";
import { addMonths, dayMonth, monthAbbrev, monthName, shortDay, todayISO } from "@/shared/lib/date";
import { formatMoney } from "@/shared/lib/money";
import { cents, fromCents } from "@/shared/lib/tier";
import { useStoredOpen } from "@/shared/lib/use-stored-open";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { DashCard } from "@/shared/ui/dash-card";
import { Money } from "@/shared/ui/money";
import { SectionToggle } from "@/shared/ui/section-toggle";

/** `05` in the viewed month, `10/10` for a bill carried from an earlier one (D17). */
const chipDay = (date: string, month: string) => (date.startsWith(month) ? date.slice(8) : dayMonth(date));

const paidOf = (bills: BillOfMonth[]) =>
  `${bills.filter((bill) => bill.paid).length} de ${bills.length} ${bills.length === 1 ? "paga" : "pagas"}`;

const overdueOf = (bills: BillOfMonth[]) => bills.filter((bill) => bill.overdue && !bill.paid).length;

/** Clock + `1 vencida`: never color alone. */
const Overdue = ({ count, lead = "" }: { count: number; lead?: string }) => (
  <span className="text-expense inline-flex items-center gap-1 whitespace-nowrap">
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

/** D56: a month's own amount is no estimate. */
const estimatedOf = (bill: BillOfMonth) => bill.variable && !bill.paid && !bill.adjusted && !bill.skipped;

/** `2 de 3 pagas · falta R$ X · 1 vencida`, or a tick once every bill of the group is paid. */
const Summary = ({ bills, currency }: { bills: BillOfMonth[]; currency: Currency }) => {
  const unpaid = bills.filter((bill) => !bill.paid);
  // ponytail: a group of only skipped months has nothing to count.
  if (bills.length === 0) return null;
  if (unpaid.length === 0)
    return (
      <span className="text-income-text flex items-center gap-1">
        <Check className="size-3.5 shrink-0" aria-hidden />
        {paidOf(bills)}
      </span>
    );
  const left = fromCents(unpaid.reduce((sum, bill) => sum + cents(bill.amount), 0));
  const late = overdueOf(bills);
  return (
    <span className="text-muted-foreground flex flex-wrap items-center gap-x-1">
      <span className="whitespace-nowrap">{paidOf(bills)}</span>{" "}
      <span className="whitespace-nowrap">
        · falta {unpaid.some(estimatedOf) && "≈ "}
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
  if (bill.skipped && !bill.installments) {
    const skipped = `pulada em ${monthName(bill.due_date, bill.due_date)}`;
    return (
      <>
        <span className="text-muted-foreground hidden text-xs lg:flex">{skipped}</span>
        <span className="text-muted-foreground flex text-xs whitespace-nowrap lg:hidden">{skipped}</span>
      </>
    );
  }
  const day = bill.due_date.slice(8);
  const late = bill.overdue && !bill.paid;
  let desktop = `Vence dia ${day}`;
  if (bill.paid) {
    let timing = "";
    if (paidOn) timing = paidOn <= bill.due_date ? " · Pago no prazo" : " · Pago com atraso";
    desktop = `${bill.due_date <= todayISO() ? "Venceu" : "Vence"} dia ${day}${timing}`;
  } else if (kindOf(bill) === "fixed" && bill.due_date > todayISO()) desktop += " · paga sozinha";
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
          "flex items-center gap-1 text-xs whitespace-nowrap lg:hidden",
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

/** SOL-186: a fixa pays itself on its due day, so undoing it reads Não paguei. */
const unpayWord = (bill: BillOfMonth) => (kindOf(bill) === "fixed" ? "Não paguei" : "Desmarcar");

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
    aria-label={bill.paid ? `${unpayWord(bill)} ${label}` : payLabel(bill, label)}
    title={bill.paid && kindOf(bill) === "fixed" ? "Não paguei" : undefined}
    onClick={onToggle}
    disabled={busy}
    className="group/check focus-visible:outline-ring -ml-2 hidden size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 disabled:opacity-60 lg:flex"
  >
    <span
      className={cn(
        "flex size-6 items-center justify-center rounded-full border-2 motion-safe:transition-[background-color,border-color,scale] motion-safe:duration-150",
        bill.paid && "border-income bg-income text-primary-foreground",
        !bill.paid && "group-hover/check:border-income scale-90",
        !bill.paid &&
          (bill.overdue ? "border-expense bg-expense text-primary-foreground" : "border-muted-foreground/50"),
      )}
    >
      {bill.overdue && !bill.paid ? (
        <span aria-hidden className="text-sm leading-none font-bold">
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
  onFixPayment,
  onOpenName,
  busy,
}: {
  bill: BillOfMonth;
  month: string;
  paidOn?: string;
  onPay: () => void;
  onUnpay: () => void;
  onAdjust: () => void;
  /** SOL-186: a paid fixa's amount opens its payment; unset until the payment loads. */
  onFixPayment?: () => void;
  /** SOL-119: a card's name area opens its fatura; SOL-153: any other bill's opens Editar conta, disabled while unset. */
  onOpenName?: () => void;
  busy: boolean;
}) => {
  const currency = useCurrency();
  const captionId = useId();
  const late = carriedFrom(bill, month);
  const title = billTitle(bill);
  const label = late ? `${title} de ${late}` : title;
  const estimated = estimatedOf(bill);
  let parcel =
    bill.installments &&
    (bill.installment === bill.installments
      ? "Última parcela"
      : `Parcela ${bill.installment}/${bill.installments} · termina em ${monthAbbrev(addMonths(bill.due_date.slice(0, 7), bill.installments - Number(bill.installment)))}`);
  if (parcel && bill.skipped) parcel = `Parcela ${bill.installment}/${bill.installments} · pulada`;
  const amount = (
    <span className="whitespace-nowrap">
      {estimated && <span aria-hidden>≈ </span>}
      <Money
        amount={bill.amount}
        className={cn(
          "text-sm sm:text-base lg:text-lg",
          bill.paid || bill.skipped ? "text-muted-foreground" : "font-bold",
          bill.overdue && "text-expense",
          bill.skipped && "line-through",
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
              "line-clamp-2 max-w-full text-base font-medium break-words",
              bill.paid && "lg:text-muted-foreground lg:line-through",
              bill.skipped && "text-muted-foreground line-through",
            )}
          >
            {title}
          </span>
          {parcel && (
            <>
              {" "}
              <span className="text-muted-foreground basis-full text-sm lg:basis-auto">
                <span className="hidden lg:inline">·</span>{" "}
                {[parcel, late && `venceu em ${late}`].filter(Boolean).join(" · ")}
              </span>
            </>
          )}
          {estimated && (
            <span className="text-muted-foreground basis-full text-sm whitespace-nowrap lg:basis-auto">
              <span className="hidden lg:inline"> ·</span> valor variável
            </span>
          )}
          {bill.adjusted && !bill.paid && !bill.skipped && (
            <span className="text-muted-foreground basis-full text-sm whitespace-nowrap lg:basis-auto">
              <span className="hidden lg:inline"> ·</span> valor ajustado
            </span>
          )}
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
      {bill.skipped ? (
        <span aria-hidden className="-ml-2 hidden size-11 shrink-0 lg:block" />
      ) : (
        <RoundCheck bill={bill} label={label} onToggle={bill.paid ? onUnpay : onPay} busy={busy} />
      )}
      <button
        type="button"
        aria-label={`${bill.is_card ? "Ver" : "Editar"} ${label}`}
        aria-describedby={captionId}
        onClick={onOpenName}
        disabled={!onOpenName}
        className="focus-visible:outline-ring flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-visible:outline-2 sm:gap-3"
      >
        {name}
        {onOpenName && <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />}
      </button>
      {bill.paid && kindOf(bill) === "fixed" && (
        <button
          type="button"
          aria-label={`${formatMoney(bill.amount, currency)}: ajustar valor pago de ${label}`}
          onClick={onFixPayment}
          disabled={!onFixPayment || busy}
          className="hover:bg-muted focus-visible:outline-ring min-h-11 shrink-0 rounded-lg px-1 transition-colors focus-visible:outline-2"
        >
          {amount}
        </button>
      )}
      {bill.paid && kindOf(bill) !== "fixed" && amount}
      {!bill.paid && (
        <button
          type="button"
          aria-label={
            bill.skipped
              ? `Abrir ${label} de ${monthName(bill.due_date, bill.due_date)}`
              : `${estimated ? "valor estimado " : ""}${formatMoney(bill.amount, currency)}: ajustar pagamento de ${label}`
          }
          onClick={onAdjust}
          className="hover:bg-muted focus-visible:outline-ring min-h-11 shrink-0 rounded-lg px-1 transition-colors focus-visible:outline-2"
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
  const expanded = useStoredOpen("bills");
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
  const payments = new Map(transactions.data?.map((transaction) => [transaction.id, transaction]));
  const [payment, setPayment] = useState<Transaction>();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const bills = view.bills_of_month.filter((bill) => !hidden.includes(bill.bill_id));
  const day = chosen?.month === view.month && bills.some((bill) => bill.due_date === chosen.date) ? chosen.date : null;
  const shown = bills.filter((bill) => day === null || bill.due_date === day);
  const counted = countedBills(bills);
  const late = overdueOf(counted);
  const next = nextDue(counted, todayISO());
  let upcoming =
    next &&
    `Próxima: dia ${next.due_date.slice(8)} · ${estimatedOf(next) ? "≈ " : ""}${formatMoney(next.amount, currency)}`;
  if (counted.length > 0 && counted.every((bill) => bill.paid)) upcoming = ALL_BILLS_PAID;
  const grouped = new Set(bills.map(kindOf)).size > 1;

  const adjust = (bill: BillOfMonth) => {
    setAdjusting(bill);
    setSheetOpen(true);
  };

  const payFailed = () => toast.error("Não foi possível marcar como paga.");

  // A fatura and a variable bill are paid only through the sheet (D28, D44).
  const payNow = (bill: BillOfMonth) => {
    if (bill.is_card || bill.variable) return adjust(bill);
    const month = bill.due_date.slice(0, 7);
    pay.mutate({ billId: bill.bill_id, month, date: payDateFor(month, bill.due_date) }, { onError: payFailed });
  };

  /** SOL-186: Desfazer books the payment again on its own date and amount; a fatura's has none. */
  const undo = (bill: BillOfMonth, paidOn?: string) => {
    const month = bill.due_date.slice(0, 7);
    const again = () =>
      pay.mutate(
        { billId: bill.bill_id, month, date: paidOn ?? bill.due_date, amount: bill.amount },
        { onError: payFailed },
      );
    unpay.mutate(
      { billId: bill.bill_id, month },
      {
        onSuccess: () =>
          toast(
            "Pagamento desfeito",
            bill.is_card ? undefined : { duration: 5000, action: { label: "Desfazer", onClick: again } },
          ),
        onError: () => toast.error("Não foi possível desfazer o pagamento."),
      },
    );
  };

  const fixPayment = (bill: BillOfMonth) => {
    const found = payments.get(bill.transaction_id ?? "");
    if (!found) return undefined;
    return () => {
      setPayment(found);
      setPaymentOpen(true);
    };
  };

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
          paidOn={payments.get(bill.transaction_id ?? "")?.date}
          onPay={() => payNow(bill)}
          onUnpay={() => undo(bill, payments.get(bill.transaction_id ?? "")?.date)}
          onAdjust={() => adjust(bill)}
          onFixPayment={fixPayment(bill)}
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
          className="focus-visible:outline-ring flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm focus-visible:outline-2"
        >
          <span aria-hidden className="bg-primary h-4 w-1 rounded-full lg:hidden" />
          Contas a pagar
          <span className="bg-muted text-muted-foreground inline-flex rounded-full px-2 text-xs leading-5 font-medium">
            {paidOf(counted)}
          </span>
        </span>
      }
      label="Contas a pagar"
      trailing={<SectionToggle open={expanded.open} onOpenChange={expanded.choose} label="Contas a pagar" />}
      className={className}
    >
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground -mt-2 flex flex-wrap gap-x-2 text-sm">
          {late > 0 && (
            <>
              <Overdue count={late} />{" "}
            </>
          )}
          {upcoming && <span className="whitespace-nowrap">{upcoming}</span>}
        </p>
        {expanded.open && (
          <>
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
                  className="border-border data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 gap-1.5 rounded-full! border px-4 text-base font-medium"
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
                        <CollapsibleTrigger className="group/trigger focus-visible:outline-ring flex min-h-11 w-full flex-col items-start gap-0.5 rounded-lg py-1 text-left text-sm focus-visible:outline-2">
                          <span className="flex w-full items-center justify-between gap-2 text-base font-medium">
                            {name}
                            <ChevronDown
                              className="text-muted-foreground size-4 shrink-0 group-data-[state=open]/trigger:rotate-180 motion-safe:transition-transform motion-safe:duration-150"
                              aria-hidden
                            />
                          </span>
                          <Summary bills={counted.filter((bill) => kindOf(bill) === kind)} currency={currency} />
                        </CollapsibleTrigger>
                      </h3>
                      <CollapsibleContent>{list(rows, name)}</CollapsibleContent>
                    </Collapsible>
                  );
                })
              : list(shown)}
            <Link
              href="/ajustes/contas"
              className="text-primary focus-visible:outline-ring inline-flex min-h-11 items-center self-start rounded-lg text-sm font-medium hover:underline focus-visible:outline-2"
            >
              Gerenciar contas fixas
            </Link>
          </>
        )}
      </div>

      <PayBillSheet
        month={adjusting?.due_date.slice(0, 7) ?? view.month}
        bill={adjusting}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onEditBill={adjusting && openName(adjusting)}
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
      {payment && <TransactionSheet open={paymentOpen} onOpenChange={setPaymentOpen} transaction={payment} />}
    </DashCard>
  );
};
