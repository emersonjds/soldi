"use client";

import { type FormEvent, useId, useState } from "react";

import { Check, Repeat, Trash2, TrendingDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { firstMonth, installmentOf, lastMonthOf } from "@/entities/bill/bill-plan";
import { type Bill, useArchiveBill, useCreateBill, useUpdateBill } from "@/entities/bill/bill-queries";
import { categoryLabel } from "@/entities/category/categories-query";
import { useCategoryChips } from "@/entities/category/category-chips";
import { cn } from "@/lib/utils";
import { problemMessage, type Schemas } from "@/shared/api/client";
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
  variable: boolean;
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
  variable: false,
};

const currentOf = (from: { due_day: number; installments?: number | null; last_month?: string | null }) => {
  if (!from.installments || !from.last_month) return "1";
  const current = installmentOf(firstMonth(todayISO(), from.due_day), from.last_month, from.installments);
  return String(current ?? 1);
};

const draftOf = (bill?: Bill, prefill?: Schemas["CreateBill"], parcelado?: boolean): Draft => {
  const from = bill ?? prefill;
  if (!from) return emptyDraft;
  return {
    name: from.name,
    amount: from.amount ?? "",
    dueDay: String(from.due_day),
    closingDay: from.closing_day ? String(from.closing_day) : "",
    card: from.closing_day != null,
    categoryId: from.category_id ?? undefined,
    active: bill?.active ?? true,
    parcelado: parcelado ?? from.installments != null,
    installments: from.installments ? String(from.installments) : "",
    current: currentOf(from),
    variable: from.variable ?? false,
  };
};

