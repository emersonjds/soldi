"use client";

import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useBills, useCards } from "@/entities/bill/bill-queries";
import { categoriesQuery } from "@/entities/category/categories-query";
import { billKey, previstoKey } from "@/entities/month/forecast-alert";
import { useMonth } from "@/entities/month/month-query";
import { activeEstimate } from "@/entities/settings/daily-estimate";
import { useSettings } from "@/entities/settings/settings-query";
import { type Transaction, useTransactions } from "@/entities/transaction/transaction-queries";
import { TransactionSheet } from "@/features/add-transaction/transaction-sheet";
import { EditBillSheet } from "@/features/edit-bill/edit-bill-sheet";
import { cn } from "@/lib/utils";
import { hasProblem, type Schemas } from "@/shared/api/client";
import { type Currency, useCurrency } from "@/shared/lib/currency";
import { addMonths, lastDay, monthName, todayISO, weekdayName } from "@/shared/lib/date";
import { toInput } from "@/shared/lib/money";
import { cents, TIER_LABEL, TIER_ORDER, TIER_STYLE } from "@/shared/lib/tier";
import { replaceUrl } from "@/shared/lib/url";
import { EstimateNote } from "@/shared/ui/estimate-note";
import { Money } from "@/shared/ui/money";
import { MonthLink } from "@/shared/ui/month-link";
import { monthLabel } from "@/shared/ui/month-switcher";
import { PageError } from "@/shared/ui/page-state";
import { TierPill } from "@/shared/ui/tier-pill";

import { type Entry, titleOf, useEntryActions } from "./entry-actions";
import { DayBalance, dayLabel, dueCaption, entryOf, estimateCaption, isForecast } from "./ledger";
import { type PlanilhaRow, planilhaMonths, planilhaRows, sum } from "./planilha-rows";

const COLUMNS = ["Data", "Entrada", "Saída", "Diário", "Saldo"];

type Column = "Entrada" | "Saída" | "Diário";

const KIND_OF: Record<Column, Schemas["CategoryKind"]> = { Entrada: "income", Saída: "bill", Diário: "daily" };

const isMoney = (column?: string): column is Column =>
  column === "Entrada" || column === "Saída" || column === "Diário";

/** P8: Excel's gridlines, each cell drawing its bottom and right edges; the Data column also its left. */
const LINES = "border-border border-b border-r";
const DATA_LINES = "border-l min-w-11";

const MONEY = cn(LINES, "whitespace-nowrap px-1.5 text-right");

/** The weekend tint over the card, opaque for the sticky Data cell. */
const WEEKEND_OPAQUE = "bg-[color-mix(in_oklab,var(--color-muted)_50%,var(--color-card))]";

/** The sheet's number format: pt-BR, no symbol. */
const amountOf = (amount: string) => (cents(amount) === 0 ? null : toInput(amount));

/** A money cell's value, a zero as a muted "-" a screen reader reads as "sem valor". */
const cellOf = (amount: string) =>
  amountOf(amount) ?? (
    <>
      <span aria-hidden className="text-muted-foreground">
        -
      </span>
      <span className="sr-only">sem valor</span>
    </>
  );

const dayName = (date: string, today: string) => {
  const weekday = weekdayName(date);
  const name = `${weekday[0].toUpperCase()}${weekday.slice(1)}, ${Number(date.slice(8))} de ${monthName(date, today)}`;
  return date === today ? `${name}, hoje` : name;
};

type Entries = ReturnType<typeof useTransactions>;

/** `estimate`: the Diário previsto, never a Lançamento (SOL-164 S9); `transaction`: a lançamento; `due`: an unpaid conta. */
type Item = {
  key: string;
  title: string;
  caption: string;
  amount: string;
  estimate?: boolean;
  transaction?: Transaction;
  entry?: Entry;
  due?: Schemas["BillOfMonth"];
};

type Group = { name: Column; income: boolean; items: Item[]; total: string | null };

type Lookup = {
  categories?: Schemas["Category"][];
  bills?: Schemas["Bill"][];
  cards?: Schemas["Bill"][];
  currency: Currency;
};

