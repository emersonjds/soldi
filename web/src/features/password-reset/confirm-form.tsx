"use client";

import { type FormEvent, useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
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

const focus = (node: HTMLElement | null) => node?.focus();

/** Sets a new password with the token the e-mailed link carries in its fragment. */
export const ConfirmForm = () => {
  const [token, setToken] = useState<string>();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [refused, setRefused] = useState(false);
  const [expired, setExpired] = useState(false);
  const confirm = useMutation({
    mutationFn: async (body: Schemas["ConfirmPasswordReset"]) =>
      okOrThrow(await api.POST("/api/auth/password-reset/confirm", { body })),
  });
  const passwordError = (submitted && lengthProblem(password)) || (refused ? TOO_SHORT : undefined);
  const repeatError = submitted && password !== repeat ? "As senhas não são iguais." : undefined;

  useEffect(() => {
    const found = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (found !== null) window.history.replaceState(null, "", "/redefinir-senha");
    // Strict Mode runs this twice; the second run sees the cleaned URL.
    setToken((current) => current || found || "");
  }, []);

  if (token === undefined) return null;

  if (expired || !token)
    return (
      <div className="flex flex-col gap-4">
        <p
          ref={focus}
          tabIndex={-1}
          role="alert"
          className="rounded-xl bg-expense-soft px-4 py-3 font-medium text-sm text-tier-red-foreground"
        >
          Este link expirou ou já foi usado.
        </p>
        <Link
          href="/esqueci-senha"
          className="inline-flex min-h-11 items-center self-center font-semibold text-primary"
        >
          Pedir outro link
        </Link>
      </div>
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (lengthProblem(password) || password !== repeat) return;
    confirm.mutate(
      { token, new_password: password },
      {
        onSuccess: () => {
          toast.success("Senha redefinida. Entre com a nova senha.");
          router.replace("/entrar");
        },
        onError: (error) => {
          if (hasProblem(error, "invalid-reset-link")) setExpired(true);
          else if (error instanceof ApiError && error.errors.some(({ field }) => field === "password"))
            setRefused(true);
          else if (hasStatus(error, 429)) toast.error("Muitas tentativas. Espere um pouco e tente de novo.");
          else toast.error("Não foi possível salvar a senha. Tente de novo.");
        },
      },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Field className="gap-1.5" data-invalid={Boolean(passwordError)}>
          <FieldLabel htmlFor="reset-password">Nova senha</FieldLabel>
          <Input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setRefused(false);
            }}
            className="h-12 text-base md:text-base"
            aria-invalid={Boolean(passwordError)}
          />
          {passwordError ? <FieldError>{passwordError}</FieldError> : <FieldDescription>{TOO_SHORT}</FieldDescription>}
        </Field>
        <Field className="gap-1.5" data-invalid={Boolean(repeatError)}>
          <FieldLabel htmlFor="reset-repeat">Repita a nova senha</FieldLabel>
          <Input
            id="reset-repeat"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            className="h-12 text-base md:text-base"
            aria-invalid={Boolean(repeatError)}
          />
          {repeatError && <FieldError>{repeatError}</FieldError>}
        </Field>
      </div>
      <BrandButton type="submit" disabled={confirm.isPending}>
        {confirm.isPending && <Spinner aria-hidden />}
        Salvar nova senha
      </BrandButton>
    </form>
  );
};
