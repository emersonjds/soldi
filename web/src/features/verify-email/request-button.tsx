"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { meQuery } from "@/entities/user/session";
import { api, hasProblem, hasStatus, okOrThrow } from "@/shared/api/client";

/** Mails a verification link to the signed-in user's e-mail. */
export const VerifyEmailButton = ({ email }: { email: string }) => {
  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: async () => okOrThrow(await api.POST("/api/me/email-verification")),
    onSuccess: () => toast.success(`Enviamos um link para ${email}. Ele vale por 24 horas.`),
    onError: (error) => {
      if (hasProblem(error, "email-already-verified"))
        return queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
      toast.error(
        hasStatus(error, 429) ? "Muitas tentativas. Tente de novo mais tarde." : "Não foi possível enviar o link.",
      );
    },
  });

  return (
    <Button
      variant="link"
      className="min-h-11 px-0 font-semibold text-primary text-sm"
      disabled={send.isPending}
      onClick={() => send.mutate()}
    >
      {send.isPending ? "Enviando…" : "Verificar e-mail"}
    </Button>
  );
};
