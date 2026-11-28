"use client";

import { type FormEvent, type ReactNode, useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  type BillOfMonth,
  billTitle,
  type MonthState,
  monthStateOf,
  payDateFor,
  useBills,
  usePayBill,
  useSetBillMonth,
} from "@/entities/bill/bill-queries";
import { billKey } from "@/entities/month/forecast-alert";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/shared/lib/currency";
import { dayMonth, monthName, todayISO } from "@/shared/lib/date";
import { formatMoney, positiveAmount } from "@/shared/lib/money";
import { cents } from "@/shared/lib/tier";
import { BrandButton } from "@/shared/ui/brand-button";
import { DateChips } from "@/shared/ui/date-chips";
import { HeroAmount } from "@/shared/ui/hero-amount";
import { ResponsiveSheet, ResponsiveSheetFooter } from "@/shared/ui/responsive-sheet";

type Payment = { date: string; amount: string };

const textButton = "text-primary min-h-11 flex-1 whitespace-normal";

type Actions = {
  mes: string;
  normal: string | undefined;
  busy: boolean;
  onSave: (amount: string) => void;
  onNormal: () => void;
  onSkip: () => void;
  onEditBill: (() => void) | undefined;
};

const Tertiary = ({ left, onEditBill, busy }: { left?: ReactNode; onEditBill?: () => void; busy: boolean }) => (
  <div className="flex gap-2">
    {left}
    <Button type="button" variant="ghost" className={textButton} disabled={busy || !onEditBill} onClick={onEditBill}>
      Editar conta
    </Button>
  </div>
);

const PayForm = ({
  bill,
  month,
  onPay,
  actions,
}: {
  bill: BillOfMonth;
  month: string;
  onPay: (payment: Payment) => void;
  /** Absent on a card: its sheet is Pagar only. */
  actions?: Actions;
}) => {
  const [input, setInput] = useState(bill.amount);
  const [date, setDate] = useState(payDateFor(month, bill.due_date));
  const [submitted, setSubmitted] = useState(false);
  const amount = positiveAmount(input);
  const [year, number] = month.split("-").map(Number);
  const busy = actions?.busy ?? false;
  const normal = actions?.normal;
  const changed = actions !== undefined && amount !== null && cents(amount) !== cents(bill.amount);
  const currency = useCurrency();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!amount) return;
    onPay({ date, amount });
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <HeroAmount
        id="pay-amount"
        label={actions && `Valor de ${actions.mes}`}
        value={input}
        onChange={setInput}
        invalid={submitted && !amount}
      />
      {bill.is_card && (
        <p className="text-muted-foreground -mt-3 text-center text-sm">Confira com a fatura do banco.</p>
      )}
      {actions && normal && (changed || bill.adjusted) && (
        <div className="text-muted-foreground -mt-3 flex flex-col items-center text-center text-sm">
          {changed && (
            <p>
              Só {actions.mes} muda. Os outros meses seguem {formatMoney(normal, currency)}.
            </p>
          )}
          {bill.adjusted && (
            <>
              <p>Valor ajustado · o normal é {formatMoney(normal, currency)}</p>
              <Button type="button" variant="link" className="min-h-11" disabled={busy} onClick={actions.onNormal}>
                Voltar ao valor normal
              </Button>
            </>
          )}
        </div>
      )}
      <DateChips
        legend="Quando pagou?"
        value={date}
        onChange={setDate}
        min={`${month}-01`}
        max={`${month}-${new Date(year, number, 0).getDate()}`}
      />
      <ResponsiveSheetFooter>
        <BrandButton type="submit" disabled={busy}>
          Pagar
        </BrandButton>
        {actions && changed && amount && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full whitespace-normal"
            disabled={busy}
            onClick={() => actions.onSave(amount)}
          >
            Salvar valor de {actions.mes}
          </Button>
        )}
        {actions && (
          <Tertiary
            busy={busy}
            onEditBill={actions.onEditBill}
            left={
              <Button type="button" variant="ghost" className={textButton} disabled={busy} onClick={actions.onSkip}>
                Pular {actions.mes}
              </Button>
            }
          />
        )}
      </ResponsiveSheetFooter>
    </form>
  );
};

const descriptionOf = (bill: BillOfMonth) => {
  const due = dayMonth(bill.due_date);
  if (bill.overdue) return `Venceu dia ${due}`;
  if (bill.variable) return "Valor variável · confira o boleto";
  if (bill.installment && bill.installments)
    return `Parcela ${bill.installment}/${bill.installments} · vence dia ${due}`;
  return `Conta fixa · vence dia ${due}`;
};

