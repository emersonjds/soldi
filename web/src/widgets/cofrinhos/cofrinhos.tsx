"use client";

import { type CSSProperties, useState } from "react";

import { ArrowDownToLine, ArrowUpFromLine, Check, ChevronRight, Pencil, PiggyBank, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useArchiveCategory, useCategories } from "@/entities/category/categories-query";
import { CategorySheet } from "@/entities/category/category-sheet";
import { type Cofrinho, useCofrinhos, useMovements } from "@/entities/cofrinho/cofrinho-queries";
import { TransactionSheet } from "@/features/add-transaction/transaction-sheet";
import { EditBillSheet } from "@/features/edit-bill/edit-bill-sheet";
import { WithdrawForm } from "@/features/withdraw-cofrinho/withdraw-form";
import { cn } from "@/lib/utils";
import { hasProblem, type Schemas } from "@/shared/api/client";
import { useCurrency } from "@/shared/lib/currency";
import { monthYear, shortDay } from "@/shared/lib/date";
import { formatMoney, minusMoney, positiveAmount } from "@/shared/lib/money";
import { formatPct } from "@/shared/lib/percent";
import { BrandButton } from "@/shared/ui/brand-button";
import { CategoryIcon, categoryFill } from "@/shared/ui/category-icon";
import { Money } from "@/shared/ui/money";
import { PageError } from "@/shared/ui/page-state";
import { ResponsiveSheet } from "@/shared/ui/responsive-sheet";

const card = "flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6";

const caption = "font-semibold text-[11px] text-muted-foreground uppercase leading-4 tracking-[0.12em]";

/** `Faltam … · …/mês até jun 2027`, `Faltam … · Sem prazo`, or nothing without a goal or once it is met. */
const useGoalCaption = () => {
  const currency = useCurrency();
  return ({ target, balance, done, deadline, monthly_suggestion }: Cofrinho) => {
    if (!target || done) return null;
    const left = `Faltam ${formatMoney(minusMoney(target, balance), currency)}`;
    if (!deadline || !monthly_suggestion) return `${left} · Sem prazo`;
    return `${left} · ${formatMoney(monthly_suggestion, currency)}/mês até ${monthYear(deadline)}`;
  };
};

/** The template's Progress in the cofrinho's color; it keeps `value` off the root, so the meter reads aria-valuenow. */
const Bar = ({ cofrinho }: { cofrinho: Cofrinho }) => {
  const pct = Number(cofrinho.progress_pct ?? 0);
  const color: CSSProperties & { "--bar": string } = { "--bar": categoryFill(cofrinho.color) };
  return (
    <Progress
      value={pct}
      aria-label={`Progresso de ${cofrinho.name}`}
      aria-valuenow={pct}
      style={color}
      className="h-2 *:data-[slot=progress-indicator]:bg-(--bar)"
    />
  );
};

/** The balance, `de {meta}`, the bar and the caption: the card and the sheet show the same. */
const Balance = ({ cofrinho, large = false }: { cofrinho: Cofrinho; large?: boolean }) => {
  const goal = useGoalCaption()(cofrinho);
  return (
    <div className="flex flex-col gap-3">
      <p className="leading-8">
        <Money
          amount={cofrinho.balance}
          className={cn("font-bold tracking-[-0.02em]", large ? "text-[34px] leading-10" : "text-2xl leading-8")}
        />{" "}
        {cofrinho.target && (
          <span className="whitespace-nowrap text-muted-foreground">
            de <Money amount={cofrinho.target} />
          </span>
        )}
      </p>
      {cofrinho.target && <Bar cofrinho={cofrinho} />}
      {goal && <p className="text-muted-foreground text-sm">{goal}</p>}
    </div>
  );
};

const Status = ({ cofrinho }: { cofrinho: Cofrinho }) => {
  if (cofrinho.done)
    return (
      <span className="inline-flex items-center gap-1 font-medium text-income-text text-sm">
        <Check className="size-4" aria-hidden />
        Meta batida
      </span>
    );
  if (!cofrinho.progress_pct) return null;
  return <span className="text-muted-foreground text-sm tabular-nums">{formatPct(cofrinho.progress_pct, 0)}</span>;
};

const CofrinhoCard = ({ cofrinho, onOpen }: { cofrinho: Cofrinho; onOpen: () => void }) => (
  <li className="min-w-0">
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        card,
        "h-full w-full text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring",
      )}
    >
      <span className="flex items-center gap-3">
        <CategoryIcon icon={cofrinho.icon} color={cofrinho.color} className="size-11" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold text-base">{cofrinho.name}</span>
          <Status cofrinho={cofrinho} />
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </span>
      <Balance cofrinho={cofrinho} />
    </button>
  </li>
);

