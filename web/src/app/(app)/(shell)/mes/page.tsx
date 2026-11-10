"use client";

import { Suspense, useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";

import { causeOf, forecastAlert } from "@/entities/month/forecast-alert";
import { useMonth } from "@/entities/month/month-query";
import { settingsQuery } from "@/entities/settings/settings-query";
import { useTransactions } from "@/entities/transaction/transaction-queries";
import { TransactionSheet } from "@/features/add-transaction/transaction-sheet";
import { EditBillSheet } from "@/features/edit-bill/edit-bill-sheet";
import { monthParam } from "@/shared/lib/date";
import { PageError } from "@/shared/ui/page-state";
import { BillsOfMonth } from "@/widgets/bills-of-month/bills-of-month";
import { Ledger } from "@/widgets/ledger/ledger";
import { MonthHeader } from "@/widgets/month-header/month-header";
import { MonthSkeleton, MonthSummary, ThermometerCard } from "@/widgets/month-overview/month-overview";
import { RedDayAlert } from "@/widgets/red-day-alert/red-day-alert";

const MonthScreen = () => {
  const router = useRouter();
  const search = useSearchParams();
  const month = monthParam(search.get("m"));
  const fromTour = search.get("lancar") === "1";
  const view = useMonth(month);
  const transactions = useTransactions(month);
  const settings = useQuery(settingsQuery);
  const [launching, setLaunching] = useState<"income" | "bill" | "daily" | null>(fromTour ? "income" : null);
  const [hint, setHint] = useState(fromTour);
  const [highlight, setHighlight] = useState<{ date: string } | null>(null);

  useEffect(() => {
    if (fromTour) window.history.replaceState(null, "", "/mes");
  }, [fromTour]);

  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(null), 2000);
    return () => clearTimeout(timer);
  }, [highlight]);

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

  const entries = transactions.data;
  const bills = view.data.bills_of_month;
  const days = view.data.days;
  const alert = forecastAlert(days);
  const causes = new Set(
    (alert ? [alert.firstRed.date, alert.lowest.date] : [])
      .map((date) => causeOf(date, days, entries, bills))
      .filter((id): id is string => id !== null),
  );
  const jump = (date: string) => {
    const group = document.getElementById(`dia-${date}`);
    group?.scrollIntoView({ block: "start" });
    group?.focus({ preventScroll: true });
    setHighlight({ date });
  };

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
        >
          {alert && <RedDayAlert alert={alert} onJump={jump} />}
        </MonthHeader>
        <MonthSummary view={view.data} onLaunch={setLaunching} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        <BillsOfMonth view={view.data} className="lg:col-span-2 lg:col-start-1 lg:row-start-1" />
        <ThermometerCard view={view.data} className="lg:sticky lg:top-6 lg:col-start-3 lg:row-span-2 lg:row-start-1" />
        <Ledger
          view={view.data}
          transactions={entries}
          onLaunch={() => setLaunching("daily")}
          highlight={highlight?.date ?? null}
          causes={causes}
          className="lg:col-span-2 lg:col-start-1 lg:row-start-2"
        />
      </div>
      <TransactionSheet
        open={launching !== null}
        onOpenChange={(open) => {
          if (open) return;
          setLaunching(null);
          setHint(false);
        }}
        initialKind={launching ?? "daily"}
        hint={hint ? "Comece pela sua primeira entrada do mês" : undefined}
        billSheet={(props) => <EditBillSheet open {...props} />}
      />
    </div>
  );
};

const MesPage = () => (
  <Suspense fallback={<MonthSkeleton />}>
    <MonthScreen />
  </Suspense>
);

export default MesPage;
