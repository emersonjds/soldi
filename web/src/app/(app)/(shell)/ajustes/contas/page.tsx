"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { monthParam } from "@/shared/lib/date";
import { BillList } from "@/widgets/bill-list/bill-list";

const ContasPage = () => (
  <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 xl:max-w-7xl">
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/ajustes" className="inline-flex min-h-11 items-center">
              Configurações
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage className="font-medium text-primary">Contas Fixas</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
    <BillList month={monthParam(useSearchParams().get("m"))} />
  </div>
);

export default ContasPage;
