"use client";

import { type ReactNode, useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";

import { type BillOfMonth, billTitle } from "@/entities/bill/bill-queries";
import { faturaQuery } from "@/entities/bill/fatura-query";
import type { Transaction } from "@/entities/transaction/transaction-queries";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { useCurrency } from "@/shared/lib/currency";
import { addMonths, dayMonth, monthAbbrev, monthName } from "@/shared/lib/date";
import { formatMoney } from "@/shared/lib/money";
import { cents, fromCents } from "@/shared/lib/tier";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { Money } from "@/shared/ui/money";
import { ResponsiveSheet } from "@/shared/ui/responsive-sheet";

import { faturaGroups } from "./fatura-groups";

type EntrySheet = (props: {
  transaction: Transaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => ReactNode;

const stateOf = (fatura: Schemas["CardFatura"], bill: BillOfMonth, money: (amount: string) => string) => {
  const paid = cents(fatura.paid);
  const total = cents(fatura.total);
  if (paid > 0 && paid >= total) return "Paga";
  if (paid > 0)
    return `Pagou ${money(fatura.paid)} · ${money(fromCents(total - paid))} vão para a fatura de ${monthName(addMonths(fatura.month, 1), fatura.month)}`;
  return `${bill.overdue ? "Venceu" : "Vence"} dia ${dayMonth(bill.due_date)}`;
};

const Body = ({ bill, onOpenEntry }: { bill: BillOfMonth; onOpenEntry: (entry: Transaction) => void }) => {
  const currency = useCurrency();
  const money = (amount: string) => formatMoney(amount, currency);
  const fatura = useQuery(faturaQuery(bill.due_date.slice(0, 7), bill.bill_id));
  if (fatura.isError && !fatura.data)
    return (
      <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
        Não foi possível carregar.
        <button
          type="button"
          onClick={() => fatura.refetch()}
          className="text-primary focus-visible:outline-ring inline-flex min-h-11 items-center font-semibold hover:underline focus-visible:outline-2"
        >
          Tentar de novo
        </button>
      </p>
    );
  if (!fatura.data) return null;
  const data = fatura.data;
  const late = bill.overdue && cents(data.paid) === 0;
  const ahead = data.ahead.some(({ total }) => cents(total) > 0);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-1">
        <Money amount={data.total} className="text-3xl font-bold" />
        <p className={cn("text-sm", late ? "text-expense" : "text-muted-foreground")}>{stateOf(data, bill, money)}</p>
      </div>
      {cents(data.carried) > 0 && (
        <p className="flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate">
            Restante da fatura de {monthName(addMonths(data.month, -1), data.month)}
          </span>
          <Money amount={data.carried} className="whitespace-nowrap" />
        </p>
      )}
      {faturaGroups(data.entries, data.total, money).map((group) => (
        <section key={group.label} aria-label={group.label} className="flex flex-col gap-1">
          <h3 className="flex items-baseline justify-between gap-2 text-sm font-semibold">
            {group.label}
            <span className="text-muted-foreground font-normal whitespace-nowrap">
              {money(group.total)} · {group.share}%
            </span>
          </h3>
          <ul className="flex flex-col">
            {group.rows.map((row) => (
              <li key={row.key}>
                <button
                  type="button"
                  onClick={() => onOpenEntry(row.entry)}
                  className="hover:bg-muted focus-visible:outline-ring -mx-2 flex min-h-14 w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 text-left focus-visible:outline-2"
                >
                  <CategoryIcon icon={row.entry.category.icon} color={row.entry.category.color} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="line-clamp-2 text-base font-medium break-words">{row.title}</span>
                    <span className="text-muted-foreground truncate text-xs">{row.caption}</span>
                  </span>
                  <Money amount={row.amount} className="text-sm font-semibold whitespace-nowrap" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {ahead && (
        <section aria-labelledby="fatura-ahead" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-x-2">
            <h3 id="fatura-ahead" className="text-sm font-semibold">
              Próximos meses
            </h3>
            <Link
              href="/posso-comprar"
              className="text-primary focus-visible:outline-ring inline-flex min-h-11 items-center gap-1 text-sm font-semibold hover:underline focus-visible:outline-2"
            >
              Posso comprar?
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <p className="text-muted-foreground text-xs">Já comprometido: assinaturas, parcelas e compras feitas.</p>
          <ul className="flex flex-col gap-1 text-sm">
            {data.ahead.map(({ month, total }) => (
              <li key={month} className="flex items-center justify-between gap-2">
                <span>{monthAbbrev(month)}</span>
                <Money amount={total} className="whitespace-nowrap" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

/** SOL-119: what weighs on a card's fatura and what is already committed ahead; a row opens its entry. */
export const FaturaSheet = ({
  bill,
  open,
  onOpenChange,
  entrySheet,
}: {
  bill: BillOfMonth | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entrySheet: EntrySheet;
}) => {
  const [entry, setEntry] = useState<Transaction>();
  const [editing, setEditing] = useState(false);
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={bill ? billTitle(bill) : "Fatura"}
      description="O que pesa nesta fatura e o que já está comprometido nos próximos meses."
    >
      {bill && (
        <Body
          bill={bill}
          onOpenEntry={(picked) => {
            setEntry(picked);
            setEditing(true);
          }}
        />
      )}
      {entry && entrySheet({ transaction: entry, open: editing, onOpenChange: setEditing })}
    </ResponsiveSheet>
  );
};
