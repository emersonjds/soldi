"use client";

import { type FormEvent, useState } from "react";

import { toast } from "sonner";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useUpdateSettings } from "@/entities/settings/settings-query";
import type { Schemas } from "@/shared/api/client";
import { parseBRL, toInput } from "@/shared/lib/money";
import { BrandButton } from "@/shared/ui/brand-button";

/** The balance everything starts from, and the day it was true. */
export const OpeningForm = ({ settings }: { settings: Schemas["Settings"] }) => {
  const [amount, setAmount] = useState(toInput(settings.opening_balance));
  const [date, setDate] = useState(settings.opening_date);
  const [submitted, setSubmitted] = useState(false);
  const save = useUpdateSettings();
  const balance = parseBRL(amount);
  const invalid = submitted && balance === null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (balance === null) return;
    save.mutate(
      { opening_balance: balance, opening_date: date },
      {
        onSuccess: () => toast.success("Saldo inicial salvo"),
        onError: () => toast.error("Não foi possível salvar."),
      },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6">
        <Field className="gap-1.5" data-invalid={invalid}>
          <FieldLabel htmlFor="opening-balance">Saldo inicial</FieldLabel>
          <Input
            id="opening-balance"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="h-12 text-base tabular-nums md:text-base"
            aria-invalid={invalid}
          />
          {invalid ? (
            <FieldError>Informe um valor, como 1.250,00.</FieldError>
          ) : (
            <FieldDescription>Somando suas contas. Pode ser negativo.</FieldDescription>
          )}
        </Field>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="opening-date">Data</FieldLabel>
          <Input
            id="opening-date"
            type="date"
            required
            value={date}
            onChange={(event) => event.target.value && setDate(event.target.value)}
            className="h-12 text-base md:text-base"
          />
        </Field>
      </div>
      <BrandButton type="submit" className="lg:w-auto lg:self-start lg:px-8">
        Salvar
      </BrandButton>
    </form>
  );
};
