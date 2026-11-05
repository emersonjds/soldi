"use client";

import { Suspense } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { useSettings } from "@/entities/settings/settings-query";
import { todayISO } from "@/shared/lib/date";
import { YearHeader } from "@/widgets/month-header/month-header";
import { SavingsSkeleton, SavingsYearView } from "@/widgets/savings-year/savings-year";

const yearParam = (asked: string | null) => Number(asked && /^\d{4}$/.test(asked) ? asked : todayISO().slice(0, 4));

const EconomiaScreen = () => {
  const router = useRouter();
  const year = yearParam(useSearchParams().get("y"));
  const settings = useSettings();

  return (
    <div className="flex flex-col gap-6">
      <YearHeader
        title="Economia"
        year={year}
        minYear={settings.data && Number(settings.data.opening_date.slice(0, 4))}
        onYearChange={(next) => router.replace(`/economia?y=${next}`, { scroll: false })}
      />
      <SavingsYearView key={year} year={year} />
    </div>
  );
};

const EconomiaPage = () => (
  <Suspense fallback={<SavingsSkeleton />}>
    <EconomiaScreen />
  </Suspense>
);

export default EconomiaPage;
