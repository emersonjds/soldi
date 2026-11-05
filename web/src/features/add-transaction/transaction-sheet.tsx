"use client";

import { type FormEvent, type ReactNode, useState } from "react";

import { CalendarDays, Check, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCategories } from "@/entities/category/categories-query";
import {
  type NewTransaction,
  type Transaction,
  useCreateTransaction,
  useUpdateTransaction,
} from "@/entities/transaction/transaction-queries";
import { useIsLg } from "@/hooks/use-lg";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { todayISO, yesterdayISO } from "@/shared/lib/date";
import { parseBRL } from "@/shared/lib/money";
import { BrandButton } from "@/shared/ui/brand-button";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { PageError } from "@/shared/ui/page-state";

type Kind = Schemas["CategoryKind"];

const KINDS: { value: Kind; label: string }[] = [
  { value: "income", label: "Entrada" },
  { value: "bill", label: "Conta" },
  { value: "daily", label: "Diário" },
];

/** The chip that comes first and preselected; the API sorts by name. */
const FIRST: Record<Kind, string> = { income: "Salário", bill: "Aluguel", daily: "Mercado" };

const useChips = (kind: Kind) => {
  const categories = useCategories(kind);
  const list = categories.data ?? [];
  const first = list.filter((category) => category.name === FIRST[kind]);
  return {
    ...categories,
    data: categories.data && [...first, ...list.filter((category) => !first.includes(category))],
  };
};

/** A decimal above zero, or `null`. */
const positiveAmount = (input: string) => {
  const amount = parseBRL(input);
  return amount && !amount.startsWith("-") && /[1-9]/.test(amount) ? amount : null;
};

const chip =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full bg-muted px-4 font-medium text-base transition-colors aria-pressed:bg-secondary aria-pressed:text-primary focus-visible:outline-2 focus-visible:outline-ring";

const CategoryChips = ({
  kind,
  chosen,
  onChoose,
}: {
  kind: Kind;
  chosen: Schemas["Category"] | undefined;
  onChoose: (category: Schemas["Category"]) => void;
}) => {
  const categories = useChips(kind);

  if (categories.isError)
    return <PageError message="Não foi possível carregar as categorias." onRetry={() => categories.refetch()} />;
  if (!categories.data)
    return (
      <div className="flex gap-4">
        <Skeleton className="size-12 rounded-full" />
        <Skeleton className="size-12 rounded-full" />
        <Skeleton className="size-12 rounded-full" />
      </div>
    );

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pt-1 pb-2">
      {categories.data.map((category) => (
        <label
          key={category.id}
          className="group relative flex w-20 shrink-0 cursor-pointer flex-col items-center gap-1.5 rounded-xl py-1 text-center text-muted-foreground text-xs has-checked:font-semibold has-checked:text-primary has-focus-visible:outline-2 has-focus-visible:outline-ring"
        >
          <input
            type="radio"
            name="category"
            className="sr-only"
            checked={chosen?.id === category.id}
            onChange={() => onChoose(category)}
          />
          <CategoryIcon
            icon={category.icon}
            color={category.color}
            className="size-12 opacity-60 transition-opacity group-has-checked:opacity-100 group-has-checked:ring-2 group-has-checked:ring-primary group-has-checked:ring-offset-2 group-has-checked:ring-offset-background"
          />
          <span
            aria-hidden
            className="absolute top-0 right-3 hidden size-5 items-center justify-center rounded-full bg-primary text-primary-foreground group-has-checked:flex"
          >
            <Check className="size-3" />
          </span>
          <span className="w-full truncate">{category.name}</span>
        </label>
      ))}
    </div>
  );
};

type Draft = { kind: Kind; amount: string; category?: Schemas["Category"]; date: string; note: string };

