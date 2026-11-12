"use client";

import { useEffect, useState } from "react";

import { Calculator, CreditCard, Delete, History, Info, Lightbulb, PieChart, RotateCcw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCards } from "@/entities/bill/bill-queries";
import { CategoryChips, useCategoryChips } from "@/entities/category/category-chips";
import { useForecast } from "@/entities/forecast/forecast-query";
import { useMonth } from "@/entities/month/month-query";
import { useTransactions } from "@/entities/transaction/transaction-queries";
import { useMe } from "@/entities/user/session";
import type { Schemas } from "@/shared/api/client";
import { useCurrency } from "@/shared/lib/currency";
import { addMonths, lastDay, monthName, monthSlashYear, slashDate, todayISO } from "@/shared/lib/date";
import { formatMoney, positiveAmount } from "@/shared/lib/money";
import { formatPct, wholeShare } from "@/shared/lib/percent";
import { clearHistory, pushHistory, readHistory, type SavedSimulation } from "@/shared/lib/simulation-history";
import { cents, fromCents } from "@/shared/lib/tier";
import { BrandButton } from "@/shared/ui/brand-button";
import { DateField } from "@/shared/ui/date-field";
import { HeroAmount } from "@/shared/ui/hero-amount";
import { ResponsiveSheet } from "@/shared/ui/responsive-sheet";

import { draftRows } from "./draft-rows";
import { monthOnly, Results } from "./results";

const COUNTS = [
  { value: "1", label: "À vista" },
  { value: "6", label: "6x" },
  { value: "10", label: "10x" },
  { value: "12", label: "12x" },
];

const caption = "font-semibold text-muted-foreground text-xs uppercase tracking-wider";
const label = "font-medium text-sm";

/** `2026-11-10` → `10 de Novembro, 2026`. */
const longDate = (date: string) => `${Number(date.slice(8))} de ${monthOnly(date)}, ${date.slice(0, 4)}`;

type Inputs = { amount: string; count: number; date: string; cardId: string; category?: Schemas["Category"] };

/** `date` empty: the forecast's today. */
const blank = (): Inputs => ({ amount: "", count: 1, date: "", cardId: "" });

