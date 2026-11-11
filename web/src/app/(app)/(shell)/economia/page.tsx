"use client";

import { CofrinhosView } from "@/widgets/cofrinhos/cofrinhos";
import { SavingsYear } from "@/widgets/savings-year/savings-year";

const EconomiaPage = () => (
  <div className="flex flex-col gap-6">
    <CofrinhosView />
    <SavingsYear />
  </div>
);

export default EconomiaPage;
