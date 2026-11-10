"use client";

import { type FormEvent, useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { meQuery, type User } from "@/entities/user/session";
import { api, dataOrThrow } from "@/shared/api/client";
import { BrandButton } from "@/shared/ui/brand-button";

/** The user's name, editable, and the e-mail, read-only. */
export const ProfileForm = ({ user }: { user: User }) => {
  const [name, setName] = useState(user.name);
  const [submitted, setSubmitted] = useState(false);
  const queryClient = useQueryClient();
  const rename = useMutation({
    mutationFn: async (next: string) => dataOrThrow(await api.PATCH("/api/me", { body: { name: next } })),
    onSuccess: (saved) => queryClient.setQueryData(meQuery.queryKey, saved),
  });
  const trimmed = name.trim();
  const invalid = submitted && !trimmed;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!trimmed) return;
    rename.mutate(trimmed, {
      onSuccess: () => toast.success("Nome salvo"),
      onError: () => toast.error("Não foi possível salvar."),
    });
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6">
      <Field className="gap-1.5" data-invalid={invalid}>
        <FieldLabel htmlFor="account-name">Nome</FieldLabel>
        <Input
          id="account-name"
          autoComplete="name"
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-12 text-base md:text-base"
          aria-invalid={invalid}
        />
        {invalid && <FieldError>Informe seu nome.</FieldError>}
      </Field>
      <Field className="gap-1.5">
        <FieldLabel htmlFor="account-email">E-mail</FieldLabel>
        <Input
          id="account-email"
          type="email"
          readOnly
          value={user.email}
          className="h-12 bg-muted text-base text-muted-foreground md:text-base"
        />
        <FieldDescription>Para trocar o e-mail, fale com o suporte.</FieldDescription>
      </Field>
      <BrandButton type="submit" disabled={rename.isPending} className="lg:w-auto lg:self-start lg:px-8">
        Salvar
      </BrandButton>
    </form>
  );
};
