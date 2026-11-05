"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { parseBRL } from "@/shared/lib/money";
import { AmountInput } from "@/shared/ui/amount-input";
import { BrandButton } from "@/shared/ui/brand-button";

const schema = z.object({
  amount: z.string().refine((value) => parseBRL(value) !== null, { message: "Informe um valor, como 1.250,00." }),
  date: z.string().min(1, { message: "Informe a data." }),
});

export type Opening = z.infer<typeof schema>;

export const BalanceStep = ({
  defaultValues,
  onNext,
}: {
  defaultValues: Opening;
  onNext: (values: Opening) => void;
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
        <Field className="gap-1.5" data-invalid={Boolean(errors.date)}>
          <FieldLabel htmlFor="opening-date">Data</FieldLabel>
          <Input
            {...form.register("date")}
            id="opening-date"
            type="date"
            className="h-12 text-base md:text-base"
            aria-invalid={Boolean(errors.date)}
          />
          {errors.date && <FieldError errors={[errors.date]} />}
        </Field>
      </FieldGroup>
      <BrandButton type="submit">Continuar</BrandButton>
    </form>
  );
};
