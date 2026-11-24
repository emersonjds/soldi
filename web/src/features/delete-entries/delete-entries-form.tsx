"use client";

import { useRef, useState } from "react";

import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeletePeriod, useTransactionCount } from "@/entities/transaction/transaction-queries";
import { todayISO } from "@/shared/lib/date";

type Scope = "month" | "year" | "all";

const WORD = "CONFIRMAR";

const entries = (count: number) => (count === 1 ? "1 lançamento" : `${count} lançamentos`);

const records = (count: number) => (count === 1 ? "1 registro" : `${count} registros`);

/** `2026-11` → `Novembro 2026`. */
const monthName = (month: string) => {
  const name = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(`${month}-01T12:00`));
  return `${name[0].toUpperCase()}${name.slice(1)} ${month.slice(0, 4)}`;
};

const months = (count: number) => (count === 1 ? "1 mês" : `${count} meses`);

/** `2026-11…` → a month count since year 0. */
const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));

/** Months of `year` from the opening month up to today's month; 0 for a year outside them. */
const monthsOf = (year: string, opening: string, today: string) => {
  const first = Math.max(monthIndex(opening), monthIndex(`${year}-01`));
  const last = Math.min(monthIndex(today), monthIndex(`${year}-12`));
  return Math.max(last - first + 1, 0);
};

/** Deletes the entries of the viewed month, its year or every period, once CONFIRMAR is typed. */
export const DeleteEntriesForm = ({ month, opening }: { month: string; opening: string }) => {
  const today = todayISO();
  const year = month.slice(0, 4);
  const [scope, setScope] = useState<Scope>("month");
  const [typed, setTyped] = useState("");
  const scopesRef = useRef<HTMLDivElement>(null);
  const counts = {
    month: useTransactionCount(month),
    year: useTransactionCount(year),
    all: useTransactionCount("all"),
  };
  const remove = useDeletePeriod();
  const period = { month, year, all: "all" }[scope];
  const yearMonths = months(monthsOf(year, opening, today));
  const failed = Object.values(counts).filter((count) => count.isError);

  const scopes: { value: Scope; title: string; caption: string }[] = [
    {
      value: "month",
      title: month === today.slice(0, 7) ? "Mês atual" : "Mês selecionado",
      caption:
        counts.month.data === undefined ? monthName(month) : `${monthName(month)} (${records(counts.month.data)})`,
    },
    {
      value: "year",
      title: `Ano de ${year}`,
      caption: counts.year.data === undefined ? yearMonths : `${records(counts.year.data)} em ${yearMonths}`,
    },
    {
      value: "all",
      title: "Zerar tudo",
      caption:
        counts.all.data === undefined
          ? "Limpa toda a base da conta"
          : `Limpa toda a base da conta (${records(counts.all.data)})`,
    },
  ];

  const choose = (next: Scope) => {
    setScope(next);
    setTyped("");
    remove.reset();
  };

  const confirm = () =>
    remove.mutate(period, {
      onSuccess: ({ deleted }) => {
        toast.success(`${entries(deleted)} ${deleted === 1 ? "apagado" : "apagados"}`);
        setTyped("");
        scopesRef.current?.focus();
      },
    });

  return (
    <div className="flex flex-col gap-4">
      <p id="delete-scope" className="text-sm font-semibold">
        Selecione o escopo para exclusão:
      </p>
      <div
        ref={scopesRef}
        tabIndex={-1}
        role="radiogroup"
        aria-labelledby="delete-scope"
        className="grid grid-cols-1 gap-2 outline-none sm:grid-cols-3"
      >
        {scopes.map(({ value, title, caption }) => (
          <label
            key={value}
            className="bg-muted has-checked:ring-brand has-focus-visible:ring-ring/50 flex min-h-14 cursor-pointer items-start justify-between gap-2 rounded-xl p-3 has-checked:ring-2 has-focus-visible:ring-3"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold">{title}</span>
              <span className="text-muted-foreground text-xs">{caption}</span>
            </span>
            <input
              type="radio"
              name="delete-scope"
              value={value}
              aria-label={title}
              checked={scope === value}
              onChange={() => choose(value)}
              className="accent-brand size-5 shrink-0"
            />
          </label>
        ))}
      </div>
      {failed.length > 0 && (
        <p className="text-destructive text-sm">
          Não foi possível contar os lançamentos.{" "}
          <Button
            variant="link"
            className="min-h-11 px-0 text-sm"
            onClick={() => {
              for (const count of failed) count.refetch();
            }}
          >
            Tentar de novo
          </Button>
        </p>
      )}
      <div className="bg-destructive/10 flex flex-col gap-3 rounded-2xl p-4 lg:flex-row lg:items-center">
        <TriangleAlert aria-hidden className="text-destructive size-6 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-sm font-semibold">Ação destrutiva sem retorno</p>
          <p id="delete-word" className="text-muted-foreground text-xs">
            Para confirmar exclusão em massa, digite <code className="text-destructive font-bold">{WORD}</code> no
            campo:
          </p>
        </div>
        <Input
          aria-labelledby="delete-word"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={WORD}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          className="bg-card h-12 text-base md:text-base lg:w-40"
        />
        <Button
          variant="destructive"
          disabled={typed !== WORD || counts[scope].data === 0 || remove.isPending}
          onClick={confirm}
          className="h-12 text-base"
        >
          {remove.isPending ? "Excluindo…" : "Excluir Lançamentos"}
        </Button>
      </div>
      {remove.isError && (
        <Alert variant="destructive">
          <AlertDescription>Não foi possível apagar. Tente de novo.</AlertDescription>
        </Alert>
      )}
    </div>
  );
};
