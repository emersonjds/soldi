"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { Ban } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const passwordField = useRef<HTMLInputElement>(null);
  const remove = useLeave(async () => {
    okOrThrow(await api.DELETE("/api/me", { body: { password } }));
    toast.success("Sua conta foi excluída.");
  });
  const wrongPassword = hasProblem(remove.error, "wrong-password");
  const ready = Boolean(password) && confirmation === CONFIRMATION && !remove.isPending;

  useEffect(() => {
    if (wrongPassword) passwordField.current?.focus();
  }, [wrongPassword]);
  const failure = hasStatus(remove.error, 429)
    ? "Muitas tentativas. Espere um pouco e tente de novo."
    : "Não foi possível excluir a conta.";

  const change = (next: boolean) => {
    if (!next && remove.isPending) return;
    setOpen(next);
    if (next) return;
    setPassword("");
    setConfirmation("");
    remove.reset();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    remove.mutate();
  };

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          className="h-11 gap-2 px-2 font-semibold text-base text-destructive hover:text-destructive"
        >
          <Ban aria-hidden className="size-5" />
          Excluir conta definitivamente
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
              ref={passwordField}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                remove.reset();
              }}
              className="h-12 text-base md:text-base"
              aria-invalid={wrongPassword}
              aria-describedby={wrongPassword ? "delete-password-error" : undefined}
            />
            {wrongPassword && <FieldError id="delete-password-error">Senha incorreta</FieldError>}
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
            <AlertDialogCancel type="button" className="h-11" disabled={remove.isPending}>
              Cancelar
            </AlertDialogCancel>
            <Button type="submit" variant="destructive" className="h-11" disabled={!ready}>
              Excluir para sempre
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
};
