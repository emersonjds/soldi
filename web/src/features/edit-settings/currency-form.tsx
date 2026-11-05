"use client";

import { type FormEvent, useState } from "react";

import { toast } from "sonner";

import { Spinner } from "@/components/ui/spinner";
import { useUpdateSettings } from "@/entities/settings/settings-query";
import type { Schemas } from "@/shared/api/client";
import { BrandButton } from "@/shared/ui/brand-button";
import { CurrencyPicker } from "@/shared/ui/currency-picker";

export const CurrencyForm = ({ settings }: { settings: Schemas["Settings"] }) => {
  const [currency, setCurrency] = useState(settings.currency);
  const save = useUpdateSettings();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(
      { currency },
      {
        onSuccess: () => toast.success("Moeda salva"),
        onError: () => toast.error("Não foi possível salvar."),
      },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <CurrencyPicker value={currency} onChange={setCurrency} />
      <BrandButton type="submit" disabled={save.isPending} className="lg:w-auto lg:self-start lg:px-8">
        {save.isPending && <Spinner aria-hidden />}
        Salvar
      </BrandButton>
    </form>
  );
};
