"use client";

import { Suspense, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";

import { useMonth } from "@/entities/month/month-query";
import { settingsQuery } from "@/entities/settings/settings-query";
import { useTransactions } from "@/entities/transaction/transaction-queries";
import { TransactionSheet } from "@/features/add-transaction/transaction-sheet";
import { todayISO } from "@/shared/lib/date";
import { PageError } from "@/shared/ui/page-state";
import { BillsOfMonth } from "@/widgets/bills-of-month/bills-of-month";
import { Ledger } from "@/widgets/ledger/ledger";
import { MonthHeader } from "@/widgets/month-header/month-header";
import { MonthSkeleton, MonthSummary, ThermometerCard } from "@/widgets/month-overview/month-overview";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const MonthScreen = () => {
  const router = useRouter();
  const asked = useSearchParams().get("m");
  const month = asked && MONTH.test(asked) ? asked : todayISO().slice(0, 7);
  const view = useMonth(month);
  const transactions = useTransactions(month);
  const settings = useQuery(settingsQuery);
  const [launching, setLaunching] = useState(false);

  if (view.isError || transactions.isError)
    return (
      <div className="rounded-2xl bg-card shadow-sm">
        <PageError
          message="Não foi possível carregar o mês."
          onRetry={() => {
            view.refetch();
            transactions.refetch();
          }}
        />
      </div>
    );
  if (!view.data || !transactions.data) return <MonthSkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Mês</h1>
      <div className="flex flex-col">
        <MonthHeader
          month={month}
          minMonth={settings.data?.opening_date.slice(0, 7)}
          balance={view.data.balance_today}
          tier={view.data.balance_today_tier}
          onMonthChange={(next) => router.replace(`/mes?m=${next}`, { scroll: false })}
        />
        <MonthSummary view={view.data} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        <BillsOfMonth view={view.data} className="lg:col-span-2 lg:col-start-1 lg:row-start-1" />
        <ThermometerCard view={view.data} className="lg:sticky lg:top-6 lg:col-start-3 lg:row-span-2 lg:row-start-1" />
        <Ledger
          view={view.data}
          transactions={transactions.data}
          onLaunch={() => setLaunching(true)}
          className="lg:col-span-2 lg:col-start-1 lg:row-start-2"
        />
      </div>
      <TransactionSheet open={launching} onOpenChange={setLaunching} />
    </div>
  );
};

const MesPage = () => (
  <Suspense fallback={<MonthSkeleton />}>
    <MonthScreen />
  </Suspense>
);

export default MesPage;
