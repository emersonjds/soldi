"use client";

import { type FormEvent, useState } from "react";

import { Archive } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { type Bill, useCreateBill, useUpdateBill } from "@/entities/bill/bill-queries";
import { CategoryChips, useCategoryChips } from "@/entities/category/category-chips";
import type { Schemas } from "@/shared/api/client";
import { positiveAmount, toInput } from "@/shared/lib/money";
import { BrandButton } from "@/shared/ui/brand-button";
import { ResponsiveSheet } from "@/shared/ui/responsive-sheet";

type Draft = { name: string; amount: string; dueDay: string; categoryId?: string; active: boolean };

const input = "h-12 text-base md:text-base";

type Fields = Schemas["CreateBill"] & { active: boolean };

const BillForm = ({
  bill,
  onSave,
  onArchive,
}: {
  bill?: Bill;
  onSave: (fields: Fields) => void;
  onArchive: (bill: Bill) => void;
}) => {
  const [draft, setDraft] = useState<Draft>(
    bill
      ? {
          name: bill.name,
          amount: toInput(bill.amount),
          dueDay: String(bill.due_day),
          categoryId: bill.category_id,
          active: bill.active,
        }
      : { name: "", amount: "", dueDay: "", active: true },
  );
  const [submitted, setSubmitted] = useState(false);
  const categories = useCategoryChips("bill");
  const category = categories.data?.find((each) => each.id === draft.categoryId) ?? categories.data?.[0];

  const name = draft.name.trim();
  const amount = positiveAmount(draft.amount);
  const day = Number(draft.dueDay);
  const dayValid = /^\d{1,2}$/.test(draft.dueDay) && day >= 1 && day <= 31;
  const errors = {
    name: submitted && !name ? "Informe o nome." : undefined,
    amount: submitted && !amount ? "Informe um valor maior que zero." : undefined,
    day: submitted && !dayValid ? "Escolha um dia de 1 a 31." : undefined,
  };

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!name || !amount || !dayValid || !category) return;
    onSave({ name, amount, due_day: day, category_id: category.id, active: draft.active });
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <Field className="gap-1.5" data-invalid={Boolean(errors.name)}>
        <FieldLabel htmlFor="bill-name">Nome</FieldLabel>
        <Input
          id="bill-name"
          value={draft.name}
          onChange={(event) => set({ name: event.target.value })}
          placeholder="Aluguel"
          maxLength={100}
          className={input}
          aria-invalid={Boolean(errors.name)}
        />
        {errors.name && <FieldError>{errors.name}</FieldError>}
      </Field>
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <Field className="gap-1.5" data-invalid={Boolean(errors.amount)}>
          <FieldLabel htmlFor="bill-amount">Valor</FieldLabel>
          <Input
            id="bill-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            value={draft.amount}
            onChange={(event) => set({ amount: event.target.value.replace(/[^\d.,]/g, "") })}
            className={`${input} tabular-nums`}
            aria-invalid={Boolean(errors.amount)}
          />
          {errors.amount && <FieldError>{errors.amount}</FieldError>}
        </Field>
        <Field className="gap-1.5" data-invalid={Boolean(errors.day)}>
          <FieldLabel htmlFor="bill-day">Dia do vencimento</FieldLabel>
          <Input
            id="bill-day"
            inputMode="numeric"
            placeholder="10"
            value={draft.dueDay}
            onChange={(event) => set({ dueDay: event.target.value.replace(/\D/g, "").slice(0, 2) })}
            className={`${input} tabular-nums`}
            aria-invalid={Boolean(errors.day)}
          />
          {errors.day && <FieldError>{errors.day}</FieldError>}
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold text-sm">Categoria</legend>
        <CategoryChips kind="bill" chosen={category} onChoose={(chosen) => set({ categoryId: chosen.id })} />
      </fieldset>
      {bill && (
        <label
          htmlFor="bill-active-switch"
          className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl bg-muted px-4"
        >
          <span className="flex flex-col">
            <span id="bill-active" className="font-medium text-base">
              Ativa
            </span>
            <span className="text-muted-foreground text-xs">Pausada, fica fora do mês e do projetado.</span>
          </span>
          <Switch
            id="bill-active-switch"
            aria-labelledby="bill-active"
            checked={draft.active}
            onCheckedChange={(active) => set({ active })}
          />
        </label>
      )}
      <BrandButton type="submit">Salvar</BrandButton>
      {bill && (
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 text-base text-destructive hover:text-destructive"
          onClick={() => onArchive(bill)}
        >
          <Archive className="size-5" />
          Arquivar
        </Button>
      )}
    </form>
  );
};

type EditBillSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Given: the sheet edits it, pauses it or archives it. */
  bill?: Bill;
  onArchive: (bill: Bill) => void;
};

/** Add or edit a recurring bill: nome, valor, dia 1–31, categoria and, when editing, Ativa. */
export const EditBillSheet = ({ open, onOpenChange, bill, onArchive }: EditBillSheetProps) => {
  const create = useCreateBill();
  const update = useUpdateBill();

  const save = ({ active, ...fields }: Fields) => {
    onOpenChange(false);
    const feedback = {
      onSuccess: () => toast.success("Conta salva"),
      onError: () => toast.error("Não foi possível salvar a conta."),
    };
    if (bill) return update.mutate({ id: bill.id, ...fields, active }, feedback);
    create.mutate(fields, feedback);
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={bill ? "Editar conta" : "Nova conta"}
      description="Uma conta que se repete todo mês."
    >
      <BillForm
        key={bill?.id ?? "new"}
        bill={bill}
        onSave={save}
        onArchive={(archived) => {
          onOpenChange(false);
          onArchive(archived);
        }}
      />
    </ResponsiveSheet>
  );
};
