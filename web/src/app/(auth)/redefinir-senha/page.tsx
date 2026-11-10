"use client";

import { ConfirmForm } from "@/features/password-reset/confirm-form";

const RedefinirSenhaPage = () => (
  <div className="flex flex-col gap-6">
    <h1 className="font-bold text-[22px] leading-7">Nova senha</h1>
    <ConfirmForm />
  </div>
);

export default RedefinirSenhaPage;
