"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Spinner } from "@/components/ui/spinner";
import { meQuery } from "@/entities/user/session";
import { api, hasProblem, hasStatus, okOrThrow } from "@/shared/api/client";
import { BrandButton } from "@/shared/ui/brand-button";

const Outcome = ({ title, text, action, href }: { title: string; text: string; action: string; href: string }) => (
  <div className="flex flex-col gap-4">
    <h1 className="font-bold text-[22px] leading-7">{title}</h1>
    <p className="text-base">{text}</p>
    <BrandButton asChild>
      <Link href={href}>{action}</Link>
    </BrandButton>
  </div>
);

const Alert = ({ children }: { children: string }) => (
  <p role="alert" className="rounded-xl bg-expense-soft px-4 py-3 font-medium text-sm text-tier-red-foreground">
    {children}
  </p>
);

/** Confirms the e-mail with the token the mailed link carries in its fragment. */
export const ConfirmEmail = () => {
  const queryClient = useQueryClient();
  // Strict Mode runs the effect twice; the ref keeps the second run from spending the token again.
  const token = useRef<string | null | undefined>(undefined);
  const [missing, setMissing] = useState(false);
  const { mutate, ...confirm } = useMutation({
    mutationFn: async (value: string) =>
      okOrThrow(await api.POST("/api/auth/email-verification/confirm", { body: { token: value } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meQuery.queryKey }),
  });

  useEffect(() => {
    if (token.current !== undefined) return;
    token.current = new URLSearchParams(window.location.hash.slice(1)).get("token");
    window.history.replaceState(null, "", "/verificar-email");
    if (token.current) mutate(token.current);
    else setMissing(true);
  }, [mutate]);

  if (missing || hasProblem(confirm.error, "invalid-verification-link"))
    return (
      <Outcome
        title="Link inválido ou expirado"
        text="Peça um novo link em Ajustes › Minha Conta."
        action="Ir para Ajustes"
        href="/ajustes#conta"
      />
    );

  if (confirm.isSuccess)
    return (
      <Outcome
        title="E-mail verificado"
        text="Pronto: seu e-mail está confirmado."
        action="Ir para o Soldi"
        href="/mes"
      />
    );

  if (hasStatus(confirm.error, 429)) return <Alert>Muitas tentativas. Tente de novo mais tarde.</Alert>;

  if (confirm.isError)
    return (
      <div className="flex flex-col gap-4">
        <Alert>Não foi possível verificar agora.</Alert>
        <BrandButton onClick={() => token.current && mutate(token.current)}>Tentar de novo</BrandButton>
      </div>
    );

  return (
    <p role="status" className="flex items-center gap-2 text-base">
      <Spinner aria-hidden />
      Verificando seu e-mail…
    </p>
  );
};
