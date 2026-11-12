"use client";

import { useState } from "react";

import { Check, Clock } from "lucide-react";
import { toast } from "sonner";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type BillOfMonth, billTitle, payDateFor, usePayBill, useUnpayBill } from "@/entities/bill/bill-queries";
import { BillStatus } from "@/entities/bill/bill-status";
import { billKey } from "@/entities/month/forecast-alert";
import { ALL_BILLS_PAID, dueDays, nextDue } from "@/entities/month/schedule";
import { useTransactions } from "@/entities/transaction/transaction-queries";
import { PayBillSheet } from "@/features/pay-bill/pay-bill-sheet";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { useCurrency } from "@/shared/lib/currency";
import { dayMonth, monthName, shortDay, todayISO } from "@/shared/lib/date";
import { formatMoney } from "@/shared/lib/money";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { DashCard } from "@/shared/ui/dash-card";
import { Money } from "@/shared/ui/money";

/** `05` in the viewed month, `10/10` for a bill carried from an earlier one (D17). */
const chipDay = (date: string, month: string) => (date.startsWith(month) ? date.slice(8) : dayMonth(date));

const registered = (count: number) => (count === 1 ? "1 obrigação cadastrada" : `${count} obrigações cadastradas`);

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
    aria-label={bill.paid ? `Desmarcar ${label}` : `Marcar ${label} como paga`}
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
  busy,
}: {
  bill: BillOfMonth;
  month: string;
  paidOn?: string;
  onPay: () => void;
  onUnpay: () => void;
  onAdjust: () => void;
  busy: boolean;
}) => {
  const currency = useCurrency();
  const late = carriedFrom(bill, month);
  const title = billTitle(bill);
  const label = late ? `${title} de ${late}` : title;
  const amount = (
    <Money
      amount={bill.amount}
      className={cn(
        "text-sm sm:text-base lg:text-lg",
        bill.paid ? "text-muted-foreground" : "font-bold",
        bill.overdue && "text-expense",
      )}
    />
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
      <CategoryIcon icon={bill.icon} color={bill.color} tintedOnDesktop />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span
          title={title}
          className={cn(
            "max-w-full truncate font-medium text-base",
            bill.paid && "lg:text-muted-foreground lg:line-through",
          )}
        >
          {title}
        </span>
        <Caption bill={bill} paidOn={paidOn} />
      </span>
      {bill.paid ? (
        amount
      ) : (
        <button
          type="button"
          aria-label={`${formatMoney(bill.amount, currency)}: ajustar pagamento de ${label}`}
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
 * C3 `Contas a pagar` (spec 2026-11-10 §3.4, 2026-11-11): the paid count, one chip per due day that filters the list
 * (a second tap clears it), and a round check that pays or undoes; the amount opens Pagar to adjust.
 */
export const BillsOfMonth = ({ view, className }: { view: Schemas["MonthView"]; className?: string }) => {
  const [chosen, setChosen] = useState<{ month: string; date: string } | null>(null);
  const [adjusting, setAdjusting] = useState<BillOfMonth>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const pay = usePayBill();
  const unpay = useUnpayBill();
  const currency = useCurrency();
  const transactions = useTransactions(view.month);
  const paidOn = new Map(transactions.data?.map((transaction) => [transaction.id, transaction.date]));
  const bills = view.bills_of_month;
  const day = chosen?.month === view.month ? chosen.date : null;
  const shown = bills.filter((bill) => day === null || bill.due_date === day);
  const paid = bills.filter((bill) => bill.paid).length;
  const next = nextDue(bills, todayISO());
  let upcoming = next && `Próxima: dia ${next.due_date.slice(8)} · ${formatMoney(next.amount, currency)}`;
  if (paid === bills.length) upcoming = ALL_BILLS_PAID;

  const adjust = (bill: BillOfMonth) => {
    setAdjusting(bill);
    setSheetOpen(true);
  };

  // A fatura is paid only through the sheet: the API wants its amount (D28).
  const payNow = (bill: BillOfMonth) => {
    if (bill.is_card) return adjust(bill);
    const month = bill.due_date.slice(0, 7);
    pay.mutate(
      { billId: bill.bill_id, month, date: payDateFor(month, bill.due_date) },
      { onError: () => toast.error("Não foi possível marcar como paga.") },
    );
  };

  const undo = (bill: BillOfMonth) =>
    unpay.mutate(
      { billId: bill.bill_id, month: bill.due_date.slice(0, 7) },
      {
        onSuccess: () => toast("Pagamento desfeito"),
        onError: () => toast.error("Não foi possível desfazer o pagamento."),
      },
    );

  if (bills.length === 0) return null;

  return (
    <DashCard
      title={
        <span className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span aria-hidden className="h-4 w-1 rounded-full bg-primary lg:hidden" />
            <span className="lg:hidden">Contas do Mês</span>
            <span className="hidden lg:inline">Contas a pagar</span>
            <span className="hidden rounded-full bg-muted px-2 font-medium text-muted-foreground text-xs leading-5 lg:inline-flex">
              {paid} de {bills.length} pagas
            </span>
          </span>
          <span className="font-normal text-muted-foreground text-xs lg:hidden">{registered(bills.length)}</span>
        </span>
      }
      label="Contas a pagar"
      action={{ href: "/ajustes/contas", label: "Ver todas" }}
      className={className}
    >
      <div className="flex flex-col gap-4">
        <div className="hidden items-center justify-between gap-4 lg:flex">
          <p className="shrink-0 text-muted-foreground text-sm">{upcoming}</p>
          <ToggleGroup
            type="single"
            value={day ?? ""}
            onValueChange={(date: string) => setChosen(date ? { month: view.month, date } : null)}
            aria-label="Filtrar por dia"
            className="min-w-0 overflow-x-auto py-0.5"
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
        </div>
        <ul className="flex flex-col gap-1">
          {shown.map((bill) => (
            <Row
              key={billKey(bill)}
              bill={bill}
              month={view.month}
              paidOn={paidOn.get(bill.transaction_id ?? "")}
              onPay={() => payNow(bill)}
              onUnpay={() => undo(bill)}
              onAdjust={() => adjust(bill)}
              busy={pay.isPending || unpay.isPending}
            />
          ))}
        </ul>
      </div>

      <PayBillSheet
        month={adjusting?.due_date.slice(0, 7) ?? view.month}
        bill={adjusting}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </DashCard>
  );
};
