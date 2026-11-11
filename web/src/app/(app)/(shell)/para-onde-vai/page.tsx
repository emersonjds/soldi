"use client";

import { Suspense } from "react";

import { useSearchParams } from "next/navigation";

import { monthParam } from "@/shared/lib/date";
import { BreakdownSkeleton, CategoryBreakdown } from "@/widgets/category-breakdown/category-breakdown";
import { PageHero } from "@/widgets/month-header/month-header";

const ParaOndeVaiScreen = () => {
  const month = monthParam(useSearchParams().get("m"));

  return (
    <div className="flex flex-col gap-6">
      <PageHero title="Para onde vai" />
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
