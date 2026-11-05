import Link from "next/link";

import { SignUpForm } from "@/features/sign-up/sign-up-form";

const CriarContaPage = () => (
  <div className="flex flex-col gap-6">
    <h1 className="font-bold text-[22px] leading-7">Criar conta</h1>
    <SignUpForm />
    <p className="text-center text-muted-foreground">
      Já tem conta?{" "}
      <Link href="/entrar" className="inline-flex min-h-11 items-center font-semibold text-primary">
        Entrar
      </Link>
    </p>
  </div>
);

export default CriarContaPage;
