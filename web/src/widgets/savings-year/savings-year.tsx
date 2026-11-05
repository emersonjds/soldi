"use client";

import { type FormEvent, useRef, useState } from "react";

import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSaveSavings, useSavingsGoal, useSavingsYear } from "@/entities/savings/savings-queries";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { todayISO } from "@/shared/lib/date";
import { formatBRL, parseBRL, toInput } from "@/shared/lib/money";
import { formatPct } from "@/shared/lib/percent";
import { TIER_STYLE, type Tier } from "@/shared/lib/tier";
import { Money } from "@/shared/ui/money";
import { PageError } from "@/shared/ui/page-state";

type SavingsYear = Schemas["SavingsYear"];
type SavingsMonth = Schemas["SavingsMonth"];

const card = "flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6";

const caption = "font-semibold text-[11px] text-muted-foreground uppercase leading-4 tracking-[0.12em]";

const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });
const MONTH_NAMES = Array.from({ length: 12 }, (_, index) => {
  const name = monthFormat.format(Date.UTC(2026, index, 1));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
});

/** The sheet's rule: under 5% red, 5–15% yellow, over 15% green. */
const savingsTier = (pct: string): Tier => {
  const value = Number(pct);
  if (value < 5) return "red";
  if (value > 15) return "green";
  return "yellow";
};

const Dash = () => <span className="text-muted-foreground">—</span>;

const Share = ({ pct }: { pct?: string | null }) => {
  if (pct === null || pct === undefined) return <Dash />;
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", TIER_STYLE[savingsTier(pct)].dot)} />
      <span>{formatPct(pct)}</span>
    </span>
  );
};

/** Tap the amount, type, Enter or leave the field to save; Escape cancels. */
const SavedCell = ({ year, row }: { year: number; row: SavingsMonth }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const save = useSaveSavings();
  const name = MONTH_NAMES[row.month - 1];

  if (row.saved === null || row.saved === undefined) return <Dash />;
  const saved = row.saved;

  if (draft === null)
    return (
      <button
        type="button"
        aria-label={`Guardado em ${name}: ${formatBRL(saved)}. Editar`}
        onClick={() => {
          cancelled.current = false;
          setDraft(toInput(saved));
        }}
        className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-semibold transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Money amount={saved} />
        <Pencil className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    );

  const commit = () => {
    setDraft(null);
    if (cancelled.current) return;
    const amount = parseBRL(draft);
    if (amount === null || amount.startsWith("-")) return toast.error("Informe um valor como 250,00.");
    if (amount === saved) return;
    save.mutate(
      { year, month: row.month, amount },
      { onSuccess: () => toast.success("Salvo"), onError: () => toast.error("Não foi possível salvar.") },
    );
  };

  return (
    <input
      aria-label={`Guardado em ${name}`}
      // biome-ignore lint/a11y/noAutofocus: the field replaces the amount just tapped.
      autoFocus
      inputMode="decimal"
      autoComplete="off"
      value={draft}
      onChange={(event) => setDraft(event.target.value.replace(/[^\d.,]/g, ""))}
      onKeyDown={(event) => {
        if (event.key === "Escape") cancelled.current = true;
        if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
      }}
      onBlur={commit}
      className="h-11 w-28 rounded-lg border border-input bg-background px-2 text-right text-base tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
    />
  );
};

const GOAL_ID = "savings-goal";

const GoalEditor = ({ initial, onClose }: { initial: string; onClose: () => void }) => {
  const [draft, setDraft] = useState(initial);
  const save = useSavingsGoal();
  const goal = draft === "" ? null : Number(draft);
  const valid = goal === null || (Number.isInteger(goal) && goal >= 1 && goal <= 100);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    save.mutate(goal, {
      onSuccess: () => {
        onClose();
        toast.success("Meta salva");
      },
      onError: () => toast.error("Não foi possível salvar a meta."),
    });
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-2 rounded-xl bg-muted p-3">
      <label htmlFor={GOAL_ID} className="font-medium text-sm">
        Meta (% das entradas)
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={GOAL_ID}
          autoFocus
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && onClose()}
          aria-invalid={!valid}
          className="h-11 w-24 bg-background text-base tabular-nums md:text-base"
        />
        <Button type="submit" disabled={!valid || save.isPending} className="min-h-11 px-5">
          Salvar
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={onClose}>
          Cancelar
        </Button>
      </div>
      {!valid && (
        <p role="alert" className="text-destructive text-sm">
          De 1 a 100.
        </p>
      )}
    </form>
  );
};

