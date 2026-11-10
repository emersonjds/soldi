"use client";

import { type FormEvent, useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, api, hasProblem, hasStatus, okOrThrow, type Schemas } from "@/shared/api/client";
import { BrandButton } from "@/shared/ui/brand-button";

const TOO_SHORT = "Mínimo de 8 caracteres";

// The server counts characters, not UTF-16 code units.
const lengthProblem = (password: string) => {
  const length = [...password].length;
  if (length < 8) return TOO_SHORT;
  if (length > 128) return "A senha pode ter até 128 caracteres.";
  return undefined;
};

/** Swaps the password; the server signs out every other session. */
export const PasswordForm = () => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [refused, setRefused] = useState<"current" | "next">();
  const change = useMutation({
    mutationFn: async (body: Schemas["ChangePassword"]) => okOrThrow(await api.POST("/api/me/password", { body })),
    gcTime: 0,
  });
  const nextError = (submitted && lengthProblem(next)) || (refused === "next" ? TOO_SHORT : undefined);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (lengthProblem(next)) return;
    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          toast.success("Senha trocada. Os outros aparelhos foram desconectados.");
          setCurrent("");
          setNext("");
          setSubmitted(false);
        },
        onError: (error) => {
          if (hasProblem(error, "wrong-password")) {
            setRefused("current");
            toast.error("Senha atual incorreta");
          } else if (error instanceof ApiError && error.errors.some(({ field }) => field === "password"))
            setRefused("next");
          else if (hasStatus(error, 429)) toast.error("Muitas tentativas. Espere um pouco e tente de novo.");
          else toast.error("Não foi possível trocar a senha.");
        },
        onSettled: () => change.reset(),
      },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6">
      <Field className="gap-1.5" data-invalid={refused === "current"}>
        <FieldLabel htmlFor="current-password">Senha atual</FieldLabel>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => {
            setCurrent(event.target.value);
            if (refused === "current") setRefused(undefined);
          }}
          className="h-12 text-base md:text-base"
          aria-invalid={refused === "current"}
        />
        {refused === "current" && <FieldError>Senha atual incorreta</FieldError>}
      </Field>
      <Field className="gap-1.5" data-invalid={Boolean(nextError)}>
        <FieldLabel htmlFor="new-password">Nova senha</FieldLabel>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => {
            setNext(event.target.value);
            if (refused === "next") setRefused(undefined);
          }}
          className="h-12 text-base md:text-base"
          aria-invalid={Boolean(nextError)}
        />
        {nextError ? <FieldError>{nextError}</FieldError> : <FieldDescription>{TOO_SHORT}</FieldDescription>}
      </Field>
      <BrandButton type="submit" disabled={change.isPending} className="lg:w-auto lg:self-start lg:px-8">
        Trocar senha
      </BrandButton>
    </form>
  );
};
