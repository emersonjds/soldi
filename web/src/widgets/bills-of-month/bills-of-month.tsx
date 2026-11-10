"use client";

import { useState } from "react";

import Link from "next/link";

import { Check, CircleCheck, Clock, Info, ReceiptText, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type BillOfMonth, payDateFor, usePayBill, useUnpayBill } from "@/entities/bill/bill-queries";
import { billKey } from "@/entities/month/forecast-alert";
import { PayBillSheet } from "@/features/pay-bill/pay-bill-sheet";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { useCurrency } from "@/shared/lib/currency";
import { dayMonth, monthName, todayISO } from "@/shared/lib/date";
import { formatMoney } from "@/shared/lib/money";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { Money } from "@/shared/ui/money";

type Filter = "all" | "open" | "paid";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "open", label: "Pendentes" },
  { value: "paid", label: "Pagas" },
];

const daysFromToday = (date: string) => (Date.parse(date) - Date.parse(todayISO())) / 86_400_000;

const whenDue = (date: string) => {
  const days = daysFromToday(date);
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  return `em ${days} dias`;
};

const Footer = ({ bills }: { bills: BillOfMonth[] }) => {
  const next = bills
    .filter((bill) => !bill.paid && !bill.overdue)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  if (!next && bills.some((bill) => !bill.paid)) return null;
  return (
    <p className="flex items-center gap-2 rounded-xl bg-muted px-4 py-3 text-muted-foreground text-sm">
      {next ? (
        <>
          <Info className="size-4 shrink-0" aria-hidden />
          <span>
            Próximo vencimento: <strong className="font-semibold text-foreground">{next.name}</strong>{" "}
            {whenDue(next.due_date)}
          </span>
        </>
      ) : (
        <>
          <CircleCheck className="size-4 shrink-0 text-income" aria-hidden />
          Todas as contas do mês pagas
        </>
      )}
    </p>
  );
};

// The pill draws 32px tall like the design; the ::after stretches the touch target to 44px.
const pill =
  "relative inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 font-semibold text-sm transition-colors after:absolute after:inset-x-0 after:-inset-y-1.5 focus-visible:outline-2 focus-visible:outline-ring lg:h-10 lg:px-4 lg:text-base";

const Pill = ({
  bill,
  label,
  onPay,
  onUnpay,
}: {
  bill: BillOfMonth;
  label: string;
  onPay: () => void;
  onUnpay: () => void;
}) => {
  if (bill.paid)
    return (
      <button
        type="button"
        aria-label={`Pago: desfazer ${label}`}
        onClick={onUnpay}
        className={cn(pill, "bg-income-soft text-income")}
      >
        <Check className="size-4" aria-hidden />
        Pago
      </button>
    );
  if (bill.overdue)
    return (
      <button
        type="button"
        aria-label={`Pagar ${label}, vencida`}
        onClick={onPay}
        className={cn(pill, "bg-expense/15 text-expense")}
      >
        <TriangleAlert className="hidden size-4 sm:block" aria-hidden />
        Vencido
      </button>
    );
  return (
    <button
      type="button"
      aria-label={`Pagar ${label}`}
      onClick={onPay}
      className={cn(pill, "bg-secondary text-primary hover:bg-secondary/70")}
    >
      Pagar
    </button>
  );
};

/** The earlier month a carried row is still unpaid in (D17), or null for the viewed month's own row. */
const carriedFrom = (bill: BillOfMonth, month: string) =>
  bill.due_date.startsWith(month) ? null : monthName(bill.due_date, month);

const Row = ({
  bill,
  month,
  onPay,
  onUnpay,
  onAdjust,
}: {
  bill: BillOfMonth;
  month: string;
  onPay: () => void;
  onUnpay: () => void;
  onAdjust: () => void;
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
      <CategoryIcon icon={bill.icon} color={bill.color} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-base">{bill.name}</span>
        {bill.overdue ? (
          <span className="flex items-start gap-1 text-expense text-xs">
            <Clock className="mt-px size-3.5 shrink-0" aria-hidden />
            {late ? `Venceu em ${late}` : `Venceu dia ${dayMonth(bill.due_date)}`}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">Vence dia {dayMonth(bill.due_date)}</span>
        )}
      </span>
      {bill.paid ? (
        amount
      ) : (
        <button
          type="button"
          aria-label={`${formatMoney(bill.amount, currency)}: ajustar pagamento de ${label}`}
          onClick={onAdjust}
          className="min-h-11 shrink-0 rounded-lg transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          {amount}
        </button>
      )}
      <Pill bill={bill} label={label} onPay={onPay} onUnpay={onUnpay} />
    </li>
  );
};

const seeAll = "inline-flex min-h-11 items-center font-semibold text-primary text-sm hover:underline";

/** `Contas do Mês`: one tap pays a bill, a tap on Pago undoes it; the amount opens Pagar to adjust. */
export const BillsOfMonth = ({ view, className }: { view: Schemas["MonthView"]; className?: string }) => {
  const [filter, setFilter] = useState<Filter>("all");
  const [adjusting, setAdjusting] = useState<BillOfMonth>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const pay = usePayBill();
  const unpay = useUnpayBill();
  const bills = view.bills_of_month;
  const shown = bills.filter((bill) => filter === "all" || bill.paid === (filter === "paid"));
  const count = bills.filter((bill) => bill.due_date.startsWith(view.month)).length;

  const payNow = (bill: BillOfMonth) => {
    const month = bill.due_date.slice(0, 7);
    pay.mutate(
      { billId: bill.bill_id, month, date: payDateFor(month, bill.due_date) },
      { onError: () => toast.error("Não foi possível marcar como paga.") },
    );
  };

  const undo = (bill: BillOfMonth) =>
    unpay.mutate(
      { billId: bill.bill_id, month: view.month },
      {
        onSuccess: () => toast("Pagamento desfeito"),
        onError: () => toast.error("Não foi possível desfazer o pagamento."),
      },
    );

  const adjust = (bill: BillOfMonth) => {
    setAdjusting(bill);
    setSheetOpen(true);
  };

  return (
    <section
      aria-labelledby="bills-title"
      className={cn("flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6", className)}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span aria-hidden className="mt-1 h-6 w-1.5 shrink-0 rounded-full bg-brand" />
          <div className="flex min-w-0 flex-col">
            <h2 id="bills-title" className="font-semibold text-lg leading-6 lg:text-[22px] lg:leading-7">
              Contas do Mês
            </h2>
            {count > 0 && (
              <p className="text-muted-foreground text-sm">
                {count === 1 ? "1 obrigação cadastrada" : `${count} obrigações cadastradas`}
              </p>
            )}
          </div>
        </div>
        {count > 0 && (
          <>
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
            <Link href="/ajustes/contas" className={seeAll}>
              Ver todas
            </Link>
          </>
        )}
      </div>

      {count === 0 ? (
        <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
            <ReceiptText className="size-6" aria-hidden />
          </span>
          <p className="text-muted-foreground">Nenhuma conta fixa ainda</p>
          <Link href="/ajustes/contas" className={seeAll}>
            Cadastrar contas
          </Link>
        </div>
      ) : (
        <>
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
                />
              ))}
            </ul>
          )}
          <Footer bills={bills} />
        </>
      )}

      <PayBillSheet
        month={adjusting?.due_date.slice(0, 7) ?? view.month}
        bill={adjusting}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </section>
  );
};
