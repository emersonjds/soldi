"use client";

import { PiggyBank } from "lucide-react";

import { CofrinhoBar } from "@/entities/cofrinho/cofrinho-bar";
import { useCofrinhos } from "@/entities/cofrinho/cofrinho-queries";
import { useCurrency } from "@/shared/lib/currency";
import { currencySymbol, formatWhole } from "@/shared/lib/money";
import { wholeShare } from "@/shared/lib/percent";
import { cents } from "@/shared/lib/tier";
import { DashCard } from "@/shared/ui/dash-card";
import { Money } from "@/shared/ui/money";
import { PageError } from "@/shared/ui/page-state";

const TITLE = "Cofrinhos";
const ICON = <PiggyBank aria-hidden className="size-5 text-primary" />;

/**
 * Stitch §2.9: `total_saved` and the two largest cofrinhos with a goal. Nothing while loading,
 * nor when only an empty Reserva Livre (the `parent`) exists (D25).
 */
export const CofrinhosGlance = ({ className }: { className?: string }) => {
  const cofrinhos = useCofrinhos();
  const symbol = currencySymbol(useCurrency());
  const items = cofrinhos.data?.items ?? [];

  if (cofrinhos.isError && !cofrinhos.data)
    return (
      <DashCard title={TITLE} icon={ICON} className={className}>
        <PageError message="Não foi possível carregar os cofrinhos." onRetry={() => cofrinhos.refetch()} />
      </DashCard>
    );
  if (!cofrinhos.data) return null;
  if (!items.some((cofrinho) => !cofrinho.parent) && cents(cofrinhos.data.total_saved) === 0) return null;

  const top = items
    .filter((cofrinho) => cofrinho.target)
    .sort((a, b) => cents(b.balance) - cents(a.balance))
    .slice(0, 2);
  return (
    <DashCard
      title={TITLE}
      icon={ICON}
      action={{ href: "/economia", label: "Ver todos", arrow: true }}
      className={className}
    >
      <div className="flex flex-col gap-4">
        <p className="flex flex-col gap-1">
          <span className="font-semibold text-[11px] text-muted-foreground uppercase leading-4 tracking-[0.12em]">
            Total guardado
          </span>
          <Money amount={cofrinhos.data.total_saved} size="figure" />
        </p>
        <ul className="flex flex-col gap-4">
          {top.map((cofrinho) => {
            const target = cofrinho.target ?? "0";
            return (
              <li key={cofrinho.category_id} className="flex flex-col gap-2">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="line-clamp-2 break-words font-medium text-base">{cofrinho.name}</span>
                  <span className="font-semibold text-sm tabular-nums">
                    {wholeShare(cents(cofrinho.balance), cents(target))}%
                  </span>
                </span>
                <CofrinhoBar cofrinho={cofrinho} />
                <span className="flex justify-between gap-3 text-muted-foreground text-sm tabular-nums">
                  <span>
                    {symbol} {formatWhole(cofrinho.balance)}
                  </span>
                  <span>
                    Meta: {symbol} {formatWhole(target)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </DashCard>
  );
};
