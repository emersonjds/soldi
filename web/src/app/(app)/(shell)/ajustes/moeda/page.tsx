"use client";

import { useSettings } from "@/entities/settings/settings-query";
import { CurrencyForm } from "@/features/edit-settings/currency-form";
import { BackLink } from "@/shared/ui/back-link";
import { PageError, PageLoading } from "@/shared/ui/page-state";

const MoedaPage = () => {
  const settings = useSettings();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <BackLink href="/ajustes" label="Ajustes" />
      <h1 className="font-bold text-[22px] leading-7">Moeda</h1>
      {settings.isError && (
        <PageError message="Não foi possível carregar os ajustes." onRetry={() => settings.refetch()} />
      )}
      {settings.data ? <CurrencyForm settings={settings.data} /> : !settings.isError && <PageLoading />}
    </div>
  );
};

export default MoedaPage;
