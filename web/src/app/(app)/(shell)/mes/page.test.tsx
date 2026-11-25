import type { ReactNode } from "react";

import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { stubIntersection } from "@/test/intersection";
import { router, setSearch } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import {
  ANA,
  BILL_ALUGUEL,
  BILLS_OF_MONTH,
  CARRIED_ALUGUEL,
  CATEGORIES,
  COFRINHO_SEM_OBJETIVO,
  COFRINHOS,
  ECONOMIA,
  FORECAST,
  FORECAST_MONTH,
  FORECAST_TRANSACTIONS,
  MERCADO,
  MONTH,
  MOVEMENTS,
  problem,
  REPORT,
  SETTINGS,
  signedIn,
  TRANSACTIONS,
  WITH_COFRINHOS,
} from "@/test/stub-api";

import MesPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

type Reply = { status: number; body?: unknown };

let client: QueryClient;
let rerender: (ui: ReactNode) => void;

const page = () => (
  <>
    <MesPage />
    <Toaster />
  </>
);

const open = (replies: Record<string, Reply> = {}) => {
  const requests = signedIn({
    "GET /api/months/2026-11": { status: 200, body: MONTH },
    "GET /api/transactions": { status: 200, body: TRANSACTIONS },
    "GET /api/categories": { status: 200, body: CATEGORIES },
    "GET /api/reports/categories": { status: 200, body: REPORT },
    "GET /api/cofrinhos": { status: 200, body: COFRINHOS },
    ...replies,
  });
  ({ client, rerender } = renderWithQuery(page()));
  return requests;
};

const filter = () => within(ledger()).getByRole("radiogroup", { name: "Filtrar lançamentos" });

const dayHeadings = () =>
  within(ledger())
    .getAllByRole("heading", { level: 3 })
    .map((day) => day.textContent?.replace(/\s/g, " "));

const ledger = () => screen.getByRole("region", { name: "Lançamentos" });

const spent = (date: string): Schemas["Transaction"] => ({
  ...TRANSACTIONS[0],
  id: `t-${date}`,
  date,
  note: `Gasto ${date}`,
});

const EMPTY = {
  ...MONTH,
  totals: { ...MONTH.totals, income: "0.00", spent: "0.00", performance: "0.00" },
};

const withTotals = (totals: Partial<Schemas["MonthView"]["totals"]>) => ({
  "GET /api/months/2026-11": { status: 200, body: { ...MONTH, totals: { ...MONTH.totals, ...totals } } },
});

