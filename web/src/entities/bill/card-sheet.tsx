"use client";

import { type FormEvent, useId, useState } from "react";

import { Check } from "lucide-react";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { problemMessage } from "@/shared/api/client";
import { BrandButton } from "@/shared/ui/brand-button";
import { ResponsiveSheet, ResponsiveSheetFooter } from "@/shared/ui/responsive-sheet";

import { type Bill, useCreateBill } from "./bill-queries";
import { asDay, ClosingDay, DueDay } from "./day-fields";

const CardForm = ({
  onSaved,
  onOpenChange,
}: {
  onSaved: (card: Bill) => void;
  onOpenChange: (open: boolean) => void;
}) => {
  const create = useCreateBill();
  const nameId = useId();
  const [name, setName] = useState("");
  const [closingDay, setClosingDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const trimmed = name.trim();
  const closing = asDay(closingDay);
  const due = asDay(dueDay);
  const dayError = "Escolha um dia de 1 a 31.";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // React bubbles the submit through the portal to the Lançar form around the sheet.
    event.stopPropagation();
    setSubmitted(true);
    if (!trimmed || !closing || !due) return;
    create.mutate(
      { name: trimmed, due_day: due, closing_day: closing },
      {
        onSuccess: (card) => {
          onSaved(card);
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <Field className="gap-1.5" data-invalid={submitted && !trimmed}>
        <FieldLabel htmlFor={nameId}>Nome do cartão</FieldLabel>
        <Input
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          className="h-12 text-base md:text-base"
          aria-invalid={submitted && !trimmed}
        />
        {submitted && !trimmed && <FieldError>Informe o nome.</FieldError>}
      </Field>
      <ClosingDay value={closingDay} error={submitted && !closing ? dayError : undefined} onChange={setClosingDay} />
      <DueDay
        label="Dia do vencimento"
        value={dueDay}
        error={submitted && !due ? dayError : undefined}
        onChange={setDueDay}
      />
      {create.error && (
        <p role="alert" className="text-destructive text-sm">
          {problemMessage(create.error) ?? "Não foi possível criar o cartão."}
        </p>
      )}
      <ResponsiveSheetFooter>
        <BrandButton type="submit" disabled={create.isPending}>
          <Check className="size-5" />
          Criar cartão
        </BrandButton>
      </ResponsiveSheetFooter>
    </form>
  );
};

/** `Novo cartão`: a credit card from its name and days; the server files it in the card group (D43). */
export const CardSheet = ({
  open,
  onOpenChange,
  onSaved,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (card: Bill) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) => (
  <ResponsiveSheet
    open={open}
    onOpenChange={onOpenChange}
    onCloseAutoFocus={onCloseAutoFocus}
    title="Novo cartão"
    description="O nome do cartão, o dia em que a fatura fecha e o dia em que vence."
  >
    <CardForm onSaved={onSaved} onOpenChange={onOpenChange} />
  </ResponsiveSheet>
);
