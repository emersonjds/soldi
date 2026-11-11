"use client";

import { Suspense, useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { causeOf, forecastAlert } from "@/entities/month/forecast-alert";
import { useMonth } from "@/entities/month/month-query";
import { useTransactions } from "@/entities/transaction/transaction-queries";
import { TransactionSheet } from "@/features/add-transaction/transaction-sheet";
import { EditBillSheet } from "@/features/edit-bill/edit-bill-sheet";
import { monthParam } from "@/shared/lib/date";
import { PageError } from "@/shared/ui/page-state";
import { BillsOfMonth } from "@/widgets/bills-of-month/bills-of-month";
import { CofrinhosGlance } from "@/widgets/cofrinhos-glance/cofrinhos-glance";
import { Ledger } from "@/widgets/ledger/ledger";
import {
  HeroSkeleton,
  MonthHero,
  RowsSkeleton,
  StripSkeleton,
  ThermometerCard,
} from "@/widgets/month-overview/month-overview";
import { MonthsAhead } from "@/widgets/months-ahead/months-ahead";
import { RedDayAlert } from "@/widgets/red-day-alert/red-day-alert";
import { SpendingGlance } from "@/widgets/spending-glance/spending-glance";

const MonthScreen = () => {
  const router = useRouter();
  const search = useSearchParams();
  const month = monthParam(search.get("m"));
  const fromTour = search.get("lancar") === "1";
  const view = useMonth(month);
  const transactions = useTransactions(month);
  const [launching, setLaunching] = useState<"income" | "daily" | null>(fromTour ? "income" : null);
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

  const entries = transactions.data;
  const days = view.data?.days ?? [];
  const bills = view.data?.bills_of_month ?? [];
  const alert = forecastAlert(days);
  const causes = new Set(
    (alert && entries
      ? [alert.firstRed.date, alert.lowest.date].map((date) => causeOf(date, days, entries, bills))
      : []
    ).filter((id): id is string => id !== null),
  );
  const monthFailed = view.isError && !view.data;
  const entriesFailed = transactions.isError && !entries;
  const jump = (date: string) => {
    const group = document.getElementById(`dia-${date}`);
    group?.scrollIntoView({ block: "start" });
    group?.focus({ preventScroll: true });
    setHighlight({ date });
  };

  const wide = "md:col-span-2 xl:col-start-1";
  const ledgerPlace = `${wide} xl:row-start-3`;

  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-6">
      <h1 className="sr-only">Mês</h1>
      <p role="status" className="sr-only">
        {((!view.data && !monthFailed) || (!entries && !entriesFailed)) && "Carregando"}
      </p>
      {monthFailed && (
        <section aria-label="Saldo hoje" className={`rounded-3xl bg-card shadow-sm ${wide} xl:row-start-1`}>
          <PageError message="Não foi possível carregar o mês." onRetry={() => view.refetch()} />
        </section>
      )}
      {!monthFailed && !view.data && (
        <>
          <HeroSkeleton className={`${wide} xl:row-start-1`} />
          <RowsSkeleton rows={3} className={`${wide} xl:row-start-2`} />
        </>
      )}
      {view.data && (
        <>
          <MonthHero
            view={view.data}
            onLaunchIncome={() => setLaunching("income")}
            className={`${wide} xl:row-start-1`}
          >
            {alert && <RedDayAlert alert={alert} onJump={jump} />}
          </MonthHero>
          <BillsOfMonth view={view.data} className={`${wide} xl:row-start-2`} />
        </>
      )}
      {entriesFailed && !monthFailed && (
        <section aria-label="Lançamentos" className={`rounded-2xl bg-card shadow-sm ${ledgerPlace}`}>
          <PageError message="Não foi possível carregar os lançamentos." onRetry={() => transactions.refetch()} />
        </section>
      )}
      {!entriesFailed && !monthFailed && (!view.data || !entries) && <RowsSkeleton rows={5} className={ledgerPlace} />}
      {view.data && entries && (
        <Ledger
          view={view.data}
          transactions={entries}
          onLaunch={() => setLaunching("daily")}
          highlight={highlight?.date ?? null}
          causes={causes}
          className={ledgerPlace}
        />
      )}
      {view.data && <ThermometerCard view={view.data} className="xl:col-start-3 xl:row-start-1" />}
      {!monthFailed && !view.data && <StripSkeleton className="xl:col-start-3 xl:row-start-1" />}
      <MonthsAhead
        viewing={month}
        onOpen={(next) => {
          router.replace(`/mes?m=${next}`, { scroll: false });
          window.scrollTo({ top: 0 });
        }}
        className="xl:col-start-3 xl:row-start-2"
      />
      <div className="contents xl:col-start-3 xl:row-start-3 xl:flex xl:flex-col xl:gap-6">
        <SpendingGlance month={month} />
        <CofrinhosGlance />
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
  <Suspense fallback={<HeroSkeleton />}>
    <MonthScreen />
  </Suspense>
);

export default MesPage;
