"use client";

import { type FormEvent, useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, hasProblem, okOrThrow, type Schemas } from "@/shared/api/client";
import { BrandButton } from "@/shared/ui/brand-button";

const MIN_LENGTH = 8;

/** Swaps the password; the server signs out every other session. */
export const PasswordForm = () => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const change = useMutation({
    mutationFn: async (body: Schemas["ChangePassword"]) => okOrThrow(await api.POST("/api/me/password", { body })),
  });
  const tooShort = submitted && next.length < MIN_LENGTH;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (next.length < MIN_LENGTH) return;
    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          toast.success("Senha trocada. Os outros aparelhos foram desconectados.");
          setCurrent("");
          setNext("");
          setSubmitted(false);
        },
        onError: (error) =>
          toast.error(
            hasProblem(error, "wrong-password") ? "Senha atual incorreta" : "Não foi possível trocar a senha.",
          ),
      },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6">
      <Field className="gap-1.5">
        <FieldLabel htmlFor="current-password">Senha atual</FieldLabel>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          className="h-12 text-base md:text-base"
        />
      </Field>
      <Field className="gap-1.5" data-invalid={tooShort}>
        <FieldLabel htmlFor="new-password">Nova senha</FieldLabel>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          className="h-12 text-base md:text-base"
          aria-invalid={tooShort}
        />
        {tooShort ? (
          <FieldError>Mínimo de 8 caracteres</FieldError>
        ) : (
          <FieldDescription>Mínimo de 8 caracteres</FieldDescription>
        )}
      </Field>
      <BrandButton type="submit" disabled={change.isPending} className="lg:w-auto lg:self-start lg:px-8">
        Trocar senha
      </BrandButton>
    </form>
  );
};
