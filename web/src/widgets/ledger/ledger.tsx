"use client";

import { type ReactNode, useId } from "react";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, CreditCard } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useBills, useCards } from "@/entities/bill/bill-queries";
import { categoriesQuery, categoryLabel } from "@/entities/category/categories-query";
import { billKey, previstoKey } from "@/entities/month/forecast-alert";
import { OPEN_LABEL } from "@/entities/transaction/series-step";
import type { Transaction } from "@/entities/transaction/transaction-queries";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { type Currency, useCurrency } from "@/shared/lib/currency";
import { dayMonth, monthName, shortDay, todayISO, yesterdayISO } from "@/shared/lib/date";
import { formatMoney } from "@/shared/lib/money";
import { cents, TIER_STYLE } from "@/shared/lib/tier";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { EstimateIcon } from "@/shared/ui/estimate-icon";
import { Money } from "@/shared/ui/money";
import { MonthLink } from "@/shared/ui/month-link";
import { SectionToggle } from "@/shared/ui/section-toggle";
import { TierPill } from "@/shared/ui/tier-pill";

import { type Entry, titleOf, useEntryActions } from "./entry-actions";

const KIND_LABEL: Record<Schemas["CategoryKind"], string> = { income: "Entrada", bill: "Saída", daily: "Diário" };

export const dayLabel = ({ date, is_future }: Pick<Schemas["Day"], "date" | "is_future">) => {
  const short = shortDay(date);
  if (is_future) return `Previsto · ${short}`;
  if (date === todayISO()) return `Hoje, ${short}`;
  if (date === yesterdayISO()) return `Ontem, ${short}`;
  return short;
};

/** Money put in a cofrinho: a bill under Economia or one of its children. */
const isSaved = ({ kind, category }: Transaction, categories: Schemas["Category"][] = []) =>
  kind === "bill" &&
  (category.is_savings || categories.some((each) => each.id === category.parent_id && each.is_savings));

type Due = Schemas["BillOfMonth"];

/** The same words as Contas a pagar (SOL-153). */
const billKind = ({ is_card, installment, installments }: Due) => {
  if (is_card) return "Fatura";
  if (!installments) return "Conta fixa";
  return installment === installments ? "Última parcela" : `Parcela ${installment}/${installments}`;
};

/** Without the month's row, the payment date cannot tell which parcela was paid (D35). */
const paidCaption = (transaction: Transaction, billsOfMonth: Due[], bills: Schemas["Bill"][] = []) => {
  const row = billsOfMonth.find(({ transaction_id }) => transaction_id === transaction.id);
  if (row) return `${billKind(row)} · paga`;
  const bill = bills.find(({ id }) => id === transaction.recurring_bill_id);
  if (bill?.closing_day != null) return "Fatura · paga";
  return bill?.installments ? "Conta parcelada · paga" : "Conta fixa · paga";
};

/** `Economia › Reserva` with `Guardado` for money put away, `Resgate › Reserva` with `Resgatado` for money taken back. */
export const entryOf = (
  transaction: Transaction,
  categories: Schemas["Category"][] = [],
  billsOfMonth: Due[],
  bills?: Schemas["Bill"][],
): Entry => {
  const { category } = transaction;
  const byId = (id?: string | null) => categories.find((each) => each.id === id);
  if (transaction.kind === "income" && category.is_savings) {
    const from = byId(transaction.cofrinho_id)?.name;
    return { label: from ? `${category.name} › ${from}` : category.name, caption: "Resgatado" };
  }
  const label = categoryLabel(category, categories);
  if (isSaved(transaction, categories)) return { label, caption: "Guardado" };
  if (transaction.kind === "bill" && transaction.recurring_bill_id)
    return { label, caption: paidCaption(transaction, billsOfMonth, bills) };
  return { label, caption: KIND_LABEL[transaction.kind] };
};

/** Same rule as the day balance: only income adds; a deposit into a cofrinho takes from it. */
const addsToBalance = (transaction: Transaction) => transaction.kind === "income";

type Day = Schemas["Day"];

