import Link from "next/link";

import { SignInForm } from "@/features/sign-in/sign-in-form";

const EntrarPage = () => (
  <div className="flex flex-col gap-6">
    <h1 className="text-[22px] leading-7 font-bold">Entrar</h1>
    <SignInForm />
    <p className="text-muted-foreground text-center">
      Não tem conta?{" "}
      <Link href="/criar-conta" className="text-primary inline-flex min-h-11 items-center font-semibold">
        Criar conta
      </Link>
    </p>
  </div>
);

export default EntrarPage;
