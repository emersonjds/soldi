"use client";

import { useQuery } from "@tanstack/react-query";

import { settingsQuery } from "@/entities/settings/settings-query";
import { formatBRL } from "@/shared/lib/money";
import { PageError, PageLoading } from "@/shared/ui/page-state";

const MesPage = () => {
  const settings = useQuery(settingsQuery);

  if (settings.isError)
    return <PageError message="Não foi possível carregar o seu mês." onRetry={() => settings.refetch()} />;
  if (!settings.data) return <PageLoading />;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <p>Saldo hoje</p>
        <p className="font-bold text-4xl tabular-nums">{formatBRL(settings.data.opening_balance)}</p>
      </section>
      <p className="text-center text-muted-foreground">Nenhum lançamento ainda. Toque em Lançar.</p>
    </div>
  );
};

export default MesPage;
