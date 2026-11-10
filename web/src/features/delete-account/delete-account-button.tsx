"use client";

import { type FormEvent, useState } from "react";

import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useLeave } from "@/entities/user/session";
import { api, hasProblem, hasStatus, okOrThrow } from "@/shared/api/client";

const WARNING =
  "Apaga sua conta e todos os seus lançamentos, categorias, contas fixas e cofrinhos. Não dá para desfazer.";
const CONFIRMATION = "EXCLUIR";

/** Deletes the account and all its data after the password and a typed confirmation. */
export const DeleteAccountButton = () => {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const remove = useLeave(async () => {
    okOrThrow(await api.DELETE("/api/me", { body: { password } }));
    toast.success("Sua conta foi excluída.");
  });
  const wrongPassword = hasProblem(remove.error, "wrong-password");
  const failure = hasStatus(remove.error, 429)
    ? "Muitas tentativas. Espere um pouco e tente de novo."
    : "Não foi possível excluir a conta.";

  const close = (open: boolean) => {
    if (open) return;
    setPassword("");
    setConfirmation("");
    remove.reset();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    remove.mutate();
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6">
      <p className="text-muted-foreground text-sm">{WARNING}</p>
      <AlertDialog onOpenChange={close}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="h-11 lg:w-auto lg:self-start lg:px-8">
            Excluir minha conta
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <form noValidate onSubmit={submit} className="grid gap-4">
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir sua conta?</AlertDialogTitle>
              <AlertDialogDescription>{WARNING}</AlertDialogDescription>
            </AlertDialogHeader>
            <Field className="gap-1.5" data-invalid={wrongPassword}>
              <FieldLabel htmlFor="delete-password">Senha</FieldLabel>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  remove.reset();
                }}
                className="h-12 text-base md:text-base"
                aria-invalid={wrongPassword}
              />
              {wrongPassword && <FieldError>Senha incorreta</FieldError>}
            </Field>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="delete-confirmation">Digite EXCLUIR para confirmar</FieldLabel>
              <Input
                id="delete-confirmation"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="h-12 text-base md:text-base"
              />
            </Field>
            {remove.isError && !wrongPassword && (
              <p role="alert" className="text-destructive text-sm">
                {failure}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel type="button" className="h-11">
                Cancelar
              </AlertDialogCancel>
              <Button
                type="submit"
                variant="destructive"
                className="h-11"
                disabled={!password || confirmation !== CONFIRMATION || remove.isPending}
              >
                Excluir para sempre
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
