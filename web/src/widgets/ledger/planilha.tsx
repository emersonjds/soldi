"use client";

import { useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useBills } from "@/entities/bill/bill-queries";
import { categoriesQuery } from "@/entities/category/categories-query";
import { billKey } from "@/entities/month/forecast-alert";
import { useMonth } from "@/entities/month/month-query";
import { type Transaction, useTransactions } from "@/entities/transaction/transaction-queries";
import { cn } from "@/lib/utils";
import { hasProblem, type Schemas } from "@/shared/api/client";
import { lastDay, monthName, weekdayName } from "@/shared/lib/date";
import { toInput } from "@/shared/lib/money";
import { cents, TIER_LABEL, TIER_ORDER, TIER_STYLE } from "@/shared/lib/tier";
import { Money } from "@/shared/ui/money";
import { monthLabel } from "@/shared/ui/month-switcher";
import { PageError } from "@/shared/ui/page-state";
import { TierPill } from "@/shared/ui/tier-pill";

import { DayBalance, dayLabel, dueCaption, entryOf, isForecast, titleOf } from "./ledger";
import { type PlanilhaRow, planilhaMonths, planilhaRows, sum } from "./planilha-rows";

const COLUMNS = ["Data", "Entrada", "Saída", "Diário", "Saldo"];

const MONEY = "whitespace-nowrap px-2 text-right";

/** The weekend tint over the card, opaque for the sticky Data cell. */
const WEEKEND_OPAQUE = "bg-[color-mix(in_oklab,var(--color-muted)_50%,var(--color-card))]";

/** The sheet's number format: pt-BR, no symbol, a zero left blank. */
const amountOf = (amount: string) => (cents(amount) === 0 ? null : toInput(amount));

const dayName = (date: string, today: string) => {
  const weekday = weekdayName(date);
  const name = `${weekday[0].toUpperCase()}${weekday.slice(1)}, ${Number(date.slice(8))} de ${monthName(date, date)}`;
  return date === today ? `${name}, hoje` : name;
};

type Entries = ReturnType<typeof useTransactions>;

type Item = { key: string; title: string; caption: string; amount: string };

const itemOf =
  (view: Schemas["MonthView"], categories?: Schemas["Category"][], bills?: Schemas["Bill"][]) =>
  (transaction: Transaction): Item => {
    const entry = entryOf(transaction, categories, view.bills_of_month, bills);
    return {
      key: transaction.id,
      title: titleOf(transaction, entry),
      caption: entry.caption,
      amount: transaction.amount,
    };
  };

/** Spec SOL-163 §9: the day's items under the planilha's columns, read-only. */
const DayDetail = ({ row, view, entries }: { row: PlanilhaRow; view: Schemas["MonthView"]; entries: Entries }) => {
  const categories = useQuery(categoriesQuery).data;
  const bills = useBills({ includeInactive: true }).data;
  if (!row.day) return <p className="text-muted-foreground">Este dia é anterior ao seu saldo inicial.</p>;
  const ofKind = (kind: Schemas["CategoryKind"]) =>
    (entries.data ?? [])
      .filter((transaction) => transaction.date === row.date && transaction.kind === kind)
      .map(itemOf(view, categories, bills));
  const groups = [
    { name: "Entrada", income: true, items: ofKind("income") },
    {
      name: "Saída",
      income: false,
      items: [
        ...ofKind("bill"),
        ...row.landed.map((bill) => ({
          key: billKey(bill),
          title: bill.name,
          caption: dueCaption(bill, view.month),
          amount: bill.amount,
        })),
      ],
    },
    { name: "Diário", income: false, items: ofKind("daily") },
  ].filter(({ items }) => items.length > 0);

  return (
    <>
      <DayBalance day={row.day} />
      {groups.map(({ name, income, items }) => (
        <section key={name} aria-label={name} className="flex flex-col gap-2">
          <h3 className="flex justify-between gap-3 text-sm font-semibold">
            <span>{name}</span> <Money amount={sum(items.map(({ amount }) => amount))} />
          </h3>
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.key} className="grid grid-cols-[1fr_auto] gap-x-3">
                <span className="text-base font-medium break-words">{item.title}</span>
                <Money amount={item.amount} income={income} outflow={!income} className="row-span-2 font-semibold" />
                <span className="text-muted-foreground text-xs">{item.caption}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
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

type RowProps = { row: PlanilhaRow; today: string; view: Schemas["MonthView"]; entries: Entries };

const FINE_POINTER = "(hover: hover) and (pointer: fine)";

/** `hover`: the popover a resting pointer opened, which leaves focus where it is. */
type Shown = "hover" | "popover" | "sheet" | null;

const Row = ({ row, today, view, entries }: RowProps) => {
  const { date, day, income, outflow, landed } = row;
  const [shown, setShown] = useState<Shown>(null);
  const button = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const weekend = ["sábado", "domingo"].includes(weekdayName(date));
  const ahead = day?.is_future && "italic text-muted-foreground";
  const title = dayLabel(day ?? { date, is_future: false });
  const fine = () => window.matchMedia(FINE_POINTER).matches;
  const hasItems = landed.length > 0 || Boolean(entries.data?.some((transaction) => transaction.date === date));
  const close = (next: boolean) => next || setShown(null);

  const open = () => {
    clearTimeout(timer.current);
    setShown(fine() ? "popover" : "sheet");
  };
  const hold = () => {
    clearTimeout(timer.current);
    if (!shown && hasItems && fine()) timer.current = setTimeout(() => setShown("hover"), 300);
  };
  const release = () => {
    clearTimeout(timer.current);
    if (shown !== "hover" && shown !== "popover") return;
    timer.current = setTimeout(() => {
      if (content.current?.contains(document.activeElement)) button.current?.focus();
      setShown(null);
    }, 150);
  };

  return (
    <Popover open={shown === "hover" || shown === "popover"} onOpenChange={close}>
      <PopoverAnchor asChild>
        <tr
          onClick={open}
          onPointerEnter={hold}
          onPointerLeave={release}
          aria-current={date === today ? "date" : undefined}
          className={cn("cursor-pointer", weekend && "bg-muted/50", !day && "text-muted-foreground")}
        >
          <td className={cn("sticky left-0 p-0", weekend ? WEEKEND_OPAQUE : "bg-card")}>
            <button
              ref={button}
              type="button"
              aria-label={dayName(date, today)}
              className="flex min-h-11 w-full items-center px-2"
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
              <td className={cn(MONEY, ahead)}>{amountOf(income)}</td>
              <td className={cn(MONEY, ahead, landed.length > 0 && "italic")}>
                {amountOf(outflow)}
                {landed.length > 0 && <span className="sr-only"> inclui conta a pagar</span>}
              </td>
              <td className={cn(MONEY, ahead)}>{amountOf(day.daily)}</td>
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
              <td />
              <td />
              <td />
              <td />
            </>
          )}
        </tr>
      </PopoverAnchor>
      <PopoverContent
        ref={content}
        aria-label={title}
        align="start"
        onOpenAutoFocus={(event) => shown === "hover" && event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={() => button.current?.focus()}
        onPointerEnter={hold}
        onPointerLeave={release}
        className="w-80 max-w-[calc(100vw-2rem)] gap-3 p-4"
      >
        <p className="text-base font-semibold">{title}</p>
        <DayDetail row={row} view={view} entries={entries} />
      </PopoverContent>
      <Sheet open={shown === "sheet"} onOpenChange={close}>
        <SheetContent
          side="bottom"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            button.current?.focus();
          }}
          className="mx-auto max-h-[80dvh] max-w-lg gap-3 overflow-y-auto rounded-t-3xl px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        >
          <SheetTitle className="pr-12 text-lg font-bold">{title}</SheetTitle>
          <DayDetail row={row} view={view} entries={entries} />
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
        <td colSpan={5} className="h-11 px-2">
          <Skeleton className="h-4 w-full" />
        </td>
      </tr>
    ))}
  </tbody>
);