const Goal = ({ data }: { data: SavingsYear }) => {
  const [editing, setEditing] = useState(false);
  const goal = data.goal_pct;

  if (editing) return <GoalEditor initial={goal ? String(goal) : ""} onClose={() => setEditing(false)} />;
  if (goal === null || goal === undefined)
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl bg-muted p-3 pl-4">
        <span className="text-muted-foreground">Sem meta</span>
        <Button variant="ghost" className="min-h-11 text-primary" onClick={() => setEditing(true)}>
          Definir meta
        </Button>
      </div>
    );

  const progress = data.goal_progress_pct ?? "0";
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-muted p-3 pl-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">Meta {goal}%</span>
        <span className="flex items-center gap-1 text-muted-foreground text-sm tabular-nums">
          {formatPct(progress)} da meta
          <Button
            variant="ghost"
            size="icon"
            aria-label="Editar meta"
            className="size-11 rounded-full"
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-4" />
          </Button>
        </span>
      </div>
      {/* The template's Progress keeps `value` off the root, so the meter reads it from these. */}
      <Progress
        value={Number(progress)}
        aria-label="Progresso da meta"
        aria-valuenow={Number(progress)}
        aria-valuetext={`${formatPct(progress)} da meta`}
        className="h-2 bg-background"
      />
    </div>
  );
};

const Hero = ({ data }: { data: SavingsYear }) => (
  <section aria-labelledby="saved-year-title" className={cn(card, "lg:flex-row lg:items-center lg:gap-8")}>
    <div className="flex flex-col gap-1 lg:flex-1">
      <h2 id="saved-year-title" className={caption}>
        Guardado no ano
      </h2>
      <Money amount={data.total_saved} className="font-bold text-[34px] leading-10 tracking-[-0.02em]" />
      {data.pct !== null && data.pct !== undefined && (
        <p className="text-muted-foreground">{formatPct(data.pct)} das entradas</p>
      )}
    </div>
    <div className="lg:w-96">
      <Goal data={data} />
    </div>
  </section>
);

const Months = ({ data }: { data: SavingsYear }) => {
  const today = todayISO();
  const current = (month: number) => `${data.year}-${String(month).padStart(2, "0")}` === today.slice(0, 7);

  return (
    <section aria-labelledby="savings-months-title" className={cn(card, "gap-2 px-2 lg:px-4")}>
      <h2 id="savings-months-title" className="px-2 font-semibold text-lg leading-6">
        Mês a mês
      </h2>
      <Table className="text-base">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-muted-foreground">Mês</TableHead>
            <TableHead className="hidden text-right text-muted-foreground lg:table-cell">Entradas</TableHead>
            <TableHead className="text-right text-muted-foreground">Guardado</TableHead>
            <TableHead className="w-20 text-right text-muted-foreground">%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.months.map((row) => {
            const income = row.income ? <Money amount={row.income} /> : <Dash />;
            return (
              <TableRow key={row.month} className={cn("hover:bg-transparent", current(row.month) && "bg-secondary/60")}>
                <TableCell className="py-1.5">
                  <span className="block font-medium">{MONTH_NAMES[row.month - 1]}</span>
                  <span className="block text-muted-foreground text-xs lg:hidden">Entradas: {income}</span>
                </TableCell>
                <TableCell className="hidden text-right lg:table-cell">{income}</TableCell>
                <TableCell className="py-1.5 text-right">
                  <SavedCell year={data.year} row={row} />
                </TableCell>
                <TableCell className="text-right">
                  <Share pct={row.pct} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter className="bg-transparent font-semibold">
          <TableRow className="hover:bg-transparent">
            <TableCell>
              <span className="block">Total</span>
              <span className="block font-normal text-muted-foreground text-xs lg:hidden">
                Entradas: <Money amount={data.total_income} />
              </span>
            </TableCell>
            <TableCell className="hidden text-right lg:table-cell">
              <Money amount={data.total_income} />
            </TableCell>
            <TableCell className="text-right">
              <Money amount={data.total_saved} />
            </TableCell>
            <TableCell className="text-right">
              <Share pct={data.pct} />
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </section>
  );
};

export const SavingsSkeleton = () => (
  <div role="status" aria-label="Carregando" className="flex flex-col gap-6">
    <div className={card}>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-16 w-full rounded-xl" />
    </div>
    <div className={card}>
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <div key={index} className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  </div>
);

/** `Economia`: the year's savings against income and the goal, month by month. */
export const SavingsYearView = ({ year }: { year: number }) => {
  const savings = useSavingsYear(year);

  if (savings.isError)
    return (
      <div className="rounded-2xl bg-card shadow-sm">
        <PageError message="Não foi possível carregar a economia do ano." onRetry={() => savings.refetch()} />
      </div>
    );
  if (!savings.data) return <SavingsSkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <Hero data={savings.data} />
      <Months data={savings.data} />
    </div>
  );
};
