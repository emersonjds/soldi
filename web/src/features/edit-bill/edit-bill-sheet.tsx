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
import { useTransactions } from "@/entities/transaction/transaction-queries";
import type { Schemas } from "@/shared/api/client";
import { todayISO } from "@/shared/lib/date";
import { positiveAmount } from "@/shared/lib/money";
import { AmountInput } from "@/shared/ui/amount-input";
import { BrandButton } from "@/shared/ui/brand-button";
import { ResponsiveSheet, ResponsiveSheetFooter } from "@/shared/ui/responsive-sheet";

type Draft = {
  name: string;
  amount: string;
  dueDay: string;
  closingDay: string;
  card: boolean;
  categoryId?: string;
  active: boolean;
};

const input = "h-12 text-base md:text-base";

const asDay = (text: string) => (/^\d{1,2}$/.test(text) && Number(text) >= 1 && Number(text) <= 31 ? Number(text) : 0);

const DayField = ({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) => (
  <Field className="gap-1.5" data-invalid={Boolean(error)}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Input
      id={id}
      inputMode="numeric"
      placeholder="10"
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 2))}
      className={`${input} tabular-nums`}
      aria-invalid={Boolean(error)}
    />
    {error && <FieldError>{error}</FieldError>}
  </Field>
);

type Fields = Schemas["CreateBill"] & { active: boolean };

const BillForm = ({
  bill,
  prefill,
  onSave,
  onArchive,
}: {
  bill?: Bill;
  prefill?: Schemas["CreateBill"];
  onSave: (fields: Fields) => void;
  onArchive: (bill: Bill) => void;
}) => {
  const from = bill ?? prefill;
  const [draft, setDraft] = useState<Draft>(
    from
      ? {
          name: from.name,
          amount: from.amount ?? "",
          dueDay: String(from.due_day),
          closingDay: from.closing_day ? String(from.closing_day) : "",
          card: from.closing_day != null,
          categoryId: from.category_id,
          active: bill?.active ?? true,
        }
      : { name: "", amount: "", dueDay: "", closingDay: "", card: false, active: true },
  );
  const [submitted, setSubmitted] = useState(false);
  const categories = useCategoryChips("bill");
  const thisMonth = useTransactions(todayISO().slice(0, 7));
  const found = categories.data?.find((each) => each.id === draft.categoryId);
  const archived = Boolean(draft.categoryId && categories.data && !found);
  const fallback = draft.card ? undefined : categories.data?.[0];
  const category = draft.categoryId ? found : fallback;
  const categoryId = draft.categoryId ?? category?.id;

  const name = draft.name.trim();
  const amount = positiveAmount(draft.amount);
  const day = asDay(draft.dueDay);
  const closingDay = asDay(draft.closingDay);
  const dayError = "Escolha um dia de 1 a 31.";
  const errors = {
    name: submitted && !name ? "Informe o nome." : undefined,
    amount: submitted && !draft.card && !amount ? "Informe um valor maior que zero." : undefined,
    day: submitted && !day ? dayError : undefined,
    closingDay: submitted && draft.card && !closingDay ? dayError : undefined,
    category: submitted && !categoryId ? "Escolha uma categoria." : undefined,
  };

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!name || !day || !categoryId) return;
    const fields = { name, due_day: day, category_id: categoryId, active: draft.active };
    if (draft.card) {
      if (closingDay) onSave({ ...fields, closing_day: closingDay });
      return;
    }
    if (amount) onSave({ ...fields, amount });
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
      {!from && (
        <label
          htmlFor="bill-card-switch"
          className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl bg-muted px-4 py-2"
        >
          <span id="bill-card" className="font-medium text-base">
            Cartão de crédito
          </span>
          <Switch
            id="bill-card-switch"
            aria-labelledby="bill-card"
            checked={draft.card}
            onCheckedChange={(card) => set({ card })}
          />
        </label>
      )}
      <div className={draft.card ? "grid grid-cols-2 gap-3" : "grid grid-cols-[1fr_7rem] gap-3"}>
        {draft.card ? (
          <DayField
            id="bill-closing-day"
            label="Fecha dia"
            value={draft.closingDay}
            error={errors.closingDay}
            onChange={(closingDay) => set({ closingDay })}
          />
        ) : (
          <Field className="gap-1.5" data-invalid={Boolean(errors.amount)}>
            <FieldLabel htmlFor="bill-amount">Valor</FieldLabel>
            <AmountInput
              id="bill-amount"
              value={draft.amount}
              onValueChange={(amount) => set({ amount })}
              className={`${input} tabular-nums`}
              aria-invalid={Boolean(errors.amount)}
            />
            {errors.amount && <FieldError>{errors.amount}</FieldError>}
          </Field>
        )}
        <DayField
          id="bill-day"
          label="Vence dia"
          value={draft.dueDay}
          error={errors.day}
          onChange={(dueDay) => set({ dueDay })}
        />
      </div>
      <CategoryChips
        kind="bill"
        chosen={category}
        onChoose={(chosen) => set({ categoryId: chosen.id })}
        entries={thisMonth.isError ? [] : thisMonth.data}
        error={errors.category}
      />
      {draft.card && <p className="-mt-3 text-muted-foreground text-sm">Ex.: Cartão › Porto</p>}
      {archived && (
        <p className="-mt-3 text-muted-foreground text-sm">
          Categoria arquivada. Fica a mesma se você não escolher outra.
        </p>
      )}
      {bill && !draft.card && (
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
      <ResponsiveSheetFooter>
        <BrandButton type="submit">Salvar</BrandButton>
      </ResponsiveSheetFooter>
    </form>
  );
};

type EditBillSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Given: the sheet edits it, pauses it or archives it. */
  bill?: Bill;
  onArchive?: (bill: Bill) => void;
  /** Fills a new bill. */
  prefill?: Schemas["CreateBill"];
  /** Takes over saving a new bill. */
  onCreate?: (fields: Schemas["CreateBill"]) => void;
};

/** Add or edit a recurring bill: nome, valor, dia 1–31, categoria and, when editing, Ativa; a new one may be a card (D28), which has Fecha dia instead of valor and no pause. */
export const EditBillSheet = ({ open, onOpenChange, bill, onArchive, prefill, onCreate }: EditBillSheetProps) => {
  const create = useCreateBill();
  const update = useUpdateBill();

  const save = ({ active, ...fields }: Fields) => {
    onOpenChange(false);
    const feedback = {
      onSuccess: () => toast.success("Conta salva"),
      onError: () => toast.error("Não foi possível salvar a conta."),
    };
    if (bill) return update.mutate({ id: bill.id, ...fields, ...(active !== bill.active && { active }) }, feedback);
    if (onCreate) return onCreate(fields);
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
        prefill={prefill}
        onSave={save}
        onArchive={(archived) => {
          onOpenChange(false);
          onArchive?.(archived);
        }}
      />
    </ResponsiveSheet>
  );
};
