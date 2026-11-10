"use client";

import Link from "next/link";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, hasStatus, okOrThrow } from "@/shared/api/client";
import { BrandButton } from "@/shared/ui/brand-button";

const formSchema = z.object({ email: z.email({ message: "Informe um e-mail válido." }) });

type RequestReset = z.infer<typeof formSchema>;

const failure = (error: Error) =>
  hasStatus(error, 429)
    ? "Muitas tentativas. Espere um pouco e tente de novo."
    : "Não foi possível enviar agora. Tente de novo.";

const focus = (node: HTMLElement | null) => node?.focus();

/** Asks for a reset link; the answer never tells whether the e-mail has an account. */
export const RequestForm = () => {
  const form = useForm<RequestReset>({ resolver: zodResolver(formSchema), defaultValues: { email: "" } });
  const send = useMutation({
    mutationFn: async (body: RequestReset) => okOrThrow(await api.POST("/api/auth/password-reset", { body })),
  });

  if (send.isSuccess)
    return (
      <div className="flex flex-col gap-4">
        <p ref={focus} tabIndex={-1} role="status" className="text-base">
          Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha. Ele vale por 1 hora.
        </p>
        <Link href="/entrar" className="inline-flex min-h-11 items-center self-center font-semibold text-primary">
          Voltar para Entrar
        </Link>
      </div>
    );

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => send.mutate(values))} className="flex flex-col gap-6">
      <Controller
        control={form.control}
        name="email"
        render={({ field, fieldState }) => (
          <Field className="gap-1.5" data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="reset-email">E-mail</FieldLabel>
            <Input
              {...field}
              id="reset-email"
              type="email"
              inputMode="email"
              placeholder="voce@exemplo.com"
              autoComplete="email"
              className="h-12 text-base md:text-base"
              aria-invalid={fieldState.invalid}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      {send.isError && (
        <p role="alert" className="rounded-xl bg-expense-soft px-4 py-3 font-medium text-sm text-tier-red-foreground">
          {failure(send.error)}
        </p>
      )}
      <BrandButton type="submit" disabled={send.isPending}>
        {send.isPending && <Spinner aria-hidden />}
        Enviar link
      </BrandButton>
    </form>
  );
};
