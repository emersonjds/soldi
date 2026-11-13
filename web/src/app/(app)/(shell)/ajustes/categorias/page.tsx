"use client";

import { Suspense } from "react";

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
import { replaceUrl } from "@/shared/lib/url";
import { PageLoading } from "@/shared/ui/page-state";
import { CategoryList, kindParam } from "@/widgets/category-list/category-list";

const CategoriasScreen = () => {
  const search = useSearchParams();
  return (
    <CategoryList
      kind={kindParam(search.get("k"))}
      month={monthParam(search.get("m"))}
      onKindChange={(next) => {
        const params = new URLSearchParams(search.toString());
        params.set("k", next);
        replaceUrl(`/ajustes/categorias?${params}`);
      }}
    />
  );
};

const CategoriasPage = () => (
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
          <BreadcrumbPage className="font-medium text-primary">Gestão de Categorias</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
    <Suspense fallback={<PageLoading />}>
      <CategoriasScreen />
    </Suspense>
  </div>
);

export default CategoriasPage;