/** Days with entries or an unpaid bill landed on them, newest first. */
// ponytail: days × entries scan, 31 days a month.
const groupByDay = (days: Day[], transactions: Transaction[], bills: Due[]) =>
  days
    .map((day) => ({
      date: day.date,
      day,
      entries: transactions.filter((transaction) => transaction.date === day.date),
      due: bills.filter((bill) => bill.lands_on === day.date),
    }))
    .filter(({ entries, due }) => entries.length > 0 || due.length > 0)
    .reverse();

/** A day ahead, or today once an unpaid bill landed on it. */
export const isForecast = (day: Day) => day.is_future || day.projected_balance !== day.balance;

/** The day header's "Saldo ao final:" / "Projeção:" line. */
export const DayBalance = ({ day }: { day: Day }) => (
  <span className="flex items-center gap-1.5">
    <span className="font-medium">{day.is_future ? "Projeção:" : "Saldo ao final:"}</span>
    <Money amount={day.projected_balance} className={cn("font-bold", TIER_STYLE[day.projected_tier].label)} />
    <TierPill tier={day.projected_tier} forecast={!day.is_future && isForecast(day)} size="sm" />
  </span>
);

const Cause = ({ id }: { id?: string }) => (
  <span id={id} className="text-expense text-xs">
    Motivo da queda
  </span>
);

const dueStatus = (bill: Due, month: string) => {
  if (!bill.due_date.startsWith(month)) return `venceu em ${monthName(bill.due_date, month)}`;
  return bill.overdue ? `venceu dia ${dayMonth(bill.due_date)}` : "a pagar";
};

export const dueCaption = (bill: Due, month: string) =>
  `${billKind(bill)} · ${dueStatus(bill, month)}${bill.variable ? " · valor variável" : ""}`;

const DueRow = ({ bill, month, cause }: { bill: Due; month: string; cause: boolean }) => (
  <li
    aria-label={bill.due_date.startsWith(month) ? bill.name : `${bill.name} de ${monthName(bill.due_date, month)}`}
    className="flex min-h-16 items-center gap-3 px-2 py-2"
  >
    <CategoryIcon icon={bill.icon} color={bill.color} />
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="line-clamp-2 text-base font-medium break-words">{bill.name}</span>
      <span className={cn("text-xs", bill.overdue ? "text-expense" : "text-muted-foreground")}>
        {dueCaption(bill, month)}
      </span>
    </span>
    <span className="flex flex-col items-end gap-0.5">
      <Money amount={bill.amount} outflow className="text-base font-bold" />
      {cause && <Cause />}
    </span>
  </li>
);

/** "Estimativa de R$ 50,00/dia", less the cash Diário typed for the day (SOL-164 Copy). */
export const estimateCaption = (estimate: string, day: Day, currency: Currency) =>
  `Estimativa de ${formatMoney(estimate, currency)}/dia${
    cents(day.daily) > 0 ? `, menos ${formatMoney(day.daily, currency)} lançados` : ""
  }`;

/** SOL-164 S7/S9: the day's Diário previsto, last in its list; never a Lançamento, so it opens the setting. */
const EstimateLine = ({ day, estimate, cause }: { day: Day; estimate: string; cause: boolean }) => {
  const currency = useCurrency();
  const id = useId();
  return (
    <li>
      <MonthLink
        href="/ajustes#diario-previsto"
        aria-label={`Diário previsto, ${formatMoney(day.previsto, currency)}, estimativa. Ajustar Diário previsto`}
        aria-describedby={cause ? `${id}-caption ${id}-cause` : `${id}-caption`}
        className="hover:bg-muted focus-visible:outline-ring flex min-h-16 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors focus-visible:outline-2"
      >
        <EstimateIcon />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-base font-medium italic">Diário previsto</span>
          <span id={`${id}-caption`} className="text-muted-foreground text-xs break-words">
            {estimateCaption(estimate, day, currency)}
          </span>
        </span>
        <span className="flex flex-col items-end gap-0.5">
          <Money amount={day.previsto} outflow className="text-base font-bold italic" />
          {cause && <Cause id={`${id}-cause`} />}
        </span>
        <ChevronRight aria-hidden className="text-muted-foreground size-4 shrink-0" />
      </MonthLink>
    </li>
  );
};

type RowProps = { transaction: Transaction; entry: Entry; cause: boolean; onOpen: () => void };

