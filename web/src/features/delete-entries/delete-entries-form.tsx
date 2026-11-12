"use client";

import { useState } from "react";

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

/** Months of `year` from January, or the opening month, up to today's month. */
const monthsOf = (year: string, opening: string, today: string) => {
  const first = opening.startsWith(year) ? Number(opening.slice(5, 7)) : 1;
  const last = today.startsWith(year) ? Number(today.slice(5, 7)) : 12;
  return Math.max(last - first + 1, 0);
};

/** Deletes the entries of the viewed month, its year or every period, once CONFIRMAR is typed. */
export const DeleteEntriesForm = ({ month, opening }: { month: string; opening: string }) => {
  const today = todayISO();
  const year = month.slice(0, 4);
  const [scope, setScope] = useState<Scope>("month");
  const [typed, setTyped] = useState("");
  const count = useTransactionCount(month);
  const remove = useDeletePeriod();
  const period = { month, year, all: "all" }[scope];

  const scopes: { value: Scope; title: string; caption: string }[] = [
    {
      value: "month",
      title: month === today.slice(0, 7) ? "Mês atual" : "Mês selecionado",
      caption: count.data === undefined ? monthName(month) : `${monthName(month)} (${records(count.data)})`,
    },
    { value: "year", title: `Ano de ${year}`, caption: `Todos os ${monthsOf(year, opening, today)} meses deste ano` },
    { value: "all", title: "Zerar tudo", caption: "Limpa toda a base da conta" },
  ];

  const confirm = () =>
    remove.mutate(period, {
      onSuccess: ({ deleted }) => {
        toast.success(`${entries(deleted)} ${deleted === 1 ? "apagado" : "apagados"}`);
        setTyped("");
      },
    });

  return (
    <div className="flex flex-col gap-4">
      <p id="delete-scope" className="font-semibold text-sm">
        Selecione o escopo para exclusão:
      </p>
      <div role="radiogroup" aria-labelledby="delete-scope" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {scopes.map(({ value, title, caption }) => (
          <label
            key={value}
            className="flex min-h-14 cursor-pointer items-start justify-between gap-2 rounded-xl bg-muted p-3 has-checked:ring-2 has-checked:ring-brand has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
          >
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold text-sm">{title}</span>
              <span className="text-muted-foreground text-xs">{caption}</span>
            </span>
            <input
              type="radio"
              name="delete-scope"
              value={value}
              aria-label={title}
              checked={scope === value}
              onChange={() => setScope(value)}
              className="size-5 shrink-0 accent-brand"
            />
          </label>
        ))}
      </div>
      {count.isError && (
        <p className="text-destructive text-sm">
          Não foi possível contar os lançamentos.{" "}
          <Button variant="link" className="min-h-11 px-0 text-sm" onClick={() => count.refetch()}>
            Tentar de novo
          </Button>
        </p>
      )}
      <div className="flex flex-col gap-3 rounded-2xl bg-destructive/10 p-4 lg:flex-row lg:items-center">
        <TriangleAlert aria-hidden className="size-6 shrink-0 text-destructive" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="font-semibold text-sm">Ação destrutiva sem retorno</p>
          <p id="delete-word" className="text-muted-foreground text-xs">
            Para confirmar exclusão em massa, digite <code className="font-bold text-destructive">{WORD}</code> no
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
          className="h-12 bg-card text-base md:text-base lg:w-40"
        />
        <Button
          variant="destructive"
          disabled={typed !== WORD || remove.isPending}
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
