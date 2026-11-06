"use client";

import { useState } from "react";

import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PERIOD, useDeletePeriod, useTransactionCount } from "@/entities/transaction/transaction-queries";
import { todayISO } from "@/shared/lib/date";

type Mode = "month" | "year" | "all";

const MODES: { value: Mode; label: string }[] = [
  { value: "month", label: "Mês" },
  { value: "year", label: "Ano" },
  { value: "all", label: "Tudo" },
];

const chip =
  "h-11 rounded-xl! font-semibold text-base text-muted-foreground data-[state=on]:bg-brand data-[state=on]:text-brand-foreground data-[state=on]:shadow-sm";

const WORD = "APAGAR";

const YEAR_RANGE = "Informe um ano entre 2000 e 2100.";

const entries = (count: number) => (count === 1 ? "1 lançamento" : `${count} lançamentos`);

/** `2026-11` → `novembro de 2026`, `2026` → `2026`, `all` → `todo o período`. */
const periodName = (period: string) => {
  if (period === "all") return "todo o período";
  if (period.length === 4) return period;
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${period}-01T12:00`));
};

const summary = (count: number, period: string) =>
  `${count === 1 ? "Será apagado" : "Serão apagados"} ${entries(count)} de ${periodName(period)}.`;

const Preview = ({ count, period }: { count: ReturnType<typeof useTransactionCount>; period: string }) => {
  if (count.isError)
    return (
      <p className="text-destructive">
        Não foi possível contar os lançamentos.{" "}
        <Button variant="link" className="min-h-11 px-0 text-base" onClick={() => count.refetch()}>
          Tentar de novo
        </Button>
      </p>
    );
  if (count.data === 0) return <p className="text-muted-foreground">Nada para apagar neste período.</p>;
  if (count.data !== undefined) return <p className="font-medium">{summary(count.data, period)}</p>;
  return count.isFetching && <p className="animate-pulse text-muted-foreground">Contando…</p>;
};

/** Deletes the entries of a month, a year or every period, after a typed confirmation. */
export const DeleteEntriesForm = () => {
  const today = todayISO();
  const [mode, setMode] = useState<Mode>("month");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [year, setYear] = useState(today.slice(0, 4));
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const period = { month, year, all: "all" }[mode];
  const count = useTransactionCount(period);
  const remove = useDeletePeriod();
  const invalid = !PERIOD.test(period);
  const total = count.data;

  const toggle = (next: boolean) => {
    setOpen(next);
    setTyped("");
    remove.reset();
  };

  const confirm = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    remove.mutate(period, {
      onSuccess: ({ deleted }) => {
        toast.success(`${entries(deleted)} ${deleted === 1 ? "apagado" : "apagados"}`);
        toggle(false);
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6">
        <FieldTitle id="delete-period">Período</FieldTitle>
        <ToggleGroup
          type="single"
          spacing={0}
          value={mode}
          onValueChange={(next: Mode | "") => next && setMode(next)}
          aria-labelledby="delete-period"
          className="grid w-full grid-cols-3 rounded-2xl bg-muted p-1"
        >
          {MODES.map(({ value, label }) => (
            <ToggleGroupItem key={value} value={value} className={chip}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {mode === "month" && (
          <Field className="gap-1.5" data-invalid={invalid}>
            <FieldLabel htmlFor="delete-month">Mês</FieldLabel>
            <Input
              id="delete-month"
              type="month"
              min="2000-01"
              max="2100-12"
              value={month}
              onChange={(event) => event.target.value && setMonth(event.target.value)}
              aria-invalid={invalid}
              aria-describedby={invalid ? "delete-period-error" : undefined}
              className="h-12 text-base md:text-base"
            />
            {invalid && <FieldError id="delete-period-error">{YEAR_RANGE}</FieldError>}
          </Field>
        )}
        {mode === "year" && (
          <Field className="gap-1.5" data-invalid={invalid}>
            <FieldLabel htmlFor="delete-year">Ano</FieldLabel>
            <Input
              id="delete-year"
              type="number"
              inputMode="numeric"
              min={2000}
              max={2100}
              value={year}
              onChange={(event) => setYear(event.target.value)}
              aria-invalid={invalid}
              aria-describedby={invalid ? "delete-period-error" : undefined}
              className="h-12 text-base tabular-nums md:text-base"
            />
            {invalid && <FieldError id="delete-period-error">{YEAR_RANGE}</FieldError>}
          </Field>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div aria-live="polite" className="rounded-2xl bg-card p-4 shadow-sm lg:p-6">
          <Preview count={count} period={period} />
        </div>
        <p className="px-1 text-muted-foreground text-sm">
          Categorias, contas fixas e cofrinhos continuam, sem os lançamentos.
        </p>
      </div>

      <AlertDialog open={open} onOpenChange={(next) => !remove.isPending && toggle(next)}>
        <AlertDialogTrigger asChild>
          <Button
            variant="destructive"
            disabled={!total || count.isError}
            className="h-12 w-full text-base lg:w-auto lg:self-start lg:px-8"
          >
            {total === undefined ? "Apagar lançamentos" : `Apagar ${entries(total)}`}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar {entries(total ?? 0)}?</AlertDialogTitle>
            <AlertDialogDescription>
              {summary(total ?? 0, period)} Isso não pode ser desfeito. O saldo dos meses seguintes muda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="delete-confirm">Digite {WORD} para confirmar</FieldLabel>
            <Input
              id="delete-confirm"
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={WORD}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="h-11 text-base md:text-base"
            />
          </Field>
          {remove.isError && (
            <Alert variant="destructive">
              <AlertDescription>Não foi possível apagar. Tente de novo.</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending} className="h-11">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={typed !== WORD || remove.isPending}
              onClick={confirm}
              className="h-11"
            >
              {remove.isPending ? "Apagando…" : "Apagar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