const Row = ({ transaction, entry, cause, onOpen }: RowProps) => (
  <li>
    <button
      type="button"
      onClick={onOpen}
      className="hover:bg-muted focus-visible:outline-ring flex min-h-16 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors focus-visible:outline-2"
    >
      <CategoryIcon icon={transaction.category.icon} color={transaction.category.color} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-2 text-base font-medium break-words">{titleOf(transaction, entry)}</span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
          {entry.caption}
          {entry.card && (
            <span className="flex min-w-0 items-center gap-1">
              <CreditCard aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{entry.card}</span>
            </span>
          )}
          {transaction.series && (
            <>
              <span aria-hidden className="bg-muted text-foreground rounded-full px-2 font-medium">
                {`↻ ${KIND_LABEL[transaction.kind]} · ${
                  transaction.series.open_ended
                    ? OPEN_LABEL[transaction.series.every]
                    : `${transaction.series.position}/${transaction.series.total}`
                }`}
              </span>
              <span className="sr-only">
                {transaction.series.open_ended
                  ? OPEN_LABEL[transaction.series.every]
                  : `${transaction.series.position} de ${transaction.series.total}`}
              </span>
            </>
          )}
        </span>
      </span>
      <span className="flex flex-col items-end gap-0.5">
        <Money
          amount={transaction.amount}
          income={addsToBalance(transaction)}
          outflow={!addsToBalance(transaction)}
          className="text-base font-bold"
        />
        {cause && <Cause />}
      </span>
    </button>
  </li>
);

export type LedgerFilter = "all" | "daily" | "fixed" | "variable";

const FILTERS: { value: LedgerFilter; label: string; empty?: string }[] = [
  { value: "all", label: "Todos" },
  { value: "daily", label: "Diário", empty: "Nenhum gasto diário neste mês." },
  { value: "fixed", label: "Contas fixas", empty: "Nenhuma conta fixa neste mês." },
  { value: "variable", label: "Valor variável", empty: "Nenhuma conta de valor variável neste mês." },
];

/** A bill payment counts as fixed until the bills load; income shows only under Todos. */
const filterOf = (
  transaction: Transaction,
  categories: Schemas["Category"][] = [],
  bills: Schemas["Bill"][] = [],
): LedgerFilter | null => {
  if (bills.some(({ id, variable }) => variable && id === transaction.recurring_bill_id)) return "variable";
  if (transaction.kind === "income" || isSaved(transaction, categories)) return null;
  return transaction.kind === "bill" ? "fixed" : "daily";
};

type LedgerProps = {
  view: Schemas["MonthView"];
  transactions: Transaction[];
  /** The day ringed after a jump from the hero. */
  highlight?: string | null;
  /** Ids (`transaction.id` or `billKey(bill)`) captioned `Motivo da queda`. */
  causes?: ReadonlySet<string>;
  /** SOL-154 §2; the page owns it so a jump can reset it before it scrolls. */
  filter: LedgerFilter;
  onFilterChange: (filter: LedgerFilter) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** SOL-163: shown in place of the filters and the days; given = Planilha mode. */
  planilha?: ReactNode;
  onPlanilhaChange?: (planilha: boolean) => void;
  /** The Diário previsto per day (SOL-164); absent when off. */
  estimate?: string | null;
  className?: string;
};

const VIEW_ITEM =
  "text-muted-foreground data-[state=on]:bg-card data-[state=on]:text-primary min-h-11 rounded-lg! px-4 text-base font-medium data-[state=on]:shadow-sm";

/**
 * `Lançamentos`: the whole month's entries grouped by day; a row opens Editar / Excluir,
 * and Excluir can be undone for 5 s.
 */
