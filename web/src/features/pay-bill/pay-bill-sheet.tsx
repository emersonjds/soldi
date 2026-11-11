"use client";

import { type FormEvent, useState } from "react";

import { toast } from "sonner";

import { type BillOfMonth, payDateFor, usePayBill } from "@/entities/bill/bill-queries";
import { billKey } from "@/entities/month/forecast-alert";
import { monthName, todayISO } from "@/shared/lib/date";
import { positiveAmount } from "@/shared/lib/money";
import { BrandButton } from "@/shared/ui/brand-button";
import { DateChips } from "@/shared/ui/date-chips";
import { HeroAmount } from "@/shared/ui/hero-amount";
import { ResponsiveSheet, ResponsiveSheetFooter } from "@/shared/ui/responsive-sheet";

type Payment = { date: string; amount: string };

const PayForm = ({ bill, month, onPay }: { bill: BillOfMonth; month: string; onPay: (payment: Payment) => void }) => {
  const [input, setInput] = useState(bill.amount);
  const [date, setDate] = useState(payDateFor(month, bill.due_date));
  const [submitted, setSubmitted] = useState(false);
  const amount = positiveAmount(input);
  const [year, number] = month.split("-").map(Number);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!amount) return;
    onPay({ date, amount });
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <HeroAmount id="pay-amount" value={input} onChange={setInput} invalid={submitted && !amount} />
      <DateChips
        legend="Quando pagou?"
        value={date}
        onChange={setDate}
        min={`${month}-01`}
        max={`${month}-${new Date(year, number, 0).getDate()}`}
      />
      <ResponsiveSheetFooter>
        <BrandButton type="submit">Confirmar</BrandButton>
      </ResponsiveSheetFooter>
    </form>
  );
};

type PayBillSheetProps = {
  /** `YYYY-MM` being paid. */
  month: string;
  bill: BillOfMonth | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** `Pagar`: the bill's amount prefilled and editable, dated today. */
export const PayBillSheet = ({ month, bill, open, onOpenChange }: PayBillSheetProps) => {
  const pay = usePayBill();

  const confirm = (billId: string, payment: Payment) => {
    onOpenChange(false);
    pay.mutate({ billId, month, ...payment }, { onError: () => toast.error("Não foi possível marcar como paga.") });
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={bill ? `Pagar ${bill.name}` : "Pagar"}
      description={
        month === todayISO().slice(0, 7)
          ? "Valor e data do pagamento desta conta."
          : `Conta de ${monthName(month, month)}: a data do pagamento fica em ${monthName(month, month)}.`
      }
    >
      {bill && (
        <PayForm key={billKey(bill)} bill={bill} month={month} onPay={(payment) => confirm(bill.bill_id, payment)} />
      )}
    </ResponsiveSheet>
  );
};
