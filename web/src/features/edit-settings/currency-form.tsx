"use client";

import { useState } from "react";

import { toast } from "sonner";

import { useUpdateSettings } from "@/entities/settings/settings-query";
import type { Schemas } from "@/shared/api/client";
import type { Currency } from "@/shared/lib/currency";

const CURRENCIES: { code: Currency; name: string; caption: string }[] = [
  { code: "BRL", name: "Real (BRL - R$)", caption: "Padrão Brasil" },
  { code: "USD", name: "Dólar (USD - $)", caption: "United States" },
  { code: "EUR", name: "Euro (EUR - €)", caption: "Zona do Euro" },
  { code: "GBP", name: "Libra (GBP - £)", caption: "Reino Unido" },
];

/** Radio cards for the app's currency; picking one saves it. */
export const CurrencyForm = ({ settings }: { settings: Schemas["Settings"] }) => {
  const [currency, setCurrency] = useState(settings.currency);
  const save = useUpdateSettings();

  const pick = (next: Currency) => {
    const previous = currency;
    setCurrency(next);
    save.mutate(
      { currency: next },
      {
        onSuccess: () => toast.success("Moeda salva"),
        onError: () => {
          setCurrency(previous);
          toast.error("Não foi possível salvar.");
        },
      },
    );
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-3 font-semibold text-sm">Moeda Base do App</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CURRENCIES.map(({ code, name, caption }) => (
          <label
            key={code}
            className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted has-checked:bg-accent has-focus-visible:ring-3 has-focus-visible:ring-ring/50 motion-reduce:transition-none"
          >
            <input
              type="radio"
              name="currency"
              value={code}
              aria-label={name}
              checked={currency === code}
              disabled={save.isPending}
              onChange={() => pick(code)}
              className="size-5 shrink-0 accent-brand"
            />
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold text-sm">{name}</span>
              <span className="text-muted-foreground text-xs">{caption}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
};
