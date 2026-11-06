"use client";

import { DeleteEntriesForm } from "@/features/delete-entries/delete-entries-form";
import { BackLink } from "@/shared/ui/back-link";

const ApagarPage = () => (
  <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
    <BackLink href="/ajustes" label="Ajustes" />
    <h1 className="font-bold text-[22px] leading-7">Apagar lançamentos</h1>
    <DeleteEntriesForm />
  </div>
);

export default ApagarPage;
