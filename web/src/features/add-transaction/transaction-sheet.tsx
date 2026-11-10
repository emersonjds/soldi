"use client";

import { type FormEvent, type ReactNode, useState } from "react";

import { Repeat } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type BillPrefill, useCreateBill } from "@/entities/bill/bill-queries";
import { CategoryChips, useCategoryChips } from "@/entities/category/category-chips";
import { ScopeRadio } from "@/entities/transaction/scope-radio";
import {
  type NewTransaction,
  type Scope,
  type Transaction,
  useCreateTransaction,
  useUpdateTransaction,
} from "@/entities/transaction/transaction-queries";
import type { Schemas } from "@/shared/api/client";
import { useCurrency } from "@/shared/lib/currency";
import { addMonths, monthYear, todayISO } from "@/shared/lib/date";
import { installmentCents } from "@/shared/lib/installments";
import { formatMoney, positiveAmount } from "@/shared/lib/money";
import { cents, fromCents } from "@/shared/lib/tier";
import { BrandButton } from "@/shared/ui/brand-button";
import { DateChips } from "@/shared/ui/date-chips";
import { HeroAmount } from "@/shared/ui/hero-amount";
import { ResponsiveSheet } from "@/shared/ui/responsive-sheet";

import { draftRows, type Plan } from "./draft-rows";
import { Simulation } from "./simulation";

type Kind = Schemas["CategoryKind"];

const KINDS: { value: Kind; label: string }[] = [
  { value: "income", label: "Entrada" },
  { value: "bill", label: "Saída" },
  { value: "daily", label: "Diário" },
];

const PRESETS = ["2", "3", "6", "12", "other"];

const chip =
  "h-11 rounded-xl! font-semibold text-base text-muted-foreground data-[state=on]:bg-brand data-[state=on]:text-brand-foreground data-[state=on]:shadow-sm";

type Draft = {
  kind: Kind;
  amount: string;
  category?: Schemas["Category"];
  date: string;
  note: string;
  repeat: boolean;
  installments: boolean;
  simulate: boolean;
  preset: string;
  custom: string;
  scope: Scope;
};

/** `out 2027`: the month of the last of `months` entries from `date`; the day clamp never changes the month. */
const lastMonth = (date: string, months: number) => monthYear(addMonths(date.slice(0, 7), months - 1));

type Source = Transaction | NewTransaction;

const prefillOf = ({ note, category, amount, date }: Source): BillPrefill => ({
  name: (note ?? category.name).slice(0, 100),
  amount,
  due_day: Number(date.slice(8)),
  category_id: category.id,
});

