"use client";

import { useState } from "react";

import { Info } from "lucide-react";
import { toast } from "sonner";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { useUpdateSettings } from "@/entities/settings/settings-query";
import type { Schemas } from "@/shared/api/client";
import { todayISO } from "@/shared/lib/date";
import { parseBRL } from "@/shared/lib/money";
import { cents } from "@/shared/lib/tier";
import { AmountInput } from "@/shared/ui/amount-input";
import { DateField } from "@/shared/ui/date-field";

type Opening = { opening_balance: string; opening_date: string };

const failed = () => toast.error("Não foi possível salvar.");

/** The balance everything starts from, and the day it was true; each saves on its own, with undo. */
export const OpeningForm = ({ settings }: { settings: Schemas["Settings"] }) => {
  const [amount, setAmount] = useState(settings.opening_balance);
  const [date, setDate] = useState(settings.opening_date);
  const [invalid, setInvalid] = useState(false);
  const save = useUpdateSettings();

  const restore = (previous: Partial<Opening>) =>
    save.mutate(previous, {
      onSuccess: () => {
        if (previous.opening_balance !== undefined) setAmount(previous.opening_balance);
        if (previous.opening_date !== undefined) setDate(previous.opening_date);
      },
      onError: failed,
    });

  const commit = (nextAmount: string, nextDate: string) => {
    const balance = parseBRL(nextAmount);
    setInvalid(balance === null);
    if (balance === null) return;
    const changed: Partial<Opening> = {};
    const previous: Partial<Opening> = {};
    if (cents(balance) !== cents(settings.opening_balance)) {
      changed.opening_balance = balance;
      previous.opening_balance = settings.opening_balance;
    }
    if (nextDate !== settings.opening_date) {
      changed.opening_date = nextDate;
      previous.opening_date = settings.opening_date;
    }
    if (Object.keys(changed).length === 0) return;
    save.mutate(changed, {
      onSuccess: () =>
        toast.success("Saldo inicial salvo", {
          id: "opening-undo",
          action: { label: "Desfazer", onClick: () => restore(previous) },
        }),
      onError: failed,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Field className="gap-2" data-invalid={invalid}>
        <FieldLabel htmlFor="opening-balance" className="font-semibold text-sm">
          Saldo Inicial da Conta Corrente
        </FieldLabel>
        <AmountInput
          id="opening-balance"
          negative
          value={amount}
          onValueChange={setAmount}
          onBlur={() => commit(amount, date)}
          className="h-16 rounded-2xl bg-muted font-bold text-3xl tabular-nums md:text-3xl"
          aria-invalid={invalid}
        />
        {invalid ? (
          <FieldError>Informe um valor, como 1.250,00.</FieldError>
        ) : (
          <FieldDescription className="flex items-start gap-1.5 text-xs">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            Usado para recalcular o fluxo desde o primeiro mês cadastrado.
          </FieldDescription>
        )}
      </Field>
      <Field className="gap-1.5">
        <FieldLabel htmlFor="opening-date">Data</FieldLabel>
        <DateField
          id="opening-date"
          label="Data"
          value={date}
          onChange={(next) => {
            setDate(next);
            commit(amount, next);
          }}
          max={todayISO()}
          className="min-h-12"
        />
      </Field>
    </div>
  );
};
