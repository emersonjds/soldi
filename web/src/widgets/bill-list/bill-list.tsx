"use client";

import { useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CirclePlus, MoreVertical, Pencil, ReceiptText, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasEnded } from "@/entities/bill/bill-plan";
import { type Bill, useBills, useUpdateBill } from "@/entities/bill/bill-queries";
import { statusPill } from "@/entities/bill/bill-status";
import { categoriesQuery, categoryLabel } from "@/entities/category/categories-query";
import { useMonth } from "@/entities/month/month-query";
import { ALL_BILLS_PAID } from "@/entities/month/schedule";
import { BillFormPanel, EditBillSheet, useArchiveLater } from "@/features/edit-bill/edit-bill-sheet";
import { useIsXl } from "@/hooks/use-xl";
import { cn } from "@/lib/utils";
import { problemMessage, type Schemas } from "@/shared/api/client";
import { monthAbbrev, monthName, todayISO } from "@/shared/lib/date";
import { wholeShare } from "@/shared/lib/percent";
import { cents, fromCents } from "@/shared/lib/tier";
import { BrandButton } from "@/shared/ui/brand-button";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { DashCard } from "@/shared/ui/dash-card";
import { Money } from "@/shared/ui/money";
import { PageError, PageLoading } from "@/shared/ui/page-state";

/** A card (D28) has no amount: Contas fixas shows its days instead and leaves it out of the total. */
const hasAmount = (bill: Bill): bill is Bill & { amount: string } => bill.amount != null;

type Filter = "all" | "active" | "paused";
type Sort = "due" | "amount" | "name";

const isFilter = (value: string): value is Filter => value === "all" || value === "active" || value === "paused";
const isSort = (value: string): value is Sort => value === "due" || value === "amount" || value === "name";

const SORTS: Record<Sort, (a: Bill, b: Bill) => number> = {
  due: (a, b) => a.due_day - b.due_day,
  amount: (a, b) => cents(b.amount ?? "0") - cents(a.amount ?? "0"),
  name: (a, b) => a.name.localeCompare(b.name, "pt-BR"),
};

const COLUMNS = "lg:grid-cols-[minmax(0,1fr)_6rem_9rem_7rem]";
const pill = "rounded-full px-2.5 py-0.5 font-semibold text-xs";
const select = "[&_select]:h-11 [&_select]:rounded-xl [&_select]:bg-card [&_select]:text-base";

