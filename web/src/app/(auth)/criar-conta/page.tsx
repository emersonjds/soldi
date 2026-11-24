import Link from "next/link";

import { SignUpForm } from "@/features/sign-up/sign-up-form";

const CriarContaPage = () => (
  <div className="flex flex-col gap-6">
    <h1 className="text-[22px] leading-7 font-bold">Criar conta</h1>
    <SignUpForm />
    <p className="text-muted-foreground text-center">
      Já tem conta?{" "}
      <Link href="/entrar" className="text-primary inline-flex min-h-11 items-center font-semibold">
        Entrar
      </Link>
    </p>
  </div>
);

export default CriarContaPage;
