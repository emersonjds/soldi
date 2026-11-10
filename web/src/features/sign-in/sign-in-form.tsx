"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { meQuery, redirectFor } from "@/entities/user/session";
import { api, dataOrThrow, hasStatus } from "@/shared/api/client";
import { BrandButton } from "@/shared/ui/brand-button";

const formSchema = z.object({
  email: z.email({ message: "Informe um e-mail válido." }),
  password: z.string().min(1, { message: "Informe a senha." }),
});

type SignIn = z.infer<typeof formSchema>;

const failure = (error: Error) => {
  if (hasStatus(error, 401)) return "E-mail ou senha incorretos";
  if (hasStatus(error, 429)) return "Muitas tentativas. Espere um pouco e tente de novo.";
  return "Não foi possível entrar. Tente de novo.";
};

export const SignInForm = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<SignIn>({ resolver: zodResolver(formSchema), defaultValues: { email: "", password: "" } });
  const signIn = useMutation({
    mutationFn: async (body: SignIn) => dataOrThrow(await api.POST("/api/auth/sign-in", { body })),
    onSuccess: (user) => {
      queryClient.setQueryData(meQuery.queryKey, user);
      router.replace(redirectFor(user, "/") ?? "/mes");
    },
  });

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => signIn.mutate(values))} className="flex flex-col gap-6">
      <FieldGroup className="gap-4">
        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <Field className="gap-1.5" data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="sign-in-email">E-mail</FieldLabel>
              <Input
                {...field}
                id="sign-in-email"
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
        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <Field className="gap-1.5" data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="sign-in-password">Senha</FieldLabel>
              <Input
                {...field}
                id="sign-in-password"
                type="password"
                autoComplete="current-password"
                className="h-12 text-base md:text-base"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              <Link
                href="/esqueci-senha"
                className="inline-flex min-h-11 items-center self-end font-semibold text-primary text-sm"
              >
                Esqueci minha senha
              </Link>
            </Field>
          )}
        />
      </FieldGroup>
      {signIn.isError && (
        <p role="alert" className="rounded-xl bg-expense-soft px-4 py-3 font-medium text-sm text-tier-red-foreground">
          {failure(signIn.error)}
        </p>
      )}
      <BrandButton type="submit" disabled={signIn.isPending}>
        {signIn.isPending && <Spinner aria-hidden />}
        Entrar
      </BrandButton>
    </form>
  );
};
