"use client";

import { type FormEvent, useState } from "react";

import { toast } from "sonner";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useMonth } from "@/entities/month/month-query";
import { useUpdateSettings } from "@/entities/settings/settings-query";
import type { Schemas } from "@/shared/api/client";
import { todayISO } from "@/shared/lib/date";
import { formatBRL, parseBRL, toInput } from "@/shared/lib/money";
import { boundsRise, type TierBounds, tierOf } from "@/shared/lib/tier";
import { BrandButton } from "@/shared/ui/brand-button";
import { ThermometerStrip } from "@/shared/ui/thermometer-strip";

const FIELDS: { key: keyof TierBounds; label: string }[] = [
  { key: "tier_red", label: "Atenção a partir de" },
  { key: "tier_zero", label: "Apertado a partir de" },
  { key: "tier_yellow", label: "Confortável a partir de" },
  { key: "tier_green", label: "Folga a partir de" },
];

const parseAll = (draft: TierBounds): TierBounds | null => {
  const parsed = FIELDS.map(({ key }) => [key, parseBRL(draft[key])] as const);
  if (parsed.some(([, value]) => value === null)) return null;
  return Object.fromEntries(parsed) as TierBounds;
};

/** The four lower bounds of the thermometer, with today's balance placed live as they change. */
export const ThermometerForm = ({ settings }: { settings: Schemas["Settings"] }) => {
  const [draft, setDraft] = useState<TierBounds>({
    tier_red: toInput(settings.tier_red),
    tier_zero: toInput(settings.tier_zero),
    tier_yellow: toInput(settings.tier_yellow),
    tier_green: toInput(settings.tier_green),
  });
  const month = useMonth(todayISO().slice(0, 7));
  const save = useUpdateSettings();
  const bounds = parseAll(draft);
  const rising = bounds !== null && boundsRise(bounds);
  const balance = month.data?.balance_today;
  const problem = bounds ? "Cada faixa precisa ser maior que a anterior." : "Informe valores como 1.250,00.";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!bounds || !rising) return;
    save.mutate(bounds, {
      onSuccess: () => toast.success("Termômetro salvo"),
      onError: () => toast.error("Não foi possível salvar."),
    });
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <section aria-label="Prévia" className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6">
        {balance !== undefined && (
          <p className="text-muted-foreground text-sm">
            Com o saldo de hoje, <strong className="font-bold text-foreground">{formatBRL(balance)}</strong>, o
            termômetro fica assim:
          </p>
        )}
        <ThermometerStrip
          tier={
            balance !== undefined && rising ? tierOf(balance, bounds) : (month.data?.balance_today_tier ?? "yellow")
          }
        />
      </section>
      <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6">
        <p className="text-muted-foreground text-sm">Abaixo do primeiro valor, o saldo fica Crítico.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.map(({ key, label }) => (
            <Field key={key} className="gap-1.5" data-invalid={!rising}>
              <FieldLabel htmlFor={key}>{label}</FieldLabel>
              <Input
                id={key}
                inputMode="decimal"
                autoComplete="off"
                value={draft[key]}
                onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                className="h-12 text-base tabular-nums md:text-base"
                aria-invalid={!rising}
              />
            </Field>
          ))}
        </div>
        {!rising && (
          <p role="alert" className="text-destructive text-sm">
            {problem}
          </p>
        )}
      </div>
      <BrandButton type="submit" disabled={!rising} className="lg:w-auto lg:self-start lg:px-8">
        Salvar
      </BrandButton>
    </form>
  );
};
