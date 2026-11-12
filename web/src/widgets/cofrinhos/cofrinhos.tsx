"use client";

import { useState } from "react";

import { ArrowDownToLine, ArrowUpFromLine, LayoutGrid, List, ListFilter, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useArchiveCategory, useCategories } from "@/entities/category/categories-query";
import { CategorySheet } from "@/entities/category/category-sheet";
import { type Cofrinho, useCofrinhos, useMovements } from "@/entities/cofrinho/cofrinho-queries";
import { TransactionSheet } from "@/features/add-transaction/transaction-sheet";
import { EditBillSheet } from "@/features/edit-bill/edit-bill-sheet";
import { WithdrawForm } from "@/features/withdraw-cofrinho/withdraw-form";
import { cn } from "@/lib/utils";
import { hasProblem, type Schemas } from "@/shared/api/client";
import { shortDay, todayISO } from "@/shared/lib/date";
import { positiveAmount } from "@/shared/lib/money";
import { cents } from "@/shared/lib/tier";
import { BrandButton } from "@/shared/ui/brand-button";
import { Money } from "@/shared/ui/money";
import { PageError } from "@/shared/ui/page-state";
import { ResponsiveSheet } from "@/shared/ui/responsive-sheet";

import { Balance, CofrinhoCard, CreateTile, focusOf, ReservaLivreCard } from "./cofrinho-card";
import { CofrinhoPicker, CofrinhosHero } from "./cofrinhos-hero";

const card = "flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6";

const caption = "font-semibold text-[11px] text-muted-foreground uppercase leading-4 tracking-[0.12em]";

type MovementsProps = { categoryId: string; nameOf?: (movement: Schemas["Transaction"]) => string };