const useLookup = (): Lookup => ({
  categories: useQuery(categoriesQuery).data,
  bills: useBills({ includeInactive: true }).data,
  cards: useCards({ includeInactive: true }).data,
  currency: useCurrency(),
});

/** The day's items under the planilha's columns, all three groups, empty ones included; the cell and the detail read the same. */
const groupsOf = (
  row: PlanilhaRow,
  view: Schemas["MonthView"],
  transactions: Transaction[] | undefined,
  estimate: string | null | undefined,
  { categories, bills, cards, currency }: Lookup,
): Group[] => {
  const previsto: Item[] =
    estimate && row.day && cents(row.day.previsto) > 0
      ? [
          {
            key: previstoKey(row.date),
            title: "Diário previsto",
            caption: estimateCaption(estimate, row.day, currency),
            amount: row.day.previsto,
            estimate: true,
          },
        ]
      : [];
  const ofKind = (kind: Schemas["CategoryKind"]) =>
    (transactions ?? []).filter((transaction) => transaction.date === row.date && transaction.kind === kind);
  const item = (transaction: Transaction): Item => {
    const entry = entryOf(transaction, categories, view.bills_of_month, bills);
    return {
      key: transaction.id,
      title: titleOf(transaction, entry),
      caption: entry.caption,
      amount: transaction.amount,
      transaction,
      entry,
    };
  };
  const spends = ofKind("daily")
    .filter((transaction) => !transaction.card_id)
    .map(item);
  // D28: the server counts a card's Diário in its fatura, never in the day's Diário.
  const onCard = ofKind("daily")
    .filter((transaction) => transaction.card_id)
    .map((transaction) => ({
      ...item(transaction),
      caption: `${cards?.find(({ id }) => id === transaction.card_id)?.name ?? "Cartão"} · na fatura`,
    }));
  const total = (items: Item[]) => (items.length > 0 ? sum(items.map(({ amount }) => amount)) : null);
  const outflows: Item[] = [
    ...ofKind("bill").map(item),
    ...row.landed.map((bill) => ({
      key: billKey(bill),
      title: bill.name,
      caption: dueCaption(bill, view.month),
      amount: bill.amount,
      due: bill,
    })),
  ];
  const incomes = ofKind("income").map(item);
  return [
    { name: "Entrada", income: true, items: incomes, total: total(incomes) },
    { name: "Saída", income: false, items: outflows, total: total(outflows) },
    {
      name: "Diário",
      income: false,
      items: [...spends, ...previsto, ...onCard],
      total: total([...spends, ...previsto]),
    },
  ];
};