const Row = ({
  bill,
  category,
  label,
  wide,
  active,
  saving,
  onEdit,
  onArchive,
  onToggle,
}: {
  bill: Bill;
  category?: Schemas["Category"];
  label?: string;
  /** The form sits beside the list. */
  wide: boolean;
  active: boolean;
  saving: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onToggle: (active: boolean) => void;
}) => {
  // Editar moves focus to the form, so the menu must not hand it back to ⋮; Radix holds it in the menu until it closes.
  const editing = useRef(false);
  const parcelado = bill.installments != null;
  let end: string | undefined;
  if (bill.last_month && hasEnded(bill, todayISO())) end = `terminou em ${monthAbbrev(bill.last_month)}`;
  else if (bill.last_month && parcelado) end = `até ${monthAbbrev(bill.last_month)}`;
  return (
    <li
      className={cn(
        "border-border/60 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 border-t px-3 py-3 first:border-t-0 lg:px-6",
        COLUMNS,
      )}
    >
      <button
        type="button"
        onClick={onEdit}
        className="focus-visible:outline-ring col-span-3 flex min-h-11 min-w-0 items-center gap-3 rounded-xl text-left focus-visible:outline-2 lg:col-span-1"
      >
        <CategoryIcon icon={category?.icon ?? ""} color={category?.color ?? ""} />
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2">
            <span
              className={cn("line-clamp-2 text-base font-semibold break-words", !active && "text-muted-foreground")}
              title={bill.name}
            >
              {bill.name}
            </span>
            {end && (
              <>
                {" "}
                <span className="text-muted-foreground text-sm whitespace-nowrap">· {end}</span>
              </>
            )}
            {bill.variable && (
              <>
                {" "}
                <span className="text-muted-foreground text-sm whitespace-nowrap">· valor variável</span>
              </>
            )}
            {!active && !parcelado && (
              <span className={cn(statusPill, "bg-muted text-muted-foreground min-h-6 shrink-0")}>Pausada</span>
            )}
          </span>
          {label && <span className="text-muted-foreground truncate text-xs">{label}</span>}
        </span>
      </button>
      {hasAmount(bill) ? (
        <>
          <span className={cn(pill, "bg-muted text-muted-foreground justify-self-start")}>
            Dia {String(bill.due_day).padStart(2, "0")}
          </span>
          <span className="justify-self-end text-base leading-6 whitespace-nowrap">
            {bill.variable && <span aria-hidden>≈ </span>}
            <Money
              amount={bill.amount}
              size="figure"
              className={cn("text-base leading-6", !active && "text-muted-foreground line-through")}
            />
          </span>
        </>
      ) : (
        <span className="text-muted-foreground col-span-2 text-sm">
          Fecha dia {bill.closing_day} · vence dia {bill.due_day}
        </span>
      )}
      <span className="flex items-center justify-end">
        {hasAmount(bill) && !parcelado && (
          <Switch
            aria-label={`Ativa: ${bill.name}`}
            checked={active}
            disabled={saving}
            onCheckedChange={onToggle}
            className="mx-2 shrink-0 after:-inset-y-3.5"
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Mais ações de ${bill.name}`}
              className="text-muted-foreground size-11 shrink-0 rounded-full"
            >
              <MoreVertical className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-auto"
            onCloseAutoFocus={(event) => {
              if (!editing.current) return;
              editing.current = false;
              event.preventDefault();
              if (wide) document.getElementById("bill-name")?.focus();
            }}
          >
            <DropdownMenuItem
              className="min-h-11 text-base"
              onSelect={() => {
                editing.current = true;
                onEdit();
              }}
            >
              <Pencil />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 text-base" variant="destructive" onSelect={onArchive}>
              <Trash2 />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </li>
  );
};

/** Days from `today` to `date`, as the Próximo Vencimento pill reads them. */
const dueIn = (date: string, today: string) => {
  const days = (Date.parse(date) - Date.parse(today)) / 86_400_000;
  if (days < 0) return "Vencida";
  if (days === 0) return "Hoje";
  if (days === 1) return "Amanhã";
  return `Em ${days} dias`;
};

const NextDue = ({ rows: month, today }: { rows: Schemas["BillOfMonth"][]; today: string }) => {
  const rows = month.filter((row) => !row.is_card);
  // D17: a bill registered after its day this month is not owed until next month.
  const owed = rows.filter((row) => !row.paid && (row.overdue || row.due_date >= today));
  const next = owed.sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const when = next && dueIn(next.due_date, today);
  return (
    <DashCard
      label="Próximo Vencimento"
      title={
        <>
          Próximo Vencimento
          {when && (
            <span
              className={cn(
                pill,
                "ml-auto",
                when === "Vencida" ? "bg-expense-soft text-expense-text" : "bg-secondary text-primary",
              )}
            >
              {when}
            </span>
          )}
        </>
      }
    >
      {next ? (
        <p className="flex flex-col gap-1">
          <span className="line-clamp-2 text-base font-bold break-words" title={next.name}>
            {next.name}
          </span>
          <Money amount={next.amount} className="text-lg font-bold" />
          <span className="text-muted-foreground mt-2 flex items-center gap-1.5 text-sm">
            <CalendarDays className="size-4" aria-hidden />
            Vence no dia {next.due_date.slice(8)}
          </span>
        </p>
      ) : (
        <p className="text-muted-foreground">
          {rows.length > 0 && rows.every((row) => row.paid) ? ALL_BILLS_PAID : "Nada a vencer este mês"}
        </p>
      )}
    </DashCard>
  );
};

/** Spec 2026-11-11 §8.2: the active bills' total against the switcher month's income, and the next bill due this month. */
const Summary = ({ active, month }: { active: (Bill & { amount: string })[]; month: string }) => {
  const today = todayISO();
  const viewed = useMonth(month);
  const current = useMonth(today.slice(0, 7));
  const total = active.reduce((sum, bill) => sum + cents(bill.amount), 0);
  const income = viewed.data ? cents(viewed.data.totals.income) : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <DashCard
        label="Total de Despesas Fixas"
        title={
          <>
            Total de Despesas Fixas
            <span className={cn(pill, "bg-secondary text-primary ml-auto")}>
              {active.length === 1 ? "1 conta" : `${active.length} contas`}
            </span>
          </>
        }
      >
        <Money amount={fromCents(total)} size="figure" />
        {viewed.data && total > 0 && (
          <p className="mt-3 flex items-center gap-2 text-sm">
            {income > 0 ? (
              <>
                <span className="bg-expense size-2 shrink-0 rounded-full" aria-hidden />
                <span>
                  Compromete <strong>{wholeShare(total, income)}%</strong> da renda líquida
                </span>
              </>
            ) : (
              `Sem entradas em ${monthName(`${month}-01`, today)}`
            )}
          </p>
        )}
      </DashCard>
      {current.data && <NextDue rows={current.data.bills_of_month} today={today} />}
    </div>
  );
};

/** Spec 2026-11-11 §8: Contas fixas, the summary, the filtered list and, from 1280 px, the form beside it. */
export const BillList = ({ month }: { month: string }) => {
  const bills = useBills({ includeInactive: true });
  const categories = useQuery(categoriesQuery);
  const update = useUpdateBill();
  const wide = useIsXl();
  const [toggled, setToggled] = useState<Record<string, boolean | undefined>>({});
  const [selected, setSelected] = useState<Bill>();
  const [editing, setEditing] = useState(false);
  const [opened, setOpened] = useState(0);
  const [archiving, setArchiving] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("due");

  const isActive = (bill: Bill) => (toggled[bill.id] ?? bill.active) && !hasEnded(bill, todayISO());
  const isSaving = (bill: Bill) => toggled[bill.id] !== undefined;

  const edit = (bill?: Bill) => {
    setSelected(bill && { ...bill, active: isActive(bill) });
    setOpened((count) => count + 1);
    if (!wide) setEditing(true);
  };

  const archiveLater = useArchiveLater(
    (id) => setArchiving((ids) => [...ids, id]),
    (id) => setArchiving((ids) => ids.filter((each) => each !== id)),
  );

  const settle = (id: string) => setToggled((current) => ({ ...current, [id]: undefined }));

  // mutateAsync: mutate's own callbacks fire only for the latest call, and two rows can be toggled at once.
  const send = (bill: Bill, active: boolean, onSaved?: () => void) =>
    update
      .mutateAsync({ id: bill.id, active })
      .then(onSaved, (error) => toast.error(problemMessage(error) ?? "Não foi possível salvar."))
      .finally(() => settle(bill.id));

  // D17: resuming sets active_since to today and drops the bill's overdue occurrences, so the pause waits for the toast like useArchiveLater and Desfazer sends nothing.
  const pauseLater = (bill: Bill) => {
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      void send(bill, false);
    };
    toast("Conta pausada", {
      duration: 5000,
      action: {
        label: "Desfazer",
        onClick: () => {
          done = true;
          settle(bill.id);
        },
      },
      onAutoClose: commit,
      onDismiss: commit,
    });
  };

  const toggle = (bill: Bill, active: boolean) => {
    setToggled((current) => ({ ...current, [bill.id]: active }));
    if (!active) return pauseLater(bill);
    void send(bill, true, () =>
      toast("Conta reativada", {
        duration: 5000,
        action: { label: "Desfazer", onClick: () => toggle(bill, false) },
      }),
    );
  };

  const choose = (value: string) => isFilter(value) && setFilter(value);

  if (bills.isError)
    return <PageError message="Não foi possível carregar as contas." onRetry={() => bills.refetch()} />;
  if (!bills.data) return <PageLoading />;

  const visible = bills.data.filter((bill) => !archiving.includes(bill.id));
  const active = visible.filter(isActive);
  const ordered = [...visible].sort((a, b) => Number(!isActive(a)) - Number(!isActive(b)) || SORTS[sort](a, b));
  const shown = ordered.filter((bill) => filter === "all" || (filter === "active") === isActive(bill));
  const categoryOf = (bill: Bill) => categories.data?.find((each) => each.id === bill.category_id);

  const list = (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="bg-card flex flex-col gap-3 rounded-2xl p-2 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={filter} onValueChange={choose}>
          <TabsList className="h-auto w-full lg:w-auto">
            <TabsTrigger value="all" className="min-h-11 px-3 text-sm">
              Todas ({visible.length})
            </TabsTrigger>
            <TabsTrigger value="active" className="min-h-11 px-3 text-sm">
              Despesas ({active.length})
            </TabsTrigger>
            <TabsTrigger value="paused" className="min-h-11 px-3 text-sm">
              Pausadas ({visible.length - active.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <label
          htmlFor="bills-sort"
          className="text-muted-foreground flex items-center gap-2 px-2 text-xs font-semibold tracking-[0.12em] uppercase"
        >
          Ordenação:
          <NativeSelect
            id="bills-sort"
            aria-label="Ordenação"
            value={sort}
            onChange={(event) => isSort(event.target.value) && setSort(event.target.value)}
            className={cn(
              select,
              "[&_select]:text-foreground tracking-normal normal-case [&_select]:border-0 [&_select]:font-semibold",
            )}
          >
            <NativeSelectOption value="due">Vencimento</NativeSelectOption>
            <NativeSelectOption value="amount">Valor</NativeSelectOption>
            <NativeSelectOption value="name">Nome</NativeSelectOption>
          </NativeSelect>
        </label>
      </div>
      <div className="bg-card flex flex-col rounded-2xl shadow-sm">
        <div
          className={cn(
            "bg-muted text-muted-foreground hidden gap-x-3 rounded-t-2xl px-6 py-3 text-xs font-semibold tracking-[0.08em] uppercase lg:grid",
            COLUMNS,
          )}
        >
          <span>Conta / Categoria</span>
          <span>Vencimento</span>
          <span className="text-right">Valor mensal</span>
          <span className="text-right">Ação / Status</span>
        </div>
        {shown.length === 0 ? (
          <p className="text-muted-foreground px-6 py-8 text-center">
            {filter === "paused" ? "Nenhuma conta pausada." : "Nenhuma conta ativa."}
          </p>
        ) : (
          <ul aria-label="Contas fixas" className="flex flex-col">
            {shown.map((bill) => {
              const category = categoryOf(bill);
              return (
                <Row
                  key={bill.id}
                  bill={bill}
                  category={category}
                  label={category && categoryLabel(category, categories.data)}
                  wide={wide}
                  active={isActive(bill)}
                  saving={isSaving(bill)}
                  onEdit={() => edit(bill)}
                  onArchive={() => archiveLater(bill)}
                  onToggle={(next) => toggle(bill, next)}
                />
              );
            })}
          </ul>
        )}
        <footer className="border-border/60 text-muted-foreground flex flex-col gap-2 border-t px-6 py-4 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span>
            Mostrando {shown.length} de {visible.length} contas fixas configuradas
          </span>
          <span className="text-income-text flex items-center gap-1.5 font-medium">
            <ShieldCheck className="size-4" aria-hidden />
            Sincronizado com projeção de caixa
          </span>
        </footer>
      </div>
    </section>
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] leading-7 font-bold lg:text-[28px] lg:leading-9">Contas Fixas Recorrentes</h1>
          <p className="text-muted-foreground">Despesas mensais que compõem sua base fixa de orçamento.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {visible.length > 0 && (
            <label
              htmlFor="bills-status"
              className="bg-card flex items-center gap-2 rounded-xl px-3 text-base shadow-sm"
            >
              Status:
              <NativeSelect
                id="bills-status"
                aria-label="Status"
                value={filter}
                onChange={(event) => choose(event.target.value)}
                className={cn(select, "flex-1 [&_select]:border-0")}
              >
                <NativeSelectOption value="all">Todos</NativeSelectOption>
                <NativeSelectOption value="active">Ativas</NativeSelectOption>
                <NativeSelectOption value="paused">Pausadas</NativeSelectOption>
              </NativeSelect>
            </label>
          )}
          <BrandButton className="sm:w-auto sm:px-6" onClick={() => edit()}>
            <CirclePlus className="size-5" />
            Nova Conta Fixa
          </BrandButton>
        </div>
      </header>
      {visible.length > 0 && <Summary active={active.filter(hasAmount)} month={month} />}
      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        {visible.length === 0 ? (
          <div className="bg-card flex flex-col items-center gap-3 rounded-2xl px-4 py-10 text-center shadow-sm">
            <span className="bg-secondary text-primary flex size-12 items-center justify-center rounded-full">
              <ReceiptText className="size-6" aria-hidden />
            </span>
            <p className="text-muted-foreground">Nenhuma conta fixa ainda</p>
          </div>
        ) : (
          list
        )}
        {wide && (
          <BillFormPanel
            key={`${selected?.id ?? "new"}-${opened}`}
            bill={selected}
            autoFocus={opened > 0}
            onArchive={archiveLater}
            onDone={() => {
              setSelected(undefined);
              setOpened((count) => count + 1);
            }}
          />
        )}
      </div>
      {!wide && <EditBillSheet open={editing} onOpenChange={setEditing} bill={selected} onArchive={archiveLater} />}
    </div>
  );
};
