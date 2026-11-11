"use client";

import { useState } from "react";

import { Check, Clock } from "lucide-react";
import { toast } from "sonner";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type BillOfMonth, payDateFor, usePayBill, useUnpayBill } from "@/entities/bill/bill-queries";
import { billKey } from "@/entities/month/forecast-alert";
import { dueDays, subtitleOf } from "@/entities/month/schedule";
import { PayBillSheet } from "@/features/pay-bill/pay-bill-sheet";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { useCurrency } from "@/shared/lib/currency";
import { dayMonth, monthName, todayISO } from "@/shared/lib/date";
import { formatMoney } from "@/shared/lib/money";
import { cents, fromCents } from "@/shared/lib/tier";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { DashCard } from "@/shared/ui/dash-card";
import { Money } from "@/shared/ui/money";

type Filter = "all" | "open" | "paid";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "open", label: "Pendentes" },
  { value: "paid", label: "Pagas" },
];

/** `05` in the viewed month, `10/10` for a bill carried from an earlier one (D17). */
const chipDay = (date: string, month: string) => (date.startsWith(month) ? date.slice(8) : dayMonth(date));

const unpaidLabel = (count: number) => {
  if (count === 0) return "nenhuma conta a pagar";
  return count === 1 ? "1 conta a pagar" : `${count} contas a pagar`;
};

/** The earlier month a carried row is still unpaid in (D17), or null for the viewed month's own row. */
const carriedFrom = (bill: BillOfMonth, month: string) =>
  bill.due_date.startsWith(month) ? null : monthName(bill.due_date, month);

const badge = "inline-flex w-fit items-center gap-1 rounded-lg px-2 py-0.5 font-medium text-xs";

const Status = ({ bill, late }: { bill: BillOfMonth; late: string | null }) => {
  if (bill.paid) return <span className={cn(badge, "bg-income-soft text-tier-green-foreground")}>Pago</span>;
  if (bill.overdue)
    return (
      <span className={cn(badge, "bg-expense/15 text-expense")}>
        <Clock className="hidden size-3.5 shrink-0 sm:block" aria-hidden />
        {late ? `Venceu em ${late}` : `Venceu dia ${dayMonth(bill.due_date)}`}
      </span>
    );
  return <span className={cn(badge, "bg-muted text-muted-foreground")}>Vence dia {dayMonth(bill.due_date)}</span>;
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
    className="group/check -ml-2 flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
  >
    <span
      className={cn(
        "flex size-6 items-center justify-center rounded-full border-2 motion-safe:transition-[background-color,border-color,scale] motion-safe:duration-150",
        bill.paid && "border-income bg-income text-primary-foreground",
        !bill.paid && "scale-90 group-hover/check:border-income",
        !bill.paid && (bill.overdue ? "border-expense" : "border-muted-foreground/50"),
      )}
    >
      <Check
        className={cn("size-4 motion-safe:transition-[scale] motion-safe:duration-150", !bill.paid && "scale-0")}
        strokeWidth={3}
        aria-hidden
      />
    </span>
  </button>
);

const Row = ({
  bill,
  month,
  onPay,
  onUnpay,
  onAdjust,
  busy,
}: {
  bill: BillOfMonth;
  month: string;
  onPay: () => void;
  onUnpay: () => void;
  onAdjust: () => void;
  busy: boolean;
}) => {
  const currency = useCurrency();
  const late = carriedFrom(bill, month);
  const label = late ? `${bill.name} de ${late}` : bill.name;
  const amount = (
    <Money
      amount={bill.amount}
      className={cn("font-bold text-sm sm:text-base lg:text-lg", bill.overdue && "text-expense")}
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
      <CategoryIcon icon={bill.icon} color={bill.color} />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="max-w-full truncate font-medium text-base">{bill.name}</span>
        <Status bill={bill} late={late} />
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
    </li>
  );
};

/**
 * C3 `Contas a pagar` (spec 2026-11-10 §3.4): the open total, one chip per due day that filters the list
 * (a second tap clears it), and a round check that pays or undoes; the amount opens Pagar to adjust.
 */
export const BillsOfMonth = ({ view, className }: { view: Schemas["MonthView"]; className?: string }) => {
  const [filter, setFilter] = useState<Filter>("all");
  const [chosen, setChosen] = useState<{ month: string; date: string } | null>(null);
  const [adjusting, setAdjusting] = useState<BillOfMonth>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const pay = usePayBill();
  const unpay = useUnpayBill();
  const bills = view.bills_of_month;
  const day = chosen?.month === view.month ? chosen.date : null;
  const shown = bills.filter(
    (bill) => (filter === "all" || bill.paid === (filter === "paid")) && (day === null || bill.due_date === day),
  );
  const open = fromCents(bills.reduce((sum, bill) => sum + (bill.paid ? 0 : cents(bill.amount)), 0));
  const subtitle = subtitleOf(bills, todayISO());

  const payNow = (bill: BillOfMonth) => {
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

  const adjust = (bill: BillOfMonth) => {
    setAdjusting(bill);
    setSheetOpen(true);
  };

  if (bills.length === 0) return null;

  return (
    <DashCard title="Contas a pagar" action={{ href: "/ajustes/contas", label: "Ver todas" }} className={className}>
      <div className="flex flex-col gap-4">
        {subtitle && <p className="-mt-2 text-muted-foreground text-sm">{subtitle}</p>}
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <p className="flex flex-col">
            <span className="sr-only">Em aberto: </span>
            <Money amount={open} size="figure" />
            <span className="text-muted-foreground text-sm">
              {bills.filter((bill) => bill.paid).length} de {bills.length} pagas
            </span>
          </p>
          <ToggleGroup
            type="single"
            spacing={0}
            value={filter}
            onValueChange={(value: Filter | "") => value && setFilter(value)}
            aria-label="Filtrar contas"
            className="hidden rounded-xl bg-muted p-1 lg:flex"
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
        </div>
        <ToggleGroup
          type="single"
          value={day ?? ""}
          onValueChange={(date: string) => setChosen(date ? { month: view.month, date } : null)}
          aria-label="Filtrar por dia"
          className="-mx-4 w-auto max-w-none justify-start overflow-x-auto px-4 py-0.5 lg:-mx-6 lg:px-6"
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
        {shown.length === 0 ? (
          <p className="px-2 py-6 text-center text-muted-foreground">Nenhuma conta aqui.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {shown.map((bill) => (
              <Row
                key={billKey(bill)}
                bill={bill}
                month={view.month}
                onPay={() => payNow(bill)}
                onUnpay={() => undo(bill)}
                onAdjust={() => adjust(bill)}
                busy={pay.isPending || unpay.isPending}
              />
            ))}
          </ul>
        )}
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
