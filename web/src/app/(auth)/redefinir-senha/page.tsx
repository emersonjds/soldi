"use client";

import { ConfirmForm } from "@/features/password-reset/confirm-form";

const RedefinirSenhaPage = () => (
  <div className="flex flex-col gap-6">
    <h1 className="text-[22px] leading-7 font-bold">Nova senha</h1>
    <ConfirmForm />
  </div>
);

export default RedefinirSenhaPage;
