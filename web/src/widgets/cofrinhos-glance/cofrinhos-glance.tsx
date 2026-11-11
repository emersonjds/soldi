"use client";

import Link from "next/link";

import { CofrinhoBar } from "@/entities/cofrinho/cofrinho-bar";
import { useCofrinhos } from "@/entities/cofrinho/cofrinho-queries";
import { formatPct } from "@/shared/lib/percent";
import { cents } from "@/shared/lib/tier";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { DashCard } from "@/shared/ui/dash-card";
import { CofrinhoIllustration } from "@/shared/ui/illustrations";
import { Money } from "@/shared/ui/money";
import { PageError, SkeletonRows } from "@/shared/ui/page-state";

const TITLE = "Cofrinhos";
const ALL = "/economia";

/** C7: `total_saved`, never the month's saving (C1 shows that), and the two largest cofrinhos. */
export const CofrinhosGlance = ({ className }: { className?: string }) => {
  const cofrinhos = useCofrinhos();
  const items = cofrinhos.data?.items ?? [];

  if (cofrinhos.isError && !cofrinhos.data)
    return (
      <DashCard title={TITLE} className={className}>
        <PageError message="Não foi possível carregar os cofrinhos." onRetry={() => cofrinhos.refetch()} />
      </DashCard>
    );
  if (!cofrinhos.data)
    return (
      <DashCard title={TITLE} className={className}>
        <SkeletonRows count={2} />
      </DashCard>
    );
  if (items.length === 0)
    return (
      <DashCard title={TITLE} className={className}>
        <div className="flex flex-col items-center gap-3">
          <div
            aria-hidden
            className="pointer-events-none flex w-full select-none justify-center opacity-50 saturate-50"
          >
            <CofrinhoIllustration />
          </div>
          <p className="max-w-xs text-center text-muted-foreground">
            Nenhum cofrinho ainda. Comece pela reserva de emergência.
          </p>
          <Link
            href={ALL}
            className="inline-flex min-h-11 items-center rounded-lg px-2 font-medium text-primary text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          >
            Ver cofrinhos
          </Link>
        </div>
      </DashCard>
    );

  const top = [...items].sort((a, b) => cents(b.balance) - cents(a.balance)).slice(0, 2);
  return (
    <DashCard title={TITLE} action={{ href: ALL, label: "Ver todos" }} className={className}>
      <div className="flex flex-col gap-4">
        <p className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground text-sm">Guardado</span>
          <Money amount={cofrinhos.data.total_saved} size="figure" />
        </p>
        <ul className="flex flex-col gap-3">
          {top.map((cofrinho) => (
            <li key={cofrinho.category_id} className="flex flex-col gap-2">
              <span className="flex min-h-11 items-center gap-3">
                <CategoryIcon icon={cofrinho.icon} color={cofrinho.color} />
                <span className="min-w-0 flex-1 truncate font-medium text-base">{cofrinho.name}</span>
                {cofrinho.target ? (
                  <span className="whitespace-nowrap text-muted-foreground text-sm tabular-nums">
                    {formatPct(cofrinho.progress_pct ?? "0", 0)} de <Money amount={cofrinho.target} />
                  </span>
                ) : (
                  <Money amount={cofrinho.balance} className="font-semibold" />
                )}
              </span>
              {cofrinho.target && <CofrinhoBar cofrinho={cofrinho} />}
            </li>
          ))}
        </ul>
      </div>
    </DashCard>
  );
};