/** Spec SOL-163 §9: the day's items under the planilha's columns, read-only. */
const DayDetail = ({
  row,
  view,
  entries,
  estimate,
}: {
  row: PlanilhaRow;
  view: Schemas["MonthView"];
  entries: Entries;
  estimate?: string | null;
}) => {
  const lookup = useLookup();
  if (!row.day) return <p className="text-muted-foreground">Este dia é anterior ao seu saldo inicial.</p>;
  const groups = groupsOf(row, view, entries.data, estimate, lookup).filter(({ items }) => items.length > 0);
  const previsto = groups.some(({ items }) => items.some((item) => item.estimate));

  return (
    <>
      <DayBalance day={row.day} />
      {groups.map(({ name, income, items, total }) => (
        <section key={name} aria-label={name} className="flex flex-col gap-2">
          <h3 className="flex justify-between gap-3 text-sm font-semibold">
            <span>{name}</span> {total && <Money amount={total} />}
          </h3>
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.key} className="grid grid-cols-[1fr_auto] gap-x-3">
                <span className={cn("text-base font-medium break-words", item.estimate && "italic")}>{item.title}</span>
                <Money amount={item.amount} income={income} outflow={!income} className="row-span-2 font-semibold" />
                <span className="text-muted-foreground text-xs">{item.caption}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {previsto && (
        <MonthLink
          href="/ajustes#diario-previsto"
          className="text-primary focus-visible:outline-ring inline-flex min-h-11 items-center self-start text-sm font-medium hover:underline focus-visible:outline-2"
        >
          Ajustar Diário previsto
        </MonthLink>
      )}
      {entries.isSuccess && groups.length === 0 && (
        <p className="text-muted-foreground">
          {row.day.is_future ? "Nada previsto para este dia." : "Nada lançado neste dia."}
        </p>
      )}
      {entries.isError && (
        <PageError message="Não foi possível carregar os lançamentos deste dia." onRetry={() => entries.refetch()} />
      )}
    </>
  );
};

/** Spec SOL-163 §10: each key's target as `[month, day]`; a day past the month's end clamps to its last. */
const MOVES: Record<string, (month: string, day: number) => [string, number]> = {
  ArrowUp: (month, day) => [month, Math.max(day - 1, 1)],
  ArrowDown: (month, day) => [month, day + 1],
  Home: (month) => [month, 1],
  End: (month) => [month, 31],
  ArrowLeft: (month, day) => [addMonths(month, -1), day],
  ArrowRight: (month, day) => [addMonths(month, 1), day],
};

/** A month still loading has no day buttons: the focus stays put. */
const move = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
  const step = MOVES[event.key];
  if (!step) return;
  event.preventDefault();
  const [month, day] = step(date.slice(0, 7), Number(date.slice(8)));
  const next = document.querySelector<HTMLElement>(
    `[data-day="${month}-${String(Math.min(day, lastDay(month))).padStart(2, "0")}"]`,
  );
  next?.focus();
  if (month !== date.slice(0, 7)) next?.scrollIntoView({ block: "nearest", inline: "start" });
};

/** What a cell or the detail does, owned by the Planilha (SOL-171 P2–P5); `date`: the day to give focus back to. */
type Act = {
  lookup: Lookup;
  create: (kind: Schemas["CategoryKind"], date: string) => void;
  entry: (transaction: Transaction, entry: Entry, date: string) => void;
};

/** P2: a cell's own action, or none when it opens the detail. */
const cellAction = (
  column: Column,
  row: PlanilhaRow,
  view: Schemas["MonthView"],
  entries: Entries,
  estimate: string | null | undefined,
  act: Act,
) => {
  const { day, date } = row;
  if (!day || !entries.data) return undefined;
  const items = (
    groupsOf(row, view, entries.data, estimate, act.lookup).find(({ name }) => name === column)?.items ?? []
  ).filter((item) => !item.estimate);
  if (items.length === 0) return () => act.create(KIND_OF[column], date);
  const [only] = items;
  const shown = {
    Entrada: row.income,
    Saída: row.outflow,
    Diário: cents(day.previsto) > 0 && estimate ? row.daily : day.daily,
  }[column];
  if (items.length > 1 || !only.transaction || !only.entry || only.transaction.id.startsWith("optimistic-"))
    return undefined;
  if (cents(only.amount) !== cents(shown)) return undefined;
  const { transaction, entry } = only;
  return () => act.entry(transaction, entry, date);
};

type RowProps = {
  act: Act;
  row: PlanilhaRow;
  today: string;
  view: Schemas["MonthView"];
  entries: Entries;
  /** The month's one tab stop (roving tabindex). */
  stop: boolean;
  onFocus: () => void;
  /** Spec §11: the day a RedDayAlert jump landed on. */
  ringed: boolean;
  /** Takes a focus asked for `date` before its month loaded; true when it is still the person's. */
  claim: (date: string) => boolean;
  /** The Diário previsto per day (SOL-164); absent when off. */
  estimate?: string | null;
};

const FINE_POINTER = "(hover: hover) and (pointer: fine)";

/** `hover`: the popover a resting pointer opened, which leaves focus where it is. */
type Shown = "hover" | "popover" | "sheet" | null;

const Row = ({ act, row, today, view, entries, stop, onFocus, ringed, claim, estimate }: RowProps) => {
  const { date, day, income, outflow, daily, landed } = row;
  const estimated = Boolean(estimate) && cents(day?.previsto ?? "0.00") > 0;
  const [shown, setShown] = useState<Shown>(null);
  /** The group a money cell's click asked the detail to focus. */
  const [group, setGroup] = useState<Column>();
  const tr = useRef<HTMLTableRowElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const weekend = ["sábado", "domingo"].includes(weekdayName(date));
  const ahead = day?.is_future && "italic text-muted-foreground";
  const title = dayLabel(day ?? { date, is_future: false });
  const fine = () => window.matchMedia(FINE_POINTER).matches;
  const hasItems =
    landed.length > 0 || estimated || Boolean(entries.data?.some((transaction) => transaction.date === date));
  const close = (next: boolean) => next || setShown(null);
  const floating = shown === "hover" || shown === "popover";

  useEffect(() => {
    if (claim(date)) button.current?.focus({ preventScroll: true });
  }, [claim, date]);
  useEffect(() => () => clearTimeout(timer.current), []);

  /** P5: into the group a money cell asked for, else the first control; the container when it has none. */
  const focusIn = (container: HTMLElement | null, column?: Column) =>
    (
      container?.querySelector<HTMLElement>(column ? `[aria-label="${column}"] button` : "button, a[href]") ?? container
    )?.focus();

  const open = (event: MouseEvent<HTMLTableRowElement>) => {
    clearTimeout(timer.current);
    const column = COLUMNS[event.target instanceof Element ? (event.target.closest("td")?.cellIndex ?? 0) : 0];
    if (isMoney(column)) {
      const action = cellAction(column, row, view, entries, estimate, act);
      if (action) {
        setShown(null);
        return action();
      }
    }
    const asked = isMoney(column) ? column : undefined;
    setGroup(asked);
    if (shown === "hover" || (asked && floating)) {
      setShown("popover");
      return focusIn(content.current, asked);
    }
    if (!floating) return setShown(fine() ? "popover" : "sheet");
    setShown(null);
    button.current?.focus();
  };
  const autoFocus = (event: Event, container: HTMLElement | null) => {
    if (shown === "hover") return event.preventDefault();
    if (!group) return;
    event.preventDefault();
    focusIn(container, group);
  };
  const hold = () => {
    clearTimeout(timer.current);
    if (!shown && hasItems && fine()) timer.current = setTimeout(() => setShown("hover"), 300);
  };
  const release = () => {
    clearTimeout(timer.current);
    if (!floating) return;
    timer.current = setTimeout(() => {
      if (content.current?.contains(document.activeElement)) button.current?.focus();
      setShown(null);
    }, 150);
  };

  return (
    <Popover open={floating} onOpenChange={close}>
      <PopoverAnchor asChild>
        <tr
          ref={tr}
          onClick={open}
          onPointerEnter={hold}
          onPointerLeave={release}
          aria-current={date === today ? "date" : undefined}
          className={cn("cursor-pointer", weekend && "bg-muted/50", !day && "text-muted-foreground")}
        >
          <td className={cn(LINES, DATA_LINES, "sticky left-0 p-0", weekend ? WEEKEND_OPAQUE : "bg-card")}>
            <button
              ref={button}
              type="button"
              data-day={date}
              tabIndex={stop ? 0 : -1}
              onFocus={onFocus}
              onKeyDown={(event) => move(event, date)}
              aria-label={dayName(date, today)}
              className={cn(
                "flex min-h-11 w-full items-center px-1.5",
                ringed && "ring-expense rounded-md ring-2 ring-inset",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-full",
                  date === today && "bg-primary text-primary-foreground font-semibold",
                )}
              >
                {Number(date.slice(8))}
              </span>
            </button>
          </td>
          {day ? (
            <>
              <td className={cn(MONEY, ahead)}>{cellOf(income)}</td>
              <td className={cn(MONEY, ahead, landed.length > 0 && "italic")}>
                {cellOf(outflow)}
                {landed.length > 0 && <span className="sr-only"> inclui conta a pagar</span>}
              </td>
              <td className={cn(MONEY, ahead)}>
                {cellOf(estimated ? daily : day.daily)}
                {estimated && <span className="sr-only"> inclui Diário previsto</span>}
              </td>
              <td
                className={cn(MONEY, "font-semibold", TIER_STYLE[day.projected_tier].pill, isForecast(day) && "italic")}
              >
                {(day.projected_tier === "red" || day.projected_tier === "light_red") && (
                  <TriangleAlert aria-hidden className="mr-1 inline size-[1em] align-[-0.125em]" />
                )}
                {toInput(day.projected_balance)}
                <span className="sr-only"> {TIER_LABEL[day.projected_tier]}</span>
              </td>
            </>
          ) : (
            <>
              <td className={LINES} />
              <td className={LINES} />
              <td className={LINES} />
              <td className={LINES} />
            </>
          )}
        </tr>
      </PopoverAnchor>
      <PopoverContent
        ref={content}
        aria-label={title}
        align="start"
        onOpenAutoFocus={(event) => autoFocus(event, content.current)}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={() => button.current?.focus()}
        onInteractOutside={(event) => {
          if (event.target instanceof Node && tr.current?.contains(event.target)) event.preventDefault();
        }}
        onPointerEnter={hold}
        onPointerLeave={release}
        className="w-80 max-w-[calc(100vw-2rem)] gap-3 p-4"
      >
        <p className="text-base font-semibold">{title}</p>
        <DayDetail row={row} view={view} entries={entries} estimate={estimate} />
      </PopoverContent>
      <Sheet open={shown === "sheet"} onOpenChange={close}>
        <SheetContent
          ref={sheet}
          side="bottom"
          onOpenAutoFocus={(event) => autoFocus(event, sheet.current)}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            button.current?.focus();
          }}
          className="mx-auto max-h-[80dvh] max-w-lg gap-3 overflow-y-auto rounded-t-3xl px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        >
          <SheetTitle className="pr-12 text-lg font-bold">{title}</SheetTitle>
          <DayDetail row={row} view={view} entries={entries} estimate={estimate} />
        </SheetContent>
      </Sheet>
    </Popover>
  );
};

