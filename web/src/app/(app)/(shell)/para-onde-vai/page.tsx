"use client";

import { Suspense } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { useSettings } from "@/entities/settings/settings-query";
import { monthParam } from "@/shared/lib/date";
import { BreakdownSkeleton, CategoryBreakdown } from "@/widgets/category-breakdown/category-breakdown";
import { MonthHeader } from "@/widgets/month-header/month-header";

const ParaOndeVaiScreen = () => {
  const router = useRouter();
  const month = monthParam(useSearchParams().get("m"));
  const settings = useSettings();

  return (
    <div className="flex flex-col gap-6">
      <MonthHeader
        title="Para onde vai"
        month={month}
        minMonth={settings.data?.opening_date.slice(0, 7)}
        onMonthChange={(next) => router.replace(`/para-onde-vai?m=${next}`, { scroll: false })}
      />
      <CategoryBreakdown key={month} month={month} />
    </div>
  );
};

const ParaOndeVaiPage = () => (
  <Suspense fallback={<BreakdownSkeleton />}>
    <ParaOndeVaiScreen />
  </Suspense>
);

export default ParaOndeVaiPage;