const MonthBody = ({ month, today, openingDate }: { month: string; today: string; openingDate: string }) => {
  const view = useMonth(month);
  const entries = useTransactions(month);
  if (view.isSuccess)
    return (
      <tbody>
        {planilhaRows(view.data, openingDate).map((row) => (
          <Row key={row.date} row={row} today={today} view={view.data} entries={entries} />
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

const MonthBlock = ({ month, today, openingDate }: { month: string; today: string; openingDate: string }) => {
  const [near, setNear] = useState(false);
  const label = monthLabel(month);

  /** Fetches once the table comes within its own width of the scroller's view. */
  const watch = (table: HTMLTableElement) => {
    const observer = new IntersectionObserver((entries) => setNear(entries.some((entry) => entry.isIntersecting)), {
      root: table.parentElement,
      rootMargin: `0px ${table.offsetWidth}px`,
    });
    observer.observe(table);
    return () => observer.disconnect();
  };

  return (
    <table
      ref={near ? undefined : watch}
      aria-label={label}
      className="min-w-[100cqi] shrink-0 snap-start text-[length:clamp(0.75rem,3.6cqi,0.875rem)] tabular-nums @[40rem]:min-w-[calc((100cqi-1rem)/2)] @[64rem]:min-w-[calc((100cqi-2rem)/3)]"
    >
      <thead className="bg-card sticky top-0 z-10">
        <tr>
          <th colSpan={5} scope="colgroup" className="px-2 py-2 text-left text-base font-semibold">
            {label}
          </th>
        </tr>
        <tr className="border-b">
          {COLUMNS.map((column) => (
            <th
              key={column}
              scope="col"
              className={cn(
                "text-muted-foreground px-2 py-1 text-right font-medium",
                column === "Data" && "bg-card sticky left-0 text-left",
              )}
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      {near ? <MonthBody month={month} today={today} openingDate={openingDate} /> : <SkeletonBody month={month} />}
    </table>
  );
};

/** Spec SOL-163 §3–§8: the month view as the owner's sheet, one table per month side by side. */
export const Planilha = ({ today, openingDate }: { today: string; openingDate: string }) => (
  <div className="@container flex flex-col gap-3">
    <div className="flex max-h-[80dvh] snap-x snap-mandatory gap-4 overflow-auto overscroll-x-contain">
      {planilhaMonths(today, openingDate).map((month) => (
        <MonthBlock key={month} month={month} today={today} openingDate={openingDate} />
      ))}
    </div>
    <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
      <span className="italic">Itálico: previsto</span>
      {TIER_ORDER.map((tier) => (
        <TierPill key={tier} tier={tier} size="sm" />
      ))}
    </div>
  </div>
);