/** One skeleton row per day of `month`: the block keeps its final size while it loads. */
const SkeletonBody = ({ month }: { month: string }) => (
  <tbody aria-busy="true">
    {Array.from({ length: lastDay(month) }, (_, index) => `${month}-${index + 1}`).map((key) => (
      <tr key={key}>
        <td colSpan={5} className={cn(LINES, "h-11 border-l px-2")}>
          <Skeleton className="h-4 w-full" />
        </td>
      </tr>
    ))}
  </tbody>
);

type MonthProps = Pick<RowProps, "act" | "today" | "claim" | "estimate"> & {
  month: string;
  openingDate: string;
  highlight: string | null;
};

const MonthBody = ({ act, month, today, openingDate, highlight, claim, estimate }: MonthProps) => {
  const view = useMonth(month);
  const entries = useTransactions(month);
  const [stop, setStop] = useState(today.startsWith(month) ? today : `${month}-01`);
  if (view.isSuccess)
    return (
      <tbody>
        {planilhaRows(view.data, openingDate).map((row) => (
          <Row
            key={row.date}
            act={act}
            row={row}
            today={today}
            view={view.data}
            entries={entries}
            stop={row.date === stop}
            onFocus={() => setStop(row.date)}
            ringed={row.date === highlight}
            claim={claim}
            estimate={estimate}
          />
        ))}
      </tbody>
    );
  if (!view.isError) return <SkeletonBody month={month} />;
  return (
    <tbody>
      <tr>
        <td colSpan={5}>
          {hasProblem(view.error, "month-before-opening") ? (
            <p className="text-muted-foreground p-6 text-center">Este mês é anterior ao seu saldo inicial.</p>
          ) : (
            <PageError message={`Não foi possível carregar ${monthLabel(month)}.`} onRetry={() => view.refetch()} />
          )}
        </td>
      </tr>
    </tbody>
  );
};