/** Spec 2026-11-11 §8.4: one form for the Contas fixas side panel and the sheet; a new bill may be a card (D28). */
export const BillForm = ({
  bill,
  prefill,
  parcelado,
  hint,
  onSave,
  onArchive,
  pinned = false,
  autoFocus = false,
}: {
  bill?: Bill;
  prefill?: Schemas["CreateBill"];
  /** Parcelado's opening state; absent, whether the prefill has a plan. */
  parcelado?: boolean;
  /** A line above the form, by Parcelado. */
  hint?: (parcelado: boolean) => string;
  onSave: (fields: Fields) => void;
  /** Absent: no Excluir. */
  onArchive?: (bill: Bill) => void;
  /** In a sheet: the buttons stick to its bottom. */
  pinned?: boolean;
  autoFocus?: boolean;
}) => {
  const [draft, setDraft] = useState<Draft>(() => draftOf(bill, prefill, parcelado));
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
  const initial = draftOf(bill, prefill, parcelado);
  const planTouched = draft.installments !== initial.installments || draft.current !== initial.current;
  // D44: an untouched prefill keeps the series' last month, which the form cannot work out once its due day passed.
  const endMonth = (!bill && !planTouched && prefill?.last_month) || lastMonth;
  const dropping = bill?.installments != null && !draft.parcelado;
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
    setDraft(draftOf(bill, prefill, parcelado));
    setSubmitted(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!name || !day || !categoryId) return;
    const active = draft.parcelado ? (bill?.active ?? true) : draft.active;
    const fields = { name, due_day: day, category_id: categoryId, active };
    const variable = draft.variable !== (bill?.variable ?? false) ? { variable: draft.variable } : {};
    if (draft.card) {
      if (closingDay) onSave({ ...fields, closing_day: closingDay });
      return;
    }
    if (!amount) return;
    if (!draft.parcelado)
      return onSave({ ...fields, amount, ...variable, ...(dropping && { installments: null, last_month: null }) });
    if (!lastMonth) return;
    const changed = !bill || planTouched;
    onSave({ ...fields, amount, ...variable, ...(changed && { installments: count, last_month: endMonth }) });
  };

  const actions = (
    <>
      <BrandButton type="submit">
        <Check className="size-5" />
        Salvar Conta Fixa
      </BrandButton>
      <Button type="button" variant="ghost" className="text-muted-foreground min-h-11 text-base" onClick={discard}>
        Descartar alterações
      </Button>
    </>
  );

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      {hint && (
        <p className="bg-secondary text-primary rounded-xl px-4 py-3 text-sm font-medium">{hint(draft.parcelado)}</p>
      )}
      <span className="bg-muted flex min-h-11 items-center justify-center gap-2 rounded-xl p-1">
        <span className="bg-card text-primary flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold shadow-sm">
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
      {(!bill || bill.closing_day == null) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {!bill && !prefill && (
            <label
              htmlFor="bill-card-switch"
              className="bg-muted flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-4 py-2"
            >
              <span id="bill-card" className="text-base font-medium">
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
            className="bg-muted flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-4 py-2"
          >
            <span className="flex flex-col">
              <span id="bill-parcelado" className="text-base font-medium">
                Parcelado
              </span>
              {dropping && (
                <span className="text-muted-foreground text-xs">
                  Vira conta fixa: todo mês, sem fim. Os pagamentos feitos ficam como estão.
                </span>
              )}
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
          <FieldLabel htmlFor="bill-amount">
            {draft.variable ? "Valor estimado" : "Valor mensal fixo estimado"}
          </FieldLabel>
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
      {!draft.card && (
        <label
          htmlFor="bill-variable-switch"
          className="bg-muted flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-4 py-2"
        >
          <span className="flex flex-col">
            <span id="bill-variable" className="text-base font-medium">
              Valor varia todo mês
            </span>
            <span className="text-muted-foreground text-xs">
              {draft.variable
                ? "Ex.: luz, água, cartão. O valor fica como estimativa e você ajusta ao pagar."
                : "Paga sozinha no dia do vencimento."}
            </span>
          </span>
          <Switch
            id="bill-variable-switch"
            aria-labelledby="bill-variable"
            checked={draft.variable}
            onCheckedChange={(variable) => set({ variable })}
          />
        </label>
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
          {lastMonth && endMonth === lastMonth && (
            <p className="text-muted-foreground -mt-3 text-sm">
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
      {draft.card && <p className="text-muted-foreground -mt-3 text-sm">Ex.: Cartão › Porto</p>}
      {archived && (
        <p className="text-muted-foreground -mt-3 text-sm">
          Categoria arquivada. Fica a mesma se você não escolher outra.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Periodicidade</span>
        <span className="bg-muted flex min-h-12 items-center gap-2 rounded-xl px-4 text-base">
          <Repeat className="text-primary size-4" aria-hidden />
          Mensal (todo mês)
          <span className="text-muted-foreground ml-auto text-xs">{draft.parcelado ? "Parcelado" : "Fixo"}</span>
        </span>
      </div>
      {bill && !draft.card && !draft.parcelado && bill.installments == null && (
        <label
          htmlFor="bill-active-switch"
          className="bg-muted flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-4"
        >
          <span className="flex flex-col">
            <span id="bill-active" className="text-base font-medium">
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
      {bill && onArchive && (
        <div className="flex flex-col items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive min-h-11 text-base"
            onClick={() => onArchive(bill)}
          >
            <Trash2 className="size-5" />
            {bill.closing_day == null ? "Excluir conta fixa" : "Excluir cartão"}
          </Button>
          <p className="text-muted-foreground text-center text-xs">
            Sai de todos os meses; os pagamentos já feitos continuam nos lançamentos.
          </p>
        </div>
      )}
      {pinned ? (
        <ResponsiveSheetFooter>{actions}</ResponsiveSheetFooter>
      ) : (
        <div className="flex flex-col gap-2">{actions}</div>
      )}
    </form>
  );
};

const savedMessage = (bill?: Bill, installments?: number | null) => {
  if (!bill) return "Conta salva";
  if (installments === null) return "Agora é uma conta fixa";
  if (installments && bill.installments == null) return "Agora é uma conta parcelada";
  return "Conta salva";
};

/** Saves the form's fields as a new bill or into `bill`, with a toast either way. */
export const useSaveBill = (bill?: Bill, onCreate?: (fields: Schemas["CreateBill"]) => void) => {
  const create = useCreateBill();
  const update = useUpdateBill();
  return ({ active, ...fields }: Fields) => {
    // The host may unmount the sheet on close; mutate's own callbacks would not run.
    const feedback = (saving: Promise<unknown>) =>
      void saving.then(
        () => toast.success(savedMessage(bill, fields.installments)),
        (error: Error) => toast.error(problemMessage(error) ?? "Não foi possível salvar a conta."),
      );
    if (bill)
      return feedback(update.mutateAsync({ id: bill.id, ...fields, ...(active !== bill.active && { active }) }));
    if (onCreate) return onCreate(fields);
    feedback(create.mutateAsync(fields));
  };
};

// ponytail: no unarchive endpoint, so the DELETE waits for the toast; closing the tab inside those 5 s keeps the bill.
/** SOL-153: hides a bill at once and deletes it when the 5 s Desfazer toast closes; Desfazer or a failure brings it back. */
export const useArchiveLater = (onHide: (id: string) => void, onRestore: (id: string) => void) => {
  const archive = useArchiveBill();
  return (bill: Bill) => {
    onHide(bill.id);
    const card = bill.closing_day != null;
    let undone = false;
    const commit = () => {
      if (undone) return;
      undone = true;
      // The screen may be gone by now; mutate's own callbacks would not run.
      archive.mutateAsync(bill.id).catch(() => {
        onRestore(bill.id);
        toast.error(card ? "Não foi possível excluir o cartão." : "Não foi possível excluir a conta fixa.");
      });
    };
    toast(card ? "Cartão excluído" : "Conta fixa excluída", {
      duration: 5000,
      action: {
        label: "Desfazer",
        onClick: () => {
          undone = true;
          onRestore(bill.id);
        },
      },
      onAutoClose: commit,
      onDismiss: commit,
    });
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
    <section aria-labelledby={id} className="bg-card flex flex-col gap-5 rounded-2xl p-6 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <h2 id={id} className="flex items-center gap-2 text-lg leading-6 font-bold">
          <span className="bg-primary size-2 shrink-0 rounded-full" aria-hidden />
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
  /** Parcelado's opening state on a new bill. */
  parcelado?: boolean;
  /** A line above the form, by Parcelado. */
  hint?: (parcelado: boolean) => string;
  onCloseAutoFocus?: (event: Event) => void;
};

/** Add or edit a recurring bill: nome, valor, dia 1–31, categoria and, when editing, Ativa; a new one may be a card (D28), which has Fecha dia instead of valor and no pause. */
export const EditBillSheet = ({
  open,
  onOpenChange,
  bill,
  onArchive,
  prefill,
  onCreate,
  parcelado,
  hint,
  onCloseAutoFocus,
}: EditBillSheetProps) => {
  const save = useSaveBill(bill, onCreate);

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={bill ? "Editar conta" : "Nova conta"}
      description="Uma conta que se repete todo mês."
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <BillForm
        key={bill?.id ?? "new"}
        bill={bill}
        prefill={prefill}
        parcelado={parcelado}
        hint={hint}
        pinned
        onSave={(fields) => {
          onOpenChange(false);
          save(fields);
        }}
        onArchive={
          onArchive &&
          ((archived) => {
            onOpenChange(false);
            onArchive(archived);
          })
        }
      />
    </ResponsiveSheet>
  );
};