const Movements = ({ categoryId, nameOf }: MovementsProps) => {
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
                {[shortDay(movement.date), nameOf?.(movement), movement.note].filter(Boolean).join(" · ")}
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
  saveDisabled: boolean;
  withdrawing: boolean;
  onWithdrawingChange: (withdrawing: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onSave: (cofrinho: Cofrinho) => void;
  onEdit: (cofrinho: Cofrinho) => void;
  onArchive: (cofrinho: Cofrinho) => void;
};

const action = "min-h-12 justify-start gap-3 text-base";

/** The cofrinho's sheet: Guardar, Resgatar, its movements, Editar and Excluir; `Sem objetivo` is only Economia. */
const CofrinhoDetail = ({
  cofrinho,
  saveDisabled,
  withdrawing,
  onWithdrawingChange: setWithdrawing,
  onOpenChange,
  onSave,
  onEdit,
  onArchive,
}: DetailProps) => (
  <ResponsiveSheet
    open={Boolean(cofrinho)}
    onOpenChange={onOpenChange}
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
            <div className="grid auto-cols-fr grid-flow-col gap-2">
              <BrandButton disabled={saveDisabled} onClick={() => onSave(cofrinho)}>
                <ArrowDownToLine className="size-5" />
                Guardar
              </BrandButton>
              {cents(cofrinho.balance) > 0 && (
                <Button variant="outline" className="min-h-12 text-base" onClick={() => setWithdrawing(true)}>
                  <ArrowUpFromLine className="size-5" />
                  Resgatar
                </Button>
              )}
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

export const CofrinhosSkeleton = () => (
  <div role="status" aria-label="Carregando" className="flex flex-col gap-6">
    <div className={card}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-48" />
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
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

type Filter = "all" | "progress" | "done" | "none";

const FILTERS: { key: Filter; label: string; empty?: string; keep: (item: Cofrinho) => boolean }[] = [
  { key: "all", label: "Todos", keep: () => true },
  {
    key: "progress",
    label: "Em andamento",
    empty: "Nenhum cofrinho em andamento.",
    keep: (item) => Boolean(item.target) && !item.done,
  },
  { key: "done", label: "Meta batida", empty: "Nenhum cofrinho com meta batida.", keep: (item) => item.done },
  { key: "none", label: "Sem meta", empty: "Nenhum cofrinho sem meta.", keep: (item) => !item.target },
];

const RESERVA_LIVRE = "Reserva Livre";

type ControlsProps = { filter: Filter; list: boolean; onFilter: (filter: Filter) => void; onList: () => void };

const GridControls = ({ filter, list, onFilter, onList }: ControlsProps) => {
  const active = FILTERS.find(({ key }) => key === filter)?.label;
  return (
    <div className="ml-auto flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            aria-label={`Filtrar: ${active}`}
            className="min-h-11 min-w-11 rounded-full px-3 text-base text-muted-foreground"
          >
            <ListFilter className="size-5" />
            {filter !== "all" && active}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto">
          <DropdownMenuRadioGroup value={filter}>
            {FILTERS.map(({ key, label }) => (
              <DropdownMenuRadioItem
                key={key}
                value={key}
                className="min-h-11 text-base"
                onSelect={() => onFilter(key)}
              >
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Ver em lista"
        aria-pressed={list}
        className="size-11 rounded-full text-muted-foreground"
        onClick={onList}
      >
        {list ? <LayoutGrid className="size-5" /> : <List className="size-5" />}
      </Button>
    </div>
  );
};

/** `Cofrinhos`: the total, one card per goal, Reserva Livre, the create tile, and the sheets to fill, empty and archive them. */
export const CofrinhosView = ({ month }: { month?: string }) => {
  const cofrinhos = useCofrinhos(month);
  const categories = useCategories("bill");
  const archive = useArchiveCategory();
  const [selectedId, setSelectedId] = useState<string>();
  const [withdrawing, setWithdrawing] = useState(false);
  const [saving, setSaving] = useState<Schemas["Category"]>();
  const [editing, setEditing] = useState<Editing>({ open: false });
  const [archiving, setArchiving] = useState<string[]>([]);
  const [picking, setPicking] = useState<"save" | "withdraw">();
  const [allMovements, setAllMovements] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [list, setList] = useState(false);
  const economia = categories.data?.find((category) => category.is_savings);
  const categoryOf = (id: string) => categories.data?.find((category) => category.id === id);
  const items = (cofrinhos.data?.items ?? [])
    .filter((item) => !archiving.includes(item.category_id))
    .map((item) => (item.parent ? { ...item, name: RESERVA_LIVRE } : item));
  const goals = items.filter((item) => !item.parent);
  const livre: Cofrinho = items.find((item) => item.parent) ?? {
    category_id: economia?.id ?? "",
    name: RESERVA_LIVRE,
    icon: "piggy-bank",
    color: economia?.color ?? "",
    balance: "0.00",
    done: false,
    parent: true,
  };
  const withdrawable = [...goals, livre].filter((item) => cents(item.balance) > 0);
  const selected = [...goals, livre].find((item) => item.category_id === selectedId);
  const { keep, empty } = FILTERS.find(({ key }) => key === filter) ?? FILTERS[0];
  const shown = goals.filter(keep);
  const today = todayISO();
  const focus = focusOf(goals, today);

  const create = () => setEditing({ open: true });
  const openCofrinho = (id: string, withdraw: boolean) => {
    setPicking(undefined);
    setWithdrawing(withdraw);
    setSelectedId(id);
  };
  const save = (id: string) => {
    if (categories.isError) {
      categories.refetch();
      return toast.error("Não foi possível carregar as categorias.");
    }
    setPicking(undefined);
    setSelectedId(undefined);
    setSaving(categoryOf(id));
  };
  const nameOf = (movement: Schemas["Transaction"]) => {
    const id = movement.cofrinho_id ?? movement.category.id;
    return [...goals, livre].find((item) => item.category_id === id)?.name ?? movement.category.name;
  };

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
        <CofrinhosHero
          data={{ ...cofrinhos.data, items }}
          firstUse={
            goals.length === 0 &&
            cents(cofrinhos.data.total_saved) === 0 &&
            cents(cofrinhos.data.saved_this_month) === 0
          }
          saveDisabled={categories.isPending}
          withdrawDisabled={withdrawable.length === 0}
          onSave={() => setPicking("save")}
          onWithdraw={() => setPicking("withdraw")}
          onMovements={() => setAllMovements(true)}
        />
        <section aria-labelledby="cofrinhos-grid-title" className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 font-semibold text-lg leading-6">
              <span id="cofrinhos-grid-title">Seus Cofrinhos</span>{" "}
              {goals.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-muted-foreground text-xs">
                  {goals.length} {goals.length === 1 ? "ativo" : "ativos"}
                </span>
              )}
            </h2>
            <GridControls filter={filter} list={list} onFilter={setFilter} onList={() => setList(!list)} />
          </div>
          {empty && shown.length === 0 && <p className="text-muted-foreground">{empty}</p>}
          <ul aria-label="Cofrinhos" className={cn("grid gap-4", !list && "lg:grid-cols-2 xl:grid-cols-3")}>
            {shown.map((item) => (
              <CofrinhoCard
                key={item.category_id}
                cofrinho={item}
                focus={item.category_id === focus}
                today={today}
                disabled={categories.isPending}
                onSave={() => save(item.category_id)}
                onWithdraw={() => openCofrinho(item.category_id, true)}
                onMovements={() => openCofrinho(item.category_id, false)}
                onEdit={() => setEditing({ open: true, category: categoryOf(item.category_id) })}
                onArchive={() => archiveLater(item.category_id, item.balance)}
              />
            ))}
            {keep(livre) && (
              <ReservaLivreCard
                cofrinho={livre}
                disabled={categories.isPending}
                onSave={() => save(livre.category_id)}
                onWithdraw={() => openCofrinho(livre.category_id, true)}
              />
            )}
            <CreateTile onCreate={create} />
          </ul>
        </section>
      </>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
            POUPANÇA ATIVA & FUTURO
          </p>
          <h1 className="font-bold text-[22px] leading-7 lg:text-[28px] lg:leading-9">Cofrinhos & Metas de Poupança</h1>
        </div>
        <BrandButton className="w-auto px-5" onClick={create}>
          <Plus className="size-5" />
          Novo Cofrinho
        </BrandButton>
      </div>
      {body()}
      <CofrinhoPicker
        title={picking === "withdraw" ? "Resgatar" : "Guardar Dinheiro"}
        options={picking === "withdraw" ? withdrawable : [...goals, livre]}
        open={Boolean(picking)}
        onOpenChange={(open) => !open && setPicking(undefined)}
        onPick={(cofrinho) =>
          picking === "withdraw" ? openCofrinho(cofrinho.category_id, true) : save(cofrinho.category_id)
        }
      />
      <ResponsiveSheet
        open={allMovements}
        onOpenChange={setAllMovements}
        title="Movimentos"
        description="Os movimentos de todos os cofrinhos."
      >
        {categories.isError ? (
          <PageError message="Não foi possível carregar as categorias." onRetry={() => categories.refetch()} />
        ) : (
          economia && <Movements categoryId={economia.id} nameOf={nameOf} />
        )}
      </ResponsiveSheet>
      <CofrinhoDetail
        cofrinho={selected}
        saveDisabled={categories.isPending}
        withdrawing={withdrawing}
        onWithdrawingChange={setWithdrawing}
        onOpenChange={(open) => !open && setSelectedId(undefined)}
        onSave={(cofrinho) => save(cofrinho.category_id)}
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
