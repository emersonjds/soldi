"use client";

import { type FormEvent, useState } from "react";

import { toast } from "sonner";

import { type BillOfMonth, payDateFor, usePayBill } from "@/entities/bill/bill-queries";
import { positiveAmount, toInput } from "@/shared/lib/money";
import { BrandButton } from "@/shared/ui/brand-button";
import { DateChips } from "@/shared/ui/date-chips";
import { HeroAmount } from "@/shared/ui/hero-amount";
import { ResponsiveSheet } from "@/shared/ui/responsive-sheet";

const PayForm = ({ bill, month, onDone }: { bill: BillOfMonth; month: string; onDone: () => void }) => {
  const pay = usePayBill();
  const [input, setInput] = useState(toInput(bill.amount));
  const [date, setDate] = useState(payDateFor(month, bill.due_date));
  const [submitted, setSubmitted] = useState(false);
  const amount = positiveAmount(input);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!amount) return;
    onDone();
    pay.mutate(
      { billId: bill.bill_id, month, date, amount },
      { onError: () => toast.error("Não foi possível marcar como paga.") },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <HeroAmount id="pay-amount" value={input} onChange={setInput} invalid={submitted && !amount} />
      <DateChips legend="Quando pagou?" value={date} onChange={setDate} />
      <BrandButton type="submit">Confirmar</BrandButton>
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
export const PayBillSheet = ({ month, bill, open, onOpenChange }: PayBillSheetProps) => (
  <ResponsiveSheet
    open={open}
    onOpenChange={onOpenChange}
    title={bill ? `Pagar ${bill.name}` : "Pagar"}
    description="Valor e data do pagamento desta conta."
  >
    {bill && <PayForm key={bill.bill_id} bill={bill} month={month} onDone={() => onOpenChange(false)} />}
  </ResponsiveSheet>
);