describe("Mês", () => {
  beforeEach(() => {
    window.innerWidth = 375;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
    setSearch("");
    router.replace.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("greets on the palette hero below 1024 and, from 1024, shows today's balance, the projection box and the split of the outflow", async () => {
    open({
      "GET /api/months/2026-11": {
        status: 200,
        body: { ...MONTH, projected_balance: "-312.40", projected_tier: "light_red" },
      },
    });

    const hero = await screen.findByRole("region", { name: "Saldo hoje" });
    const greeting = await within(hero).findByText("Olá, Ana");
    expect(greeting.closest(".rounded-3xl")).toHaveClass(
      "bg-hero",
      "text-hero-foreground",
      "lg:bg-card",
      "lg:text-card-foreground",
      "shadow-sm",
    );
    expect(greeting.closest(".rounded-3xl")).not.toHaveClass("bg-linear-to-br");
    expect(within(hero).getByRole("group", { name: "Mês" }).parentElement).toHaveClass("lg:hidden");
    expect(within(hero).getByText("em conta", { exact: false })).toHaveClass("hidden", "lg:inline");
    expect(within(hero).getByText("R$ 957,79").parentElement).toHaveClass("text-[34px]", "lg:text-[40px]");
    expect(within(hero).getAllByText("Apertado")).toHaveLength(1);

    const projected = within(hero).getByText("Projetado no fim do mês").parentElement?.parentElement as HTMLElement;
    expect(projected).toHaveClass("hidden", "lg:flex");
    expect(projected).toHaveTextContent(/^Projetado no fim do mês-R\$\s312,40Atenção$/);
    expect(within(projected).getByText("-R$ 312,40")).toHaveClass("text-expense");

    const split = within(hero).getByRole("heading", { name: "Para onde foi a entrada deste mês" }).parentElement
      ?.parentElement as HTMLElement;
    expect(split).toHaveClass("hidden", "lg:flex");
    expect(split).toHaveTextContent(/Total:\sR\$\s1\.384,31/);
    expect(within(split).getByRole("img", { name: /^Gastos R\$\s1\.384,31: gastos 100,0%$/ })).toBeInTheDocument();

    const summary = within(hero).getByRole("region", { name: "Resumo do mês" });
    expect(summary).toHaveClass("lg:hidden");
    expect(within(summary).getByText("R$ 500,00")).toHaveClass("text-income-text");
    expect(within(summary).getByText("R$ 1.384,31")).toBeInTheDocument();
    expect(summary).toHaveTextContent(/Gastos/);
    expect(summary).not.toHaveTextContent(/Saídas/);
    expect(summary).toHaveTextContent(/Projetado-R\$\s312,40Atenção/);

    const thermometer = screen.getByRole("region", { name: "Termômetro do Mês" });
    expect(within(thermometer).getByRole("meter")).toHaveAttribute("aria-valuetext", "Apertado");
    expect(thermometer).toHaveTextContent("Você comprometeu 277% das receitas líquidas.");
    expect(document.body).not.toHaveTextContent(/ritmo/i);
  });

  it("splits the entrada into Gastos, Guardado and Livre restante, each with one decimal", async () => {
    open(
      withTotals({
        income: "6361.60",
        spent: "4256.50",
        saved: "776.13",
        performance: "1328.97",
      }),
    );

    const hero = await screen.findByRole("region", { name: "Saldo hoje" });
    expect(hero).toHaveTextContent(/Total:\sR\$\s6\.361,60/);
    expect(
      within(hero).getByRole("img", {
        name: /^Entradas R\$\s6\.361,60: gastos 66,9%, guardado 12,2%, livre restante 20,9%$/,
      }),
    ).toBeInTheDocument();
  });

  it("greets with Olá alone when the account has no name", async () => {
    open({ "GET /api/auth/me": { status: 200, body: { ...ANA, name: "" } } });

    const hero = await screen.findByRole("region", { name: "Saldo hoje" });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(within(hero).getByText("Olá")).toBeInTheDocument();
  });

  it("lists the entries by day, newest first, with the day's balance and tier", async () => {
    open();

    const days = await within(await screen.findByRole("region", { name: "Lançamentos" })).findAllByRole("heading", {
      level: 3,
    });
    expect(days.map((day) => day.textContent?.replace(/\s/g, " "))).toEqual([
      "Hoje, 5 novSaldo ao final:R$ 957,79Apertado",
      "Ontem, 4 novSaldo ao final:R$ 1.142,10Confortável",
      "3 novSaldo ao final:R$ 2.342,10Folga",
    ]);
    const groceries = within(ledger()).getByRole("button", { name: /Compras da semana/ });
    expect(groceries).toHaveTextContent("Compras da semanaDiário- R$ 184,31");
    expect(within(ledger()).getByRole("button", { name: /Aluguel/ })).toHaveTextContent("AluguelSaída- R$ 1.200,00");
    expect(within(ledger()).getByText("+ R$ 500,00")).toHaveClass("text-income-text");
    expect(days[0]).toHaveClass("bg-muted", "rounded-lg");
    expect(within(days[0]).getByText("R$ 957,79")).toHaveClass("text-tier-yellow-foreground");
    expect(within(days[2]).getByText("R$ 2.342,10")).toHaveClass("text-tier-green-foreground");
  });

  it("names the card an entry went on, archived or not (D28)", async () => {
    const card = { id: "b1000000-0000-4000-8000-000000000009", name: "Porto", closing_day: 3, due_day: 10 };
    open({
      "GET /api/transactions": {
        status: 200,
        body: [{ ...TRANSACTIONS[0], card_id: card.id }, ...TRANSACTIONS.slice(1)],
      },
      "GET /api/bills?include_inactive=true": { status: 200, body: [{ ...card, amount: null, active: false }] },
    });

    const groceries = await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: /Compras da semana/,
    });
    await waitFor(() => expect(groceries).toHaveTextContent("Compras da semanaDiárioPorto- R$ 184,31"));
    expect(groceries.querySelector(".lucide-credit-card")).not.toBeNull();
    expect(within(ledger()).getByRole("button", { name: /Aluguel/ })).toHaveTextContent("AluguelSaída- R$ 1.200,00");
  });

  it("lays the four filters as a 2 × 2 grid below lg and beside the title from lg, each a 44 px target in 16 px text", async () => {
    open();

    await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: /Compras da semana/,
    });
    expect(ledger()).toHaveClass("lg:grid-cols-[auto_1fr_auto]");
    expect(filter()).toHaveClass("grid", "w-full", "grid-cols-2", "lg:flex", "lg:w-fit");
    const segments = within(filter()).getAllByRole("radio");
    expect(segments.map((segment) => segment.textContent)).toEqual([
      "Todos",
      "Diário",
      "Contas fixas",
      "Valor variável",
    ]);
    for (const segment of segments) expect(segment).toHaveClass("min-h-11", "text-base");
  });

  it("shows saving into a cofrinho as Guardado and a resgate as Resgatado, in income color", async () => {
    const loose = { ...MOVEMENTS[1], id: "t2000000-0000-4000-8000-000000000009", amount: "10.00", category: ECONOMIA };
    open({
      "GET /api/transactions": { status: 200, body: [...MOVEMENTS.map((each) => ({ ...each, note: null })), loose] },
      "GET /api/categories": { status: 200, body: WITH_COFRINHOS },
      "GET /api/months/2026-11": {
        status: 200,
        body: { ...MONTH, totals: { ...MONTH.totals, saved: "250.00" } },
      },
    });

    const resgate = await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: /^Resgate › Reserva/,
    });
    expect(resgate).toHaveTextContent("Resgate › ReservaResgatado+ R$ 50,00");
    expect(within(resgate).getByText("+ R$ 50,00")).toHaveClass("text-income-text");
    expect(within(ledger()).getByRole("button", { name: /^Economia › Reserva.*R\$\s100,00/ })).toHaveTextContent(
      "Economia › ReservaGuardado- R$ 100,00",
    );
    expect(within(ledger()).getByRole("button", { name: /^Economia.*R\$\s10,00/ })).toHaveTextContent(
      "EconomiaGuardado- R$ 10,00",
    );
    expect(screen.getByRole("region", { name: "Termômetro do Mês" })).not.toHaveTextContent("Guardou");

    await userEvent.click(resgate);
    expect(await screen.findByText("Resgatado · Resgate › Reserva")).toBeInTheDocument();
  });

  it("says nothing about saving when the month kept nothing", async () => {
    open();

    expect(await screen.findByRole("region", { name: "Termômetro do Mês" })).not.toHaveTextContent("Guardou");
  });

  it("lists a future day first as Previsto with its Projeção, and its entry opens Editar / Excluir", async () => {
    const later = { ...TRANSACTIONS[0], id: "later", date: "2026-11-20", note: "Show" };
    open({ "GET /api/transactions": { status: 200, body: [later, ...TRANSACTIONS] } });

    const days = await within(await screen.findByRole("region", { name: "Lançamentos" })).findAllByRole("heading", {
      level: 3,
    });
    expect(days.map((day) => day.textContent?.replace(/\s/g, " "))).toEqual([
      "Previsto · 20 novProjeção:R$ 957,79Apertado",
      "Hoje, 5 novSaldo ao final:R$ 957,79Apertado",
      "Ontem, 4 novSaldo ao final:R$ 1.142,10Confortável",
      "3 novSaldo ao final:R$ 2.342,10Folga",
    ]);
    expect(within(ledger()).getByRole("button", { name: /Show/ }).closest("ul")).toHaveClass("opacity-60");
    expect(
      within(ledger())
        .getByRole("button", { name: /Compras/ })
        .closest("ul"),
    ).not.toHaveClass("opacity-60");
    await userEvent.click(within(ledger()).getByRole("button", { name: /Show/ }));
    const actions = await screen.findByRole("dialog", { name: "Show" });
    expect(within(actions).getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "Excluir" })).toBeInTheDocument();
  });

  it("lists an unpaid conta fixa on the day it lands, with the Previsto balance", async () => {
    const landed = (day: Schemas["Day"]): Schemas["Day"] => {
      if (day.date < "2026-11-05") return day;
      if (day.date < "2026-11-10") return { ...day, projected_balance: "673.69", projected_tier: "yellow" };
      return { ...day, projected_balance: "-1585.87", projected_tier: "red" };
    };
    const bills = [
      { ...BILLS_OF_MONTH[0], lands_on: "2026-11-05" },
      { ...BILLS_OF_MONTH[1], lands_on: "2026-11-10" },
    ];
    open({
      "GET /api/months/2026-11": {
        status: 200,
        body: { ...MONTH, days: MONTH.days.map(landed), bills_of_month: bills },
      },
    });

    const days = await within(await screen.findByRole("region", { name: "Lançamentos" })).findAllByRole("heading", {
      level: 3,
    });
    expect(days.map((day) => day.textContent?.replace(/\s/g, " "))).toEqual([
      "Previsto · 10 novProjeção:-R$ 1.585,87Crítico",
      "Hoje, 5 novSaldo ao final:R$ 673,69Previsto · Apertado",
      "Ontem, 4 novSaldo ao final:R$ 1.142,10Confortável",
      "3 novSaldo ao final:R$ 2.342,10Folga",
    ]);
    expect(within(ledger()).getByRole("listitem", { name: "Aluguel Residencial" })).toHaveTextContent(
      "Aluguel ResidencialConta fixa · a pagar- R$ 2.259,56",
    );
    expect(within(ledger()).getByRole("listitem", { name: "Luz (Enel)" })).toHaveTextContent(
      "Luz (Enel)Conta fixa · venceu dia 02/11- R$ 284,10",
    );
  });

  it("lands October's unpaid rent today next to November's, each named by its month", async () => {
    const november = { ...BILLS_OF_MONTH[1], lands_on: "2026-11-05" };
    open({
      "GET /api/months/2026-11": { status: 200, body: { ...MONTH, bills_of_month: [CARRIED_ALUGUEL, november] } },
    });
    const region = await screen.findByRole("region", { name: "Lançamentos" });
    expect(await within(region).findByRole("listitem", { name: "Aluguel Residencial de outubro" })).toHaveTextContent(
      "Conta fixa · venceu em outubro",
    );
    expect(within(region).getByRole("listitem", { name: "Aluguel Residencial" })).toHaveTextContent(
      "Conta fixa · a pagar",
    );
  });

  it("lists a month whose only entry is scheduled instead of the empty state", async () => {
    const later = { ...TRANSACTIONS[0], id: "later", date: "2026-11-20", note: "Show" };
    open({ "GET /api/transactions": { status: 200, body: [later] } });

    expect(await within(await screen.findByRole("region", { name: "Lançamentos" })).findByText("Show")).toBeVisible();
    expect(screen.queryByText("Nenhum lançamento ainda")).not.toBeInTheDocument();
  });

  it("rounds the committed share half to even", async () => {
    open(withTotals({ income: "1040.00", spent: "130.00", performance: "910.00" }));

    expect(
      within(await screen.findByRole("region", { name: "Termômetro do Mês" })).getByText("12% Gasto"),
    ).toBeInTheDocument();
  });

  it("shows only the hero on a fresh account: no banner, no split and no other card (D25)", async () => {
    open({
      "GET /api/months/2026-11": { status: 200, body: EMPTY },
      "GET /api/transactions": { status: 200, body: [] },
      "GET /api/reports/categories": {
        status: 200,
        body: { ...REPORT, spent_total: "0.00", income_total: "0.00", groups: [] },
      },
      "GET /api/cofrinhos": {
        status: 200,
        body: { total_saved: "0.00", saved_this_month: "0.00", items: [COFRINHO_SEM_OBJETIVO] },
      },
    });

    const hero = await screen.findByRole("region", { name: "Saldo hoje" });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    const page = screen.getByRole("heading", { level: 1, name: "Mês" }).parentElement as HTMLElement;
    expect(
      within(page)
        .getAllByRole("region")
        .filter((region) => !hero.contains(region)),
    ).toEqual([]);
    expect(screen.queryByText("Nenhum lançamento ainda")).not.toBeInTheDocument();
    expect(screen.queryByText(/no vermelho/)).not.toBeInTheDocument();
    expect(within(hero).queryByRole("img")).not.toBeInTheDocument();
    expect(within(hero).queryByText("Para onde foi a entrada deste mês")).not.toBeInTheDocument();
  });

  it("opens Lançar on Entrada from the Entradas card", async () => {
    open({ "GET /api/months/2026-11": { status: 200, body: EMPTY } });
    await userEvent.click(await screen.findByRole("button", { name: "Lançar entrada" }));
    expect(await screen.findByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Entrada" })).toBeChecked();
  });

  it("opens Lançar on Entrada with a one-time hint when coming from the tour", async () => {
    setSearch("lancar=1");
    window.history.replaceState(null, "", "/mes?lancar=1");
    open({ "GET /api/months/2026-11": { status: 200, body: EMPTY } });

    const sheet = await screen.findByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
    expect(within(sheet).getByText("Comece pela sua primeira entrada do mês")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Entrada" })).toBeChecked();
    expect(`${window.location.pathname}${window.location.search}`).toBe("/mes");

    await userEvent.click(within(sheet).getByRole("button", { name: "Fechar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Lançar entrada" }));
    expect(await screen.findByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ })).toBeInTheDocument();
    expect(screen.queryByText("Comece pela sua primeira entrada do mês")).not.toBeInTheDocument();
  });

  it("flows the hero, Contas a pagar and Lançamentos in one stack and the rail in another, with no pinned rows", async () => {
    open({
      "GET /api/months/2026-11": {
        status: 200,
        body: { ...MONTH, projected_balance: "-312.40", projected_tier: "light_red", bills_of_month: BILLS_OF_MONTH },
      },
      "GET /api/forecast": { status: 200, body: FORECAST },
    });

    const bills = await screen.findByRole("region", { name: "Contas a pagar" });
    for (const name of ["Lançamentos", "Próximos meses", "Cofrinhos", "Para Onde Vai"]) {
      await screen.findByRole("region", { name });
    }
    const order = [
      "Saldo hoje",
      "Contas a pagar",
      "Lançamentos",
      "Termômetro do Mês",
      "Próximos meses",
      "Cofrinhos",
      "Para Onde Vai",
    ].map((name) => screen.getByRole("region", { name }));
    order.slice(1).forEach((card, index) => {
      expect(order[index].compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    const [main, rail] = [order[0].parentElement, order[3].parentElement];
    expect(order.slice(0, 3).map((card) => card.parentElement)).toEqual([main, main, main]);
    expect(order.slice(3).map((card) => card.parentElement)).toEqual([rail, rail, rail, rail]);
    expect(main).not.toBe(rail);
    expect(document.querySelector('[class*="xl:row-start"], [class*="xl:col-start"]')).toBeNull();
    expect(within(bills).getByRole("listitem", { name: "Luz (Enel)" })).toHaveTextContent("Venceu dia 02/11");
    const summary = screen.getByRole("region", { name: "Resumo do mês" });
    expect(summary).toHaveTextContent(/Projetado-R\$\s312,40Atenção/);
    expect(within(summary).getByText("-R$ 312,40")).toHaveClass("text-expense");
  });

  it("asks the month, its entries, the forecast, the spending and the cofrinhos together, with a skeleton for the hero alone", async () => {
    const requests = open();

    expect(requests.map((request) => new URL(request.url).pathname + new URL(request.url).search)).toEqual(
      expect.arrayContaining([
        "/api/months/2026-11",
        "/api/transactions?month=2026-11",
        "/api/forecast",
        "/api/reports/categories?month=2026-11",
        "/api/cofrinhos",
      ]),
    );
    expect(screen.getByTestId("hero-figure-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("hero-bar-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("strip-skeleton")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("row-skeleton")).toHaveLength(0);
    expect(document.querySelectorAll('[aria-busy="true"]')).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Carregando");

    await screen.findByRole("region", { name: "Lançamentos" });
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("keeps every card's data when a refetch fails, with no error and no second card", async () => {
    open();
    expect(
      await within(await screen.findByRole("region", { name: "Lançamentos" })).findByText("Compras da semana"),
    ).toBeInTheDocument();
    const cofrinhos = await screen.findByRole("region", { name: "Cofrinhos" });
    expect(await within(cofrinhos).findByText("Reserva")).toBeVisible();
    const spending = await screen.findByRole("region", { name: "Para Onde Vai" });
    expect(await within(spending).findByText("Mercado")).toBeInTheDocument();
    const failed = { status: 500, body: problem(500, "Falhou.") };
    const requests = signedIn({
      "GET /api/months/2026-11": failed,
      "GET /api/transactions": failed,
      "GET /api/reports/categories": failed,
      "GET /api/cofrinhos": failed,
      "GET /api/forecast": failed,
    });

    await act(async () => {
      await client.refetchQueries();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(requests.length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Não foi possível carregar.")).not.toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: "Saldo hoje" })).toHaveLength(1);
    expect(screen.getAllByRole("region", { name: "Lançamentos" })).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Saldo hoje" })).toHaveTextContent("R$ 957,79");
    expect(within(ledger()).getByText("Compras da semana")).toBeInTheDocument();
    expect(within(cofrinhos).getByText("Reserva")).toBeVisible();
    expect(within(spending).getByText("Mercado")).toBeInTheDocument();
  });

  it("shows the month's error in the hero and keeps the other cards", async () => {
    const requests = open({
      "GET /api/months/2026-11": { status: 500, body: problem(500, "Falhou.") },
      "GET /api/forecast": { status: 200, body: FORECAST },
    });

    const hero = await screen.findByRole("region", { name: "Saldo hoje" });
    expect(await within(hero).findByText("Não foi possível carregar o mês.")).toBeInTheDocument();
    expect(await within(screen.getByRole("region", { name: "Cofrinhos" })).findByText("Reserva")).toBeVisible();
    expect(await screen.findByRole("region", { name: "Próximos meses" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Contas a pagar" })).not.toBeInTheDocument();
    await userEvent.click(within(hero).getByRole("button", { name: "Tentar de novo" }));

    await waitFor(() =>
      expect(requests.filter((request) => request.url.endsWith("/api/months/2026-11"))).toHaveLength(2),
    );
  });

  it("shows the entries' error in Lançamentos and keeps the hero", async () => {
    const requests = open({ "GET /api/transactions": { status: 500, body: problem(500, "Falhou.") } });

    expect(await screen.findByText("Não foi possível carregar os lançamentos.")).toBeInTheDocument();
    expect(ledger()).toHaveTextContent("Não foi possível carregar os lançamentos.");
    expect(screen.getByRole("region", { name: "Saldo hoje" })).toHaveTextContent("R$ 957,79");
    const entries = () => requests.filter((request) => request.url.includes("/api/transactions")).length;
    const before = entries();
    await userEvent.click(within(ledger()).getByRole("button", { name: "Tentar de novo" }));

    await waitFor(() => expect(entries()).toBe(before + 1));
  });

  it("keeps the month on screen when the cofrinhos fail", async () => {
    open({ "GET /api/cofrinhos": { status: 500, body: problem(500, "Erro") } });

    const cofrinhos = await screen.findByRole("region", { name: "Cofrinhos" });
    expect(await within(cofrinhos).findByText("Não foi possível carregar os cofrinhos.")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Saldo hoje" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Lançamentos" })).toBeInTheDocument();
  });

  it("opens the month in the address and moves it from the hero's switcher", async () => {
    setSearch("m=2026-12");
    const requests = open({
      "GET /api/months/2026-12": { status: 200, body: { ...MONTH, month: "2026-12" } },
      "GET /api/transactions": { status: 200, body: [] },
    });

    const hero = await screen.findByRole("region", { name: "Saldo hoje" });
    expect(requests.some((request) => request.url.endsWith("/api/transactions?month=2026-12"))).toBe(true);
    expect(requests.some((request) => request.url.endsWith("/api/reports/categories?month=2026-12"))).toBe(true);
    expect(await screen.findByRole("link", { name: "Ver análise" })).toHaveAttribute(
      "href",
      "/para-onde-vai?m=2026-12",
    );
    const switcher = within(hero).getByRole("group", { name: "Mês" });
    expect(switcher).toHaveTextContent("Dezembro 2026");
    await userEvent.click(within(switcher).getByRole("button", { name: "Próximo mês" }));
    expect(window.location.pathname + window.location.search).toBe("/mes?m=2027-01");
  });

  it("ignores a malformed month in the address", async () => {
    setSearch("m=nope");
    const requests = open();

    await screen.findByRole("region", { name: "Saldo hoje" });
    expect(requests.some((request) => request.url.endsWith("/api/months/2026-11"))).toBe(true);
  });

  it("deletes an entry at once and brings it back with Desfazer", async () => {
    open();
    const row = await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: /Compras da semana/,
    });
    const requests = signedIn({
      "GET /api/months/2026-11": { status: 200, body: MONTH },
      "GET /api/transactions": { status: 200, body: TRANSACTIONS.slice(1) },
      [`DELETE /api/transactions/${TRANSACTIONS[0].id}`]: { status: 204 },
      "POST /api/transactions": { status: 201, body: TRANSACTIONS[0] },
    });

    await userEvent.click(row);
    const actions = await screen.findByRole("dialog", { name: "Compras da semana" });
    await userEvent.click(within(actions).getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(within(ledger()).queryByText("Compras da semana")).not.toBeInTheDocument());
    expect(await screen.findByText("Lançamento excluído")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));

    await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
    const post = requests.find((request) => request.method === "POST");
    expect(await post?.json()).toEqual({
      date: "2026-11-05",
      amount: "184.31",
      kind: "daily",
      category_id: MERCADO.id,
      note: "Compras da semana",
    });
  });

  it("marks a series member with its place in the series", async () => {
    open({
      "GET /api/transactions": {
        status: 200,
        body: [
          {
            ...TRANSACTIONS[1],
            series: { id: "s1", position: 3, total: 12, last_date: "2027-08-04", open_ended: false, every: "month" },
          },
        ],
      },
    });

    const row = await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: /Aluguel/,
    });
    expect(row).toHaveTextContent(/^AluguelSaída↻ Saída · 3\/123 de 12- R\$/);
    expect(within(row).queryByRole("img")).not.toBeInTheDocument();
    expect(within(row).getByText("↻ Saída · 3/12")).toHaveAttribute("aria-hidden", "true");
    expect(within(row).getByText("3 de 12")).toHaveClass("sr-only");
  });

  it.each([
    ["month", "Todo mês"],
    ["week", "Toda semana"],
    ["year", "Todo ano"],
  ] as const)("marks an open %s series member with no end", async (every, label) => {
    open({
      "GET /api/transactions": {
        status: 200,
        body: [
          {
            ...TRANSACTIONS[1],
            series: { id: "s1", position: 3, total: 12, last_date: "2027-08-04", open_ended: true, every },
          },
        ],
      },
    });

    const row = await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: /Aluguel/,
    });
    expect(within(row).getByText(`↻ Saída · ${label}`)).toHaveAttribute("aria-hidden", "true");
    expect(within(row).getByText(label)).toHaveClass("sr-only");
    expect(row).not.toHaveTextContent("3/12");
  });

  it("asks how much of a series to delete, then deletes without Desfazer", async () => {
    const member = {
      ...TRANSACTIONS[1],
      series: { id: "s1", position: 3, total: 12, last_date: "2027-08-04", open_ended: false, every: "month" },
    };
    const requests = open({
      "GET /api/transactions": { status: 200, body: [member] },
      [`DELETE /api/transactions/${member.id}`]: { status: 204 },
    });

    await userEvent.click(
      await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
        name: /Aluguel/,
      }),
    );
    const actions = await screen.findByRole("dialog", { name: "Aluguel" });
    await userEvent.click(within(actions).getByRole("button", { name: "Excluir" }));
    expect(within(actions).getByRole("radiogroup", { name: "Excluir quais?" })).toBeInTheDocument();
    expect(within(actions).getByText("Excluir quais?")).toBeVisible();
    expect(within(actions).getByRole("radio", { name: "Só este lançamento" })).toBeChecked();
    await userEvent.click(within(actions).getByRole("button", { name: "Cancelar" }));
    expect(requests.some((request) => request.method === "DELETE")).toBe(false);

    await userEvent.click(within(ledger()).getByRole("button", { name: /Aluguel/ }));
    const again = await screen.findByRole("dialog", { name: "Aluguel" });
    await userEvent.click(within(again).getByRole("button", { name: "Excluir" }));
    await userEvent.click(within(again).getByRole("radio", { name: "Este e os próximos" }));
    await userEvent.click(within(again).getByRole("button", { name: "Excluir" }));

    expect(await screen.findByText("Série excluída")).toBeInTheDocument();
    const deleted = requests.find((request) => request.method === "DELETE");
    expect(new URL(deleted?.url ?? "").searchParams.get("scope")).toBe("following");
    expect(screen.queryByRole("button", { name: "Desfazer" })).not.toBeInTheDocument();
  });

  it("deletes the whole series from member 2 after asking", async () => {
    const member = {
      ...TRANSACTIONS[1],
      series: { id: "s1", position: 2, total: 12, last_date: "2027-09-04", open_ended: false, every: "month" },
    };
    const requests = open({
      "GET /api/transactions": { status: 200, body: [member] },
      [`DELETE /api/transactions/${member.id}`]: { status: 204 },
    });

    await userEvent.click(
      await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
        name: /Aluguel/,
      }),
    );
    const actions = await screen.findByRole("dialog", { name: "Aluguel" });
    await userEvent.click(within(actions).getByRole("button", { name: "Excluir" }));
    await userEvent.click(within(actions).getByRole("radio", { name: "Toda a série (12 lançamentos)" }));
    await userEvent.click(within(actions).getByRole("button", { name: "Excluir" }));
    const ask = await screen.findByRole("alertdialog", { name: "Excluir toda a série?" });
    expect(ask).toHaveTextContent("Os 12 lançamentos serão excluídos, inclusive o anterior a este.");
    expect(requests.some((request) => request.method === "DELETE")).toBe(false);
    await userEvent.click(within(ask).getByRole("button", { name: "Excluir toda a série" }));

    expect(await screen.findByText("Série excluída")).toBeInTheDocument();
    const deleted = requests.find((request) => request.method === "DELETE");
    expect(new URL(deleted?.url ?? "").searchParams.get("scope")).toBe("all");
  });

  it("deletes only this member by default", async () => {
    const member = {
      ...TRANSACTIONS[1],
      series: { id: "s1", position: 1, total: 2, last_date: "2026-12-04", open_ended: false, every: "month" },
    };
    open({
      "GET /api/transactions": { status: 200, body: [member] },
      [`DELETE /api/transactions/${member.id}`]: { status: 204 },
    });

    await userEvent.click(
      await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
        name: /Aluguel/,
      }),
    );
    const actions = await screen.findByRole("dialog", { name: "Aluguel" });
    await userEvent.click(within(actions).getByRole("button", { name: "Excluir" }));
    expect(within(actions).getByRole("radio", { name: "Toda a série (2 lançamentos)" })).not.toBeChecked();
    await userEvent.click(within(actions).getByRole("button", { name: "Excluir" }));

    expect(await screen.findByText("Lançamento excluído")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desfazer" })).not.toBeInTheDocument();
  });

  it("deletes the only member of a series without asking which", async () => {
    const member = {
      ...TRANSACTIONS[1],
      series: { id: "s1", position: 1, total: 1, last_date: "2026-11-04", open_ended: false, every: "month" },
    };
    const requests = open({
      "GET /api/transactions": { status: 200, body: [member] },
      [`DELETE /api/transactions/${member.id}`]: { status: 204 },
    });

    await userEvent.click(
      await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
        name: /Aluguel/,
      }),
    );
    const actions = await screen.findByRole("dialog", { name: "Aluguel" });
    await userEvent.click(within(actions).getByRole("button", { name: "Excluir" }));
    expect(within(actions).queryByRole("radiogroup", { name: "Excluir quais?" })).not.toBeInTheDocument();
    await userEvent.click(within(actions).getByRole("button", { name: "Excluir" }));

    expect(await screen.findByText("Lançamento excluído")).toBeInTheDocument();
    const deleted = requests.find((request) => request.method === "DELETE");
    expect(new URL(deleted?.url ?? "").searchParams.get("scope")).toBe("this");
  });

  it("opens the delete scope from Excluir da Série... in the series sheet", async () => {
    const member = {
      ...TRANSACTIONS[1],
      series: { id: "s1", position: 3, total: 12, last_date: "2027-08-04", open_ended: false, every: "month" },
    };
    open({ "GET /api/transactions": { status: 200, body: [member] } });

    await userEvent.click(
      await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
        name: /Aluguel/,
      }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Aluguel" })).getByRole("button", { name: "Editar" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Editar Lançamento Recorrente" })).getByRole("button", {
        name: "Excluir da Série...",
      }),
    );

    const actions = await screen.findByRole("dialog", { name: "Aluguel" });
    expect(within(actions).getByRole("radiogroup", { name: "Excluir quais?" })).toBeInTheDocument();
    expect(within(actions).getByRole("radio", { name: "Só este lançamento" })).toHaveAccessibleDescription(
      "Apenas a parcela de Novembro/2026 será excluída.",
    );
    expect(screen.queryByRole("dialog", { name: "Editar Lançamento Recorrente" })).not.toBeInTheDocument();
  });

  it("opens the entry in the Lançar sheet to edit it", async () => {
    open();

    await userEvent.click(
      await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
        name: /Aluguel/,
      }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Aluguel" })).getByRole("button", { name: "Editar" }),
    );

    const edit = await screen.findByRole("dialog", { name: "Editar lançamento" });
    expect(within(edit).getByLabelText(/^Valor d/)).toHaveValue("1.200,00");
  });

  it("turns the edited Saída into a bill in the bill sheet, prefilled from it", async () => {
    open();

    await userEvent.click(
      await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
        name: /Aluguel/,
      }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Aluguel" })).getByRole("button", { name: "Editar" }),
    );
    await userEvent.click(await screen.findByRole("switch", { name: "Conta fixa" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    const bill = await screen.findByRole("dialog", { name: "Nova conta" });
    expect(within(bill).getByLabelText("Nome da conta fixa")).toHaveValue("Aluguel");
    expect(within(bill).getByLabelText("Dia do vencimento recorrente")).toHaveValue("4");
  });

  describe("a series member turned into a conta (SOL-160)", () => {
    const porto: Schemas["Transaction"] = {
      ...TRANSACTIONS[1],
      id: "t-porto",
      note: "Porto",
      date: "2026-11-01",
      series: { id: "s", position: 9, total: 26, last_date: "2028-04-01", every: "month", open_ended: false },
    };
    const convert = async (kind: string) => {
      const requests = open({
        "GET /api/transactions": { status: 200, body: [porto] },
        "POST /api/bills": { status: 201, body: BILL_ALUGUEL },
      });
      await userEvent.click(
        await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
          name: /Porto/,
        }),
      );
      await userEvent.click(
        within(await screen.findByRole("dialog", { name: "Porto" })).getByRole("button", { name: "Editar" }),
      );
      await userEvent.click(await screen.findByRole("button", { name: kind }));
      const bill = await screen.findByRole("dialog", { name: "Nova conta" });
      const posted = async () => {
        await waitFor(() =>
          expect(requests.some((request) => request.method === "POST" && request.url.includes("/api/bills"))).toBe(
            true,
          ),
        );
        const post = requests.find((request) => request.method === "POST" && request.url.includes("/api/bills"));
        expect(new URL(post?.url ?? "").searchParams.get("transaction_id")).toBe("t-porto");
        return post?.json();
      };
      return { bill, posted };
    };

    it("Conta parcelada opens Parcelado on with the series' plan and its end month", async () => {
      const { bill, posted } = await convert("Conta parcelada");

      expect(
        within(bill).getByText(
          "Os lançamentos desta série até este mês viram pagamentos desta conta. Os dos próximos meses saem da lista: a conta prevê cada parcela até abr/28.",
        ),
      ).toBeInTheDocument();
      expect(within(bill).getByRole("switch", { name: "Parcelado" })).toBeChecked();
      expect(within(bill).getByLabelText("Quantas parcelas")).toHaveValue("26");
      expect(within(bill).queryByRole("switch", { name: "Cartão de crédito" })).not.toBeInTheDocument();
      await userEvent.click(within(bill).getByRole("button", { name: "Salvar Conta Fixa" }));

      expect(await posted()).toMatchObject({ installments: 26, last_month: "2028-04-01" });
      expect(await screen.findByText("Conta parcelada criada")).toBeInTheDocument();
    });

    it("Conta fixa opens Parcelado off and posts no plan", async () => {
      const { bill, posted } = await convert("Conta fixa");

      expect(
        within(bill).getByText(
          "Os lançamentos desta série até este mês viram pagamentos desta conta. Os dos próximos meses saem da lista: a conta fixa prevê todo mês, sem fim.",
        ),
      ).toBeInTheDocument();
      expect(within(bill).getByRole("switch", { name: "Parcelado" })).not.toBeChecked();
      await userEvent.click(within(bill).getByRole("button", { name: "Salvar Conta Fixa" }));

      const body = await posted();
      expect(body).not.toHaveProperty("installments");
      expect(body).not.toHaveProperty("last_month");
      expect(await screen.findByText("Conta fixa criada")).toBeInTheDocument();
    });
  });

  it("names the red day's Diário previsto with its rate when it is the cause (SOL-164 A14)", async () => {
    open({
      "GET /api/settings": { status: 200, body: { ...SETTINGS, daily_estimate: "50.00", daily_estimate_on: true } },
      "GET /api/months/2026-11": {
        status: 200,
        body: {
          ...FORECAST_MONTH,
          bills_of_month: [],
          days: FORECAST_MONTH.days.map((day) => (day.date === "2026-11-23" ? { ...day, previsto: "50.00" } : day)),
        },
      },
      "GET /api/transactions": { status: 200, body: [] },
    });

    expect(await screen.findByRole("region", { name: "Alerta do mês" })).toHaveTextContent(
      /^Dia 23 fica no vermelho: -R\$\s675,00\. Diário previsto \(R\$\s50,00\/dia\) excede o saldo em caixa projetado\.Ver o dia 23$/,
    );
  });

  it("still names the red day's Diário previsto, without the rate, when the settings fail", async () => {
    open({
      "GET /api/settings": { status: 500, body: problem(500, "Falhou.") },
      "GET /api/months/2026-11": {
        status: 200,
        body: {
          ...FORECAST_MONTH,
          bills_of_month: [],
          days: FORECAST_MONTH.days.map((day) => (day.date === "2026-11-23" ? { ...day, previsto: "50.00" } : day)),
        },
      },
      "GET /api/transactions": { status: 200, body: [] },
    });

    expect(await screen.findByRole("region", { name: "Alerta do mês" })).toHaveTextContent(
      /^Dia 23 fica no vermelho: -R\$\s675,00\. Diário previsto excede o saldo em caixa projetado\.Ver o dia 23$/,
    );
  });

  it("warns above the cards of the first red day and its two largest outflows; Ver o dia jumps, rings it for 2 s and names the cause", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    open({
      "GET /api/months/2026-11": { status: 200, body: FORECAST_MONTH },
      "GET /api/transactions": { status: 200, body: FORECAST_TRANSACTIONS },
    });

    const banner = await screen.findByRole("region", { name: "Alerta do mês" });
    expect(banner).toHaveTextContent(
      /^Dia 23 fica no vermelho: -R\$\s675,00\. Contas de Cartão e Seguro previstas excedem o saldo em caixa projetado\.Ver o dia 23$/,
    );
    expect(banner.compareDocumentPosition(screen.getByRole("region", { name: "Saldo hoje" }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.queryByText(/Pior dia/)).not.toBeInTheDocument();
    const first = within(banner).getByRole("button", { name: "Ver o dia 23" });
    expect(within(ledger()).getByRole("listitem", { name: "Cartão" })).toHaveTextContent("Motivo da queda");
    expect(within(ledger()).getByRole("listitem", { name: "Financiamento" })).toHaveTextContent("Motivo da queda");
    expect(within(ledger()).getByRole("button", { name: /Seguro/ })).not.toHaveTextContent("Motivo da queda");

    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
    fireEvent.click(first);
    const day = document.getElementById("dia-2026-11-23");
    expect(scroll).toHaveBeenLastCalledWith({ block: "start" });
    expect(scroll.mock.contexts.at(-1)).toBe(day);
    expect(day).toHaveClass("ring-2");
    act(() => vi.advanceTimersByTime(1999));
    expect(day).toHaveClass("ring-2");
    act(() => vi.advanceTimersByTime(1));
    expect(day).not.toHaveClass("ring-2");
    scroll.mockRestore();
  });

  it("moves focus to the day after the jump, and a second tap restarts the 2 s ring", async () => {
    open({
      "GET /api/months/2026-11": { status: 200, body: FORECAST_MONTH },
      "GET /api/transactions": { status: 200, body: FORECAST_TRANSACTIONS },
    });

    const first = await screen.findByRole("button", { name: "Ver o dia 23" });

    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
    fireEvent.click(first);
    const day = document.getElementById("dia-2026-11-23");
    expect(day).toHaveFocus();
    act(() => vi.advanceTimersByTime(1500));
    fireEvent.click(first);
    act(() => vi.advanceTimersByTime(1999));
    expect(day).toHaveClass("ring-2");
    act(() => vi.advanceTimersByTime(1));
    expect(day).not.toHaveClass("ring-2");
  });

  it("shows every day of the month on open, with no control to see more or less", async () => {
    open({
      "GET /api/transactions": {
        status: 200,
        body: ["10", "09", "08", "07", "06", "04", "03", "02", "01"].map((day) => spent(`2026-11-${day}`)),
      },
    });

    await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: /Gasto 2026-11-10/,
    });
    expect(
      within(ledger())
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.closest("[id]")?.id),
    ).toEqual(["10", "09", "08", "07", "06", "04", "03", "02", "01"].map((day) => `dia-2026-11-${day}`));
    expect(within(ledger()).queryByRole("button", { name: /Ver o mês inteiro|Mostrar menos/ })).not.toBeInTheDocument();
  });

  it("puts a variable bill's payment and its unpaid due row under Valor variável only, keeping each day's projection", async () => {
    const VARIABLE = {
      ...BILL_ALUGUEL,
      id: "b1000000-0000-4000-8000-000000000077",
      name: "Luz variável",
      variable: true,
    };
    open({
      "GET /api/months/2026-11": {
        status: 200,
        body: {
          ...MONTH,
          bills_of_month: [
            { ...BILLS_OF_MONTH[1], lands_on: "2026-11-10" },
            {
              ...BILLS_OF_MONTH[1],
              bill_id: VARIABLE.id,
              name: "Luz variável",
              variable: true,
              lands_on: "2026-11-10",
            },
          ],
        },
      },
      "GET /api/transactions": {
        status: 200,
        body: [
          ...TRANSACTIONS,
          { ...TRANSACTIONS[1], id: "t-luz", note: "Luz de outubro", recurring_bill_id: VARIABLE.id },
          { ...TRANSACTIONS[1], id: "t-fixa", note: "Aluguel pago", recurring_bill_id: BILL_ALUGUEL.id },
        ],
      },
      "GET /api/bills?include_inactive=true": { status: 200, body: [BILL_ALUGUEL, VARIABLE] },
    });

    await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: /Compras da semana/,
    });
    const all = dayHeadings();

    await userEvent.click(within(filter()).getByRole("radio", { name: "Valor variável" }));
    await waitFor(() => expect(within(ledger()).getByRole("button", { name: /Luz de outubro/ })).toBeInTheDocument());
    expect(within(ledger()).getByRole("listitem", { name: "Luz variável" })).toBeInTheDocument();
    expect(within(ledger()).queryByRole("listitem", { name: "Aluguel Residencial" })).not.toBeInTheDocument();
    expect(within(ledger()).queryByRole("button", { name: /Aluguel pago|Compras da semana/ })).not.toBeInTheDocument();
    expect(dayHeadings()).toEqual([all[0], all[2]]);

    await userEvent.click(within(filter()).getByRole("radio", { name: "Contas fixas" }));
    expect(within(ledger()).getByRole("listitem", { name: "Aluguel Residencial" })).toBeInTheDocument();
    expect(within(ledger()).getByRole("button", { name: /Aluguel pago/ })).toBeInTheDocument();
    expect(within(ledger()).queryByRole("listitem", { name: "Luz variável" })).not.toBeInTheDocument();
    expect(within(ledger()).queryByRole("button", { name: /Luz de outubro/ })).not.toBeInTheDocument();
    expect(dayHeadings()).toEqual([all[0], all[2]]);
  });

  it("counts a bill payment as a conta fixa while the bills are still loading", async () => {
    signedIn({
      "GET /api/months/2026-11": { status: 200, body: MONTH },
      "GET /api/transactions": {
        status: 200,
        body: [
          { ...TRANSACTIONS[1], note: "Luz de outubro", recurring_bill_id: "b1000000-0000-4000-8000-000000000077" },
        ],
      },
      "GET /api/categories": { status: 200, body: CATEGORIES },
      "GET /api/reports/categories": { status: 200, body: REPORT },
      "GET /api/cofrinhos": { status: 200, body: COFRINHOS },
    });
    const answer = globalThis.fetch;
    vi.stubGlobal("fetch", (request: Request) =>
      new URL(request.url).pathname === "/api/bills" ? new Promise<Response>(() => undefined) : answer(request),
    );
    renderWithQuery(page());

    await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: /Luz de outubro/,
    });
    await userEvent.click(within(filter()).getByRole("radio", { name: "Contas fixas" }));
    expect(within(ledger()).getByRole("button", { name: /Luz de outubro/ })).toBeInTheDocument();
    await userEvent.click(within(filter()).getByRole("radio", { name: "Valor variável" }));
    expect(within(ledger()).getByText("Nenhuma conta de valor variável neste mês.")).toBeInTheDocument();
  });

  it("filters Lançamentos by Diário or Contas fixas on the loaded month, keeping each day's own balance", async () => {
    const requests = open({
      "GET /api/months/2026-11": {
        status: 200,
        body: { ...MONTH, bills_of_month: [{ ...BILLS_OF_MONTH[1], lands_on: "2026-11-10" }] },
      },
    });

    await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: /Compras da semana/,
    });
    const asked = requests.length;
    expect(within(filter()).getByRole("radio", { name: "Todos" })).toHaveAttribute("aria-checked", "true");
    expect(dayHeadings()).toHaveLength(4);

    await userEvent.click(within(filter()).getByRole("radio", { name: "Diário" }));
    expect(dayHeadings()).toEqual(["Hoje, 5 novSaldo ao final:R$ 957,79Apertado"]);
    expect(within(ledger()).getByRole("button", { name: /Compras da semana/ })).toBeInTheDocument();
    expect(within(ledger()).queryByRole("button", { name: /Aluguel/ })).not.toBeInTheDocument();

    await userEvent.click(within(filter()).getByRole("radio", { name: "Contas fixas" }));
    expect(dayHeadings()).toEqual([
      "Previsto · 10 novProjeção:R$ 957,79Apertado",
      "Ontem, 4 novSaldo ao final:R$ 1.142,10Confortável",
    ]);
    expect(within(ledger()).getByRole("listitem", { name: "Aluguel Residencial" })).toBeInTheDocument();
    expect(within(ledger()).getByRole("button", { name: /Aluguel/ })).toBeInTheDocument();
    expect(within(ledger()).queryByText("+ R$ 500,00")).not.toBeInTheDocument();

    await userEvent.click(within(filter()).getByRole("radio", { name: "Todos" }));
    expect(dayHeadings()).toHaveLength(4);
    expect(requests).toHaveLength(asked);
  });

  it("says when a filter finds nothing in the month", async () => {
    open({ "GET /api/transactions": { status: 200, body: [TRANSACTIONS[2]] } });

    await userEvent.click(
      within(await screen.findByRole("radiogroup", { name: "Filtrar lançamentos" })).getByRole("radio", {
        name: "Diário",
      }),
    );
    expect(within(ledger()).getByText("Nenhum gasto diário neste mês.")).toBeInTheDocument();
    expect(within(ledger()).queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    await userEvent.click(within(filter()).getByRole("radio", { name: "Contas fixas" }));
    expect(within(ledger()).getByText("Nenhuma conta fixa neste mês.")).toBeInTheDocument();
    await userEvent.click(within(filter()).getByRole("radio", { name: "Valor variável" }));
    expect(within(ledger()).getByText("Nenhuma conta de valor variável neste mês.")).toBeInTheDocument();
    expect(within(ledger()).queryByText("Nenhum lançamento ainda")).not.toBeInTheDocument();
  });

  it("goes back to Todos before jumping to a red day the filter hides", async () => {
    open({
      "GET /api/months/2026-11": { status: 200, body: FORECAST_MONTH },
      "GET /api/transactions": { status: 200, body: FORECAST_TRANSACTIONS },
    });

    const first = await screen.findByRole("button", { name: "Ver o dia 23" });
    await within(ledger()).findByRole("button", { name: /Feira/ });
    await userEvent.click(within(filter()).getByRole("radio", { name: "Diário" }));
    expect(document.getElementById("dia-2026-11-23")).toBeNull();

    fireEvent.click(first);
    expect(document.getElementById("dia-2026-11-23")).toHaveFocus();
    expect(within(filter()).getByRole("radio", { name: "Todos" })).toHaveAttribute("aria-checked", "true");
  });

  it("collapses Lançamentos to its title from the chevron and keeps it closed on the next visit (SOL-158)", async () => {
    open();
    await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: /Compras da semana/,
    });
    const toggle = within(ledger()).getByRole("button", { name: "Lançamentos" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveClass("size-11");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(ledger()).getByRole("heading", { name: "Lançamentos" })).toBeInTheDocument();
    expect(within(ledger()).queryByRole("radiogroup", { name: "Filtrar lançamentos" })).not.toBeInTheDocument();
    expect(within(ledger()).queryByRole("button", { name: /Compras da semana/ })).not.toBeInTheDocument();
    expect(localStorage.getItem("soldi:open:ledger")).toBe("closed");
  });

  it("opens a closed Lançamentos to jump to a red day without changing the remembered choice (SOL-158)", async () => {
    localStorage.setItem("soldi:open:ledger", "closed");
    open({
      "GET /api/months/2026-11": { status: 200, body: FORECAST_MONTH },
      "GET /api/transactions": { status: 200, body: FORECAST_TRANSACTIONS },
    });
    const first = await screen.findByRole("button", { name: "Ver o dia 23" });
    const toggle = await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: "Lançamentos",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("dia-2026-11-23")).toBeNull();

    fireEvent.click(first);
    expect(document.getElementById("dia-2026-11-23")).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(localStorage.getItem("soldi:open:ledger")).toBe("closed");
  });

  describe("Modo planilha (SOL-163)", () => {
    const views = () => within(ledger()).getByRole("radiogroup", { name: "Ver lançamentos como" });
    const grid = () => ledger().parentElement?.parentElement;
    const TWO_COLUMNS = "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]";

    it("opens on Lista with the two-column grid at xl when nothing is stored (A1, A15)", async () => {
      open();
      await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
        name: /Compras da semana/,
      });

      expect(within(views()).getByRole("radio", { name: "Lista" })).toHaveAttribute("aria-checked", "true");
      expect(grid()).toHaveClass(TWO_COLUMNS, "xl:items-start");
      expect(within(ledger()).queryByRole("table")).not.toBeInTheDocument();
    });

    it("switches to Planilha in the Lançamentos slot, remembered, the URL untouched, and Lista comes back on Todos (A2, A15)", async () => {
      open();
      await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
        name: /Compras da semana/,
      });
      const address = window.location.href;
      await userEvent.click(within(filter()).getByRole("radio", { name: "Diário" }));

      await userEvent.click(within(views()).getByRole("radio", { name: "Planilha" }));
      expect(await within(ledger()).findAllByRole("table")).toHaveLength(12);
      expect(within(ledger()).queryByRole("radiogroup", { name: "Filtrar lançamentos" })).not.toBeInTheDocument();
      expect(localStorage.getItem("soldi:open:ledger-planilha")).toBe("open");
      expect(grid()).not.toHaveClass(TWO_COLUMNS);
      expect(grid()).not.toHaveClass("xl:items-start");
      expect(window.location.href).toBe(address);
      expect(router.replace).not.toHaveBeenCalled();

      await userEvent.click(within(views()).getByRole("radio", { name: "Lista" }));
      expect(within(filter()).getByRole("radio", { name: "Todos" })).toHaveAttribute("aria-checked", "true");
      expect(localStorage.getItem("soldi:open:ledger-planilha")).toBe("closed");
      expect(grid()).toHaveClass(TWO_COLUMNS);
    });

    it("hides the right column in Planilha and brings it back in Lista, keeping the hero and Contas a pagar (SOL-171 A16)", async () => {
      open({
        "GET /api/months/2026-11": {
          status: 200,
          body: { ...MONTH, projected_balance: "-312.40", projected_tier: "light_red", bills_of_month: BILLS_OF_MONTH },
        },
        "GET /api/forecast": { status: 200, body: FORECAST },
      });
      const rail = ["Termômetro do Mês", "Próximos meses", "Cofrinhos", "Para Onde Vai"];
      for (const name of rail) await screen.findByRole("region", { name });

      await userEvent.click(within(views()).getByRole("radio", { name: "Planilha" }));
      expect(await within(ledger()).findAllByRole("table")).not.toHaveLength(0);
      for (const name of rail) expect(screen.queryByRole("region", { name })).not.toBeInTheDocument();
      for (const name of ["Saldo hoje", "Contas a pagar"])
        expect(screen.getByRole("region", { name })).toBeInTheDocument();

      await userEvent.click(within(views()).getByRole("radio", { name: "Lista" }));
      for (const name of rail) expect(await screen.findByRole("region", { name })).toBeInTheDocument();
    });

    it("opens on Planilha when it was chosen on an earlier visit, even for a month with no entries", async () => {
      localStorage.setItem("soldi:open:ledger-planilha", "open");
      open({
        "GET /api/months/2026-11": { status: 200, body: { ...MONTH, bills_of_month: [] } },
        "GET /api/transactions": { status: 200, body: [] },
      });

      expect(
        await within(await screen.findByRole("region", { name: "Lançamentos" })).findAllByRole("table"),
      ).toHaveLength(12);
      expect(within(views()).getByRole("radio", { name: "Planilha" })).toHaveAttribute("aria-checked", "true");
    });

    it("keeps the planilha's cells when the entries fail, with no Lista error (States: entries only)", async () => {
      localStorage.setItem("soldi:open:ledger-planilha", "open");
      const intersection = stubIntersection();
      open({ "GET /api/transactions": { status: 500, body: problem(500, "Falhou.") } });

      intersection.show(
        await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("table", {
          name: "Novembro 2026",
        }),
      );

      expect(
        await within(ledger()).findByRole("button", { name: /^Segunda-feira, 23 de novembro/ }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Não foi possível carregar os lançamentos.")).not.toBeInTheDocument();
    });

    it("opens a collapsed Lançamentos on Planilha when that view is chosen", async () => {
      localStorage.setItem("soldi:open:ledger", "closed");
      open();
      await userEvent.click(
        within(
          await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("radiogroup", {
            name: "Ver lançamentos como",
          }),
        ).getByRole("radio", { name: "Planilha" }),
      );

      expect(within(ledger()).getByRole("button", { name: "Lançamentos" })).toHaveAttribute("aria-expanded", "true");
      expect(await within(ledger()).findAllByRole("table")).toHaveLength(12);
    });

    it("scrolls the planilha to the month picked in the hero (A12)", async () => {
      localStorage.setItem("soldi:open:ledger-planilha", "open");
      const scrollTo = vi.spyOn(Element.prototype, "scrollTo");
      open({ "GET /api/months/2026-12": { status: 200, body: { ...MONTH, month: "2026-12" } } });
      await within(await screen.findByRole("region", { name: "Lançamentos" })).findAllByRole("table");
      const calls = scrollTo.mock.calls.length;

      setSearch("m=2026-12");
      rerender(<QueryClientProvider client={client}>{page()}</QueryClientProvider>);

      await waitFor(() => expect(scrollTo.mock.calls.length).toBeGreaterThan(calls));
      expect(scrollTo.mock.contexts.at(-1)).toBe(within(ledger()).getAllByRole("table")[0].parentElement);
    });

    it("jumps from the red-day banner to that day in the planilha, focused and ringed for 2 s (A14)", async () => {
      localStorage.setItem("soldi:open:ledger-planilha", "open");
      const intersection = stubIntersection();
      open({
        "GET /api/months/2026-11": { status: 200, body: FORECAST_MONTH },
        "GET /api/transactions": { status: 200, body: FORECAST_TRANSACTIONS },
      });
      const first = await screen.findByRole("button", { name: "Ver o dia 23" });
      intersection.show(await within(ledger()).findByRole("table", { name: "Novembro 2026" }));
      const day = await within(ledger()).findByRole("button", { name: "Segunda-feira, 23 de novembro" });

      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      vi.setSystemTime(new Date(2026, 10, 5, 12));
      fireEvent.click(first);

      expect(day).toHaveFocus();
      expect(day).toHaveClass("ring-expense", "ring-2");
      act(() => vi.advanceTimersByTime(2000));
      expect(day).not.toHaveClass("ring-2");
    });
  });

  it("goes back to Todos when the month changes, and again on returning to the month left filtered", async () => {
    open({
      "GET /api/months/2026-12": { status: 200, body: { ...MONTH, month: "2026-12" } },
    });

    await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: /Compras da semana/,
    });
    await userEvent.click(within(filter()).getByRole("radio", { name: "Contas fixas" }));
    setSearch("m=2026-12");
    rerender(<QueryClientProvider client={client}>{page()}</QueryClientProvider>);

    await waitFor(() =>
      expect(within(filter()).getByRole("radio", { name: "Todos" })).toHaveAttribute("aria-checked", "true"),
    );
    setSearch("");
    rerender(<QueryClientProvider client={client}>{page()}</QueryClientProvider>);

    await waitFor(() => expect(dayHeadings()).toHaveLength(3));
    expect(within(filter()).getByRole("radio", { name: "Todos" })).toHaveAttribute("aria-checked", "true");
  });

  it("keeps an unpaid conta fixa under Contas fixas and out of Diário", async () => {
    open({
      "GET /api/months/2026-11": {
        status: 200,
        body: { ...MONTH, bills_of_month: [{ ...BILLS_OF_MONTH[1], lands_on: "2026-11-10" }] },
      },
      "GET /api/transactions": { status: 200, body: [TRANSACTIONS[0]] },
    });

    await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: /Compras da semana/,
    });
    await userEvent.click(within(filter()).getByRole("radio", { name: "Contas fixas" }));
    expect(within(ledger()).getByRole("listitem", { name: "Aluguel Residencial" })).toBeInTheDocument();
    await userEvent.click(within(filter()).getByRole("radio", { name: "Diário" }));
    expect(within(ledger()).queryByRole("listitem", { name: "Aluguel Residencial" })).not.toBeInTheDocument();
  });

  it("leaves money put in a cofrinho out of Contas fixas and in Todos", async () => {
    open({
      "GET /api/categories": { status: 200, body: WITH_COFRINHOS },
      "GET /api/transactions": { status: 200, body: [TRANSACTIONS[1], MOVEMENTS[1]] },
    });

    await within(await screen.findByRole("region", { name: "Lançamentos" })).findByText("Guardado");
    await userEvent.click(within(filter()).getByRole("radio", { name: "Contas fixas" }));
    expect(within(ledger()).getByRole("button", { name: /Aluguel/ })).toBeInTheDocument();
    expect(within(ledger()).queryByText("Guardado")).not.toBeInTheDocument();
    await userEvent.click(within(filter()).getByRole("radio", { name: "Todos" }));
    expect(within(ledger()).getByText("Guardado")).toBeInTheDocument();
  });

  it("keeps the filter when its own option is tapped again", async () => {
    open();

    await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: /Compras da semana/,
    });
    await userEvent.click(within(filter()).getByRole("radio", { name: "Diário" }));
    await userEvent.click(within(filter()).getByRole("radio", { name: "Diário" }));
    expect(within(filter()).getByRole("radio", { name: "Diário" })).toHaveAttribute("aria-checked", "true");
    expect(dayHeadings()).toEqual(["Hoje, 5 novSaldo ao final:R$ 957,79Apertado"]);
  });

  it("has no expand button when the month fits the cap", async () => {
    open();
    await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: /Compras da semana/,
    });
    expect(within(ledger()).queryByRole("button", { name: /Ver o mês inteiro/ })).not.toBeInTheDocument();
  });

  it("shows no banner when no day ahead is red", async () => {
    open();

    await screen.findByRole("region", { name: "Saldo hoje" });
    expect(screen.queryByRole("region", { name: "Alerta do mês" })).not.toBeInTheDocument();
    expect(screen.queryByText(/no vermelho/)).not.toBeInTheDocument();
  });

  it("opens a month from Próximos meses at the top of the screen", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    open({ "GET /api/forecast": { status: 200, body: FORECAST } });

    const strip = await screen.findByRole("region", { name: "Próximos meses" });
    await userEvent.click(await within(strip).findByRole("button", { name: /^dezembro de 2026/ }));

    expect(window.location.pathname + window.location.search).toBe("/mes?m=2026-12");
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it("links Posso comprar? in Próximos meses to its page", async () => {
    open({
      "GET /api/months/2026-11": { status: 200, body: EMPTY },
      "GET /api/forecast": { status: 200, body: FORECAST },
    });

    const strip = await screen.findByRole("region", { name: "Próximos meses" });
    expect(within(strip).getByRole("link", { name: "Posso comprar?" })).toHaveAttribute("href", "/posso-comprar");
  });

  it("keeps the month on screen when Próximos meses fails", async () => {
    open({ "GET /api/forecast": { status: 500, body: problem(500, "Erro") } });

    const strip = await screen.findByRole("region", { name: "Próximos meses" });
    expect(await within(strip).findByText("Não foi possível carregar.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Saldo hoje" })).toBeInTheDocument();
    expect(ledger()).toBeInTheDocument();
  });
});
