"use client";

import { useId } from "react";

import { CalendarDays, Check, History, Lock, MoreVertical, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CofrinhoBar } from "@/entities/cofrinho/cofrinho-bar";
import type { Cofrinho } from "@/entities/cofrinho/cofrinho-queries";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/shared/lib/currency";
import { addMonths, monthYear } from "@/shared/lib/date";
import { formatMoney, minusMoney } from "@/shared/lib/money";
import { formatPct } from "@/shared/lib/percent";
import { cents } from "@/shared/lib/tier";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { Money } from "@/shared/ui/money";

export const tile = "flex h-full flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6";

const monthsBetween = (from: string, to: string) =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));

/** The goal with the nearest future deadline; the API has no creation date, so a tie goes to the first listed. */
export const focusOf = (items: Cofrinho[], today: string) =>
  items
    .filter((item) => item.target && !item.done && (item.deadline ?? "") > today)
    .reduce<Cofrinho | undefined>(
      (nearest, item) => (nearest && (nearest.deadline ?? "") <= (item.deadline ?? "") ? nearest : item),
      undefined,
    )?.category_id;

/** `Faltam … · …/mês até jun 2027`, `Faltam … · Sem prazo`, or nothing without a goal or once it is met. */
const GoalCaption = ({ cofrinho }: { cofrinho: Cofrinho }) => {
  const currency = useCurrency();
  const { target, balance, done, deadline, monthly_suggestion } = cofrinho;
  if (!target || done) return null;
  return (
    <p className="text-muted-foreground text-sm">
      Faltam{" "}
      <strong className="font-semibold text-foreground">{formatMoney(minusMoney(target, balance), currency)}</strong> ·{" "}
      {deadline && monthly_suggestion ? (
        <>
          <span className="font-semibold text-income-text">{formatMoney(monthly_suggestion, currency)}/mês</span> até{" "}
          {monthYear(deadline)}
        </>
      ) : (
        "Sem prazo"
      )}
    </p>
  );
};

/** The balance, `de {meta}`, the bar and the caption: the card and the sheet show the same. */
export const Balance = ({ cofrinho, large = false }: { cofrinho: Cofrinho; large?: boolean }) => (
  <div className="flex flex-col gap-3">
    <p>
      <Money amount={cofrinho.balance} size={large ? "hero" : "figure"} />{" "}
      {cofrinho.target && (
        <span className="whitespace-nowrap text-muted-foreground text-sm">
          de <Money amount={cofrinho.target} />
        </span>
      )}
    </p>
    {cofrinho.target && <CofrinhoBar cofrinho={cofrinho} />}
    <GoalCaption cofrinho={cofrinho} />
  </div>
);

const badge = "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold text-xs";
const Dot = () => <span aria-hidden className="size-1.5 rounded-full bg-current" />;

const Badge = ({ cofrinho, focus, today }: { cofrinho: Cofrinho; focus: boolean; today: string }) => {
  const pct = cofrinho.progress_pct ? ` · ${formatPct(cofrinho.progress_pct, 0)}` : "";
  const yearOut = `${addMonths(today.slice(0, 7), 12)}${today.slice(7)}`;
  if (cofrinho.done)
    return (
      <span className={cn(badge, "bg-income-soft text-income-text")}>
        <Check className="size-3.5" aria-hidden />
        Meta batida
      </span>
    );
  if (focus)
    return (
      <span className={cn(badge, "bg-secondary text-primary")}>
        <Dot />
        Foco atual{pct}
      </span>
    );
  if (!cofrinho.target || !cofrinho.deadline || cofrinho.deadline > yearOut)
    return <span className={cn(badge, "bg-muted text-muted-foreground")}>Longo prazo{pct}</span>;
  return (
    <span className={cn(badge, "bg-income-soft text-income-text")}>
      <Dot />
      Em andamento{pct}
    </span>
  );
};

const chip = "flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-muted-foreground text-sm";

const InfoChip = ({ cofrinho, today }: { cofrinho: Cofrinho; today: string }) => {
  const currency = useCurrency();
  const next = cofrinho.next_contribution;
  if (next) {
    // The DTO carries only the day of the month: no weekday or month to name.
    const when = { month: `todo dia ${String(next.day).padStart(2, "0")}`, week: "toda semana", year: "todo ano" };
    return (
      <p className={chip}>
        <RefreshCw className="size-4 shrink-0" aria-hidden />
        Aporte automático: {formatMoney(next.amount, currency)} {when[next.every]}
      </p>
    );
  }
  if (cents(cofrinho.balance) !== 0 || !cofrinho.deadline || cofrinho.deadline <= today) return null;
  const months = Math.max(1, monthsBetween(today, cofrinho.deadline));
  return (
    <p className={chip}>
      <CalendarDays className="size-4 shrink-0" aria-hidden />
      Prazo: {months} {months === 1 ? "mês" : "meses"}
    </p>
  );
};

