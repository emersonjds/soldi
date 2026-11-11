"use client";

import { Suspense, useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { flushSync } from "react-dom";

import { causeOf, forecastAlert } from "@/entities/month/forecast-alert";
import { useMonth } from "@/entities/month/month-query";
import { useTransactions } from "@/entities/transaction/transaction-queries";
import { TransactionSheet } from "@/features/add-transaction/transaction-sheet";
import { EditBillSheet } from "@/features/edit-bill/edit-bill-sheet";
import { monthParam } from "@/shared/lib/date";
import { PageError } from "@/shared/ui/page-state";
import { BillsOfMonth } from "@/widgets/bills-of-month/bills-of-month";
import { CofrinhosGlance } from "@/widgets/cofrinhos-glance/cofrinhos-glance";
import { Ledger, type LedgerFilter } from "@/widgets/ledger/ledger";
import { HeroSkeleton, MonthHero, ThermometerCard } from "@/widgets/month-overview/month-overview";
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
  const [launching, setLaunching] = useState<"income" | "bill" | "daily" | null>(fromTour ? "income" : null);
  const [hint, setHint] = useState(fromTour);
  const [simulating, setSimulating] = useState(false);
  const [highlight, setHighlight] = useState<{ date: string } | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const [filterMonth, setFilterMonth] = useState(month);
  if (filterMonth !== month) {
    setFilterMonth(month);
    setFilter("all");
  }
  const launch = (kind: "income" | "bill" | "daily", simulate = false) => {
    setSimulating(simulate);
    setLaunching(kind);
  };

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
    flushSync(() => {
      setExpandedMonth(month);
      setFilter("all");
    });
    const group = document.getElementById(`dia-${date}`);
    group?.scrollIntoView({ block: "start" });
    group?.focus({ preventScroll: true });
    setHighlight({ date });
  };

  return (
    <div className="flex flex-col gap-4 xl:gap-6">
      <h1 className="sr-only">Mês</h1>
      <p role="status" className="sr-only">
        {((!view.data && !monthFailed) || (!entries && !entriesFailed)) && "Carregando"}
      </p>
      <div className="flex flex-col gap-4 lg:grid lg:gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-6">
          {monthFailed && (
            <section aria-label="Saldo hoje" className="rounded-3xl bg-card shadow-sm">
              <PageError message="Não foi possível carregar o mês." onRetry={() => view.refetch()} />
            </section>
          )}
          {!monthFailed && !view.data && <HeroSkeleton />}
          {view.data && (
            <>
              <MonthHero view={view.data} onLaunch={launch}>
                {alert && <RedDayAlert alert={alert} onJump={jump} />}
              </MonthHero>
              <BillsOfMonth view={view.data} className="max-lg:order-1" />
            </>
          )}
          {entriesFailed && !monthFailed && (
            <section aria-label="Lançamentos" className="rounded-2xl bg-card shadow-sm max-lg:order-3">
              <PageError message="Não foi possível carregar os lançamentos." onRetry={() => transactions.refetch()} />
            </section>
          )}
          {view.data && entries && (
            <Ledger
              view={view.data}
              transactions={entries}
              highlight={highlight?.date ?? null}
              causes={causes}
              expanded={expandedMonth === month}
              onExpandedChange={(expanded) => setExpandedMonth(expanded ? month : null)}
              filter={filter}
              onFilterChange={setFilter}
              className="max-lg:order-3"
            />
          )}
        </div>
        <div className="contents lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 xl:flex xl:flex-col lg:[&>:last-child:nth-child(odd)]:col-span-2">
          {view.data && <ThermometerCard view={view.data} className="max-lg:order-2" />}
          <MonthsAhead
            viewing={month}
            onSimulate={() => launch("daily", true)}
            onOpen={(next) => {
              router.replace(`/mes?m=${next}`, { scroll: false });
              window.scrollTo({ top: 0 });
            }}
            className="max-lg:order-4"
          />
          <CofrinhosGlance className="max-lg:order-4" />
          <SpendingGlance month={month} className="max-lg:order-4" />
        </div>
      </div>
      <TransactionSheet
        open={launching !== null}
        onOpenChange={(open) => {
          if (open) return;
          setLaunching(null);
          setHint(false);
        }}
        initialKind={launching ?? "daily"}
        initialSimulate={simulating}
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
