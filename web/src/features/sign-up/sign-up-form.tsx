"use client";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { meQuery } from "@/entities/user/session";
import { ApiError, api, dataOrThrow, hasStatus } from "@/shared/api/client";
import { BrandButton } from "@/shared/ui/brand-button";

const formSchema = z.object({
  email: z.email({ message: "Informe um e-mail válido." }),
  password: z
    .string()
    .min(8, { message: "A senha precisa de pelo menos 8 caracteres." })
    .max(128, { message: "A senha pode ter até 128 caracteres." }),
});

type SignUp = z.infer<typeof formSchema>;

const failure = (error: Error) => {
  if (hasStatus(error, 409)) return "Este e-mail já tem conta. Entre com ele.";
  if (hasStatus(error, 429)) return "Muitas tentativas. Espere um pouco e tente de novo.";
  return "Não foi possível criar a conta. Tente de novo.";
};

export const SignUpForm = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<SignUp>({ resolver: zodResolver(formSchema), defaultValues: { email: "", password: "" } });
  const signUp = useMutation({
    mutationFn: async (body: SignUp) => dataOrThrow(await api.POST("/api/auth/sign-up", { body })),
    onSuccess: (user) => {
      queryClient.setQueryData(meQuery.queryKey, user);
      router.replace("/onboarding");
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return;
      for (const { field, message } of error.errors) {
        if (field === "email" || field === "password") form.setError(field, { message });
      }
    },
  });
  const fieldErrors = signUp.error instanceof ApiError && signUp.error.errors.length > 0;

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => signUp.mutate(values))} className="flex flex-col gap-6">
      <FieldGroup className="gap-4">
        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <Field className="gap-1.5" data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="sign-up-email">E-mail</FieldLabel>
              <Input
                {...field}
                id="sign-up-email"
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
              <FieldLabel htmlFor="sign-up-password">Senha</FieldLabel>
              <Input
                {...field}
                id="sign-up-password"
                type="password"
                autoComplete="new-password"
                className="h-12 text-base md:text-base"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid ? (
                <FieldError errors={[fieldState.error]} />
              ) : (
                <FieldDescription>Pelo menos 8 caracteres.</FieldDescription>
              )}
            </Field>
          )}
        />
      </FieldGroup>
      {signUp.isError && !fieldErrors && (
        <p role="alert" className="rounded-xl bg-expense-soft px-4 py-3 font-medium text-sm text-tier-red-foreground">
          {failure(signUp.error)}
        </p>
      )}
      <BrandButton type="submit" disabled={signUp.isPending}>
        {signUp.isPending && <Spinner aria-hidden />}
        Criar conta
      </BrandButton>
    </form>
  );
};