/** Posso comprar isso? (D16): a purchase over the forecast, nothing written; results only after Calcular Projeção. */
export const PurchaseSimulator = () => {
  const [inputs, setInputs] = useState(blank);
  const [shown, setShown] = useState(false);
  const [history, setHistory] = useState<SavedSimulation[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const userId = useMe().data?.id;
  const currency = useCurrency();
  const today = useForecast().data?.today ?? todayISO();
  const lastMonth = addMonths(today.slice(0, 7), 11);
  const date = inputs.date || today;
  const thisMonth = useTransactions(today.slice(0, 7));
  const income = useMonth(today.slice(0, 7)).data?.totals.income;
  const cards = useCards().data ?? [];
  const chips = useCategoryChips("daily");
  const category = inputs.category ?? chips.data?.[0];
  const card = cards.find(({ id }) => id === inputs.cardId);
  const amount = positiveAmount(inputs.amount);
  const drafted = amount ? draftRows({ amount, date, count: inputs.count, card }) : null;
  // A parcela at zero cents is no purchase.
  const rows = drafted?.every((row) => row.cents < 0) ? drafted : null;
  const fatura = useMonth(card && rows ? rows[0].date.slice(0, 7) : today.slice(0, 7));
  const paid = Boolean(
    card && rows && fatura.data?.bills_of_month.some((bill) => bill.is_card && bill.bill_id === card.id && bill.paid),
  );
  const parcela = rows ? -rows[0].cents : 0;
  const money = (value: number) => formatMoney(fromCents(value), currency);

  const set = (patch: Partial<Inputs>) => {
    setInputs((current) => ({ ...current, ...patch }));
    setShown(false);
  };

  useEffect(() => {
    if (userId) setHistory(readHistory(userId));
  }, [userId]);

  const calculate = () => {
    setShown(true);
    if (!userId) return;
    const { amount, count, date, cardId } = inputs;
    setHistory(
      pushHistory(userId, { amount, count, date, cardId, categoryId: category?.id, at: new Date().toISOString() }),
    );
  };
  const categoryOf = (entry: SavedSimulation) => chips.data?.find(({ id }) => id === entry.categoryId);
  /** A card or category gone since falls back to `Nenhum` / the first chip (P10-3). */
  const restore = (entry: SavedSimulation) => {
    const cardId = cards.some(({ id }) => id === entry.cardId) ? entry.cardId : "";
    setInputs({ amount: entry.amount, count: entry.count, date: entry.date, cardId, category: categoryOf(entry) });
    setShown(true);
    setBrowsing(false);
  };
  const forget = () => {
    if (userId) clearHistory(userId);
    setHistory([]);
    setBrowsing(false);
  };

  const infoOf = () => {
    if (!rows) return null;
    if (inputs.count === 1) return `Pagamento único em ${longDate(rows[0].date)}.`;
    return `${inputs.count} parcelas de ${money(parcela)} a partir de ${monthSlashYear(rows[0].date)}.`;
  };
  const info = infoOf();
  const share = rows && income && cents(income) > 0 ? wholeShare(parcela * 10, cents(income)) / 10 : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start gap-4 rounded-2xl bg-card p-4 shadow-sm lg:p-6">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground">
          <Sparkles aria-hidden className="size-6" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-bold text-[22px] leading-7 lg:text-[28px] lg:leading-9">Posso comprar isso?</h1>
            <span className="rounded-full bg-secondary px-2.5 py-0.5 font-semibold text-primary text-xs">
              SIMULADOR PREDITIVO
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            Simulação sem risco: projeta o impacto futuro no seu fluxo de caixa sem salvar nenhum lançamento na conta
            real.
          </p>
        </div>
        {history.length > 0 && (
          <Button variant="outline" className="ml-auto min-h-11 shrink-0" onClick={() => setBrowsing(true)}>
            <History aria-hidden />
            Histórico
          </Button>
        )}
      </header>
      <ResponsiveSheet
        open={browsing}
        onOpenChange={setBrowsing}
        title="Histórico de simulações"
        description="As últimas 10 simulações ficam só neste navegador."
        showDescription
      >
        <ul className="flex flex-col gap-1">
          {history.map((entry) => (
            <li key={entry.at}>
              <button
                type="button"
                onClick={() => restore(entry)}
                className="flex min-h-11 w-full flex-col items-start rounded-xl px-3 py-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="font-semibold">
                  {formatMoney(entry.amount, currency)} ·{" "}
                  {COUNTS.find(({ value }) => value === String(entry.count))?.label}
                </span>
                <span className="text-muted-foreground text-sm">
                  {(categoryOf(entry) ?? chips.data?.[0])?.name} · {slashDate(todayISO(new Date(entry.at)))}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Button variant="ghost" className="min-h-11 text-destructive" onClick={forget}>
          Limpar histórico
        </Button>
      </ResponsiveSheet>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-[auto_1fr] lg:items-start">
        <section
          aria-labelledby="purchase-form-title"
          className="flex flex-col gap-5 rounded-2xl bg-card p-4 shadow-sm lg:p-6"
        >
          <div className="flex flex-col gap-1">
            <p className={caption}>PARÂMETROS</p>
            <h2 id="purchase-form-title" className="font-semibold text-xl">
              Simular nova despesa
            </h2>
            <p className="text-muted-foreground text-sm">
              Descubra se cabe no orçamento sem comprometer os meses seguintes.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-2xl bg-muted p-3">
            <div className="min-w-0 flex-1">
              <HeroAmount
                id="purchase-amount"
                label="Valor total estimado"
                value={inputs.amount}
                onChange={(value) => set({ amount: value })}
                invalid={false}
              />
            </div>
            {inputs.amount && (
              <button
                type="button"
                aria-label="Limpar valor"
                onClick={() => set({ amount: "" })}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Delete aria-hidden className="size-5" />
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span id="purchase-count" className={label}>
                Modalidade de pagamento
              </span>
              <span className="font-semibold text-primary text-xs">Sem juros</span>
            </div>
            <ToggleGroup
              type="single"
              spacing={0}
              value={String(inputs.count)}
              onValueChange={(value: string) => value && set({ count: Number(value) })}
              aria-labelledby="purchase-count"
              className="grid w-full grid-cols-4 rounded-2xl bg-muted p-1"
            >
              {COUNTS.map(({ value, label: name }) => (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  className="h-11 rounded-xl! font-semibold text-base text-muted-foreground data-[state=on]:bg-brand data-[state=on]:text-brand-foreground"
                >
                  {name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {info && (
              <p className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-primary text-sm">
                <Info aria-hidden className="size-4 shrink-0" />
                {info}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className={label}>Primeiro vencimento</span>
            <DateField
              label="Primeiro vencimento"
              value={date}
              onChange={(picked) => set({ date: picked })}
              min={today}
              max={`${lastMonth}-${lastDay(lastMonth)}`}
              format={longDate}
              className="h-12 rounded-xl border-0 bg-muted"
            />
          </div>

          {cards.length > 0 && (
            <Field className="gap-1.5">
              <FieldLabel htmlFor="purchase-card" className="flex items-center gap-2">
                <CreditCard aria-hidden className="size-4 text-muted-foreground" />
                Cartão
              </FieldLabel>
              <NativeSelect
                id="purchase-card"
                value={inputs.cardId}
                onChange={(event) => set({ cardId: event.target.value })}
                className="w-full [&>select]:h-12 [&>select]:rounded-xl [&>select]:pl-3 [&>select]:text-base"
              >
                <NativeSelectOption value="">Nenhum</NativeSelectOption>
                {cards.map(({ id, name }) => (
                  <NativeSelectOption key={id} value={id}>
                    {name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {paid && <p className="text-expense-text text-sm">Essa fatura já foi paga.</p>}
            </Field>
          )}

          <CategoryChips
            kind="daily"
            chosen={category}
            onChoose={(chosen) => set({ category: chosen })}
            entries={thisMonth.isError ? [] : thisMonth.data}
            label="Categoria do bem ou serviço"
          />

          {share !== null && (
            <div className="flex items-center gap-3 rounded-2xl bg-muted p-4">
              <PieChart aria-hidden className="size-5 shrink-0 text-primary" />
              <div className="flex flex-col">
                <span className="text-muted-foreground text-xs">Comprometimento de Renda</span>
                <span className="font-semibold">{`${formatPct(share.toFixed(1))} das entradas de ${monthName(today, today)}`}</span>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              aria-label="Limpar simulação"
              onClick={() => set(blank())}
              className="size-12 shrink-0 rounded-xl"
            >
              <RotateCcw aria-hidden className="size-5" />
            </Button>
            <BrandButton type="button" disabled={!rows || paid} onClick={calculate} className="min-w-0 flex-1">
              <Calculator aria-hidden />
              Calcular Projeção
            </BrandButton>
          </div>
        </section>

        <aside
          aria-labelledby="purchase-tip-title"
          className="order-last flex gap-3 rounded-2xl bg-muted p-4 lg:order-none lg:col-start-1 lg:row-start-2 lg:p-6"
        >
          <Lightbulb aria-hidden className="size-5 shrink-0 text-primary" />
          <div className="flex flex-col gap-1">
            <h2 id="purchase-tip-title" className="font-semibold">
              Você sabia?
            </h2>
            <p className="text-muted-foreground text-sm">
              O Soldi cruza seus lançamentos futuros e recorrentes já cadastrados (como IPTU, seguros e assinaturas) com
              a nova simulação para detectar riscos antes de você comprar.
            </p>
          </div>
        </aside>

        <div aria-live="polite" className="empty:hidden lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {shown && rows && amount && (
            <Results
              rows={rows}
              count={inputs.count}
              total={amount}
              name={category?.name ?? ""}
              onRetest={(count) => {
                setInputs((current) => ({ ...current, count }));
                setShown(true);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
