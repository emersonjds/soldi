"use client";

import { type FormEvent, type ReactNode, useState } from "react";

import {
  ArrowDown,
  ArrowRight,
  Calculator,
  CircleCheck,
  CircleX,
  Lightbulb,
  type LucideIcon,
  NotebookPen,
  ReceiptText,
  Repeat,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type BillPrefill, useCreateBill } from "@/entities/bill/bill-queries";
import { CategoryChips, useCategoryChips } from "@/entities/category/category-chips";
import { useSettings } from "@/entities/settings/settings-query";
import { ScopeRadio } from "@/entities/transaction/scope-radio";
import {
  type NewTransaction,
  type Scope,
  type Transaction,
  useCreateTransaction,
  useTransactions,
  useUpdateTransaction,
} from "@/entities/transaction/transaction-queries";
import { useIsLg } from "@/hooks/use-lg";
import { cn } from "@/lib/utils";
import { ApiError, type Schemas } from "@/shared/api/client";
import { useCurrency } from "@/shared/lib/currency";
import { addMonths, monthYear, todayISO } from "@/shared/lib/date";
import { installmentCents } from "@/shared/lib/installments";
import { formatMoney, positiveAmount } from "@/shared/lib/money";
import { cents, fromCents } from "@/shared/lib/tier";
import { AmountKeypad, useKeypad } from "@/shared/ui/amount-keypad";
import { BrandButton } from "@/shared/ui/brand-button";
import { DateChips } from "@/shared/ui/date-chips";
import { HeroAmount } from "@/shared/ui/hero-amount";
import { ResponsiveSheet, ResponsiveSheetFooter } from "@/shared/ui/responsive-sheet";

import { draftRows, type Plan } from "./draft-rows";
import { Simulation } from "./simulation";

type Kind = Schemas["CategoryKind"];

