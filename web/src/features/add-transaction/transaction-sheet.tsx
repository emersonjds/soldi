"use client";

import { type FormEvent, type ReactNode, useState } from "react";

import {
  ArrowDown,
  ArrowRight,
  Calculator,
  CalendarDays,
  Check,
  CircleCheck,
  CircleX,
  CreditCard,
  InfinityIcon,
  Lightbulb,
  type LucideIcon,
  NotebookPen,
  ReceiptText,
  Repeat,
  Save,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type BillPrefill, useCards, useCreateBill } from "@/entities/bill/bill-queries";
import { CategoryChips, useCategoryChips } from "@/entities/category/category-chips";
import { useSettings } from "@/entities/settings/settings-query";
import { ScopeRadio } from "@/entities/transaction/scope-radio";
import { type Every, repeatSummary, resizeLine, UNITS } from "@/entities/transaction/series-step";
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
import { ApiError, problemMessage, type Schemas } from "@/shared/api/client";
import { useCurrency } from "@/shared/lib/currency";
import { isoWeekStart, todayISO, weekdayName } from "@/shared/lib/date";
import { installmentCents } from "@/shared/lib/installments";
import { formatMoney, positiveAmount } from "@/shared/lib/money";
import { cents, fromCents } from "@/shared/lib/tier";
import { AmountKeypad, useKeypad } from "@/shared/ui/amount-keypad";
import { BrandButton } from "@/shared/ui/brand-button";
import { DateChips } from "@/shared/ui/date-chips";
import { HeroAmount } from "@/shared/ui/hero-amount";
import { ResponsiveSheet, ResponsiveSheetFooter } from "@/shared/ui/responsive-sheet";

type Kind = Schemas["CategoryKind"];

const KINDS: { value: Kind; label: string; icon: LucideIcon }[] = [
  { value: "income", label: "Entrada", icon: ArrowDown },
  { value: "bill", label: "Conta", icon: ReceiptText },
  { value: "daily", label: "Diário", icon: ShoppingBag },
];

const PRESETS = ["2", "3", "6", "12", "other"];
const SERIES_PRESETS = ["3", "6", "12", "other"];

const caption = "font-semibold text-muted-foreground text-xs uppercase tracking-[0.12em]";

const chip =
  "h-11 rounded-xl! font-semibold text-base text-muted-foreground data-[state=on]:bg-brand data-[state=on]:text-brand-foreground data-[state=on]:shadow-sm";

type Draft = {
  kind: Kind;
  amount: string;
  category?: Schemas["Category"];
  /** `""`: Nenhum. */
  cardId: string;
  date: string;
  note: string;
  repeat: boolean;
  installments: boolean;
  preset: string;
  custom: string;
  scope: Scope;
  every: Every;
};

const EVERY_LABELS: Record<Every, string> = { month: "Mensal", week: "Semanal", year: "Anual" };

type Source = Transaction | NewTransaction;