const MonthBlock = ({ act, month, today, openingDate, highlight, claim, estimate }: MonthProps) => {
  const [near, setNear] = useState(false);
  const label = monthLabel(month);

  /** Fetches once the table comes within its own width of the scroller's view. */
  const watch = useCallback((table: HTMLTableElement) => {
    const observer = new IntersectionObserver((entries) => setNear(entries.some((entry) => entry.isIntersecting)), {
      root: table.parentElement,
      rootMargin: `0px ${table.offsetWidth}px`,
    });
    observer.observe(table);
    return () => observer.disconnect();
  }, []);

  return (
    <table
      ref={near ? undefined : watch}
      data-month={month}
      aria-label={label}
      className="min-w-[100cqi] shrink-0 border-separate border-spacing-0 snap-start text-[length:clamp(0.75rem,3.6cqi,0.875rem)] tabular-nums @[45rem]:min-w-[calc((100cqi-1rem)/2)] @[68rem]:min-w-[calc((100cqi-2rem)/3)] @[91rem]:min-w-[calc((100cqi-3rem)/4)] @[114rem]:min-w-[calc((100cqi-4rem)/5)]"
    >
      <thead className="bg-card sticky top-0 z-10">
        <tr>
          <th colSpan={5} scope="colgroup" className="px-2 py-2 text-left text-base font-semibold">
            {label}
          </th>
        </tr>
        <tr>
          {COLUMNS.map((column) => (
            <th
              key={column}
              scope="col"
              className={cn(
                LINES,
                "text-muted-foreground bg-card border-t px-1.5 py-1 text-right font-medium",
                column === "Data" && cn(DATA_LINES, "sticky left-0 text-left"),
              )}
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      {near ? (
        <MonthBody
          act={act}
          month={month}
          today={today}
          openingDate={openingDate}
          highlight={highlight}
          claim={claim}
          estimate={estimate}
        />
      ) : (
        <SkeletonBody month={month} />
      )}
    </table>
  );
};

/** `away`: today is off the scroller's view, so the button shows; it keeps its space either way. */
const Toolbar = ({ away, onToday }: { away: boolean; onToday?: () => void }) => (
  <div className="flex flex-wrap items-center justify-between gap-x-3">
    <p className="text-muted-foreground text-sm">Valores em R$ · Toque num valor para lançar ou editar.</p>
    <Button
      variant="ghost"
      onClick={onToday}
      aria-hidden={!away}
      tabIndex={away ? undefined : -1}
      className={cn("ml-auto min-h-11 text-base", !away && "invisible")}
    >
      <CalendarCheck aria-hidden />
      Ir pra hoje
    </Button>
  </div>
);

/** A day's row by position: the same in a loaded month and in its skeleton. */
const rowOf = (scroller: HTMLElement, date: string) =>
  scroller.querySelector<HTMLTableElement>(`[data-month="${date.slice(0, 7)}"]`)?.tBodies[0]?.rows[
    Number(date.slice(8)) - 1
  ];

type PlanilhaProps = {
  today: string;
  openingDate: string;
  /** The URL month: the planilha opens there and follows it. */
  month?: string;
  /** The day ringed after a jump from the RedDayAlert. */
  highlight?: string | null;
  /** The Diário previsto per day (SOL-164); absent when off. */
  estimate?: string | null;
};

/** Spec SOL-163 §3–§8: the month view as the owner's sheet, one table per month side by side. */
export const Planilha = ({
  today,
  openingDate,
  month = today.slice(0, 7),
  highlight = null,
  estimate,
}: PlanilhaProps) => {
  const scroller = useRef<HTMLDivElement>(null);
  const placed = useRef<string>(null);
  const [seen, setSeen] = useState(true);
  const months = planilhaMonths(today, openingDate);
  const current = today.slice(0, 7);

  /** Spec §5: `target`'s table at the start (clamped to the range), today's row centered; the page stays put. */
  const place = (target: string, behavior: ScrollBehavior) => {
    placed.current = target;
    const box = scroller.current;
    // The middle of the three: `target` clamped to the range.
    const shown = [months[0], target, months[months.length - 1]].sort()[1];
    const table = box?.querySelector<HTMLTableElement>(`[data-month="${shown}"]`);
    if (!box || !table) return;
    const row = shown === current ? rowOf(box, today) : undefined;
    const top = row ? table.offsetTop + row.offsetTop - (box.clientHeight - row.offsetHeight) / 2 : 0;
    box.scrollTo({ left: table.offsetLeft, top, behavior });
  };
  const follow = useEffectEvent((target: string) => {
    if (placed.current !== target) place(target, "auto");
  });
  // Before the months' observers first look: the blocks at scrollLeft 0 are not fetched.
  useLayoutEffect(() => {
    follow(month);
  }, [month]);

  /** A focus asked for a day whose month has not loaded, and what had the focus then. */
  const pending = useRef<{ date: string; from: Element | null }>(null);
  const focusDay = (date: string) => {
    const button = scroller.current?.querySelector<HTMLElement>(`[data-day="${date}"]`);
    pending.current = button ? null : { date, from: document.activeElement };
    button?.focus({ preventScroll: true });
  };
  const claim = useCallback((date: string) => {
    const asked = pending.current;
    if (!asked || asked.date !== date) return false;
    pending.current = null;
    return document.activeElement === document.body || document.activeElement === asked.from;
  }, []);

  /** The day whose cell or detail opened a sheet: focus goes back to it when the sheet closes (P5). */
  const back = useRef<string>(null);
  const giveBack = () => back.current && focusDay(back.current);
  const entryActions = useEntryActions(giveBack);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ kind: Schemas["CategoryKind"]; date: string }>({ kind: "daily", date: today });
  const act: Act = {
    lookup: useLookup(),
    create: (kind, date) => {
      back.current = date;
      setDraft({ kind, date });
      setCreating(true);
    },
    entry: (transaction, entry, date) => {
      back.current = date;
      entryActions.open(transaction, entry);
    },
  };

  const jump = useEffectEvent((date: string) => {
    if (scroller.current) rowOf(scroller.current, date)?.scrollIntoView({ block: "center", inline: "start" });
    focusDay(date);
  });
  useEffect(() => {
    if (highlight) jump(highlight);
  }, [highlight]);

  const track = () => {
    const box = scroller.current;
    const cell = box && rowOf(box, today)?.cells[0];
    if (!box || !cell) return;
    const inner = cell.getBoundingClientRect();
    const outer = box.getBoundingClientRect();
    setSeen(
      inner.top >= outer.top && inner.bottom <= outer.bottom && inner.left >= outer.left && inner.right <= outer.right,
    );
  };

  const goToday = () => {
    replaceUrl(`?m=${current}`);
    place(current, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
    focusDay(today);
  };

  return (
    <div data-planilha className="@container flex flex-col gap-3">
      <Toolbar away={month !== current || !seen} onToday={goToday} />
      <div
        ref={scroller}
        onScroll={track}
        className="relative flex max-h-[80dvh] snap-x snap-mandatory gap-4 overflow-auto overscroll-x-contain"
      >
        {months.map((each) => (
          <MonthBlock
            key={each}
            act={act}
            month={each}
            today={today}
            openingDate={openingDate}
            highlight={highlight}
            claim={claim}
            estimate={estimate}
          />
        ))}
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        <span className="italic">Itálico: previsto</span>
        {TIER_ORDER.map((tier) => (
          <TierPill key={tier} tier={tier} size="sm" />
        ))}
      </div>
      {estimate && <EstimateNote estimate={estimate} />}
      {entryActions.actions}
      <TransactionSheet
        open={creating}
        onOpenChange={setCreating}
        initialKind={draft.kind}
        initialDate={draft.date}
        billSheet={(props) => <EditBillSheet open {...props} />}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          giveBack();
        }}
      />
    </div>
  );
};

/** Spec SOL-163 §2: the planilha in the Lançamentos slot, from the opening date in the settings. */
export const PlanilhaView = ({ month, highlight }: Pick<PlanilhaProps, "highlight"> & { month: string }) => {
  const settings = useSettings();
  if (settings.isError)
    return <PageError message="Não foi possível carregar a planilha." onRetry={() => settings.refetch()} />;
  if (!settings.data)
    return (
      <div className="flex flex-col gap-3">
        <Toolbar away={false} />
        <Skeleton className="h-[80dvh] w-full rounded-xl" />
        <p role="status" className="sr-only">
          Carregando
        </p>
      </div>
    );
  return (
    <Planilha
      today={todayISO()}
      openingDate={settings.data.opening_date}
      month={month}
      highlight={highlight}
      estimate={activeEstimate(settings.data)}
    />
  );
};
