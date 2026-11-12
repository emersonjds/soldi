"use client";

import { Suspense } from "react";

import { useSearchParams } from "next/navigation";

import { monthParam } from "@/shared/lib/date";
import { ShellMonthSwitcher } from "@/widgets/app-shell/app-shell";
import { CategoryBreakdown } from "@/widgets/category-breakdown/category-breakdown";
import { PageHero } from "@/widgets/month-header/month-header";

const ParaOndeVaiScreen = () => {
  const search = useSearchParams();
  const month = monthParam(search.get("m"));

  return (
    <div className="flex flex-col gap-6">
      <PageHero eyebrow="FLUXO DE DESPESAS • CONSOLIDADO" title="Para onde vai" className="lg:hidden">
        <ShellMonthSwitcher pathname="/para-onde-vai" tone="hero" />
      </PageHero>
      <CategoryBreakdown key={month} month={month} group={search.get("g") ?? undefined} />
    </div>
  );
};

const ParaOndeVaiPage = () => (
  <Suspense fallback={null}>
    <ParaOndeVaiScreen />
  </Suspense>
);

export default ParaOndeVaiPage;