const KINDS: { value: Kind; label: string; icon: LucideIcon }[] = [
  { value: "income", label: "Entrada", icon: ArrowDown },
  { value: "bill", label: "Conta", icon: ReceiptText },
  { value: "daily", label: "Diário", icon: ShoppingBag },
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

/** The server's 422 `date` message when a move meets a month holding two members (M5). */
const SHARED_MONTH = "must not move a series with two entries in one month";

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
  /** `moving`: Este e os próximos moves the series to a new day. */
  onSave: (fields: NewTransaction, scope?: Scope, moving?: boolean) => void;
  onDiscard: () => void;
  /** Absent: no Criar como Conta Fixa. */
  onConvert?: (source: Source) => void;
}) => {
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const currency = useCurrency();
  const categories = useCategoryChips(draft.kind);
  const keypad = useKeypad();
  const isLg = useIsLg();
  const thisMonth = useTransactions(todayISO().slice(0, 7));
  const settings = useSettings();
  const category = draft.category ?? categories.data?.[0];
  const amount = positiveAmount(draft.amount);
  const months = Number(draft.preset === "other" ? draft.custom : draft.preset);
  const series = transaction?.series;
  const minMonths = Math.max(2, series?.position ?? 2);
  const monthsValid = Number.isInteger(months) && months >= minMonths && months <= 60;
  const canRepeat = !transaction?.recurring_bill_id && !transaction?.cofrinho_id && !series;
  const installments = draft.installments && !transaction && draft.kind !== "income";
  const counted = draft.repeat || installments || Boolean(series);
  // A moved date can change the member's position; Meses na série waits for the next save.
  const moved = Boolean(series) && draft.date !== transaction?.date;
  const resizing = Boolean(series) && !moved && months !== series?.total;
  // D20: Este e os próximos moves the day of the month, never the month.
  const moving = moved && draft.scope === "following";
  const monthChanged = moving && draft.date.slice(0, 7) !== transaction?.date.slice(0, 7);
  const day = Number(draft.date.slice(8));
  const dayHelper = `${series?.position === 1 ? "Toda a série vai" : "Os próximos também vão"} para o dia ${day}.${
    day >= 29 ? " Nos meses mais curtos, no último dia." : ""
  }`;
  const resized = resizing && monthsValid ? months : undefined;
  const monthsChecked = draft.repeat || installments || resizing;
  const monthsError = submitted && monthsChecked && !monthsValid;
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
    if (!series || !resized) return;
    const added = resized - series.total;
    const end = monthYear(addMonths(series.last_date.slice(0, 7), added));
    if (added > 0) return `+${added}×${amount ? ` ${formatMoney(amount, currency)}` : ""} · até ${end}`;
    if (added === -1) return `Remove o último · termina em ${end}`;
    return `Remove os ${-added} últimos · termina em ${end}`;
  };
  const resizeNote = resizeHelper();

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const fields = (): NewTransaction | undefined => {
    setSubmitted(true);
    if (!amount || !category || (monthsChecked && !monthsValid) || !splitValid || monthChanged) return;
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

  const save = () => {
    const valid = fields();
    if (valid) onSave(valid, series ? draft.scope : undefined, moving);
  };

  // D16: while simulating, only Lançar de verdade writes; Enter must not.
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.simulate) save();
  };

  const convertible =
    onConvert && (transaction?.kind ?? draft.kind) === "bill" && !draft.repeat && !installments && !draft.simulate;

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
        {KINDS.map(({ value, label, icon: Icon }) => (
          <ToggleGroupItem
            key={value}
            value={value}
            className={cn(chip, "gap-1.5", value === "income" && "text-income-text")}
          >
            <Icon aria-hidden className="size-4" />
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <HeroAmount
        id="transaction-amount"
        label={draft.kind === "income" ? "Valor da entrada" : "Valor do gasto"}
        value={draft.amount}
        onChange={(value) => set({ amount: value })}
        invalid={submitted && !amount}
        keypad={keypad}
      />

      <CategoryChips
        kind={draft.kind}
        chosen={category}
        onChoose={(chosen) => set({ category: chosen })}
        entries={thisMonth.isError ? [] : thisMonth.data}
        error={submitted && !category ? "Escolha uma categoria" : undefined}
      />

      <div className="flex flex-col gap-2">
        <DateChips
          legend="Quando foi?"
          legendClassName={isLg ? "sr-only" : undefined}
          value={draft.date}
          min={settings.data?.opening_date}
          onChange={(date) => set({ date })}
        />
        {monthChanged && (
          <p role="alert" className="text-destructive text-sm">
            Para mudar o mês, use Só este.
          </p>
        )}
        {moving && !monthChanged && <p className="text-muted-foreground text-sm">{dayHelper}</p>}
      </div>

      <div className="flex items-center gap-2.5 rounded-xl bg-muted pl-3 focus-within:ring-3 focus-within:ring-ring/50">
        <NotebookPen aria-hidden className="size-5 shrink-0 text-muted-foreground" />
        <input
          aria-label="Observação"
          value={draft.note}
          onChange={(event) => set({ note: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          placeholder="Adicionar nota ou observação..."
          maxLength={200}
          className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        {draft.note && (
          <button
            type="button"
            aria-label="Limpar observação"
            onClick={() => set({ note: "" })}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <CircleX aria-hidden className="size-5" />
          </button>
        )}
      </div>
      {keypad && <AmountKeypad value={draft.amount} onValueChange={(value) => set({ amount: value })} />}

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
              <span id="transaction-repeat" className="flex items-center gap-2 font-medium text-base">
                <Repeat aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                Repetir lançamento (Série)
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
              <span id="transaction-split" className="flex items-center gap-2 font-medium text-base">
                <Calculator aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                Parcelar compra
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
                disabled={moved}
                className="grid w-full grid-cols-5 rounded-2xl bg-muted p-1"
              >
                {PRESETS.map((preset) => (
                  <ToggleGroupItem
                    key={preset}
                    value={preset}
                    disabled={preset !== "other" && Number(preset) < minMonths}
                    className={chip}
                  >
                    {preset === "other" ? "Outro" : `${preset}×`}
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
                    disabled={moved}
                    onChange={(event) => set({ custom: event.target.value.replace(/\D/g, "").slice(0, 2) })}
                    aria-invalid={monthsError}
                    aria-describedby={monthsError ? "transaction-months-error" : undefined}
                    className="h-12 rounded-xl bg-muted text-base tabular-nums md:text-base"
                  />
                  {monthsError && (
                    <p id="transaction-months-error" role="alert" className="text-destructive text-sm">
                      {installments ? "Escolha de 2 a 60 parcelas." : `Escolha de ${minMonths} a 60 meses.`}
                    </p>
                  )}
                </div>
              )}
              {draft.repeat && monthsValid && (
                <p className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Lightbulb aria-hidden className="size-4 shrink-0" />
                  {`${amount ? `${months}× de ${formatMoney(amount, currency)} · ` : ""}repete todo dia ${day} até ${lastMonth(draft.date, months)}`}
                </p>
              )}
              {resizeNote && <p className="text-muted-foreground text-sm">{resizeNote}</p>}
              {amount && split && splitValid && (
                <div className="flex flex-col gap-1 text-muted-foreground text-sm">
                  <p>{`Divide o valor total de ${formatMoney(amount, currency)} em ${months} parcelas automáticas`}</p>
                  <p className="font-medium text-foreground">{`Projeção: ${months}× de ${money(split[0])}`}</p>
                  {split[0] !== split[months - 1] && (
                    <p>{`Última parcela será ajustada para ${money(split[months - 1])} devido a centavos residuais.`}</p>
                  )}
                </div>
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
              Prefere transformar em conta fixa recorrente?{" "}
              <button
                type="button"
                onClick={convert}
                className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Criar como Conta Fixa
                <ArrowRight aria-hidden className="size-4" />
              </button>
            </p>
          )}
        </div>
      )}

      {series && transaction && (
        <ScopeRadio
          legend="Aplicar em"
          series={series}
          date={transaction.date}
          value={draft.scope}
          onChange={(scope) => set({ scope })}
        />
      )}

      {draft.simulate && <Simulation rows={rows} countInvalid={Boolean(amount) && monthsChecked && !monthsValid} />}

      <ResponsiveSheetFooter>
        {draft.simulate ? (
          <>
            <BrandButton type="button" onClick={save}>
              Lançar de verdade
            </BrandButton>
            <Button type="button" variant="ghost" className="h-12 w-full text-base" onClick={onDiscard}>
              Descartar
            </Button>
          </>
        ) : (
          <div className="flex items-center gap-3">
            {isLg && (
              <>
                <span className="mr-auto text-muted-foreground text-sm">
                  Pressione <Kbd>Enter ↵</Kbd> para salvar
                </span>
                <Button type="button" variant="ghost" className="h-12 text-base" onClick={onDiscard}>
                  Cancelar
                </Button>
              </>
            )}
            <BrandButton type="submit" className="lg:w-auto lg:px-6">
              <CircleCheck aria-hidden />
              Salvar Lançamento
            </BrandButton>
          </div>
        )}
      </ResponsiveSheetFooter>
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
  /** Creating with Simular on: Posso comprar isso? */
  initialSimulate?: boolean;
  /** `YYYY-MM-DD` when creating; today otherwise. */
  initialDate?: string;
  /** A line above the form. */
  hint?: string;
  /** The bill sheet that Criar como Conta Fixa opens; absent, the link is not offered. */
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
  initialSimulate = false,
  initialDate = todayISO(),
  hint,
  billSheet,
}: TransactionSheetProps) => {
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const createBill = useCreateBill();
  const [converting, setConverting] = useState<Source>();
  const isLg = useIsLg();
  const failed = () => toast.error("Não foi possível salvar o lançamento.");
  let title = isLg ? "Novo Lançamento" : "Novo Registro";
  if (transaction) title = "Editar lançamento";

  const save = (fields: NewTransaction, scope?: Scope, moving = false) => {
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
        onSuccess: () => {
          if (transaction.series && fields.repeat_months)
            return toast.success(`Série ajustada para ${fields.repeat_months} meses`);
          if (moving) return toast.success(`Série movida para o dia ${Number(fields.date.slice(8))}`);
          done(scope === "following" ? "Série atualizada" : "Lançamento atualizado");
        },
        onError: (error) =>
          error instanceof ApiError && error.errors.some(({ message }) => message === SHARED_MONTH)
            ? toast.error("Outro lançamento da série está no mesmo mês. Mova-o com Só este antes.")
            : failed(),
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
    : {
        kind: initialKind,
        amount: "",
        category: initialCategory,
        date: initialDate,
        note: "",
        ...repeat,
        simulate: initialSimulate,
      };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Cadastre uma movimentação pontual ou recorrente"
      showDescription={!transaction}
    >
      {hint && <p className="rounded-xl bg-secondary px-4 py-3 font-medium text-primary text-sm">{hint}</p>}
      <TransactionForm
        key={transaction?.id ?? `${initialKind}-${initialCategory?.id}-${initialSimulate}-${initialDate}`}
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
