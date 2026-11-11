"use client";

import { type ReactNode, useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTourSeen } from "@/entities/user/session";
import { cn } from "@/lib/utils";
import { BrandButton } from "@/shared/ui/brand-button";
import {
  CofrinhoIllustration,
  IncomeIllustration,
  LedgerIllustration,
  ProjectionIllustration,
} from "@/shared/ui/illustrations";

const STEPS: { title: string; text: string; illustration: ReactNode }[] = [
  {
    title: "Entradas",
    text: "Tudo que entra: salário, extras, reembolsos.",
    illustration: <IncomeIllustration />,
  },
  {
    title: "Saídas e Diário",
    text: "Contas fixas (aluguel, luz) e gastos do dia a dia (mercado, comida fora). Cada uma com sua categoria para você ver para onde vai.",
    illustration: <LedgerIllustration />,
  },
  {
    title: "Projeção do fim do mês",
    text: "O Soldi soma o que ainda vai sair (contas em aberto) e mostra como o mês termina antes de acontecer. Verde é folga, vermelho é alerta.",
    illustration: <ProjectionIllustration />,
  },
  {
    title: "Economia",
    text: "Guardar é uma saída em Economia › seu objetivo. O dinheiro sai do mês e aparece nos Cofrinhos com meta e progresso.",
    illustration: <CofrinhoIllustration />,
  },
];

const LAST = STEPS.length - 1;

/** Four cards after onboarding; `?replay=1` (from Ajustes) shows them again and only goes back to Mês. */
export const WelcomeTour = () => {
  const router = useRouter();
  const replay = useSearchParams().get("replay") === "1";
  const seen = useTourSeen();
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  const finish = () => {
    if (replay) return router.replace("/mes");
    if (!seen.isPending) seen.mutate(undefined, { onSuccess: () => router.replace("/mes?lancar=1") });
  };

  // Next's export caches `/mes` under the first search it is opened with; prefetching the bare path keeps
  // `?lancar=1` from coming back on every later link to Mês.
  useEffect(() => router.prefetch("/mes"), [router]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") setStep((at) => Math.min(at + 1, LAST));
      if (event.key === "ArrowLeft") setStep((at) => Math.max(at - 1, 0));
      if (event.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex min-h-dvh bg-card lg:items-center lg:justify-center lg:bg-linear-to-br lg:from-hero-from lg:to-hero-to lg:p-8">
      <main
        aria-label="Como o Soldi funciona"
        className="flex w-full flex-col gap-6 px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:max-w-[560px] lg:rounded-3xl lg:bg-card lg:p-10 lg:shadow-xl"
      >
        <div className="flex min-h-11 items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="sr-only">
              Passo {step + 1} de {STEPS.length}
            </span>
            {STEPS.map((dot, index) => (
              <span
                key={dot.title}
                aria-hidden
                className={cn(
                  "h-2 rounded-full transition-all duration-200 motion-reduce:transition-none",
                  index === step ? "w-6 bg-brand" : "w-2 bg-input",
                )}
              />
            ))}
          </div>
          {step < LAST && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 text-base text-muted-foreground"
              disabled={seen.isPending}
              onClick={finish}
            >
              Pular
            </Button>
          )}
        </div>
        <div
          aria-hidden
          className="-mx-6 flex flex-1 items-center justify-center bg-muted px-4 py-8 lg:mx-0 lg:min-h-64 lg:flex-none lg:rounded-3xl"
        >
          {current.illustration}
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="font-bold text-[22px] leading-7">{current.title}</h1>
          <p className="min-h-18 text-base text-muted-foreground leading-6">{current.text}</p>
        </div>
        {seen.isError && (
          <p role="alert" className="rounded-xl bg-expense-soft px-4 py-3 font-medium text-sm text-tier-red-foreground">
            Não foi possível salvar. Tente de novo.
          </p>
        )}
        {step < LAST ? (
          <BrandButton onClick={() => setStep(step + 1)}>Próximo</BrandButton>
        ) : (
          <BrandButton disabled={seen.isPending} onClick={finish}>
            {seen.isPending && <Spinner aria-hidden />}
            Começar
          </BrandButton>
        )}
      </main>
    </div>
  );
};
