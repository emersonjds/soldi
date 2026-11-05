"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Controller, type UseFormRegister, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { categoriesQuery } from "@/entities/category/categories-query";
import type { Schemas } from "@/shared/api/client";
import { parseBRL } from "@/shared/lib/money";
import { AmountInput } from "@/shared/ui/amount-input";
import { BrandButton } from "@/shared/ui/brand-button";
import { PageError } from "@/shared/ui/page-state";

const row = z
  .object({ name: z.string(), amount: z.string(), due_day: z.string(), category_id: z.string() })
  .superRefine((bill, context) => {
    if (isBlank(bill)) return;
    if (!bill.name.trim()) context.addIssue({ code: "custom", path: ["name"], message: "Informe o nome." });
    const amount = parseBRL(bill.amount);
    if (!amount || amount.startsWith("-") || !/[1-9]/.test(amount))
      context.addIssue({ code: "custom", path: ["amount"], message: "Informe um valor maior que zero." });
    const day = Number(bill.due_day);
    if (!Number.isInteger(day) || day < 1 || day > 31)
      context.addIssue({ code: "custom", path: ["due_day"], message: "Escolha um dia de 1 a 31." });
    if (!bill.category_id)
      context.addIssue({ code: "custom", path: ["category_id"], message: "Escolha uma categoria." });
  });

const schema = z.object({ rows: z.array(row) });

type BillsForm = z.infer<typeof schema>;

export type BillRow = z.infer<typeof row>;

export const EMPTY_ROW: BillRow = { name: "", amount: "", due_day: "", category_id: "" };

const isBlank = (bill: BillRow) => !bill.name.trim() && !bill.amount.trim() && !bill.due_day.trim();

/** Rows the user left blank are dropped; the rest passed validation. */
export const toBills = (rows: BillRow[]): Schemas["CreateBill"][] =>
  rows
    .filter((bill) => !isBlank(bill))
    .map((bill) => ({
      name: bill.name.trim(),
      amount: parseBRL(bill.amount) ?? "",
      due_day: Number(bill.due_day),
      category_id: bill.category_id,
    }));

type BillsStepProps = {
  defaultRows: BillRow[];
  onNext: (rows: BillRow[]) => void;
  onSkip: () => void;
  onBack: (rows: BillRow[]) => void;
};

const CategoryChips = ({ index, register }: { index: number; register: UseFormRegister<BillsForm> }) => {
  const categories = useQuery(categoriesQuery);

  if (categories.isError)
    return <PageError message="Não foi possível carregar as categorias." onRetry={() => categories.refetch()} />;
  if (!categories.data)
    return (
      <div className="flex gap-2">
        <Skeleton className="h-11 w-24 rounded-full" />
        <Skeleton className="h-11 w-20 rounded-full" />
        <Skeleton className="h-11 w-28 rounded-full" />
      </div>
    );

  const bills = categories.data.filter((category) => category.kind === "bill");
  if (bills.length === 0) return <p className="text-muted-foreground text-sm">Nenhuma categoria de conta.</p>;

  return (
    <div className="flex flex-wrap gap-2">
      {bills.map((category) => (
        <label
          key={category.id}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-input px-4 font-medium text-sm transition-colors has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:outline-2 has-focus-visible:outline-ring"
        >
          <input type="radio" value={category.id} className="sr-only" {...register(`rows.${index}.category_id`)} />
          {category.name}
        </label>
      ))}
    </div>
  );
};

export const BillsStep = ({ defaultRows, onNext, onSkip, onBack }: BillsStepProps) => {
  const form = useForm<BillsForm>({ resolver: zodResolver(schema), defaultValues: { rows: defaultRows } });
  const rows = useFieldArray({ control: form.control, name: "rows" });
  const { errors } = form.formState;

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => onNext(values.rows))} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-bold text-[22px] leading-7">Suas contas fixas</h1>
        <p className="text-muted-foreground">Aluguel, luz, internet: o que se repete todo mês.</p>
      </div>
      {rows.fields.map((item, index) => {
        const rowErrors = errors.rows?.[index];
        return (
          <fieldset key={item.id} className="relative flex flex-col gap-4 rounded-2xl border p-4">
            <legend className="sr-only">Conta {index + 1}</legend>
            {rows.fields.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remover conta"
                className="absolute top-2 right-2 size-11"
                onClick={() => rows.remove(index)}
              >
                <Trash2 />
              </Button>
            )}
            <Field className="gap-1.5" data-invalid={Boolean(rowErrors?.name)}>
              <FieldLabel htmlFor={`bill-${index}-name`}>Nome</FieldLabel>
              <Input
                {...form.register(`rows.${index}.name`)}
                id={`bill-${index}-name`}
                placeholder="Aluguel"
                className="h-12 text-base md:text-base"
                aria-invalid={Boolean(rowErrors?.name)}
              />
              {rowErrors?.name && <FieldError errors={[rowErrors.name]} />}
            </Field>
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <Field className="gap-1.5" data-invalid={Boolean(rowErrors?.amount)}>
                <FieldLabel htmlFor={`bill-${index}-amount`}>Valor</FieldLabel>
                <Controller
                  control={form.control}
                  name={`rows.${index}.amount`}
                  render={({ field: { value, onChange, ...field } }) => (
                    <AmountInput
                      {...field}
                      id={`bill-${index}-amount`}
                      value={value}
                      onValueChange={onChange}
                      className="h-12 text-base tabular-nums md:text-base"
                      aria-invalid={Boolean(rowErrors?.amount)}
                    />
                  )}
                />
                {rowErrors?.amount && <FieldError errors={[rowErrors.amount]} />}
              </Field>
              <Field className="gap-1.5" data-invalid={Boolean(rowErrors?.due_day)}>
                <FieldLabel htmlFor={`bill-${index}-day`}>Dia</FieldLabel>
                <Input
                  {...form.register(`rows.${index}.due_day`)}
                  id={`bill-${index}-day`}
                  inputMode="numeric"
                  placeholder="10"
                  className="h-12 text-base tabular-nums md:text-base"
                  aria-invalid={Boolean(rowErrors?.due_day)}
                />
                {rowErrors?.due_day && <FieldError errors={[rowErrors.due_day]} />}
              </Field>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-medium text-sm">Categoria</legend>
              <CategoryChips index={index} register={form.register} />
              {rowErrors?.category_id && <FieldError errors={[rowErrors.category_id]} />}
            </fieldset>
          </fieldset>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 self-start px-2 font-semibold text-base text-primary"
        onClick={() => rows.append(EMPTY_ROW)}
      >
        <Plus />
        Adicionar outra
      </Button>
      <div className="flex flex-col gap-2">
        <BrandButton type="submit">Continuar</BrandButton>
        <Button type="button" variant="ghost" className="min-h-11 text-base" onClick={onSkip}>
          Pular por agora
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 text-base text-muted-foreground"
          onClick={() => onBack(form.getValues().rows)}
        >
          Voltar
        </Button>
      </div>
    </form>
  );
};
