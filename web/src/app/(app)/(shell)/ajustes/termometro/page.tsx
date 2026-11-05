"use client";

import { useSettings } from "@/entities/settings/settings-query";
import { ThermometerForm } from "@/features/edit-settings/thermometer-form";
import { BackLink } from "@/shared/ui/back-link";
import { PageError, PageLoading } from "@/shared/ui/page-state";

const TermometroPage = () => {
  const settings = useSettings();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <BackLink href="/ajustes" label="Ajustes" />
      <h1 className="font-bold text-[22px] leading-7">Termômetro</h1>
      {settings.isError && (
        <PageError message="Não foi possível carregar os ajustes." onRetry={() => settings.refetch()} />
      )}
      {settings.data ? <ThermometerForm settings={settings.data} /> : !settings.isError && <PageLoading />}
    </div>
  );
};

export default TermometroPage;
