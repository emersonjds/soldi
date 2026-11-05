"use client";

import { useSettings } from "@/entities/settings/settings-query";
import { OpeningForm } from "@/features/edit-settings/opening-form";
import { BackLink } from "@/shared/ui/back-link";
import { PageError, PageLoading } from "@/shared/ui/page-state";

const SaldoInicialPage = () => {
  const settings = useSettings();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <BackLink href="/ajustes" label="Ajustes" />
      <h1 className="font-bold text-[22px] leading-7">Saldo inicial</h1>
      {settings.isError && (
        <PageError message="Não foi possível carregar os ajustes." onRetry={() => settings.refetch()} />
      )}
      {settings.data ? <OpeningForm settings={settings.data} /> : !settings.isError && <PageLoading />}
    </div>
  );
};

export default SaldoInicialPage;
