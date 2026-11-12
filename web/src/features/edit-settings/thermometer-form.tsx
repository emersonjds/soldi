"use client";

import { type FormEvent, useState } from "react";

import { Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { useMonth } from "@/entities/month/month-query";
import { useUpdateSettings } from "@/entities/settings/settings-query";
import { cn } from "@/lib/utils";
import type { Schemas } from "@/shared/api/client";
import { useCurrency } from "@/shared/lib/currency";
import { todayISO } from "@/shared/lib/date";
import { currencySymbol, formatMoney, formatWhole, parseBRL } from "@/shared/lib/money";
import {
  boundsRise,
  cents,
  TIER_LABEL,
  TIER_ORDER,
  TIER_STYLE,
  type Tier,
  type TierBounds,
  tierOf,
} from "@/shared/lib/tier";
import { AmountInput } from "@/shared/ui/amount-input";
import { BrandButton } from "@/shared/ui/brand-button";
import { PageError } from "@/shared/ui/page-state";
import { ThermometerStrip } from "@/shared/ui/thermometer-strip";

const FIELDS: { key: keyof TierBounds; label: string; caption: string; tiers: [Tier, Tier] }[] = [
  { key: "tier_red", label: "Crítico / Atenção", caption: "Abaixo disso fica Crítico", tiers: ["red", "light_red"] },
  {
    key: "tier_zero",
    label: "Atenção / Apertado",
    caption: "Linha zero de equilíbrio",
    tiers: ["light_red", "yellow"],
  },
  {
    key: "tier_yellow",
    label: "Apertado / Confortável",
    caption: "Colchão de segurança mín.",
    tiers: ["yellow", "light_green"],
  },
  {
    key: "tier_green",
    label: "Confortável / Folga",
    caption: "Meta de poupança livre",
    tiers: ["light_green", "green"],
  },
];

/** The D9 sheet defaults, as the server seeds them. */
const DEFAULTS: TierBounds = { tier_red: "-500.00", tier_zero: "0.00", tier_yellow: "1000.00", tier_green: "2000.00" };

const MARKER_PLACE = [
  "left-0",
  "left-[30%] -translate-x-1/2",
  "left-1/2 -translate-x-1/2",
  "left-[70%] -translate-x-1/2",
  "right-0",
];

const parseAll = (draft: TierBounds): TierBounds | null => {
  const parsed = FIELDS.map(({ key }) => [key, parseBRL(draft[key])] as const);
  if (parsed.some(([, value]) => value === null)) return null;
  return Object.fromEntries(parsed) as TierBounds;
};

/** The first field that does not parse or does not rise above the one before it; -1 when all rise. */
const firstWrong = (draft: TierBounds) => {
  const values = FIELDS.map(({ key }) => parseBRL(draft[key]));
  return values.findIndex((value, index) => {
    const before = values[index - 1];
    return value === null || (index > 0 && before !== null && cents(value) <= cents(before));
  });
};

/** `-500.00` → `-R$ 500`: whole units after the symbol. */
const whole = (amount: string, symbol: string) =>
  amount.startsWith("-") ? `-${symbol} ${formatWhole(amount.slice(1))}` : `${symbol} ${formatWhole(amount)}`;

const ranges = ({ tier_red, tier_zero, tier_yellow, tier_green }: TierBounds, symbol: string) => {
  const money = (amount: string) => whole(amount, symbol);
  return [
    `< ${money(tier_red)}`,
    `${money(tier_red)} a ${money(tier_zero)}`,
    `${money(tier_zero)} a ${money(tier_yellow)}`,
    `${money(tier_yellow)} a ${money(tier_green)}`,
    `> ${money(tier_green)}`,
  ];
};

/** The four bounds of the thermometer, with today's balance placed on the scale live as they change. */
export const ThermometerForm = ({ settings }: { settings: Schemas["Settings"] }) => {
  const [draft, setDraft] = useState<TierBounds>({
    tier_red: settings.tier_red,
    tier_zero: settings.tier_zero,
    tier_yellow: settings.tier_yellow,
    tier_green: settings.tier_green,
  });
  const month = useMonth(todayISO().slice(0, 7));
  const save = useUpdateSettings();
  const bounds = parseAll(draft);
  const rising = bounds !== null && boundsRise(bounds);
  const shown = rising ? bounds : settings;
  const balance = month.data?.balance_today;
  const currency = useCurrency();
  const symbol = currencySymbol(currency);
  const tier = balance === undefined ? undefined : tierOf(balance, shown);
  const wrong = firstWrong(draft);
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {FIELDS.map(({ key, label, caption, tiers }, index) => (
          <Field key={key} className="gap-2 rounded-2xl bg-muted p-3" data-invalid={index === wrong}>
            <FieldLabel htmlFor={key} className="gap-1.5 font-semibold text-xs">
              <span className="flex shrink-0 gap-0.5" aria-hidden>
                {tiers.map((dot) => (
                  <span key={dot} className={cn("size-2 rounded-full", TIER_STYLE[dot].dot)} />
                ))}
              </span>
              {label}
            </FieldLabel>
            <div className="flex items-center gap-2 rounded-xl bg-card pl-3">
              <span aria-hidden className="font-semibold text-muted-foreground">
                {symbol}
              </span>
              <AmountInput
                id={key}
                negative
                value={draft[key]}
                onValueChange={(value) => setDraft((current) => ({ ...current, [key]: value }))}
                className="h-12 border-0 pl-0 font-bold text-base tabular-nums shadow-none md:text-base"
                aria-invalid={index === wrong}
              />
            </div>
            <FieldDescription className="text-xs">{caption}</FieldDescription>
          </Field>
        ))}
      </div>
      {!rising && (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      )}
      <section aria-label="Simulação" className="flex flex-col gap-4 rounded-2xl bg-muted p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold text-[11px] text-muted-foreground tracking-[0.12em]">
            SIMULAÇÃO DE ESCALA TÉRMICA
          </h3>
          {tier && (
            <p className="text-muted-foreground text-xs">
              Faixa Ativa Atual: <strong className={cn("font-bold", TIER_STYLE[tier].label)}>{TIER_LABEL[tier]}</strong>
            </p>
          )}
        </div>
        {month.isError ? (
          <PageError message="Não foi possível carregar o saldo de hoje." onRetry={() => month.refetch()} />
        ) : (
          // The strip holds its place while today's balance loads, so a #section below does not move.
          <div className={cn("relative pt-8", !tier && "invisible")}>
            {balance !== undefined && tier && (
              <span
                className={cn(
                  "absolute top-0 whitespace-nowrap rounded-md bg-foreground px-1.5 py-0.5 font-bold text-[11px] text-background tabular-nums",
                  MARKER_PLACE[TIER_ORDER.indexOf(tier)],
                )}
              >
                {formatMoney(balance, currency)}
              </span>
            )}
            <ThermometerStrip tier={tier ?? "yellow"} />
          </div>
        )}
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {ranges(shown, symbol).map((range, index) => {
            const segment = TIER_ORDER[index];
            const active = segment === tier;
            return (
              <li
                key={segment}
                aria-current={active || undefined}
                className={cn(
                  "flex min-w-0 flex-col gap-0.5 rounded-xl border-2 bg-card p-2",
                  active ? "border-brand" : "border-transparent",
                )}
              >
                <span className={cn("flex items-center gap-1.5 font-semibold text-xs", TIER_STYLE[segment].label)}>
                  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", TIER_STYLE[segment].dot)} />
                  {TIER_LABEL[segment]}
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{range}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" className="h-12 text-base" onClick={() => setDraft(DEFAULTS)}>
          Restaurar Padrões
        </Button>
        <BrandButton type="submit" disabled={!rising} className="sm:w-auto sm:px-6">
          <Check aria-hidden />
          Salvar Novos Limites
        </BrandButton>
      </div>
    </form>
  );
};
