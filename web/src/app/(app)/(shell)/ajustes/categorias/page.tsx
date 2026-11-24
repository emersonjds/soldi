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
import { replaceUrl } from "@/shared/lib/url";
import { PageLoading } from "@/shared/ui/page-state";
import { CategoryList, kindParam } from "@/widgets/category-list/category-list";

const CategoriasScreen = () => {
  const search = useSearchParams();
  return (
    <CategoryList
      kind={kindParam(search.get("k"))}
      onKindChange={(next) => {
        const params = new URLSearchParams(search.toString());
        params.set("k", next);
        replaceUrl(`/ajustes/categorias?${params}`);
      }}
    />
  );
};

const CategoriasPage = () => (
  <div className="mx-auto flex w-full max-w-4xl flex-col gap-2">
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/ajustes" className="inline-flex min-h-11 items-center">
              Ajustes
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage className="text-primary font-medium">Categorias</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
    <Suspense fallback={<PageLoading />}>
      <CategoriasScreen />
    </Suspense>
  </div>
);

export default CategoriasPage;