const Movements = ({ categoryId }: { categoryId: string }) => {
  const movements = useMovements(categoryId);

  if (movements.isError)
    return <PageError message="Não foi possível carregar os movimentos." onRetry={() => movements.refetch()} />;
  if (!movements.data)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    );
  if (movements.data.length === 0)
    return <p className="py-4 text-center text-muted-foreground">Nada guardado aqui ainda</p>;

  return (
    <ul aria-label="Movimentos" className="flex flex-col divide-y">
      {movements.data.map((movement) => {
        const resgate = movement.kind === "income";
        return (
          <li key={movement.id} className="flex min-h-14 items-center gap-3 py-2">
            <span
              aria-hidden
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full",
                resgate ? "bg-income-soft text-income" : "bg-secondary text-primary",
              )}
            >
              {resgate ? <ArrowUpFromLine className="size-4" /> : <ArrowDownToLine className="size-4" />}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium text-base">{resgate ? "Resgatado" : "Guardado"}</span>
              <span className="truncate text-muted-foreground text-xs">
                {movement.note ? `${shortDay(movement.date)} · ${movement.note}` : shortDay(movement.date)}
              </span>
            </span>
            <Money amount={movement.amount} income={resgate} className="font-semibold text-base" />
          </li>
        );
      })}
    </ul>
  );
};

type DetailProps = {
  cofrinho?: Cofrinho;
  onOpenChange: (open: boolean) => void;
  onSave: (cofrinho: Cofrinho) => void;
  onEdit: (cofrinho: Cofrinho) => void;
  onArchive: (cofrinho: Cofrinho) => void;
};

const action = "min-h-12 justify-start gap-3 text-base";

