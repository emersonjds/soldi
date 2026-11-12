"use client";

import { useId } from "react";

import { History, Lock, PiggyBank } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { Cofrinho } from "@/entities/cofrinho/cofrinho-queries";
import type { Schemas } from "@/shared/api/client";
import { useCurrency } from "@/shared/lib/currency";
import { formatMoney } from "@/shared/lib/money";
import { formatPct, wholeShare } from "@/shared/lib/percent";
import { cents, fromCents } from "@/shared/lib/tier";
import { BrandButton } from "@/shared/ui/brand-button";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { Money } from "@/shared/ui/money";
import { ResponsiveSheet } from "@/shared/ui/responsive-sheet";

import { tile } from "./cofrinho-card";

const PROTECTED = "Saldo protegido de gastos correntes da conta principal.";

const MonthLine = ({ saved, firstUse }: { saved: string; firstUse: boolean }) => {
  const currency = useCurrency();
  if (firstUse) return "Nada guardado ainda.";
  if (cents(saved) === 0) return `Nada guardado este mês. ${PROTECTED}`;
  const negative = saved.startsWith("-");
  return (
    <>
      <span className={negative ? "font-semibold text-expense" : "font-semibold text-income-text"}>
        {negative ? "" : "+"}
        {formatMoney(saved, currency)}
      </span>{" "}
      este mês. {PROTECTED}
    </>
  );
};

const sum = (amounts: string[]) => amounts.reduce((total, amount) => total + cents(amount), 0);

/** Only cofrinhos with a target count, so a loose balance never inflates the progress. */
const MetaGlobal = ({ items }: { items: Cofrinho[] }) => {
  const goals = items.filter((item) => item.target);
  if (goals.length === 0) return null;
  const saved = sum(goals.map((goal) => goal.balance));
  const target = sum(goals.map((goal) => goal.target ?? "0"));
  const pct = Math.min(100, Math.max(0, wholeShare(saved * 10, target) / 10));
  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>
          Meta Global Consolidada: <Money amount={fromCents(saved)} className="font-bold text-primary" />{" "}
          <span className="whitespace-nowrap text-muted-foreground">
            de <Money amount={fromCents(target)} />
          </span>
        </p>
        <span className="rounded-md bg-secondary px-2 py-0.5 font-semibold text-primary text-xs">
          {formatPct(String(pct))} concluído
        </span>
      </div>
      <Progress value={pct} aria-label="Meta Global Consolidada" aria-valuenow={pct} className="h-3" />
    </div>
  );
};

type HeroProps = {
  data: Schemas["Cofrinhos"];
  firstUse: boolean;
  saveDisabled: boolean;
  withdrawDisabled: boolean;
  onSave: () => void;
  onWithdraw: () => void;
  onMovements: () => void;
};

export const CofrinhosHero = ({
  data,
  firstUse,
  saveDisabled,
  withdrawDisabled,
  onSave,
  onWithdraw,
  onMovements,
}: HeroProps) => {
  const id = useId();
  return (
    <section aria-labelledby={id} className={tile}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={id} className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
              Total guardado em cofrinhos
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-semibold text-primary text-xs">
              <Lock className="size-3" aria-hidden />
              Protegido
            </span>
          </div>
          <Money amount={data.total_saved} size="hero" />
          <p className="text-muted-foreground text-sm">
            <MonthLine saved={data.saved_this_month} firstUse={firstUse} />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BrandButton className="w-auto flex-1 px-5" disabled={saveDisabled} onClick={onSave}>
            <PiggyBank className="size-5" />
            Guardar Dinheiro
          </BrandButton>
          <Button
            variant="secondary"
            className="min-h-12 flex-1 px-5 text-base"
            disabled={withdrawDisabled}
            onClick={onWithdraw}
          >
            Resgatar
          </Button>
          <Button variant="secondary" size="icon" aria-label="Movimentos" className="size-12" onClick={onMovements}>
            <History className="size-5" />
          </Button>
        </div>
      </div>
      <MetaGlobal items={data.items} />
    </section>
  );
};

type PickerProps = {
  title: string;
  options: Cofrinho[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (cofrinho: Cofrinho) => void;
};

export const CofrinhoPicker = ({ title, options, open, onOpenChange, onPick }: PickerProps) => (
  <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={title} description="Escolha o cofrinho.">
    <ul className="flex flex-col divide-y">
      {options.map((option) => (
        <li key={option.category_id}>
          <button
            type="button"
            onClick={() => onPick(option)}
            className="flex min-h-14 w-full items-center gap-3 rounded-lg py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CategoryIcon icon={option.icon} color={option.color} />
            <span className="min-w-0 flex-1 truncate font-medium text-base">{option.name}</span>
            <Money amount={option.balance} className="font-semibold text-base" />
          </button>
        </li>
      ))}
    </ul>
  </ResponsiveSheet>
);
