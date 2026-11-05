"use client";

import { type FormEvent, useState } from "react";

import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CategoryChips, useCategoryChips } from "@/entities/category/category-chips";
import {
  type NewTransaction,
  type Transaction,
  useCreateTransaction,
  useUpdateTransaction,
} from "@/entities/transaction/transaction-queries";
import type { Schemas } from "@/shared/api/client";
import { todayISO } from "@/shared/lib/date";
import { positiveAmount } from "@/shared/lib/money";
import { BrandButton } from "@/shared/ui/brand-button";
import { DateChips } from "@/shared/ui/date-chips";
import { HeroAmount } from "@/shared/ui/hero-amount";
import { ResponsiveSheet } from "@/shared/ui/responsive-sheet";

type Kind = Schemas["CategoryKind"];

const KINDS: { value: Kind; label: string }[] = [
  { value: "income", label: "Entrada" },
  { value: "bill", label: "Saída" },
  { value: "daily", label: "Diário" },
];

type Draft = { kind: Kind; amount: string; category?: Schemas["Category"]; date: string; note: string };

const TransactionForm = ({ initial, onSave }: { initial: Draft; onSave: (draft: NewTransaction) => void }) => {
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const categories = useCategoryChips(draft.kind);
  const category = draft.category ?? categories.data?.[0];
  const amount = positiveAmount(draft.amount);

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

      <HeroAmount
        id="transaction-amount"
        value={draft.amount}
        onChange={(value) => set({ amount: value })}
        invalid={submitted && !amount}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold text-sm">Categoria</legend>
        <CategoryChips kind={draft.kind} chosen={category} onChoose={(chosen) => set({ category: chosen })} />
        {submitted && categories.data && !category && (
          <p role="alert" className="text-destructive text-sm">
            Escolha uma categoria
          </p>
        )}
      </fieldset>

      <DateChips legend="Quando foi?" value={draft.date} onChange={(date) => set({ date })} />

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

type TransactionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Given: the sheet edits it. */
  transaction?: Transaction;
  /** Preselected kind when creating; Diário otherwise. */
  initialKind?: Draft["kind"];
  /** Preselected category when creating, of `initialKind`. */
  initialCategory?: Schemas["Category"];
};

/** `Lançar`: bottom sheet below 1024px, dialog from there; closes at once and the row appears optimistically. */
export const TransactionSheet = ({
  open,
  onOpenChange,
  transaction,
  initialKind = "daily",
  initialCategory,
}: TransactionSheetProps) => {
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
        amount: transaction.amount,
        category: transaction.category,
        date: transaction.date,
        note: transaction.note ?? "",
      }
    : { kind: initialKind, amount: "", category: initialCategory, date: todayISO(), note: "" };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={transaction ? "Editar lançamento" : "Lançar"}
      description="Entrada, conta ou gasto do dia."
    >
      <TransactionForm
        key={transaction?.id ?? `${initialKind}-${initialCategory?.id}`}
        initial={initial}
        onSave={save}
      />
    </ResponsiveSheet>
  );
};
