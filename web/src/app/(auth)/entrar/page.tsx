import Link from "next/link";

import { SignInForm } from "@/features/sign-in/sign-in-form";

const EntrarPage = () => (
  <div className="flex flex-col gap-6">
    <h1 className="font-bold text-[22px] leading-7">Entrar</h1>
    <SignInForm />
    <p className="text-center text-muted-foreground">
      Não tem conta?{" "}
      <Link href="/criar-conta" className="inline-flex min-h-11 items-center font-semibold text-primary">
        Criar conta
      </Link>
    </p>
  </div>
);

export default EntrarPage;
