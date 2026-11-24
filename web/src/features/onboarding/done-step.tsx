"use client";

import { useRouter } from "next/navigation";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { meQuery, redirectFor } from "@/entities/user/session";
import { api, dataOrThrow, hasStatus, type Schemas } from "@/shared/api/client";
import { useCurrency } from "@/shared/lib/currency";
import { formatMoney } from "@/shared/lib/money";
import { BrandButton } from "@/shared/ui/brand-button";

const dateLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export const DoneStep = ({ onboarding, onBack }: { onboarding: Schemas["Onboarding"]; onBack: () => void }) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const currency = useCurrency();
  const bills = onboarding.bills?.length ?? 0;
  const save = useMutation({
    mutationFn: async () => dataOrThrow(await api.POST("/api/onboarding", { body: onboarding })),
    onSuccess: (user) => {
      queryClient.setQueryData(meQuery.queryKey, user);
      router.replace(redirectFor(user, "/onboarding") ?? "/mes");
    },
    onError: async (error) => {
      if (!hasStatus(error, 409)) return;
      const user = await queryClient.fetchQuery({ ...meQuery, staleTime: 0 });
      router.replace(redirectFor(user, "/onboarding") ?? "/mes");
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <CircleCheck className="text-income size-12" aria-hidden />
        <h1 className="text-[22px] leading-7 font-bold">Tudo pronto</h1>
        <p className="text-muted-foreground">Seu mês começa com</p>
        <p className="text-[34px] leading-10 font-bold tracking-[-0.02em] tabular-nums">
          {formatMoney(onboarding.opening_balance, currency)}
        </p>
        <p className="text-muted-foreground">
          em {dateLabel.format(new Date(onboarding.opening_date))}
          {" · "}
          {bills === 0 ? "nenhuma conta fixa por enquanto" : `${bills} ${bills === 1 ? "conta fixa" : "contas fixas"}`}
        </p>
      </div>
      {save.isError && !hasStatus(save.error, 409) && (
        <p role="alert" className="bg-expense-soft text-tier-red-foreground rounded-xl px-4 py-3 text-sm font-medium">
          Não foi possível salvar. Tente de novo.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <BrandButton disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Spinner aria-hidden />}
          Ver meu mês
        </BrandButton>
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground min-h-11 text-base"
          disabled={save.isPending}
          onClick={onBack}
        >
          Voltar
        </Button>
      </div>
    </div>
  );
};