export const Ledger = ({
  view,
  transactions,
  highlight = null,
  causes = new Set<string>(),
  filter,
  onFilterChange,
  open: expanded,
  onOpenChange,
  planilha,
  onPlanilhaChange,
  estimate,
  className,
}: LedgerProps) => {
  const categories = useQuery(categoriesQuery).data;
  const cards = useCards({ includeInactive: true }).data;
  const bills = useBills({ includeInactive: true }).data;
  const entryFor = (transaction: Transaction): Entry => ({
    ...entryOf(transaction, categories, view.bills_of_month, bills),
    card: cards?.find(({ id }) => id === transaction.card_id)?.name,
  });
  const { open, actions } = useEntryActions();
  const any = groupByDay(view.days, transactions, view.bills_of_month).length > 0;
  const shown = (kind: LedgerFilter | null) => filter === "all" || kind === filter;
  const groups = groupByDay(
    view.days,
    transactions.filter((transaction) => shown(filterOf(transaction, categories, bills))),
    view.bills_of_month.filter((bill) => shown(bill.variable ? "variable" : "fixed")),
  );

  if (!any && !planilha) return null;

  /** Tapping the view already pressed deselects it in Radix: it only opens the section. */
  const chooseView = (value: string) => {
    if (value) {
      onPlanilhaChange?.(value === "planilha");
      onFilterChange("all");
    }
    if (!expanded) onOpenChange(true);
  };

  return (
    <section
      aria-labelledby="ledger-title"
      className={cn(
        "bg-card flex flex-col gap-2 rounded-2xl p-4 shadow-sm lg:grid lg:grid-cols-[auto_1fr_auto] lg:items-center lg:gap-x-4 lg:p-6",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 lg:contents">
        <h2 id="ledger-title" className="text-lg leading-6 font-semibold">
          Lançamentos
        </h2>
        <SectionToggle
          open={expanded}
          onOpenChange={onOpenChange}
          label="Lançamentos"
          className="lg:col-start-3 lg:row-start-1"
        />
      </div>
      <div className="flex flex-col gap-2 lg:col-start-2 lg:row-start-1 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-4">
        <ToggleGroup
          type="single"
          spacing={0}
          value={planilha ? "planilha" : "lista"}
          onValueChange={chooseView}
          aria-label="Ver lançamentos como"
          className="bg-muted grid w-full grid-cols-2 rounded-xl p-1 lg:order-last lg:ml-auto lg:flex lg:w-fit"
        >
          <ToggleGroupItem value="lista" className={VIEW_ITEM}>
            Lista
          </ToggleGroupItem>
          <ToggleGroupItem value="planilha" className={VIEW_ITEM}>
            Planilha
          </ToggleGroupItem>
        </ToggleGroup>
        {expanded && !planilha && (
          <ToggleGroup
            type="single"
            spacing={0}
            value={filter}
            onValueChange={(value: LedgerFilter | "") => value && onFilterChange(value)}
            aria-label="Filtrar lançamentos"
            className="bg-muted mb-2 grid w-full grid-cols-2 rounded-xl p-1 lg:mb-0 lg:flex lg:w-fit"
          >
            {FILTERS.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value} className={VIEW_ITEM}>
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>
      {expanded && planilha && <div className="min-w-0 lg:col-span-3 lg:row-start-2">{planilha}</div>}
      {expanded && !planilha && (
        <div className="flex flex-col gap-2 lg:col-span-3 lg:row-start-2">
          {groups.length === 0 && (
            <p className="text-muted-foreground px-2 py-8 text-center">
              {FILTERS.find((option) => option.value === filter)?.empty}
            </p>
          )}
          {groups.map(({ day, entries, due }) => (
            <div
              key={day.date}
              id={`dia-${day.date}`}
              tabIndex={-1}
              className={cn("scroll-mt-28 rounded-xl", highlight === day.date && "ring-expense ring-2")}
            >
              <h3 className="bg-muted text-muted-foreground sticky top-14 z-10 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg px-3 py-2 text-sm font-semibold lg:top-0">
                {dayLabel(day)}
                <DayBalance day={day} />
              </h3>
              <ul className={cn("flex flex-col", day.is_future && "opacity-60")}>
                {entries.map((transaction) => (
                  <Row
                    key={transaction.id}
                    entry={entryFor(transaction)}
                    transaction={transaction}
                    cause={causes.has(transaction.id)}
                    onOpen={() => open(transaction, entryFor(transaction))}
                  />
                ))}
                {due.map((bill) => (
                  <DueRow key={billKey(bill)} bill={bill} month={view.month} cause={causes.has(billKey(bill))} />
                ))}
                {estimate && shown("daily") && cents(day.previsto) > 0 && (
                  <EstimateLine day={day} estimate={estimate} cause={causes.has(previstoKey(day.date))} />
                )}
              </ul>
            </div>
          ))}
        </div>
      )}

      {actions}
    </section>
  );
};
