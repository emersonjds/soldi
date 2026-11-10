"use client";

import { Suspense } from "react";

import { useSearchParams } from "next/navigation";

import { ConfirmForm } from "@/features/password-reset/confirm-form";

const ResetScreen = () => <ConfirmForm token={useSearchParams().get("token") ?? ""} />;

const RedefinirSenhaPage = () => (
  <div className="flex flex-col gap-6">
    <h1 className="font-bold text-[22px] leading-7">Nova senha</h1>
    <Suspense>
      <ResetScreen />
    </Suspense>
  </div>
);

export default RedefinirSenhaPage;