/** The cofrinho's sheet: Guardar, Resgatar, its movements, Editar and Excluir; `Sem objetivo` is only Economia. */
const CofrinhoDetail = ({ cofrinho, onOpenChange, onSave, onEdit, onArchive }: DetailProps) => {
  const [withdrawing, setWithdrawing] = useState(false);

  return (
    <ResponsiveSheet
      open={Boolean(cofrinho)}
      onOpenChange={(open) => {
        setWithdrawing(false);
        onOpenChange(open);
      }}
      title={cofrinho?.name ?? ""}
      description="Guardar, resgatar e ver os movimentos do cofrinho."
    >
      {cofrinho && (
        <>
          <Balance cofrinho={cofrinho} large />
          {withdrawing ? (
            <WithdrawForm
              cofrinho={cofrinho}
              onDone={() => setWithdrawing(false)}
              onCancel={() => setWithdrawing(false)}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <BrandButton onClick={() => onSave(cofrinho)}>
                  <ArrowDownToLine className="size-5" />
                  Guardar
                </BrandButton>
                <Button variant="outline" className="min-h-12 text-base" onClick={() => setWithdrawing(true)}>
                  <ArrowUpFromLine className="size-5" />
                  Resgatar
                </Button>
              </div>
              <section aria-labelledby="movements-title" className="flex flex-col gap-1">
                <h3 id="movements-title" className={caption}>
                  Movimentos
                </h3>
                <Movements categoryId={cofrinho.category_id} />
              </section>
              {!cofrinho.parent && (
                <div className="flex flex-col border-t pt-2">
                  <Button variant="ghost" className={action} onClick={() => onEdit(cofrinho)}>
                    <Pencil className="size-5" />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    className={cn(action, "text-destructive hover:text-destructive")}
                    onClick={() => onArchive(cofrinho)}
                  >
                    <Trash2 className="size-5" />
                    Excluir
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </ResponsiveSheet>
  );
};

const Total = ({ data }: { data: Schemas["Cofrinhos"] }) => {
  const currency = useCurrency();
  const month = data.saved_this_month;
  return (
    <section aria-labelledby="saved-total-title" className={cn(card, "flex-row items-center justify-between gap-4")}>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id="saved-total-title" className={caption}>
          Guardado
        </h2>
        <Money amount={data.total_saved} className="font-bold text-[34px] leading-10 tracking-[-0.02em]" />
        <p className="text-muted-foreground text-sm tabular-nums">
          Este mês {month.startsWith("-") ? "" : "+"}
          {formatMoney(month, currency)}
        </p>
      </div>
      <span
        aria-hidden
        className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary lg:size-16"
      >
        <PiggyBank className="size-7 lg:size-8" />
      </span>
    </section>
  );
};

export const CofrinhosSkeleton = () => (
  <div role="status" aria-label="Carregando" className="flex flex-col gap-6">
    <div className={card}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-48" />
    </div>
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {[0, 1].map((index) => (
        <div key={index} className={card}>
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-2 w-full" />
        </div>
      ))}
    </div>
  </div>
);

type Editing = { open: boolean; category?: Schemas["Category"] };

/** `Cofrinhos`: what is saved, one card per goal, and the sheets to create, fill, empty and archive them. */
export const CofrinhosView = () => {
  const cofrinhos = useCofrinhos();
  const categories = useCategories("bill");
  const archive = useArchiveCategory();
  const [selectedId, setSelectedId] = useState<string>();
  const [saving, setSaving] = useState<Schemas["Category"]>();
  const [editing, setEditing] = useState<Editing>({ open: false });
  const [archiving, setArchiving] = useState<string[]>([]);
  const economia = categories.data?.find((category) => category.is_savings);
  const categoryOf = (id: string) => categories.data?.find((category) => category.id === id);
  const items = (cofrinhos.data?.items ?? []).filter((item) => !archiving.includes(item.category_id));
  const selected = items.find((item) => item.category_id === selectedId);

  const create = () => setEditing({ open: true });

  // ponytail: no unarchive endpoint, so the DELETE waits for the toast, as in Ajustes › Categorias.
  const archiveLater = (id: string, balance: string) => {
    setSelectedId(undefined);
    if (positiveAmount(balance)) return toast.error("Resgate tudo antes de excluir");
    const restore = () => setArchiving((current) => current.filter((each) => each !== id));
    setArchiving((current) => [...current, id]);
    let undone = false;
    const commit = () => {
      if (undone) return;
      archive.mutate(id, {
        onError: (error) => {
          restore();
          toast.error(
            hasProblem(error, "cofrinho-not-empty")
              ? "Resgate tudo antes de excluir"
              : "Não foi possível excluir o cofrinho.",
          );
        },
      });
    };
    toast("Cofrinho excluído", {
      duration: 5000,
      action: {
        label: "Desfazer",
        onClick: () => {
          undone = true;
          restore();
        },
      },
      onAutoClose: commit,
      onDismiss: commit,
    });
  };

  const body = () => {
    if (cofrinhos.isError)
      return (
        <div className="rounded-2xl bg-card shadow-sm">
          <PageError message="Não foi possível carregar os cofrinhos." onRetry={() => cofrinhos.refetch()} />
        </div>
      );
    if (!cofrinhos.data) return <CofrinhosSkeleton />;
    return (
      <>
        <Total data={cofrinhos.data} />
        {items.length === 0 ? (
          <div className={cn(card, "items-center gap-3 px-6 py-10 text-center")}>
            <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
              <PiggyBank className="size-6" aria-hidden />
            </span>
            <p className="max-w-xs text-muted-foreground">Nenhum cofrinho ainda. Comece pela reserva de emergência.</p>
            <BrandButton className="w-auto px-6" onClick={create}>
              Criar cofrinho
            </BrandButton>
          </div>
        ) : (
          <ul aria-label="Cofrinhos" className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <CofrinhoCard key={item.category_id} cofrinho={item} onOpen={() => setSelectedId(item.category_id)} />
            ))}
          </ul>
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-bold text-[22px] leading-7 lg:text-[28px] lg:leading-9">Cofrinhos</h1>
        <Button variant="outline" className="min-h-11 rounded-full text-base text-primary" onClick={create}>
          <Plus className="size-5" />
          Novo cofrinho
        </Button>
      </div>
      {body()}
      <CofrinhoDetail
        cofrinho={selected}
        onOpenChange={(open) => !open && setSelectedId(undefined)}
        onSave={(cofrinho) => {
          setSelectedId(undefined);
          setSaving(categoryOf(cofrinho.category_id));
        }}
        onEdit={(cofrinho) => {
          setSelectedId(undefined);
          setEditing({ open: true, category: categoryOf(cofrinho.category_id) });
        }}
        onArchive={(cofrinho) => archiveLater(cofrinho.category_id, cofrinho.balance)}
      />
      <TransactionSheet
        open={Boolean(saving)}
        onOpenChange={(open) => !open && setSaving(undefined)}
        initialKind="bill"
        initialCategory={saving}
        billSheet={(props) => <EditBillSheet open {...props} />}
      />
      <CategorySheet
        kind="bill"
        open={editing.open}
        onOpenChange={(open) => setEditing((current) => ({ ...current, open }))}
        category={editing.category}
        parentId={economia?.id}
        onArchive={(category) =>
          archiveLater(category.id, items.find((item) => item.category_id === category.id)?.balance ?? "0")
        }
      />
    </div>
  );
};