const TransactionForm = ({ initial, onSave }: { initial: Draft; onSave: (draft: NewTransaction) => void }) => {
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const categories = useChips(draft.kind);
  const category = draft.category ?? categories.data?.[0];
  const amount = positiveAmount(draft.amount);
  const today = todayISO();
  const yesterday = yesterdayISO();

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!amount || !category) return;
    const note = draft.note.trim();
    onSave({ date: draft.date, amount, kind: draft.kind, category_id: category.id, note: note || null, category });
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <ToggleGroup
        type="single"
        spacing={0}
        value={draft.kind}
        onValueChange={(kind: Kind | "") => kind && set({ kind, category: undefined })}
        aria-label="Tipo"
        className="grid w-full grid-cols-3 rounded-2xl bg-muted p-1"
      >
        {KINDS.map((kind) => (
          <ToggleGroupItem
            key={kind.value}
            value={kind.value}
            className="h-11 rounded-xl! font-semibold text-base text-muted-foreground data-[state=on]:bg-brand data-[state=on]:text-brand-foreground data-[state=on]:shadow-sm"
          >
            {kind.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex flex-col items-center gap-1">
        <label
          htmlFor="transaction-amount"
          className="font-semibold text-[11px] text-muted-foreground uppercase leading-4 tracking-[0.12em]"
        >
          Valor
        </label>
        <div className="flex items-baseline justify-center gap-2">
          <span aria-hidden className="font-bold text-2xl text-muted-foreground">
            R$
          </span>
          <input
            id="transaction-amount"
            // biome-ignore lint/a11y/noAutofocus: the sheet opens to type the amount; three taps in total.
            autoFocus
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            value={draft.amount}
            onChange={(event) => set({ amount: event.target.value.replace(/[^\d.,]/g, "") })}
            aria-invalid={submitted && !amount}
            aria-describedby={submitted && !amount ? "transaction-amount-error" : undefined}
            className="w-48 border-transparent border-b-2 bg-transparent text-center font-bold text-[34px] text-foreground tabular-nums leading-10 tracking-[-0.02em] outline-none placeholder:text-muted-foreground/50 focus:border-ring aria-invalid:border-destructive"
          />
        </div>
        {submitted && !amount && (
          <p id="transaction-amount-error" role="alert" className="text-destructive text-sm">
            Informe um valor
          </p>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold text-sm">Categoria</legend>
        <CategoryChips kind={draft.kind} chosen={category} onChoose={(chosen) => set({ category: chosen })} />
        {submitted && categories.data && !category && (
          <p role="alert" className="text-destructive text-sm">
            Escolha uma categoria
          </p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold text-sm">Quando foi?</legend>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={chip}
            aria-pressed={draft.date === today}
            onClick={() => set({ date: today })}
          >
            {draft.date === today && <Check className="size-4" aria-hidden />}
            Hoje
          </button>
          <button
            type="button"
            className={chip}
            aria-pressed={draft.date === yesterday}
            onClick={() => set({ date: yesterday })}
          >
            {draft.date === yesterday && <Check className="size-4" aria-hidden />}
            Ontem
          </button>
          <label className={cn(chip, "has-focus-visible:outline-2 has-focus-visible:outline-ring")}>
            <CalendarDays className="size-4 shrink-0" aria-hidden />
            <span className="sr-only">Outra data</span>
            <input
              type="date"
              value={draft.date}
              onChange={(event) => event.target.value && set({ date: event.target.value })}
              className="w-34 bg-transparent text-base outline-none"
            />
          </label>
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="transaction-note" className="font-semibold text-sm">
          Observação
        </label>
        <Input
          id="transaction-note"
          value={draft.note}
          onChange={(event) => set({ note: event.target.value })}
          placeholder="Opcional"
          maxLength={200}
          className="h-12 rounded-xl bg-muted text-base md:text-base"
        />
      </div>

      <BrandButton type="submit">Salvar</BrandButton>
    </form>
  );
};

const Surface = ({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) => {
  const close = (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Fechar"
      className="absolute top-3 right-3 size-11 rounded-full"
      onClick={() => onOpenChange(false)}
    >
      <X className="size-5" />
    </Button>
  );
  const heading = "pr-12 font-bold text-[22px] leading-7";

  if (useIsLg())
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[90dvh] flex-col gap-6 overflow-y-auto rounded-3xl p-8 sm:max-w-lg"
        >
          <DialogTitle className={heading}>{title}</DialogTitle>
          <DialogDescription className="sr-only">Entrada, conta ou gasto do dia.</DialogDescription>
          {close}
          {children}
        </DialogContent>
      </Dialog>
    );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-h-[92dvh] max-w-lg gap-6 overflow-y-auto rounded-t-3xl px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <SheetTitle className={heading}>{title}</SheetTitle>
        <SheetDescription className="sr-only">Entrada, conta ou gasto do dia.</SheetDescription>
        {close}
        {children}
      </SheetContent>
    </Sheet>
  );
};

type TransactionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Given: the sheet edits it. */
  transaction?: Transaction;
};

/** `Lançar`: bottom sheet below 1024px, dialog from there; closes at once and the row appears optimistically. */
export const TransactionSheet = ({ open, onOpenChange, transaction }: TransactionSheetProps) => {
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const failed = () => toast.error("Não foi possível salvar o lançamento.");

  const save = (draft: NewTransaction) => {
    onOpenChange(false);
    if (!transaction) return create.mutate(draft, { onSuccess: () => toast.success("Lançado"), onError: failed });
    const { category: _category, ...fields } = draft;
    update.mutate(
      { id: transaction.id, ...fields },
      { onSuccess: () => toast.success("Lançamento atualizado"), onError: failed },
    );
  };

  const initial: Draft = transaction
    ? {
        kind: transaction.kind,
        amount: transaction.amount.replace(".", ","),
        category: transaction.category,
        date: transaction.date,
        note: transaction.note ?? "",
      }
    : { kind: "daily", amount: "", date: todayISO(), note: "" };

  return (
    <Surface open={open} onOpenChange={onOpenChange} title={transaction ? "Editar lançamento" : "Lançar"}>
      <TransactionForm initial={initial} onSave={save} />
    </Surface>
  );
};
