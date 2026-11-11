"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { todayISO } from "@/shared/lib/date";
import { parseBRL } from "@/shared/lib/money";
import { AmountInput } from "@/shared/ui/amount-input";
import { BrandButton } from "@/shared/ui/brand-button";
import { DateField } from "@/shared/ui/date-field";

const schema = z.object({
  amount: z.string().refine((value) => parseBRL(value) !== null, { message: "Informe um valor, como 1.250,00." }),
  date: z.string(),
});

export type Opening = z.infer<typeof schema>;

export const BalanceStep = ({
  defaultValues,
  onNext,
  onBack,
}: {
  defaultValues: Opening;
  onNext: (values: Opening) => void;
  onBack: (values: Opening) => void;
}) => {
  const form = useForm<Opening>({ resolver: zodResolver(schema), defaultValues });
  const { errors } = form.formState;

  return (
    <form noValidate onSubmit={form.handleSubmit(onNext)} className="flex flex-col gap-6">
      <h1 className="font-bold text-[22px] leading-7">Quanto você tem hoje?</h1>
      <FieldGroup className="gap-4">
        <Field className="gap-1.5" data-invalid={Boolean(errors.amount)}>
          <FieldLabel htmlFor="opening-amount">Saldo de hoje</FieldLabel>
          <Controller
            control={form.control}
            name="amount"
            render={({ field: { value, onChange, ...field } }) => (
              <AmountInput
                {...field}
                id="opening-amount"
                negative
                value={value}
                onValueChange={onChange}
                className="h-12 text-base tabular-nums md:text-base"
                aria-invalid={Boolean(errors.amount)}
              />
            )}
          />
          {errors.amount ? (
            <FieldError errors={[errors.amount]} />
          ) : (
            <FieldDescription>Somando suas contas. Pode ser negativo.</FieldDescription>
          )}
        </Field>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="opening-date">Data</FieldLabel>
          <Controller
            control={form.control}
            name="date"
            render={({ field: { value, onChange } }) => (
              <DateField
                id="opening-date"
                label="Data"
                value={value}
                onChange={onChange}
                max={todayISO()}
                className="min-h-12"
              />
            )}
          />
        </Field>
      </FieldGroup>
      <div className="flex flex-col gap-2">
        <BrandButton type="submit">Continuar</BrandButton>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 text-base text-muted-foreground"
          onClick={() => onBack(form.getValues())}
        >
          Voltar
        </Button>
      </div>
    </form>
  );
};
