"use client";

import { Suspense } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { BackLink } from "@/shared/ui/back-link";
import { PageLoading } from "@/shared/ui/page-state";
import { CategoryList, kindParam } from "@/widgets/category-list/category-list";

const CategoriasScreen = () => {
  const router = useRouter();
  const kind = kindParam(useSearchParams().get("k"));
  return (
    <CategoryList
      kind={kind}
      onKindChange={(next) => router.replace(`/ajustes/categorias?k=${next}`, { scroll: false })}
    />
  );
};

const CategoriasPage = () => (
  <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
    <BackLink href="/ajustes" label="Ajustes" />
    <Suspense fallback={<PageLoading />}>
      <CategoriasScreen />
    </Suspense>
  </div>
);

export default CategoriasPage;
