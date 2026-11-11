"use client";

import { BackLink } from "@/shared/ui/back-link";
import { BillList } from "@/widgets/bill-list/bill-list";

const ContasPage = () => (
  <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
    <BackLink href="/ajustes" label="Ajustes" />
    <h1 className="font-bold text-[22px] leading-7">Contas fixas</h1>
    <BillList />
  </div>
);

export default ContasPage;
