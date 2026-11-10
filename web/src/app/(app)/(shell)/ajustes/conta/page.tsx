"use client";

import type { ReactNode } from "react";

import { useMe } from "@/entities/user/session";
import { DeleteAccountButton } from "@/features/delete-account/delete-account-button";
import { PasswordForm } from "@/features/edit-account/password-form";
import { ProfileForm } from "@/features/edit-account/profile-form";
import { SignOutButton } from "@/features/sign-out/sign-out-button";
import { SignOutEverywhereButton } from "@/features/sign-out/sign-out-everywhere-button";
import { BackLink } from "@/shared/ui/back-link";
import { PageLoading } from "@/shared/ui/page-state";

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section aria-label={title} className="flex flex-col gap-2">
    <h2 className="px-1 font-semibold text-[11px] text-muted-foreground uppercase leading-4 tracking-[0.12em]">
      {title}
    </h2>
    {children}
  </section>
);

const ContaPage = () => {
  const me = useMe();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-4">
        <BackLink href="/ajustes" label="Ajustes" />
        <h1 className="font-bold text-[22px] leading-7">Minha conta</h1>
      </div>
      {me.data ? (
        <>
          <Section title="Perfil">
            <ProfileForm user={me.data} />
          </Section>
          <Section title="Senha">
            <PasswordForm />
          </Section>
          <Section title="Sessão">
            <ul className="flex flex-col divide-y overflow-hidden rounded-2xl bg-card shadow-sm">
              <li>
                <SignOutButton />
              </li>
              <li>
                <SignOutEverywhereButton />
              </li>
            </ul>
          </Section>
          <Section title="Excluir conta">
            <DeleteAccountButton />
          </Section>
        </>
      ) : (
        <PageLoading />
      )}
    </div>
  );
};

export default ContaPage;
