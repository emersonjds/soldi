"use client";

import { useState } from "react";

import type { Currency } from "@/shared/lib/currency";
import { BrandButton } from "@/shared/ui/brand-button";
import { CurrencyPicker } from "@/shared/ui/currency-picker";

export const CurrencyStep = ({
  defaultValue,
  onNext,
}: {
  defaultValue: Currency;
  onNext: (currency: Currency) => void;
}) => {
  const [currency, setCurrency] = useState(defaultValue);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-bold text-[22px] leading-7">Qual moeda você usa?</h1>
      <CurrencyPicker value={currency} onChange={setCurrency} />
      <BrandButton onClick={() => onNext(currency)}>Continuar</BrandButton>
    </div>
  );
};
