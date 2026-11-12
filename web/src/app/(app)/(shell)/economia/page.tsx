"use client";

import { Suspense } from "react";

import { useSearchParams } from "next/navigation";

import { monthParam } from "@/shared/lib/date";
import { CofrinhosView } from "@/widgets/cofrinhos/cofrinhos";
import { SavingsYear } from "@/widgets/savings-year/savings-year";

const EconomiaScreen = () => (
  <div className="flex flex-col gap-6">
    <CofrinhosView month={monthParam(useSearchParams().get("m"))} />
    <SavingsYear />
  </div>
);

const EconomiaPage = () => (
  <Suspense fallback={null}>
    <EconomiaScreen />
  </Suspense>
);

export default EconomiaPage;
