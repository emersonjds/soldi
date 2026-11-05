"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";

import { settingsQuery } from "@/entities/settings/settings-query";
import { tierOf } from "@/entities/settings/tier";
import { todayISO } from "@/shared/lib/date";
import { PageError, PageLoading } from "@/shared/ui/page-state";
import { MonthHeader } from "@/widgets/month-header/month-header";

const MesPage = () => {
  const settings = useQuery(settingsQuery);
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));

  if (settings.isError)
    return <PageError message="Não foi possível carregar o seu mês." onRetry={() => settings.refetch()} />;
  if (!settings.data) return <PageLoading />;

  const balance = settings.data.opening_balance;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Mês</h1>
      <MonthHeader month={month} balance={balance} tier={tierOf(balance, settings.data)} onMonthChange={setMonth} />
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-card px-6 py-10 text-center shadow-sm">
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
          <ReceiptText className="size-6" aria-hidden />
        </span>
        <p className="max-w-sm text-muted-foreground">Nenhum lançamento ainda. Toque em Lançar.</p>
      </div>
    </div>
  );
};

export default MesPage;