/** The server's 422 `date` message when a move meets a month holding two members (M5). */
const SHARED_MONTH = "must not move a series with two entries in one month";
/** The server's 422 `kind` message when a conta fixa or fatura payment is moved off Saída (SOL-113). */
const PAYMENT_KIND = "a conta fixa payment stays a Saída";
const FIELD_MESSAGES: [server: string, message: string][] = [
  [SHARED_MONTH, "Outro lançamento da série está no mesmo mês. Mova-o com Só este antes."],
  [
    "must not move a series with two entries in one week",
    "Outro lançamento da série está na mesma semana. Mova-o com Só este antes.",
  ],
  [PAYMENT_KIND, "Um pagamento de conta fixa continua sendo Saída."],
];

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
  onDelete,
}: {
  initial: Draft;
  transaction?: Transaction;
  /** `moving`: Este e os próximos moves the series to a new day. */
  onSave: (fields: NewTransaction, scope?: Scope, moving?: boolean) => void;
  onDiscard: () => void;
  /** Absent: no Criar como Conta Fixa. */
  onConvert?: (source: Source) => void;
  /** Excluir da Série...; absent, not offered. */
  onDelete?: () => void;
}) => {
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const currency = useCurrency();
  const categories = useCategoryChips(draft.kind);
  const keypad = useKeypad();
  const isLg = useIsLg();
  const thisMonth = useTransactions(todayISO().slice(0, 7));
  const settings = useSettings();
  const cards = useCards().data ?? [];
  const category = draft.category ?? categories.data?.[0];
  const cardId = (draft.kind === "daily" && draft.cardId) || null;
  const amount = positiveAmount(draft.amount);
  const months = Number(draft.preset === "other" ? draft.custom : draft.preset);
  const series = transaction?.series;
  const presets = series ? SERIES_PRESETS : PRESETS;
  const minMonths = Math.max(2, series?.position ?? 2);
  const monthsValid = Number.isInteger(months) && months >= minMonths && months <= 60;
  const canRepeat = !transaction?.recurring_bill_id && !transaction?.cofrinho_id && !series;
  const installments = draft.installments && !transaction && draft.kind !== "income";
  const counted = draft.repeat || installments || Boolean(series);
  // A moved date can change the member's position; Meses na série waits for the next save.
  const moved = Boolean(series) && draft.date !== transaction?.date;
  const resizing = Boolean(series) && !moved && months !== series?.total;
  const every = draft.every;
  const unit = UNITS[every];
  const weekly = every === "week";
  // D20, D32: a move keeps each member in its own month (its own ISO week when weekly).
  const moving = moved && draft.scope !== "this";
  const period = (date = "") => (weekly ? isoWeekStart(date) : date.slice(0, 7));
  const periodChanged = moving && period(draft.date) !== period(transaction?.date);
  const day = Number(draft.date.slice(8));
  const target = weekly ? weekdayName(draft.date) : `o dia ${day}`;
  const dayHelper = `${series?.position === 1 || draft.scope === "all" ? "Toda a série vai" : "Os próximos lançamentos também serão movidos automaticamente"} para ${target}.${
    !weekly && day >= 29 ? " Nos meses mais curtos, no último dia." : ""
  }`;
  const resized = resizing && monthsValid ? months : undefined;
  const monthsChecked = draft.repeat || installments || resizing;
  const monthsError = submitted && monthsChecked && !monthsValid;
  let monthsLabel = "Quantas vezes";
  if (installments) monthsLabel = "Quantas parcelas";
  if (series) monthsLabel = "Duração da série";
  const split = installments && amount && monthsValid ? installmentCents(cents(amount), months) : null;
  const splitValid = !split || split[0] > 0;
  const money = (value: number) => formatMoney(fromCents(value), currency);

  let amountLabel = draft.kind === "income" ? "Valor da entrada" : "Valor do gasto";
  if (series) amountLabel = "Valor por parcela";
  let dateLegendClass = isLg ? "sr-only" : undefined;
  if (series) dateLegendClass = caption;
  const presetLabel = (preset: string) => {
    if (series) return preset === "other" ? "Customizado" : `${preset} ${unit.many}`;
    return preset === "other" ? "Outro" : `${preset}×`;
  };

  const resizeNote = series && resized && resizeLine(every, series.last_date, resized - series.total);
  // Shortening an Entrada series loses money: no saving.
  const saving =
    series && resized && resized < series.total && amount && draft.kind !== "income"
      ? money(cents(amount) * (series.total - resized))
      : undefined;

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const fields = (): NewTransaction | undefined => {
    setSubmitted(true);
    if (!amount || !category || (monthsChecked && !monthsValid) || !splitValid || periodChanged) return;
    const note = draft.note.trim();
    return {
      date: draft.date,
      amount,
      kind: draft.kind,
      category_id: category.id,
      note: note || null,
      repeat_months: draft.repeat ? months : resized,
      repeat_every: draft.repeat ? every : undefined,
      installments: installments ? months : undefined,
      // Absent keeps the stored card; `null` takes it off.
      card_id: cardId === (transaction?.card_id ?? null) ? undefined : cardId,
      category,
    };
  };

  const save = () => {
    const valid = fields();
    if (valid) onSave(valid, series ? draft.scope : undefined, moving);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save();
  };

  const convertible = onConvert && (transaction?.kind ?? draft.kind) === "bill" && !draft.repeat && !installments;

  // Editar converts the stored entry; its unsaved edits stay out.
  const convert = () => {
    const source = transaction ?? fields();
    if (source) onConvert?.(source);
  };

  const amountField = (
    <div className="flex flex-col gap-1">
      <HeroAmount
        id="transaction-amount"
        label={amountLabel}
        value={draft.amount}
        onChange={(value) => set({ amount: value })}
        invalid={submitted && !amount}
        keypad={keypad}
      />
      {series && (
        <p className="text-center text-muted-foreground text-sm">
          {draft.scope === "this"
            ? "Novo valor aplicado só a esta cobrança."
            : "Novo valor monetário aplicado a partir desta cobrança."}
        </p>
      )}
    </div>
  );
  const categoryField = (
    <CategoryChips
      kind={draft.kind}
      chosen={category}
      onChoose={(chosen) => set({ category: chosen })}
      entries={thisMonth.isError ? [] : thisMonth.data}
      error={submitted && !category ? "Escolha uma categoria" : undefined}
    />
  );
  // D25: no card, no field.
  const cardField = draft.kind === "daily" && cards.length > 0 && (
    <Field className="gap-1.5">
      <FieldLabel htmlFor="transaction-card" className="flex items-center gap-2">
        <CreditCard aria-hidden className="size-4 text-muted-foreground" />
        Cartão
      </FieldLabel>
      <NativeSelect
        id="transaction-card"
        value={draft.cardId}
        onChange={(event) => set({ cardId: event.target.value })}
        className="w-full [&>select]:h-12 [&>select]:rounded-xl [&>select]:pl-3 [&>select]:text-base"
      >
        <NativeSelectOption value="">Nenhum</NativeSelectOption>
        {cards.map(({ id, name }) => (
          <NativeSelectOption key={id} value={id}>
            {name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
  const dateField = (
    <div className="flex flex-col gap-2">
      <DateChips
        legend={series ? "Dia de vencimento" : "Quando foi?"}
        legendClassName={dateLegendClass}
        value={draft.date}
        min={settings.data?.opening_date}
        onChange={(date) => set({ date })}
      />
      {periodChanged && (
        <p role="alert" className="text-destructive text-sm">
          {weekly ? "Para mudar a semana, use Só este." : "Para mudar o mês, use Só este."}
        </p>
      )}
      {moving && !periodChanged && (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <CalendarDays aria-hidden className="size-4 shrink-0" />
          {dayHelper}
        </p>
      )}
    </div>
  );
  const noteField = (
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
  );
  const recurringNote = transaction?.recurring_bill_id && (
    <p className="text-muted-foreground text-sm">Já é uma conta fixa recorrente.</p>
  );
  const monthsField = (canRepeat || series) && (
    <div className="flex flex-col gap-3">
      {series && (
        <div className="flex items-center justify-between gap-3">
          <span className={caption}>Duração da série</span>
          <Button
            type="button"
            variant="ghost"
            disabled={moved}
            onClick={() => set({ preset: initial.preset, custom: initial.custom })}
            className="h-11 px-3 font-medium text-primary text-sm"
          >
            Ciclo Atual
          </Button>
        </div>
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
            onCheckedChange={(repeat) => set({ repeat, installments: false, every: "month" })}
          />
        </label>
      )}
      {draft.repeat && (
        <ToggleGroup
          type="single"
          spacing={0}
          value={every}
          onValueChange={(picked: Every | "") => picked && set({ every: picked })}
          aria-label="Frequência"
          className="grid w-full grid-cols-3 rounded-2xl bg-muted p-1"
        >
          {(["month", "week", "year"] as const).map((value) => (
            <ToggleGroupItem key={value} value={value} className={chip}>
              {EVERY_LABELS[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
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
            className={cn(
              "grid w-full rounded-2xl bg-muted p-1",
              series ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-5",
            )}
          >
            {presets.map((preset) => (
              <ToggleGroupItem
                key={preset}
                value={preset}
                disabled={preset !== "other" && Number(preset) < minMonths}
                className={cn(chip, series && "gap-1")}
              >
                {series && draft.preset === preset && <Check aria-hidden className="size-4" />}
                {presetLabel(preset)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {draft.preset === "other" && (
            <div className="flex flex-col gap-1.5">
              <Input
                inputMode="numeric"
                aria-label={installments ? "Parcelas" : unit.label}
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
                  {installments ? "Escolha de 2 a 60 parcelas." : `Escolha de ${minMonths} a 60 ${unit.many}.`}
                </p>
              )}
            </div>
          )}
          {draft.repeat && monthsValid && (
            <p className="flex items-center gap-2 text-muted-foreground text-sm">
              <Lightbulb aria-hidden className="size-4 shrink-0" />
              {`${amount ? `${months}× de ${formatMoney(amount, currency)} · ` : ""}${repeatSummary(every, draft.date, months)}`}
            </p>
          )}
          {resizeNote && (
            <p className="flex items-center gap-2 text-muted-foreground text-sm">
              <Lightbulb aria-hidden className="size-4 shrink-0" />
              {resizeNote}
            </p>
          )}
          {saving && <p className="font-medium text-sm">{`Economia projetada de ${saving} no orçamento previsto.`}</p>}
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
          {!series && every === "month" && day >= 29 && (
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
  );

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      {series && transaction ? (
        <>
          <p className="text-muted-foreground text-sm">
            Você está editando a parcela {series.position} de {series.total}:{" "}
            <span className="font-medium text-foreground">"{transaction.note ?? transaction.category.name}"</span> (
            {formatMoney(transaction.amount, currency)})
          </p>
          <ScopeRadio
            legend="Escopo da Alteração"
            mode="edit"
            series={series}
            date={transaction.date}
            value={draft.scope}
            onChange={(scope) => set({ scope })}
          />
          {amountField}
          {monthsField}
          {dateField}
          {categoryField}
          {cardField}
          {noteField}
          {recurringNote}
        </>
      ) : (
        <>
          {!transaction?.recurring_bill_id && (
            <ToggleGroup
              type="single"
              spacing={0}
              value={draft.kind}
              onValueChange={(kind: Kind | "") =>
                kind &&
                set({ kind, category: undefined, cardId: "", installments: draft.installments && kind !== "income" })
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
          )}
          {amountField}
          {categoryField}
          {cardField}
          {dateField}
          {noteField}
          {recurringNote}
          {monthsField}
        </>
      )}

      <ResponsiveSheetFooter>
        {keypad && <AmountKeypad value={draft.amount} onValueChange={(value) => set({ amount: value })} />}
        <div className={cn("flex flex-wrap items-center gap-3", series && "lg:gap-1")}>
          {series && onDelete && (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto h-12 text-base text-destructive hover:text-destructive lg:h-10 lg:gap-1.5 lg:px-2 lg:text-sm"
              onClick={onDelete}
            >
              <Trash2 aria-hidden />
              Excluir da Série...
            </Button>
          )}
          {isLg && (
            <Button
              type="button"
              variant="ghost"
              className={cn("ml-auto h-12 text-base", series && "lg:h-10 lg:px-3 lg:text-sm")}
              onClick={onDiscard}
            >
              Cancelar
            </Button>
          )}
          <BrandButton
            type="submit"
            className={cn("lg:w-auto lg:px-6", series && "lg:min-h-10 lg:gap-1.5 lg:px-4 lg:text-sm")}
          >
            {series ? <Save aria-hidden /> : <CircleCheck aria-hidden />}
            {series ? "Salvar Alterações na Série" : "Salvar Lançamento"}
          </BrandButton>
        </div>
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
  /** `YYYY-MM-DD` when creating; today otherwise. */
  initialDate?: string;
  /** A line above the form. */
  hint?: string;
  /** Excluir da Série... closes the sheet and calls it; absent, not offered. */
  onDelete?: () => void;
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
  initialDate = todayISO(),
  hint,
  billSheet,
  onDelete,
}: TransactionSheetProps) => {
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const createBill = useCreateBill();
  const [converting, setConverting] = useState<Source>();
  const isLg = useIsLg();
  const failed = () => toast.error("Não foi possível salvar o lançamento.");
  let title = isLg ? "Novo Lançamento" : "Novo Registro";
  if (transaction) title = transaction.series ? "Editar Lançamento Recorrente" : "Editar lançamento";

  const save = (fields: NewTransaction, scope?: Scope, moving = false) => {
    onOpenChange(false);
    const every = transaction?.series?.every ?? "month";
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
            return toast.success(
              `Série ajustada com sucesso para ${fields.repeat_months} ${UNITS[every].many} ${UNITS[every].future}.`,
            );
          if (moving)
            return toast.success(
              `Série movida para ${every === "week" ? weekdayName(fields.date) : `o dia ${Number(fields.date.slice(8))}`}`,
            );
          done(scope && scope !== "this" ? "Série atualizada" : "Lançamento atualizado");
        },
        onError: (error) =>
          toast.error(
            (error instanceof ApiError &&
              FIELD_MESSAGES.find(([server]) => error.errors.some(({ message }) => message === server))?.[1]) ||
              (problemMessage(error) ?? "Não foi possível salvar o lançamento."),
          ),
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
    preset: "12",
    custom: "",
    scope: "this",
    every: transaction?.series?.every ?? "month",
  } as const;
  const total = String(transaction?.series?.total ?? "");
  const initial: Draft = transaction
    ? {
        kind: transaction.kind,
        amount: transaction.amount,
        category: transaction.category,
        cardId: transaction.card_id ?? "",
        date: transaction.date,
        note: transaction.note ?? "",
        ...repeat,
        ...(total && { preset: SERIES_PRESETS.includes(total) ? total : "other", custom: total }),
      }
    : {
        kind: initialKind,
        amount: "",
        category: initialCategory,
        cardId: "",
        date: initialDate,
        note: "",
        ...repeat,
      };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      eyebrow={
        transaction?.series && (
          <p className="-mb-4 flex items-center gap-2 pr-12 font-medium text-primary text-sm">
            <InfinityIcon aria-hidden className="size-4" />
            Parte de uma série de {transaction.series.total} {UNITS[transaction.series.every].many}
          </p>
        )
      }
      description="Cadastre uma movimentação pontual ou recorrente"
      showDescription={!transaction}
      wide
    >
      {hint && <p className="rounded-xl bg-secondary px-4 py-3 font-medium text-primary text-sm">{hint}</p>}
      <TransactionForm
        key={transaction?.id ?? `${initialKind}-${initialCategory?.id}-${initialDate}`}
        initial={initial}
        transaction={transaction}
        onSave={save}
        onConvert={billSheet && setConverting}
        onDiscard={() => onOpenChange(false)}
        onDelete={
          onDelete &&
          (() => {
            onOpenChange(false);
            onDelete();
          })
        }
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