type PayBillSheetProps = {
  /** `YYYY-MM` of the occurrence. */
  month: string;
  bill: BillOfMonth | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Today's Editar conta for the whole series; undefined while the bills load. */
  onEditBill?: () => void;
  onCloseAutoFocus?: (event: Event) => void;
};

/** D56: one month of a conta — Pagar, its own amount, Pular or Voltar a cobrar; a card's fatura keeps Pagar only. */
export const PayBillSheet = ({ month, bill, open, onOpenChange, onEditBill, onCloseAutoFocus }: PayBillSheetProps) => {
  const pay = usePayBill();
  const setMonth = useSetBillMonth();
  const normal = useBills({ includeInactive: true }).data?.find(({ id }) => id === bill?.bill_id)?.amount ?? undefined;
  const mes = monthName(month, month);
  const Mes = `${mes[0].toUpperCase()}${mes.slice(1)}`;
  const otherMonth = month === todayISO().slice(0, 7) ? null : `Conta de ${mes}: a data do pagamento fica em ${mes}.`;

  const confirm = (billId: string, payment: Payment) => {
    onOpenChange(false);
    pay.mutate({ billId, month, ...payment }, { onError: () => toast.error("Não foi possível marcar como paga.") });
  };

  if (!bill || bill.is_card)
    return (
      <ResponsiveSheet
        open={open}
        onOpenChange={onOpenChange}
        title={bill ? `Pagar ${billTitle(bill)}` : "Pagar"}
        description={otherMonth ?? "Valor e data do pagamento desta conta."}
      >
        {bill && (
          <PayForm key={billKey(bill)} bill={bill} month={month} onPay={(payment) => confirm(bill.bill_id, payment)} />
        )}
      </ResponsiveSheet>
    );

  const change = (next: MonthState, done: string, failed: string) => {
    const previous = monthStateOf(bill);
    const base = { billId: bill.bill_id, month, normal };
    onOpenChange(false);
    setMonth.mutate(
      { ...base, ...next },
      {
        onSuccess: () =>
          toast(done, {
            duration: 5000,
            action: {
              label: "Desfazer",
              onClick: () => setMonth.mutate({ ...base, ...previous }, { onError: () => toast.error(failed) }),
            },
          }),
        onError: () => toast.error(failed),
      },
    );
  };
  const own = bill.adjusted ? bill.amount : null;
  const editBill =
    onEditBill &&
    (() => {
      onOpenChange(false);
      onEditBill();
    });
  const lines = bill.skipped
    ? [`${Mes} pulado: esta conta não cobra neste mês.`]
    : [descriptionOf(bill), ...(otherMonth ? [otherMonth] : [])];

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`${bill.name} · ${mes}`}
      description={lines.join(" ")}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <div aria-hidden className="text-muted-foreground -mt-4 flex flex-col gap-1 text-sm">
        {lines.map((line) => (
          <p key={line} className={cn(line.startsWith("Venceu") && "text-expense font-medium")}>
            {line}
          </p>
        ))}
      </div>
      {bill.skipped ? (
        <ResponsiveSheetFooter>
          <BrandButton
            type="button"
            disabled={setMonth.isPending}
            onClick={() =>
              change(
                { amount: own, skipped: false },
                `${bill.name} volta a cobrar em ${mes}`,
                "Não foi possível voltar a cobrar. Tente de novo.",
              )
            }
          >
            Voltar a cobrar
          </BrandButton>
          <Tertiary busy={setMonth.isPending} onEditBill={editBill} />
        </ResponsiveSheetFooter>
      ) : (
        <PayForm
          key={billKey(bill)}
          bill={bill}
          month={month}
          onPay={(payment) => confirm(bill.bill_id, payment)}
          actions={{
            mes,
            normal,
            busy: setMonth.isPending,
            onSave: (amount) =>
              change(
                { amount, skipped: false },
                `Valor de ${mes} ajustado`,
                "Não foi possível ajustar o valor. Tente de novo.",
              ),
            onNormal: () =>
              change(
                { amount: null, skipped: false },
                "Valor normal de volta",
                "Não foi possível voltar ao valor normal. Tente de novo.",
              ),
            onSkip: () =>
              change(
                { amount: own, skipped: true },
                `${Mes} pulado`,
                "Não foi possível pular este mês. Tente de novo.",
              ),
            onEditBill: editBill,
          }}
        />
      )}
    </ResponsiveSheet>
  );
};
