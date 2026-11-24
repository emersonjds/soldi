"use client";

import { type FormEvent, type ReactNode, useState } from "react";

import {
  ArrowDown,
  CalendarDays,
  Check,
  CircleCheck,
  CircleStop,
  CircleX,
  CreditCard,
  InfinityIcon,
  Layers,
  Lightbulb,
  type LucideIcon,
  NotebookPen,
  Pencil,
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
import { monthsBetween } from "@/entities/bill/bill-plan";
import { type Bill, type BillPrefill, useBills, useCards, useCreateBill } from "@/entities/bill/bill-queries";
import { CategoryChips, useCategoryChips } from "@/entities/category/category-chips";
import { useSettings } from "@/entities/settings/settings-query";
import { ScopeRadio } from "@/entities/transaction/scope-radio";
import { SeriesAllDialog } from "@/entities/transaction/series-all-dialog";
import { type Every, OPEN_LABEL, repeatSummary, resizeLine, UNITS } from "@/entities/transaction/series-step";
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
import { addMonths, isoWeekStart, lastDay, monthAbbrev, todayISO, weekdayName } from "@/shared/lib/date";
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

/** `always`: Sempre, an open series (D36). */
const PRESETS = ["always", "2", "3", "6", "12", "other"];
const PRESET_LABELS: Record<string, string> = { always: "Sempre", other: "Outro" };

const REPEAT_OFF = {
  repeat: false,
  every: "month",
  preset: "always",
  custom: "",
  starting: false,
  first: "1",
} as const;

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
  preset: string;
  custom: string;
  /** Começa na parcela, shown. */
  starting: boolean;
  first: string;
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

const presetOf = (open: boolean, total: string) => {
  if (open) return "always";
  return PRESETS.includes(total) ? total : "other";
};

/** SOL-160: what a conversion does to the series' members, by the kind Parcelado says. */
const seriesHint = (lastDate: string) => (parcelado: boolean) => {
  if (lastDate.slice(0, 7) <= todayISO().slice(0, 7))
    return parcelado
      ? "Os lançamentos desta série viram pagamentos desta conta. A última parcela é deste mês."
      : "Os lançamentos desta série viram pagamentos desta conta. Daqui em diante, a conta fixa prevê todo mês, sem fim.";
  const ahead =
    "Os lançamentos desta série até este mês viram pagamentos desta conta. Os dos próximos meses saem da lista:";
  return parcelado
    ? `${ahead} a conta prevê cada parcela até ${monthAbbrev(lastDate)}.`
    : `${ahead} a conta fixa prevê todo mês, sem fim.`;
};

/** D20's series day: the last member's, or the larger of the two when it sits clamped on its month's last day. */
const seriesDay = (lastDate: string, date: string) => {
  const day = Number(lastDate.slice(8));
  return day === lastDay(lastDate.slice(0, 7)) ? Math.max(day, Number(date.slice(8))) : day;
};

/**
 * D44: a series running through this month keeps its end as a parcelado bill, over its month span from the first
 * member (deleted members leave `total` short of it).
 */
const prefillOf = (source: Source): BillPrefill => {
  const { note, category, amount, date } = source;
  const prefill = {
    name: (note ?? category.name).slice(0, 100),
    amount,
    due_day: Number(date.slice(8)),
    category_id: category.id,
  };
  const series = "series" in source ? source.series : undefined;
  if (!series) return prefill;
  const month = series.last_date.slice(0, 7);
  const runsOn = !series.open_ended && month >= todayISO().slice(0, 7);
  const installments = Math.max(series.total, monthsBetween(date, month) + series.position);
  return {
    ...prefill,
    due_day: seriesDay(series.last_date, date),
    ...(runsOn && { installments, last_month: `${month}-01` }),
  };
};

const kindButton = "h-auto min-h-12 min-w-0 flex-1 whitespace-normal text-base";

/** SOL-161: a payment opens its conta; the list leaves archived ones out. */
const PaidBill = ({ billId, onEdit }: { billId: string; onEdit: (bill: Bill) => void }) => {
  const bills = useBills({ includeInactive: true });
  const bill = bills.data?.find((each) => each.id === billId);
  if (bills.data && !bill)
    return <p className="text-muted-foreground text-sm">A conta deste pagamento foi excluída.</p>;
  return (
    <Button
      type="button"
      variant="outline"
      className={kindButton}
      disabled={!bill}
      onClick={() => bill && onEdit(bill)}
    >
      <Pencil aria-hidden />
      {bill?.closing_day != null ? "Editar cartão" : "Editar conta"}
    </Button>
  );
};

const TransactionForm = ({
  initial,
  transaction,
  onSave,
  onParcelada,
  onConvert,
  onEditBill,
  onDiscard,
  onDelete,
  onOpenEnded,
}: {
  initial: Draft;
  transaction?: Transaction;
  /** `moving`: Este e os próximos moves the series to a new day. */
  onSave: (fields: NewTransaction, scope?: Scope, moving?: boolean) => void;
  /** D47: the entry, then the conta parcelada linked to it. */
  onParcelada: (fields: NewTransaction, bill: BillPrefill) => void;
  onDiscard: () => void;
  /** Absent: no Transformar em conta. `parcelado`: the kind picked. */
  onConvert?: (source: Source, parcelado: boolean) => void;
  /** Absent: a payment offers no Editar conta. */
  onEditBill?: (bill: Bill) => void;
  /** Excluir da Série...; absent, not offered. */
  onDelete?: () => void;
  /** Parar recorrência (`false`) or Tornar sem fim (`true`) on a series member. */
  onOpenEnded?: (openEnded: boolean) => void;
}) => {
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [asking, setAsking] = useState(false);
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
  const openEnded = draft.preset === "always";
  const months = Number(draft.preset === "other" ? draft.custom : draft.preset);
  const series = transaction?.series;
  const minMonths = Math.max(2, series?.position ?? 2);
  const monthsValid = Number.isInteger(months) && months >= minMonths && months <= 60;
  const canRepeat = !transaction?.recurring_bill_id && !transaction?.cofrinho_id && !series;
  // A moved date can change the member's position; Quantas vezes waits for the next save.
  const moved = Boolean(series) && draft.date !== transaction?.date;
  // An open member has no length to resize (D36).
  const resizing = Boolean(series) && !series?.open_ended && !moved && months !== series?.total;
  const every = draft.every;
  const counting = draft.repeat && !openEnded;
  // `first_installment` rides only on monthly `installments` (D16), never on an Entrada.
  const canStart = counting && !transaction && draft.kind !== "income" && every === "month";
  const starting = canStart && draft.starting;
  const first = Number(draft.first);
  const firstValid = Number.isInteger(first) && first >= 1 && first <= months;
  const offset = starting && firstValid && first > 1;
  const written = offset ? months - first + 1 : months;
  // `open_ended` 422s on a bill (D36): a conta fixa instead.
  const refused = draft.repeat && openEnded && draft.kind === "bill";
  const counted = (draft.repeat && !refused) || Boolean(series);
  // SOL-156: a new or standalone Conta counts parcelas, never Sempre.
  const parcelado = draft.kind === "bill" && !series;
  // D47: `check_plan` takes a plan starting this month or the next; any other stays a series (D14).
  const ahead = monthsBetween(todayISO(), draft.date);
  const conta = parcelado && counting && every === "month" && ahead >= 0 && ahead <= 1;
  const parcela = offset ? first : 1;
  const lastMonth = addMonths(draft.date.slice(0, 7), months - parcela);
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
  const monthsChecked = counting || resizing;
  const monthsError = submitted && monthsChecked && !monthsValid;
  const firstError = submitted && starting && monthsValid && !firstValid;
  const weekday = weekdayName(draft.date);
  const openLine = {
    month: `todo dia ${day}`,
    week: `${/^(sábado|domingo)/.test(weekday) ? "todo" : "toda"} ${weekday}`,
    year: `todo ${day}/${draft.date.slice(5, 7)}`,
  }[every];
  const money = (value: number) => formatMoney(fromCents(value), currency);

  let amountLabel = draft.kind === "income" ? "Valor da entrada" : "Valor do gasto";
  if (parcelado && counting) amountLabel = "Valor da parcela";
  if (series) amountLabel = "Valor por parcela";
  let dateLegendClass = isLg ? "sr-only" : undefined;
  if (series) dateLegendClass = caption;

  const resizeNote = series && resized && resizeLine(every, series.last_date, resized - series.total);
  // Shortening an Entrada series loses money: no saving.
  const saving =
    series && resized && resized < series.total && amount && draft.kind !== "income"
      ? money(cents(amount) * (series.total - resized))
      : undefined;

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  /** `repeat` false: the plain entry, for a conta fixa. */
  const fields = (repeat = draft.repeat && !conta): NewTransaction | undefined => {
    setSubmitted(true);
    const counts = repeat && counting;
    if (!amount || !category || periodChanged) return;
    if ((counting || resizing) && !monthsValid) return;
    if (starting && !firstValid) return;
    const note = draft.note.trim();
    const parcelas = counts && offset;
    let repeatMonths = resized;
    if (counts) repeatMonths = parcelas ? undefined : months;
    return {
      date: draft.date,
      // Parcelas split a total (D16): the total of N equal ones.
      amount: parcelas ? fromCents(cents(amount) * months) : amount,
      kind: draft.kind,
      category_id: category.id,
      note: note || null,
      repeat_months: repeatMonths,
      repeat_every: repeat && !parcelas ? every : undefined,
      open_ended: repeat && openEnded ? true : undefined,
      installments: parcelas ? months : undefined,
      first_installment: parcelas ? first : undefined,
      // Absent keeps the stored card; `null` takes it off.
      card_id: cardId === (transaction?.card_id ?? null) ? undefined : cardId,
      category,
    };
  };

  const save = (confirmed = false) => {
    const valid = fields();
    if (!valid) return;
    if (refused) return convert();
    if (conta) return onParcelada(valid, { ...prefillOf(valid), installments: months, last_month: `${lastMonth}-01` });
    // D33: asked here, before onSave closes the sheet and this dialog with it.
    if (series && draft.scope === "all" && !confirmed) return setAsking(true);
    onSave(valid, series ? draft.scope : undefined, moving);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save();
  };

  // D44, D45: the server takes a monthly series member, never a weekly or yearly one; one that ended before this
  // month has nothing left to owe as a parcelada.
  const ended = series != null && series.last_date.slice(0, 7) < todayISO().slice(0, 7);
  const convertible =
    onConvert &&
    transaction?.kind === "bill" &&
    series?.every === "month" &&
    !transaction.recurring_bill_id &&
    !transaction.cofrinho_id &&
    !transaction.card_id;

  // Editar converts the stored entry; its unsaved edits stay out.
  const convert = (parcelado = false) => {
    const source = transaction ?? fields(false);
    if (source) onConvert?.(source, parcelado);
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
        <p className="text-muted-foreground text-center text-sm">
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
        <CreditCard aria-hidden className="text-muted-foreground size-4" />
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
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <CalendarDays aria-hidden className="size-4 shrink-0" />
          {dayHelper}
        </p>
      )}
    </div>
  );
  const noteField = (
    <div className="bg-muted focus-within:ring-ring/50 flex items-center gap-2.5 rounded-xl pl-3 focus-within:ring-3">
      <NotebookPen aria-hidden className="text-muted-foreground size-5 shrink-0" />
      <input
        aria-label="Observação"
        value={draft.note}
        onChange={(event) => set({ note: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        placeholder="Adicionar nota ou observação..."
        maxLength={200}
        className="placeholder:text-muted-foreground h-12 min-w-0 flex-1 bg-transparent text-base outline-none"
      />
      {draft.note && (
        <button
          type="button"
          aria-label="Limpar observação"
          onClick={() => set({ note: "" })}
          className="text-muted-foreground focus-visible:outline-ring flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2"
        >
          <CircleX aria-hidden className="size-5" />
        </button>
      )}
    </div>
  );
  const paidBill = transaction?.recurring_bill_id && onEditBill && (
    <PaidBill billId={transaction.recurring_bill_id} onEdit={onEditBill} />
  );
  const repeatSwitch = (id: string, Icon: LucideIcon, label: string, checked: boolean, preset = "always") => (
    <label
      htmlFor={`${id}-switch`}
      className="bg-muted flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-4"
    >
      <span id={id} className="flex items-center gap-2 text-base font-medium">
        <Icon aria-hidden className="text-muted-foreground size-5 shrink-0" />
        {label}
      </span>
      <Switch
        id={`${id}-switch`}
        aria-labelledby={id}
        checked={checked}
        onCheckedChange={(on) => set({ ...REPEAT_OFF, ...(on && { repeat: true, preset }) })}
      />
    </label>
  );
  // A stored Diário or Entrada switched to Conta is not a conta fixa to convert.
  const fixable = onConvert && (transaction ?? draft).kind === "bill";
  const monthsField = (canRepeat || series) && (
    <div className="flex flex-col gap-3">
      {canRepeat && !parcelado && repeatSwitch("transaction-repeat", Repeat, "Recorrente", draft.repeat)}
      {canRepeat && parcelado && (
        <>
          {fixable && repeatSwitch("transaction-fixed", Repeat, "Conta fixa", refused)}
          {refused && (
            <p className="text-muted-foreground text-sm">
              Todo mês, sem fim. Ao salvar, abre o cadastro da conta fixa.
            </p>
          )}
          {repeatSwitch("transaction-installments", Layers, "Parcelado", counting, "")}
        </>
      )}
      {draft.repeat && !refused && (
        <ToggleGroup
          type="single"
          spacing={0}
          value={every}
          onValueChange={(picked: Every | "") => picked && set({ every: picked })}
          aria-label="Frequência"
          className="bg-muted grid w-full grid-cols-3 rounded-2xl p-1"
        >
          {(["month", "week", "year"] as const).map((value) => (
            <ToggleGroupItem key={value} value={value} className={chip}>
              {EVERY_LABELS[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      {counted && (
        <>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span className={caption}>{parcelado ? "Quantas parcelas" : "Quantas vezes"}</span>
            {series && (
              <Button
                type="button"
                variant="ghost"
                disabled={moved}
                onClick={() => set({ preset: initial.preset, custom: initial.custom })}
                className="text-primary h-11 px-3 text-sm font-medium"
              >
                Ciclo Atual
              </Button>
            )}
          </div>
          <ToggleGroup
            type="single"
            spacing={0}
            value={draft.preset}
            onValueChange={(preset: string) => preset && set({ preset })}
            aria-label={parcelado ? "Quantas parcelas" : "Quantas vezes"}
            disabled={moved || series?.open_ended}
            className="bg-muted grid w-full grid-cols-3 rounded-2xl p-1"
          >
            {(parcelado ? PRESETS.slice(1) : PRESETS).map((preset) => (
              <ToggleGroupItem
                key={preset}
                value={preset}
                // Sempre on a bounded member is Tornar sem fim, not a resize.
                disabled={Boolean(series) && (preset === "always" || Number(preset) < minMonths)}
                // The base item's px-2 outranks a plain pl-3.
                className={cn(chip, "gap-1.5", draft.preset === preset && "pl-3!")}
              >
                {draft.preset === preset && <Check aria-hidden className="size-4" />}
                {PRESET_LABELS[preset] ?? preset}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {submitted && counting && !draft.preset && (
            <p role="alert" className="text-destructive text-sm">
              Escolha quantas parcelas.
            </p>
          )}
          {draft.preset === "other" && (
            <div className="flex flex-col gap-1.5">
              <Input
                inputMode="numeric"
                aria-label={unit.label}
                placeholder={`De ${minMonths} a 60`}
                value={draft.custom}
                disabled={moved}
                onChange={(event) => set({ custom: event.target.value.replace(/\D/g, "").slice(0, 2) })}
                aria-invalid={monthsError}
                aria-describedby={monthsError ? "transaction-months-error" : undefined}
                className="bg-muted h-12 rounded-xl text-base tabular-nums md:text-base"
              />
              {monthsError && (
                <p id="transaction-months-error" role="alert" className="text-destructive text-sm">
                  {`Escolha de ${minMonths} a 60 vezes.`}
                </p>
              )}
            </div>
          )}
          {canStart && !draft.starting && (
            <button
              type="button"
              onClick={() => set({ starting: true })}
              className="text-primary focus-visible:outline-ring inline-flex min-h-11 items-center self-start text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-2"
            >
              Já começou em outra parcela?
            </button>
          )}
          {starting && (
            <Field className="gap-1.5">
              <FieldLabel htmlFor="transaction-first">Começa na parcela</FieldLabel>
              <Input
                id="transaction-first"
                inputMode="numeric"
                value={draft.first}
                onChange={(event) => set({ first: event.target.value.replace(/\D/g, "").slice(0, 2) })}
                aria-invalid={firstError}
                aria-describedby={firstError ? "transaction-first-error" : undefined}
                className="bg-muted h-12 rounded-xl text-base tabular-nums md:text-base"
              />
              {firstError && (
                <p id="transaction-first-error" role="alert" className="text-destructive text-sm">
                  {`Escolha de 1 a ${months}.`}
                </p>
              )}
            </Field>
          )}
          {counting && monthsValid && (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Lightbulb aria-hidden className="size-4 shrink-0" />
              {`${amount ? `${written}× de ${formatMoney(amount, currency)} · ` : ""}${repeatSummary(every, draft.date, written)}`}
            </p>
          )}
          {conta && monthsValid && (
            <p className="text-muted-foreground text-sm">
              {parcela === months
                ? "Vira uma conta parcelada: este lançamento paga a última parcela."
                : `Vira uma conta parcelada: este lançamento paga a parcela ${parcela} e as próximas ficam em Contas a pagar até ${monthAbbrev(lastMonth)}.`}
            </p>
          )}
          {draft.repeat && openEnded && (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Lightbulb aria-hidden className="size-4 shrink-0" />
              {`Repete ${openLine}, sem data para parar.`}
            </p>
          )}
          {resizeNote && (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Lightbulb aria-hidden className="size-4 shrink-0" />
              {resizeNote}
            </p>
          )}
          {saving && <p className="text-sm font-medium">{`Economia projetada de ${saving} no orçamento previsto.`}</p>}
          {!series && every === "month" && day >= 29 && (
            <p className="text-muted-foreground text-xs">Em meses mais curtos, cai no último dia.</p>
          )}
        </>
      )}
      {convertible && series && (
        <div className="flex flex-col gap-2">
          <span className={caption}>Transformar em conta</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className={kindButton} onClick={() => convert(false)}>
              <Repeat aria-hidden />
              Conta fixa
            </Button>
            {!ended && (
              <Button type="button" variant="outline" className={kindButton} onClick={() => convert(true)}>
                <Layers aria-hidden />
                Conta parcelada
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            {ended
              ? `A série terminou em ${monthAbbrev(series.last_date)}. Como conta fixa, volta a prever todo mês.`
              : `Fixa: todo mês, sem fim. Parcelada: termina em ${monthAbbrev(series.last_date)}.`}
          </p>
        </div>
      )}
    </div>
  );

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      {series && transaction ? (
        <>
          <p className="text-muted-foreground text-sm">
            Você está editando a parcela {series.position} de {series.total}:{" "}
            <span className="text-foreground font-medium">"{transaction.note ?? transaction.category.name}"</span> (
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
          <SeriesAllDialog
            mode="edit"
            position={series.position}
            total={series.total}
            open={asking}
            onOpenChange={setAsking}
            onConfirm={() => save(true)}
          />
          {amountField}
          {monthsField}
          {onOpenEnded && (
            <Button
              type="button"
              variant="outline"
              className="h-12 text-base"
              onClick={() => onOpenEnded(!series.open_ended)}
            >
              {series.open_ended ? <CircleStop aria-hidden /> : <InfinityIcon aria-hidden />}
              {series.open_ended ? "Parar recorrência" : "Tornar sem fim"}
            </Button>
          )}
          {dateField}
          {categoryField}
          {cardField}
          {noteField}
          {paidBill}
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
                set({
                  kind,
                  category: undefined,
                  cardId: "",
                  ...((kind === "bill" || draft.kind === "bill") && REPEAT_OFF),
                })
              }
              aria-label="Tipo"
              className="bg-muted grid w-full grid-cols-3 rounded-2xl p-1"
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
          {paidBill}
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
              className="text-destructive hover:text-destructive mr-auto h-12 text-base lg:h-10 lg:gap-1.5 lg:px-2 lg:text-sm"
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
  /** The bill sheet that Transformar em conta opens; absent, it is not offered. */
  billSheet?: (props: {
    /** Given: the sheet edits it (Editar conta on a payment). */
    bill?: Bill;
    prefill?: BillPrefill;
    parcelado?: boolean;
    hint?: (parcelado: boolean) => string;
    onOpenChange: (open: boolean) => void;
    onCreate?: (bill: BillPrefill) => void;
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
  const [converting, setConverting] = useState<{ source: Source; parcelado: boolean }>();
  const [editingBill, setEditingBill] = useState<Bill>();
  const isLg = useIsLg();
  const failed = () => toast.error("Não foi possível salvar o lançamento.");
  let title = isLg ? "Novo Lançamento" : "Novo Registro";
  if (transaction) title = transaction.series ? "Editar Lançamento Recorrente" : "Editar lançamento";

  const save = (fields: NewTransaction, scope?: Scope, moving = false) => {
    onOpenChange(false);
    const every = transaction?.series?.every ?? "month";
    const done = (fallback: string) => {
      if (fields.installments)
        return toast.success(`${fields.installments - (fields.first_installment ?? 1) + 1} lançamentos criados`);
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

  const setOpenEnded = (id: string, openEnded: boolean) => {
    onOpenChange(false);
    update.mutate(
      { id, open_ended: openEnded },
      {
        onSuccess: () => {
          if (openEnded) return toast.success("Série atualizada");
          toast.success("Recorrência parada. Sai dos próximos meses.", {
            action: { label: "Desfazer", onClick: () => setOpenEnded(id, true) },
          });
        },
        onError: (error) => toast.error(problemMessage(error) ?? "Não foi possível salvar o lançamento."),
      },
    );
  };

  // Lançar posts the entry first, Editar's conta parcelada patches it first (D47); a stored one is linked as it is.
  const convert = async (source: Source, bill: BillPrefill) => {
    onOpenChange(false);
    let transactionId: string;
    try {
      if ("id" in source) transactionId = source.id;
      else if (transaction) {
        const { category: _category, ...patch } = source;
        await update.mutateAsync({ id: transaction.id, ...patch });
        transactionId = transaction.id;
      } else transactionId = (await create.mutateAsync(source)).id;
    } catch {
      return failed();
    }
    const refused = (error: Error) => {
      if ("id" in source) return problemMessage(error) ?? "Não foi possível criar a conta fixa.";
      if (bill.installments)
        return "O lançamento foi salvo, mas a conta parcelada não foi criada. Tente de novo em Editar.";
      return "Lançado, mas a conta fixa não foi criada.";
    };
    createBill.mutate(
      { ...bill, transactionId },
      {
        onSuccess: () => toast.success(bill.installments ? "Conta parcelada criada" : "Conta fixa criada"),
        onError: (error) => toast.error(refused(error)),
      },
    );
  };

  const repeat = {
    repeat: false,
    preset: "always",
    custom: "",
    starting: false,
    first: "1",
    scope: "this",
    every: transaction?.series?.every ?? "month",
  } as const;
  const series = transaction?.series;
  const total = String(series?.total ?? "");
  const initial: Draft = transaction
    ? {
        kind: transaction.kind,
        amount: transaction.amount,
        category: transaction.category,
        cardId: transaction.card_id ?? "",
        date: transaction.date,
        note: transaction.note ?? "",
        ...repeat,
        ...(series && { preset: presetOf(series.open_ended, total), custom: total }),
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
          <p className="text-primary -mb-4 flex items-center gap-2 pr-12 text-sm font-medium">
            <InfinityIcon aria-hidden className="size-4" />
            {transaction.series.open_ended
              ? `Lançamento recorrente, ${OPEN_LABEL[transaction.series.every].toLowerCase()}`
              : `Parte de uma série de ${transaction.series.total} ${UNITS[transaction.series.every].many}`}
          </p>
        )
      }
      description="Cadastre uma movimentação pontual ou recorrente"
      showDescription={!transaction}
      wide
    >
      {hint && <p className="bg-secondary text-primary rounded-xl px-4 py-3 text-sm font-medium">{hint}</p>}
      <TransactionForm
        key={transaction?.id ?? `${initialKind}-${initialCategory?.id}-${initialDate}`}
        initial={initial}
        transaction={transaction}
        onSave={save}
        onParcelada={(fields, bill) => void convert(fields, bill)}
        onConvert={billSheet && ((source, parcelado) => setConverting({ source, parcelado }))}
        onEditBill={billSheet && setEditingBill}
        onDiscard={() => onOpenChange(false)}
        onOpenEnded={
          transaction?.series && (transaction.series.open_ended || transaction.kind !== "bill")
            ? (openEnded) => setOpenEnded(transaction.id, openEnded)
            : undefined
        }
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
          prefill: prefillOf(converting.source),
          parcelado: converting.parcelado,
          hint:
            "series" in converting.source && converting.source.series
              ? seriesHint(converting.source.series.last_date)
              : undefined,
          onOpenChange: (open) => open || setConverting(undefined),
          onCreate: (bill) => void convert(converting.source, bill),
        })}
      {editingBill && billSheet?.({ bill: editingBill, onOpenChange: (open) => open || setEditingBill(undefined) })}
    </ResponsiveSheet>
  );
};
