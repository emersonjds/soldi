"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useMe } from "@/entities/user/session";
import { DeleteAccountButton } from "@/features/delete-account/delete-account-button";
import { PasswordForm } from "@/features/edit-account/password-form";
import { ProfileForm } from "@/features/edit-account/profile-form";
import { SignOutButton } from "@/features/sign-out/sign-out-button";
import { SignOutEverywhereButton } from "@/features/sign-out/sign-out-everywhere-button";

const Tile = ({ label, value, children }: { label: string; value: string; children?: ReactNode }) => (
  <div className="flex min-w-0 flex-col items-start gap-1 rounded-2xl bg-muted p-4">
    <span className="font-semibold text-[11px] text-muted-foreground tracking-[0.12em]">{label}</span>
    <p className="max-w-full truncate font-semibold text-base">{value}</p>
    {children}
  </div>
);

/** Opens one of the shipped account forms in a dialog. */
const FormDialog = ({ action, children }: { action: string; children: ReactNode }) => (
  <Dialog>
    <DialogTrigger asChild>
      <Button variant="link" className="min-h-11 px-0 font-semibold text-primary text-sm">
        {action}
      </Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{action}</DialogTitle>
      </DialogHeader>
      {children}
    </DialogContent>
  </Dialog>
);

/** Name, e-mail and password tiles, then account deletion and sign-out. */
export const AccountSection = () => {
  const me = useMe();
  if (!me.data) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="NOME COMPLETO" value={me.data.name}>
          <FormDialog action="Alterar dados">
            <ProfileForm user={me.data} />
          </FormDialog>
        </Tile>
        <Tile label="E-MAIL CADASTRADO" value={me.data.email} />
        <Tile label="SENHA DE ACESSO" value="••••••••••••">
          <FormDialog action="Trocar senha">
            <PasswordForm />
          </FormDialog>
        </Tile>
      </div>
      <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-start sm:justify-between">
        <DeleteAccountButton />
        <div className="flex flex-col items-stretch sm:items-end">
          <SignOutButton />
          <SignOutEverywhereButton />
        </div>
      </div>
    </div>
  );
};