const TransactionForm = ({
  initial,
  transaction,
  onSave,
  onConvert,
  onDiscard,
}: {
  initial: Draft;
  transaction?: Transaction;
  onSave: (fields: NewTransaction, scope?: Scope) => void;
  onDiscard: () => void;
  /** Absent: no Transformar em conta fixa. */
  onConvert?: (source: Source) => void;
}) => {
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const currency = useCurrency();
  const categories = useCategoryChips(draft.kind);
  const category = draft.category ?? categories.data?.[0];
  const amount = positiveAmount(draft.amount);
  const months = Number(draft.preset === "other" ? draft.custom : draft.preset);
  const series = transaction?.series;
  const minMonths = Math.max(2, series?.position ?? 2);
  const monthsValid = Number.isInteger(months) && months >= minMonths && months <= 60;
  const canRepeat = !transaction?.recurring_bill_id && !transaction?.cofrinho_id && !series;
  const installments = draft.installments && !transaction && draft.kind !== "income";
  const counted = draft.repeat || installments || Boolean(series);
  const resized = series && monthsValid && months !== series.total ? months : undefined;
  let monthsLabel = "Quantas vezes";
  if (installments) monthsLabel = "Quantas parcelas";
  if (series) monthsLabel = "Meses na série";
  const split = installments && amount && monthsValid ? installmentCents(cents(amount), months) : null;
  const splitValid = !split || split[0] > 0;
  const money = (value: number) => formatMoney(fromCents(value), currency);
  let plan: Plan = "once";
  if (draft.repeat) plan = "repeat";
  if (installments) plan = "installments";
  const rows =
    amount && (plan === "once" || monthsValid)
      ? draftRows({ kind: draft.kind, amount, date: draft.date, plan, count: months })
      : null;

  const resizeHelper = () => {
    if (!transaction?.series || !resized) return;
    const { position, total } = transaction.series;
    const end = lastMonth(transaction.date, resized - position + 1);
    if (resized > total) return `+${resized - total}×${amount ? ` ${formatMoney(amount, currency)}` : ""} · até ${end}`;
    if (resized === total - 1) return `Remove o último · termina em ${end}`;
    return `Remove os ${total - resized} últimos · termina em ${end}`;
  };

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const fields = (): NewTransaction | undefined => {
    setSubmitted(true);
    if (!amount || !category || (counted && !monthsValid) || !splitValid) return;
    const note = draft.note.trim();
    return {
      date: draft.date,
      amount,
      kind: draft.kind,
      category_id: category.id,
      note: note || null,
      repeat_months: draft.repeat ? months : resized,
      installments: installments ? months : undefined,
      category,
    };
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const valid = fields();
    if (valid) onSave(valid, series ? draft.scope : undefined);
  };

  const convertible = onConvert && (transaction?.kind ?? draft.kind) === "bill" && !draft.repeat && !installments;

  // Editar converts the stored entry; its unsaved edits stay out.
  const convert = () => {
    const source = transaction ?? fields();
    if (source) onConvert?.(source);
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      {series && (
        <p className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
          <Repeat className="size-4" aria-hidden />
          Parte de uma série de {series.total}
        </p>
      )}
      {!transaction && (
        <label
          htmlFor="transaction-simulate-switch"
          className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl bg-muted px-4 py-2"
        >
          <span className="flex flex-col">
            <span id="transaction-simulate" className="font-medium text-base">
              Simular
            </span>
            <span id="transaction-simulate-help" className="text-muted-foreground text-xs">
              Veja o efeito antes de lançar.
            </span>
          </span>
          <Switch
            id="transaction-simulate-switch"
            aria-labelledby="transaction-simulate"
            aria-describedby="transaction-simulate-help"
            checked={draft.simulate}
            onCheckedChange={(simulate) => set({ simulate })}
          />
        </label>
      )}
      <ToggleGroup
        type="single"
        spacing={0}
        value={draft.kind}
        onValueChange={(kind: Kind | "") =>
          kind && set({ kind, category: undefined, installments: draft.installments && kind !== "income" })
        }
        aria-label="Tipo"
        className="grid w-full grid-cols-3 rounded-2xl bg-muted p-1"
      >
        {KINDS.map((kind) => (
          <ToggleGroupItem key={kind.value} value={kind.value} className={chip}>
            {kind.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <HeroAmount
        id="transaction-amount"
        value={draft.amount}
        onChange={(value) => set({ amount: value })}
        invalid={submitted && !amount}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold text-sm">Categoria</legend>
        <CategoryChips kind={draft.kind} chosen={category} onChoose={(chosen) => set({ category: chosen })} />
        {submitted && categories.data && !category && (
          <p role="alert" className="text-destructive text-sm">
            Escolha uma categoria
          </p>
        )}
      </fieldset>

      <DateChips legend="Quando foi?" value={draft.date} onChange={(date) => set({ date })} />

      {transaction?.recurring_bill_id && (
        <p className="text-muted-foreground text-sm">Já é uma conta fixa recorrente.</p>
      )}
      {(canRepeat || series) && (
        <div className="flex flex-col gap-3">
          {series && (
            <span id="transaction-series-months" className="font-semibold text-sm">
              Meses na série
            </span>
          )}
          {canRepeat && (
            <label
              htmlFor="transaction-repeat-switch"
              className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl bg-muted px-4"
            >
              <span id="transaction-repeat" className="font-medium text-base">
                Repetir
              </span>
              <Switch
                id="transaction-repeat-switch"
                aria-labelledby="transaction-repeat"
                checked={draft.repeat}
                onCheckedChange={(repeat) => set({ repeat, installments: false })}
              />
            </label>
          )}
          {!transaction && draft.kind !== "income" && (
            <label
              htmlFor="transaction-split-switch"
              className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl bg-muted px-4"
            >
              <span id="transaction-split" className="font-medium text-base">
                Parcelar
              </span>
              <Switch
                id="transaction-split-switch"
                aria-labelledby="transaction-split"
                checked={installments}
                onCheckedChange={(on) => set({ installments: on, repeat: false })}
              />
            </label>
          )}
          {counted && (
            <>
              <ToggleGroup
                type="single"
                spacing={0}
                value={draft.preset}
                onValueChange={(preset: string) => preset && set({ preset })}
                aria-label={monthsLabel}
                className="grid w-full grid-cols-5 rounded-2xl bg-muted p-1"
              >
                {PRESETS.map((preset) => (
                  <ToggleGroupItem
                    key={preset}
                    value={preset}
                    disabled={preset !== "other" && Number(preset) < minMonths}
                    className={chip}
                  >
                    {preset === "other" ? "Outro" : `${preset}x`}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {draft.preset === "other" && (
                <div className="flex flex-col gap-1.5">
                  <Input
                    inputMode="numeric"
                    aria-label={installments ? "Parcelas" : "Meses"}
                    placeholder={`De ${minMonths} a 60`}
                    value={draft.custom}
                    onChange={(event) => set({ custom: event.target.value.replace(/\D/g, "").slice(0, 2) })}
                    aria-invalid={submitted && !monthsValid}
                    aria-describedby={submitted && !monthsValid ? "transaction-months-error" : undefined}
                    className="h-12 rounded-xl bg-muted text-base tabular-nums md:text-base"
                  />
                  {submitted && !monthsValid && (
                    <p id="transaction-months-error" role="alert" className="text-destructive text-sm">
                      {installments ? "Escolha de 2 a 60 parcelas." : `Escolha de ${minMonths} a 60 meses.`}
                    </p>
                  )}
                </div>
              )}
              {draft.repeat && monthsValid && (
                <p className="text-muted-foreground text-sm">
                  {amount && `${months}× ${formatMoney(amount, currency)} · `}até {lastMonth(draft.date, months)}
                </p>
              )}
              {resizeHelper() && <p className="text-muted-foreground text-sm">{resizeHelper()}</p>}
              {split && splitValid && (
                <p className="text-muted-foreground text-sm">
                  {split[0] === split[months - 1]
                    ? `${months}× ${money(split[0])}`
                    : `${months - 1}× ${money(split[0])} + ${money(split[months - 1])} na última`}{" "}
                  · até {lastMonth(draft.date, months)}
                </p>
              )}
              {submitted && !splitValid && (
                <p role="alert" className="text-destructive text-sm">
                  Valor pequeno demais para {months} parcelas.
                </p>
              )}
              {!series && Number(draft.date.slice(8)) >= 29 && (
                <p className="text-muted-foreground text-xs">Em meses mais curtos, cai no último dia.</p>
              )}
            </>
          )}
          {convertible && (
            <p className="text-muted-foreground text-sm">
              Prefere uma conta fixa, sem data pra acabar?{" "}
              <button
                type="button"
                onClick={convert}
                className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Transformar em conta fixa
              </button>
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="transaction-note" className="font-semibold text-sm">
          Observação
        </label>
        <Input
          id="transaction-note"
          value={draft.note}
          onChange={(event) => set({ note: event.target.value })}
          placeholder="Opcional"
          maxLength={200}
          className="h-12 rounded-xl bg-muted text-base md:text-base"
        />
      </div>

      {series && (
        <ScopeRadio legend="Aplicar em" series={series} value={draft.scope} onChange={(scope) => set({ scope })} />
      )}

      {draft.simulate && <Simulation rows={rows} countInvalid={Boolean(amount) && counted && !monthsValid} />}

      {draft.simulate ? (
        <div className="flex flex-col gap-2">
          <BrandButton type="submit">Lançar de verdade</BrandButton>
          <Button type="button" variant="ghost" className="h-12 w-full text-base" onClick={onDiscard}>
            Descartar
          </Button>
        </div>
      ) : (
        <BrandButton type="submit">Salvar</BrandButton>
      )}
    </form>
  );
};

type TransactionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Given: the sheet edits it. */
  transaction?: Transaction;
  /** Preselected kind when creating; Diário otherwise. */
  initialKind?: Draft["kind"];
  /** Preselected category when creating, of `initialKind`. */
  initialCategory?: Schemas["Category"];
  /** A line above the form. */
  hint?: string;
  /** The bill sheet that Transformar em conta fixa opens; absent, the link is not offered. */
  billSheet?: (props: {
    prefill: BillPrefill;
    onOpenChange: (open: boolean) => void;
    onCreate: (bill: BillPrefill) => void;
  }) => ReactNode;
};

/** `Lançar`: bottom sheet below 1024px, dialog from there; closes at once and the row appears optimistically. */
export const TransactionSheet = ({
  open,
  onOpenChange,
  transaction,
  initialKind = "daily",
  initialCategory,
  hint,
  billSheet,
}: TransactionSheetProps) => {
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const createBill = useCreateBill();
  const [converting, setConverting] = useState<Source>();
  const failed = () => toast.error("Não foi possível salvar o lançamento.");

  const save = (fields: NewTransaction, scope?: Scope) => {
    onOpenChange(false);
    const done = (fallback: string) => {
      if (fields.installments) return toast.success(`${fields.installments} parcelas lançadas`);
      toast.success(fields.repeat_months ? `${fields.repeat_months} lançamentos criados` : fallback);
    };
    if (!transaction) return create.mutate(fields, { onSuccess: () => done("Lançado"), onError: failed });
    const { category: _category, ...patch } = fields;
    update.mutate(
      { id: transaction.id, scope, ...patch },
      {
        onSuccess: () =>
          transaction.series && fields.repeat_months
            ? toast.success(`Série ajustada para ${fields.repeat_months} meses`)
            : done(scope === "following" ? "Série atualizada" : "Lançamento atualizado"),
        onError: failed,
      },
    );
  };

  // Lançar posts the entry first; Editar links the one that exists.
  const convert = async (source: Source, bill: BillPrefill) => {
    onOpenChange(false);
    let transactionId: string;
    try {
      transactionId = "id" in source ? source.id : (await create.mutateAsync(source)).id;
    } catch {
      return failed();
    }
    createBill.mutate(
      { ...bill, transactionId },
      {
        onSuccess: () => toast.success("Conta fixa criada"),
        onError: () =>
          toast.error(
            transaction ? "Não foi possível criar a conta fixa." : "Lançado, mas a conta fixa não foi criada.",
          ),
      },
    );
  };

  const repeat = {
    repeat: false,
    installments: false,
    simulate: false,
    preset: "12",
    custom: "",
    scope: "this",
  } as const;
  const total = String(transaction?.series?.total ?? "");
  const initial: Draft = transaction
    ? {
        kind: transaction.kind,
        amount: transaction.amount,
        category: transaction.category,
        date: transaction.date,
        note: transaction.note ?? "",
        ...repeat,
        ...(total && { preset: PRESETS.includes(total) ? total : "other", custom: total }),
      }
    : { kind: initialKind, amount: "", category: initialCategory, date: todayISO(), note: "", ...repeat };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={transaction ? "Editar lançamento" : "Lançar"}
      description="Entrada, conta ou gasto do dia."
    >
      {hint && <p className="rounded-xl bg-secondary px-4 py-3 font-medium text-primary text-sm">{hint}</p>}
      <TransactionForm
        key={transaction?.id ?? `${initialKind}-${initialCategory?.id}`}
        initial={initial}
        transaction={transaction}
        onSave={save}
        onConvert={billSheet && setConverting}
        onDiscard={() => onOpenChange(false)}
      />
      {converting &&
        billSheet?.({
          prefill: prefillOf(converting),
          onOpenChange: (open) => open || setConverting(undefined),
          onCreate: (bill) => void convert(converting, bill),
        })}
    </ResponsiveSheet>
  );
};
