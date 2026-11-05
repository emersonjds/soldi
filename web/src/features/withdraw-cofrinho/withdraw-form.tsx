"use client";

import { type FormEvent, useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Cofrinho, useWithdraw } from "@/entities/cofrinho/cofrinho-queries";
import { hasProblem } from "@/shared/api/client";
import { useCurrency } from "@/shared/lib/currency";
import { todayISO } from "@/shared/lib/date";
import { formatMoney, positiveAmount } from "@/shared/lib/money";
import { BrandButton } from "@/shared/ui/brand-button";
import { DateChips } from "@/shared/ui/date-chips";
import { HeroAmount } from "@/shared/ui/hero-amount";

/** `Resgatar`: an amount up to the balance, a day and a note; the money comes back as an income entry. */
export const WithdrawForm = ({
  cofrinho,
  onDone,
  onCancel,
}: {
  cofrinho: Cofrinho;
  onDone: () => void;
  onCancel: () => void;
}) => {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const withdraw = useWithdraw();
  const currency = useCurrency();
  const valid = positiveAmount(amount);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!valid) return;
    withdraw.mutate(
      { categoryId: cofrinho.category_id, date, amount: valid, note: note.trim() || null },
      {
        onSuccess: () => {
          toast.success("Resgate feito");
          onDone();
        },
      },
    );
  };

  const problem =
    withdraw.error &&
    (hasProblem(withdraw.error, "insufficient-cofrinho")
      ? `Você só tem ${formatMoney(cofrinho.balance, currency)} guardado aqui`
      : "Não foi possível resgatar.");

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <HeroAmount id="withdraw-amount" value={amount} onChange={setAmount} invalid={submitted && !valid} />
      <DateChips legend="Quando?" value={date} onChange={setDate} />
      <div className="flex flex-col gap-2">
        <label htmlFor="withdraw-note" className="font-semibold text-sm">
          Observação
        </label>
        <Input
          id="withdraw-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Opcional"
          maxLength={500}
          className="h-12 rounded-xl bg-muted text-base md:text-base"
        />
      </div>
      {problem && (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <BrandButton type="submit" disabled={withdraw.isPending}>
          Confirmar resgate
        </BrandButton>
        <Button type="button" variant="ghost" className="min-h-11 text-base" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
};
