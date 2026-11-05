"use client";

import { type FormEvent, type ReactNode, useState } from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type ImportPreview, importErrorMessage, useConfirmImport } from "@/entities/import/import-queries";
import { parseBRL } from "@/shared/lib/money";
import { AmountInput } from "@/shared/ui/amount-input";
import { BrandButton } from "@/shared/ui/brand-button";
import { Money } from "@/shared/ui/money";

const count = (amount: number, one: string, many: string) => `${amount} ${amount === 1 ? one : many}`;

// The API refuses an opening date after the first imported entry, and only the years are known here.
const firstJanuary = (years: ImportPreview["years"]) => `${Math.min(...years.map(({ year }) => year))}-01-01`;

const landing = (years: ImportPreview["years"]) => {
  const latest = Math.max(...years.map(({ year }) => year));
  return latest < new Date().getFullYear() ? `/mes?m=${latest}-12` : "/mes";
};

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-center justify-between gap-3">
    <dt className="text-muted-foreground text-sm">{label}</dt>
    <dd className="font-semibold text-base">{children}</dd>
  </div>
);

/** What the workbook holds per year, the cells it could not read, and the opening balance to import with. */
export const ImportPreviewForm = ({ preview }: { preview: ImportPreview }) => {
  const router = useRouter();
  const confirm = useConfirmImport();
  const [amount, setAmount] = useState("0.00");
  const [date, setDate] = useState(() => firstJanuary(preview.years));
  const [skip, setSkip] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const balance = parseBRL(amount);
  const invalid = submitted && balance === null;
  const hasErrors = preview.errors.length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (balance === null) return;
    confirm.mutate(
      { token: preview.token, opening_balance: balance, opening_date: date, skip_errors: skip },
      {
        onSuccess: (result) => {
          toast.success(`Importado: ${count(result.transactions, "lançamento", "lançamentos")}`);
          router.replace(landing(preview.years));
        },
      },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {preview.years.map((year) => (
          <section
            key={year.year}
            aria-label={String(year.year)}
            className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-sm sm:only:col-span-2 lg:p-6"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold text-lg">{year.year}</h2>
              <span className="text-muted-foreground text-sm">
                {count(year.transactions, "lançamento", "lançamentos")}
              </span>
            </div>
            <dl className="flex flex-col gap-2">
              <Row label="Entradas">
                <Money amount={year.income_total} income />
              </Row>
              <Row label="Contas">
                <Money amount={year.bills_total} />
              </Row>
              <Row label="Diário">
                <Money amount={year.daily_total} />
              </Row>
            </dl>
          </section>
        ))}
      </div>

      {hasErrors && (
        <section
          aria-label="Células que não deram para ler"
          className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-sm lg:p-6"
        >
          <h2 className="font-semibold text-base text-destructive">Células que não deram para ler</h2>
          <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto text-sm">
            {preview.errors.map(({ sheet, cell, message }) => (
              <li key={`${sheet}!${cell}`} className="tabular-nums">{`${sheet}!${cell}: ${message}`}</li>
            ))}
          </ul>
          <Field orientation="horizontal" className="min-h-11">
            <Checkbox id="skip-errors" checked={skip} onCheckedChange={(checked) => setSkip(checked === true)} />
            <FieldLabel htmlFor="skip-errors" className="font-normal text-base">
              Importar mesmo assim, pulando essas células
            </FieldLabel>
          </Field>
        </section>
      )}

      <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6">
        <Field className="gap-1.5" data-invalid={invalid}>
          <FieldLabel htmlFor="import-balance">Saldo inicial</FieldLabel>
          <AmountInput
            id="import-balance"
            negative
            value={amount}
            onValueChange={setAmount}
            className="h-12 text-base tabular-nums md:text-base"
            aria-invalid={invalid}
          />
          {invalid ? (
            <FieldError>Informe um valor, como 1.250,00.</FieldError>
          ) : (
            <FieldDescription>O saldo antes do primeiro dia da planilha. Pode ser negativo.</FieldDescription>
          )}
        </Field>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="import-date">Data do saldo inicial</FieldLabel>
          <Input
            id="import-date"
            type="date"
            required
            value={date}
            onChange={(event) => event.target.value && setDate(event.target.value)}
            className="h-12 text-base md:text-base"
          />
        </Field>
      </div>

      {confirm.isError && (
        <Alert variant="destructive">
          <AlertDescription>{importErrorMessage(confirm.error)}</AlertDescription>
        </Alert>
      )}
      <BrandButton
        type="submit"
        disabled={(hasErrors && !skip) || confirm.isPending}
        className="lg:w-auto lg:self-start lg:px-8"
      >
        {confirm.isPending ? "Importando…" : "Importar"}
      </BrandButton>
    </form>
  );
};
