"use client";

import { type FormEvent, useId, useState } from "react";

import { Archive, Check, Repeat, TrendingDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { firstMonth, installmentOf, lastMonthOf } from "@/entities/bill/bill-plan";
import { type Bill, useCreateBill, useUpdateBill } from "@/entities/bill/bill-queries";
import { categoryLabel } from "@/entities/category/categories-query";
import { useCategoryChips } from "@/entities/category/category-chips";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { monthAbbrev, todayISO } from "@/shared/lib/date";
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
  parcelado: boolean;
  installments: string;
  current: string;
};

const input = "h-12 text-base md:text-base";

const asDay = (text: string) => (/^\d{1,2}$/.test(text) && Number(text) >= 1 && Number(text) <= 31 ? Number(text) : 0);

const DAY_CHIPS = ["05", "10", "15", "20"];

const DayField = ({
  id,
  label,
  value,
  error,
  onChange,
  autoFocus,
  placeholder = "10",
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) => (
  <Input
    id={id}
    inputMode="numeric"
    placeholder={placeholder}
    value={value}
    autoFocus={autoFocus}
    onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 2))}
    className={`${input} min-w-0 tabular-nums`}
    aria-label={label}
    aria-invalid={Boolean(error)}
  />
);

const ClosingDay = ({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) => (
  <Field className="gap-1.5" data-invalid={Boolean(error)}>
    <FieldLabel htmlFor="bill-closing-day">Fecha dia</FieldLabel>
    <DayField id="bill-closing-day" label="Fecha dia" value={value} error={error} onChange={onChange} />
    {error && <FieldError>{error}</FieldError>}
  </Field>
);

const chip = "min-h-11 rounded-xl px-1 font-medium text-sm leading-4 transition-colors";

type Fields = Schemas["CreateBill"] & { active: boolean };

const emptyDraft: Draft = {
  name: "",
  amount: "",
  dueDay: "",
  closingDay: "",
  card: false,
  active: true,
  parcelado: false,
  installments: "",
  current: "1",
};

const currentOf = (bill?: Bill) => {
  if (!bill?.installments || !bill.last_month) return "1";
  const current = installmentOf(firstMonth(todayISO(), bill.due_day), bill.last_month, bill.installments);
  return String(current ?? 1);
};

const draftOf = (bill?: Bill, prefill?: Schemas["CreateBill"]): Draft => {
  const from = bill ?? prefill;
  if (!from) return emptyDraft;
  return {
    name: from.name,
    amount: from.amount ?? "",
    dueDay: String(from.due_day),
    closingDay: from.closing_day ? String(from.closing_day) : "",
    card: from.closing_day != null,
    categoryId: from.category_id,
    active: bill?.active ?? true,
    parcelado: bill?.installments != null,
    installments: bill?.installments ? String(bill.installments) : "",
    current: currentOf(bill),
  };
};

/** Spec 2026-11-11 §8.4: one form for the Contas fixas side panel and the sheet; a new bill may be a card (D28). */
export const BillForm = ({
  bill,
  prefill,
  onSave,
  onArchive,
  pinned = false,
  autoFocus = false,
}: {
  bill?: Bill;
  prefill?: Schemas["CreateBill"];
  onSave: (fields: Fields) => void;
  onArchive: (bill: Bill) => void;
  /** In a sheet: the buttons stick to its bottom. */
  pinned?: boolean;
  autoFocus?: boolean;
}) => {
  const [draft, setDraft] = useState<Draft>(() => draftOf(bill, prefill));
  const [submitted, setSubmitted] = useState(false);
  const categories = useCategoryChips("bill");
  const found = categories.data?.find((each) => each.id === draft.categoryId);
  const archived = Boolean(draft.categoryId && categories.data && !found);
  const fallback = draft.card ? undefined : categories.data?.[0];
  const categoryId = draft.categoryId ?? fallback?.id;

  const name = draft.name.trim();
  const amount = positiveAmount(draft.amount);
  const day = asDay(draft.dueDay);
  const closingDay = asDay(draft.closingDay);
  const count = Number(draft.installments) >= 2 && Number(draft.installments) <= 60 ? Number(draft.installments) : 0;
  const maxCurrent = count || 60;
  const current = Number(draft.current) >= 1 && Number(draft.current) <= maxCurrent ? Number(draft.current) : 0;
  const lastMonth = count && current && day ? lastMonthOf(todayISO(), day, count, current - 1) : undefined;
  const dayError = "Escolha um dia de 1 a 31.";
  const errors = {
    name: submitted && !name ? "Informe o nome." : undefined,
    amount: submitted && !draft.card && !amount ? "Informe um valor maior que zero." : undefined,
    day: submitted && !day ? dayError : undefined,
    closingDay: submitted && draft.card && !closingDay ? dayError : undefined,
    category: submitted && !categoryId ? "Escolha uma categoria." : undefined,
    installments: submitted && draft.parcelado && !count ? "Escolha de 2 a 60 parcelas." : undefined,
    current: submitted && draft.parcelado && !current ? `Escolha uma parcela de 1 a ${maxCurrent}.` : undefined,
  };

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const discard = () => {
    setDraft(draftOf(bill, prefill));
    setSubmitted(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!name || !day || !categoryId) return;
    const fields = { name, due_day: day, category_id: categoryId, active: draft.active };
    if (draft.card) {
      if (closingDay) onSave({ ...fields, closing_day: closingDay });
      return;
    }
    if (!amount) return;
    if (!draft.parcelado) return onSave({ ...fields, amount });
    if (!lastMonth) return;
    const initial = draftOf(bill, prefill);
    const changed = draft.installments !== initial.installments || draft.current !== initial.current;
    onSave({ ...fields, amount, ...(changed && { installments: count, last_month: lastMonth }) });
  };

  const actions = (
    <>
      <BrandButton type="submit">
        <Check className="size-5" />
        Salvar Conta Fixa
      </BrandButton>
      <Button type="button" variant="ghost" className="min-h-11 text-base text-muted-foreground" onClick={discard}>
        Descartar alterações
      </Button>
    </>
  );

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <span className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-muted p-1">
        <span className="flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-card font-semibold text-primary text-sm shadow-sm">
          <TrendingDown className="size-4" aria-hidden />
          Despesa Fixa
        </span>
      </span>
      <Field className="gap-1.5" data-invalid={Boolean(errors.name)}>
        <FieldLabel htmlFor="bill-name">Nome da conta fixa</FieldLabel>
        <Input
          id="bill-name"
          value={draft.name}
          autoFocus={autoFocus}
          onChange={(event) => set({ name: event.target.value })}
          placeholder="Ex: Plano de Saúde Familiar"
          maxLength={100}
          className={input}
          aria-invalid={Boolean(errors.name)}
        />
        {errors.name && <FieldError>{errors.name}</FieldError>}
      </Field>
      {!prefill && (!bill || (bill.closing_day == null && bill.installments == null)) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {!bill && (
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
                onCheckedChange={(card) => set({ card, parcelado: card ? false : draft.parcelado })}
              />
            </label>
          )}
          <label
            htmlFor="bill-parcelado-switch"
            className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl bg-muted px-4 py-2"
          >
            <span id="bill-parcelado" className="font-medium text-base">
              Parcelado
            </span>
            <Switch
              id="bill-parcelado-switch"
              aria-labelledby="bill-parcelado"
              checked={draft.parcelado}
              onCheckedChange={(parcelado) => set({ parcelado, card: parcelado ? false : draft.card })}
            />
          </label>
        </div>
      )}
      {draft.card ? (
        <ClosingDay value={draft.closingDay} error={errors.closingDay} onChange={(closingDay) => set({ closingDay })} />
      ) : (
        <Field className="gap-1.5" data-invalid={Boolean(errors.amount)}>
          <FieldLabel htmlFor="bill-amount">Valor mensal fixo estimado</FieldLabel>
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
      <Field className="gap-1.5" data-invalid={Boolean(errors.day)}>
        <FieldLabel htmlFor="bill-day">Dia do vencimento recorrente</FieldLabel>
        <div className="grid grid-cols-5 gap-2">
          {DAY_CHIPS.map((chosen) => {
            const pressed = day === Number(chosen);
            return (
              <button
                key={chosen}
                type="button"
                aria-pressed={pressed}
                onClick={() => set({ dueDay: String(Number(chosen)) })}
                className={cn(
                  chip,
                  pressed ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary",
                )}
              >
                Dia {chosen}
              </button>
            );
          })}
          <DayField
            id="bill-day"
            label="Dia do vencimento recorrente"
            value={draft.dueDay}
            error={errors.day}
            onChange={(dueDay) => set({ dueDay })}
          />
        </div>
        {errors.day && <FieldError>{errors.day}</FieldError>}
      </Field>
      {draft.parcelado && (
        <>
          <Field className="gap-1.5" data-invalid={Boolean(errors.installments)}>
            <FieldLabel htmlFor="bill-installments">Quantas parcelas</FieldLabel>
            <DayField
              id="bill-installments"
              label="Quantas parcelas"
              placeholder="12"
              value={draft.installments}
              error={errors.installments}
              onChange={(installments) => set({ installments })}
            />
            {errors.installments && <FieldError>{errors.installments}</FieldError>}
          </Field>
          <Field className="gap-1.5" data-invalid={Boolean(errors.current)}>
            <FieldLabel htmlFor="bill-current">Parcela atual</FieldLabel>
            <DayField
              id="bill-current"
              label="Parcela atual"
              placeholder="1"
              value={draft.current}
              error={errors.current}
              onChange={(current) => set({ current })}
            />
            {errors.current && <FieldError>{errors.current}</FieldError>}
          </Field>
          {lastMonth && (
            <p className="-mt-3 text-muted-foreground text-sm">
              {`Parcela ${current}/${count} em ${monthAbbrev(firstMonth(todayISO(), day))} · termina em ${monthAbbrev(lastMonth)}`}
            </p>
          )}
        </>
      )}
      <Field className="gap-1.5" data-invalid={Boolean(errors.category)}>
        <FieldLabel htmlFor="bill-category">Categoria</FieldLabel>
        <NativeSelect
          id="bill-category"
          value={categoryId ?? ""}
          onChange={(event) => set({ categoryId: event.target.value })}
          aria-invalid={Boolean(errors.category)}
          className="w-full [&_select]:h-12 [&_select]:text-base"
        >
          <NativeSelectOption value="" disabled>
            Escolha uma categoria
          </NativeSelectOption>
          {archived && <NativeSelectOption value={draft.categoryId}>Categoria arquivada</NativeSelectOption>}
          {categories.data?.map((category) => (
            <NativeSelectOption key={category.id} value={category.id}>
              {categoryLabel(category, categories.data)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {errors.category && <FieldError>{errors.category}</FieldError>}
      </Field>
      {draft.card && <p className="-mt-3 text-muted-foreground text-sm">Ex.: Cartão › Porto</p>}
      {archived && (
        <p className="-mt-3 text-muted-foreground text-sm">
          Categoria arquivada. Fica a mesma se você não escolher outra.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-sm">Periodicidade</span>
        <span className="flex min-h-12 items-center gap-2 rounded-xl bg-muted px-4 text-base">
          <Repeat className="size-4 text-primary" aria-hidden />
          Mensal (todo mês)
          <span className="ml-auto text-muted-foreground text-xs">{draft.parcelado ? "Parcelado" : "Fixo"}</span>
        </span>
      </div>
      {bill && !draft.card && !draft.parcelado && (
        <label
          htmlFor="bill-active-switch"
          className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl bg-muted px-4"
        >
          <span className="flex flex-col">
            <span id="bill-active" className="font-medium text-base">
              Ativa
            </span>
            {!draft.active && (
              <span className="text-muted-foreground text-xs">
                Parada. Sai dos próximos meses; este e os anteriores ficam como estão.
              </span>
            )}
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
      {pinned ? (
        <ResponsiveSheetFooter>{actions}</ResponsiveSheetFooter>
      ) : (
        <div className="flex flex-col gap-2">{actions}</div>
      )}
    </form>
  );
};

/** Saves the form's fields as a new bill or into `bill`, with a toast either way. */
export const useSaveBill = (bill?: Bill, onCreate?: (fields: Schemas["CreateBill"]) => void) => {
  const create = useCreateBill();
  const update = useUpdateBill();
  return ({ active, ...fields }: Fields) => {
    const feedback = {
      onSuccess: () => toast.success("Conta salva"),
      onError: () => toast.error("Não foi possível salvar a conta."),
    };
    if (bill) return update.mutate({ id: bill.id, ...fields, ...(active !== bill.active && { active }) }, feedback);
    if (onCreate) return onCreate(fields);
    create.mutate(fields, feedback);
  };
};

/** Contas fixas from 1280 px: the form beside the list, new until a bill is loaded into it. */
export const BillFormPanel = ({
  bill,
  onArchive,
  onDone,
  autoFocus,
}: {
  bill?: Bill;
  onArchive: (bill: Bill) => void;
  onDone: () => void;
  autoFocus: boolean;
}) => {
  const save = useSaveBill(bill);
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5 rounded-2xl bg-card p-6 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <h2 id={id} className="flex items-center gap-2 font-bold text-lg leading-6">
          <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
          {bill ? "Editar Conta" : "Adicionar Nova Conta"}
        </h2>
        <span className="text-muted-foreground text-xs">Formulário rápido</span>
      </header>
      <BillForm
        bill={bill}
        autoFocus={autoFocus}
        onSave={(fields) => {
          onDone();
          save(fields);
        }}
        onArchive={(archived) => {
          onDone();
          onArchive(archived);
        }}
      />
    </section>
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
  const save = useSaveBill(bill, onCreate);

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
        pinned
        onSave={(fields) => {
          onOpenChange(false);
          save(fields);
        }}
        onArchive={(archived) => {
          onOpenChange(false);
          onArchive?.(archived);
        }}
      />
    </ResponsiveSheet>
  );
};