type MenuProps = { name: string; onMovements: () => void; onEdit: () => void; onArchive: () => void };

const item = "min-h-11 text-base";

const CardMenu = ({ name, onMovements, onEdit, onArchive }: MenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Mais ações de ${name}`}
        className="ml-auto size-11 shrink-0 rounded-full text-muted-foreground"
      >
        <MoreVertical className="size-5" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-auto max-w-72">
      <DropdownMenuItem className={item} onSelect={onMovements}>
        <History />
        Movimentos
      </DropdownMenuItem>
      <DropdownMenuItem className={item} onSelect={onEdit}>
        <Pencil />
        Editar
      </DropdownMenuItem>
      <DropdownMenuItem variant="destructive" className={item} onSelect={onArchive}>
        <Trash2 />
        Excluir
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

type Actions = { disabled: boolean; onSave: () => void; onWithdraw: () => void };

type CardProps = Actions & Omit<MenuProps, "name"> & { cofrinho: Cofrinho; focus: boolean; today: string };

const action = "min-h-11 px-4 text-base";

export const CofrinhoCard = ({ cofrinho, focus, today, disabled, onSave, onWithdraw, ...menu }: CardProps) => {
  const id = useId();
  const empty = cents(cofrinho.balance) === 0;
  return (
    <li className="min-w-0">
      <section aria-labelledby={id} className={tile}>
        <div className="flex items-start justify-between gap-3">
          <CategoryIcon
            icon={cofrinho.icon}
            color={cofrinho.color}
            tintedOnDesktop
            className="size-12 rounded-2xl bg-(--cat)/15 text-(--cat)"
          />
          <Badge cofrinho={cofrinho} focus={focus} today={today} />
        </div>
        <h3 id={id} className="font-semibold text-lg leading-6">
          {cofrinho.name}
        </h3>
        <Balance cofrinho={cofrinho} />
        <InfoChip cofrinho={cofrinho} today={today} />
        <div className="mt-auto flex items-center gap-2">
          {empty ? (
            <Button variant="secondary" className={cn(action, "flex-1")} disabled={disabled} onClick={onSave}>
              <Plus className="size-5" />
              Guardar primeiro valor <span className="sr-only">em {cofrinho.name}</span>
            </Button>
          ) : (
            <>
              <Button variant="secondary" className={action} disabled={disabled} onClick={onSave}>
                <Plus className="size-5" />
                Guardar <span className="sr-only">em {cofrinho.name}</span>
              </Button>
              <Button variant="ghost" className={action} disabled={disabled} onClick={onWithdraw}>
                Resgatar <span className="sr-only">de {cofrinho.name}</span>
              </Button>
            </>
          )}
          <CardMenu name={cofrinho.name} {...menu} />
        </div>
      </section>
    </li>
  );
};

/** The Economia parent: money saved without a goal. */
export const ReservaLivreCard = ({ cofrinho, disabled, onSave, onWithdraw }: Actions & { cofrinho: Cofrinho }) => {
  const id = useId();
  return (
    <li className="min-w-0">
      <section aria-labelledby={id} className={tile}>
        <span aria-hidden className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary">
          <Lock className="size-6" />
        </span>
        <h3 id={id} className="font-semibold text-lg leading-6">
          {cofrinho.name}
        </h3>
        <p>
          <Money amount={cofrinho.balance} size="figure" />{" "}
          <span className="text-muted-foreground text-sm">sem teto fixado</span>
        </p>
        <p className="text-muted-foreground text-sm">
          Dinheiro guardado sem meta vinculada, para oportunidades ou despesas pontuais.
        </p>
        <div className="mt-auto flex items-center gap-2">
          <Button variant="secondary" className={cn(action, "flex-1")} disabled={disabled} onClick={onSave}>
            <Plus className="size-5" />
            Adicionar saldo livre
          </Button>
          {cents(cofrinho.balance) > 0 && (
            <Button variant="ghost" className={action} disabled={disabled} onClick={onWithdraw}>
              Resgatar <span className="sr-only">de {cofrinho.name}</span>
            </Button>
          )}
        </div>
      </section>
    </li>
  );
};

export const CreateTile = ({ onCreate }: { onCreate: () => void }) => {
  const id = useId();
  return (
    <li className="min-w-0">
      <section
        aria-labelledby={id}
        className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center"
      >
        <span
          aria-hidden
          className="flex size-12 items-center justify-center rounded-2xl bg-card text-primary shadow-sm"
        >
          <Plus className="size-6" />
        </span>
        <h3 id={id} className="font-semibold text-lg leading-6">
          Criar novo objetivo ou sonho
        </h3>
        <p className="max-w-xs text-muted-foreground text-sm">Defina meta, prazo e acompanhe a evolução.</p>
        <Button variant="outline" className="min-h-11 rounded-full px-5 text-base text-primary" onClick={onCreate}>
          Começar objetivo
        </Button>
      </section>
    </li>
  );
};
