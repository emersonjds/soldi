import type { ReactNode } from "react";

import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { router, setSearch } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import {
  ANA,
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

const bill = (date: string): Schemas["Transaction"] => ({
  ...TRANSACTIONS[1],
  id: `b-${date}`,
  date,
  note: `Conta ${date}`,
});

const ledger = () => screen.getByRole("region", { name: "Lançamentos" });

const spent = (date: string): Schemas["Transaction"] => ({
  ...TRANSACTIONS[0],
  id: `t-${date}`,
  date,
  note: `Gasto ${date}`,
});

const EMPTY = {
  ...MONTH,
  totals: { ...MONTH.totals, income: "0.00", bills: "0.00", daily: "0.00", outflow: "0.00", performance: "0.00" },
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

  it("greets on the indigo hero below 1024 and, from 1024, shows today's balance, the projection box and the split of the outflow", async () => {
    open({
      "GET /api/months/2026-11": {
        status: 200,
        body: { ...MONTH, projected_balance: "-312.40", projected_tier: "light_red" },
      },
    });

    const hero = await screen.findByRole("region", { name: "Saldo hoje" });
    expect(await within(hero).findByText("Olá, Ana")).toBeInTheDocument();
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
    expect(
      within(split).getByRole("img", { name: /^Saídas R\$\s1\.384,31: contas fixas 86,7%, gastos diários 13,3%$/ }),
    ).toBeInTheDocument();

    const summary = within(hero).getByRole("region", { name: "Resumo do mês" });
    expect(summary).toHaveClass("lg:hidden");
    expect(within(summary).getByText("R$ 500,00")).toHaveClass("text-income-text");
    expect(within(summary).getByText("R$ 1.384,31")).toBeInTheDocument();
    expect(summary).toHaveTextContent(/Projetado-R\$\s312,40Atenção/);

    const thermometer = screen.getByRole("region", { name: "Termômetro do Mês" });
    expect(within(thermometer).getByRole("meter")).toHaveAttribute("aria-valuetext", "Apertado");
    expect(thermometer).toHaveTextContent("Você comprometeu 277% das receitas líquidas.");
    expect(document.body).not.toHaveTextContent(/ritmo/i);
  });

  it("splits the entrada into Contas fixas, Guardado, Gastos diários and Livre restante, each with one decimal", async () => {
    open(
      withTotals({
        income: "6361.60",
        bills: "3484.13",
        saved: "776.13",
        daily: "1548.50",
        outflow: "5032.63",
        performance: "1328.97",
      }),
    );

    const hero = await screen.findByRole("region", { name: "Saldo hoje" });
    expect(hero).toHaveTextContent(/Total:\sR\$\s6\.361,60/);
    expect(
      within(hero).getByRole("img", {
        name: /^Entradas R\$\s6\.361,60: contas fixas 42,6%, guardado 12,2%, gastos diários 24,3%, livre restante 20,9%$/,
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
      "Hoje, 5 novR$ 957,79Apertado",
      "Ontem, 4 novR$ 1.142,10Confortável",
      "3 novR$ 2.342,10Folga",
    ]);
    const groceries = within(ledger()).getByRole("button", { name: /Compras da semana/ });
    expect(groceries).toHaveTextContent("Compras da semanaDiárioR$ 184,31");
    expect(within(ledger()).getByRole("button", { name: /Aluguel/ })).toHaveTextContent("AluguelSaídaR$ 1.200,00");
    expect(within(ledger()).getByText("+ R$ 500,00")).toHaveClass("text-income-text");
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
      "Economia › ReservaGuardadoR$ 100,00",
    );
    expect(within(ledger()).getByRole("button", { name: /^Economia.*R\$\s10,00/ })).toHaveTextContent(
      "EconomiaGuardadoR$ 10,00",
    );
    expect(screen.getByRole("region", { name: "Termômetro do Mês" })).not.toHaveTextContent("Guardou");

    await userEvent.click(resgate);
    expect(await screen.findByText("Resgatado · Resgate › Reserva")).toBeInTheDocument();
  });

  it("says nothing about saving when the month kept nothing", async () => {
    open();

    expect(await screen.findByRole("region", { name: "Termômetro do Mês" })).not.toHaveTextContent("Guardou");
  });

  it("lists a future day first as Agendado with its Previsto balance, and its entry opens Editar / Excluir", async () => {
    const later = { ...TRANSACTIONS[0], id: "later", date: "2026-11-20", note: "Show" };
    open({ "GET /api/transactions": { status: 200, body: [later, ...TRANSACTIONS] } });

    const days = await within(await screen.findByRole("region", { name: "Lançamentos" })).findAllByRole("heading", {
      level: 3,
    });
    expect(days.map((day) => day.textContent?.replace(/\s/g, " "))).toEqual([
      "Agendado · 20 novR$ 957,79Previsto · Apertado",
      "Hoje, 5 novR$ 957,79Apertado",
      "Ontem, 4 novR$ 1.142,10Confortável",
      "3 novR$ 2.342,10Folga",
    ]);
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
      "Agendado · 10 nov-R$ 1.585,87Previsto · Crítico",
      "Hoje, 5 novR$ 673,69Previsto · Apertado",
      "Ontem, 4 novR$ 1.142,10Confortável",
      "3 novR$ 2.342,10Folga",
    ]);
    expect(within(ledger()).getByRole("listitem", { name: "Aluguel Residencial" })).toHaveTextContent(
      "Aluguel ResidencialConta fixa · a pagarR$ 2.259,56",
    );
    expect(within(ledger()).getByRole("listitem", { name: "Luz (Enel)" })).toHaveTextContent(
      "Luz (Enel)Conta fixa · venceu dia 02/11R$ 284,10",
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
    open(withTotals({ income: "1040.00", bills: "130.00", daily: "0.00", outflow: "130.00", performance: "910.00" }));

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
        body: { ...REPORT, outflow_total: "0.00", income_total: "0.00", groups: [] },
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
    expect(await screen.findByRole("dialog", { name: "Lançar" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Entrada" })).toBeChecked();
  });

  it("opens Lançar on Entrada with a one-time hint when coming from the tour", async () => {
    setSearch("lancar=1");
    window.history.replaceState(null, "", "/mes?lancar=1");
    open({ "GET /api/months/2026-11": { status: 200, body: EMPTY } });

    const sheet = await screen.findByRole("dialog", { name: "Lançar" });
    expect(within(sheet).getByText("Comece pela sua primeira entrada do mês")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Entrada" })).toBeChecked();
    expect(`${window.location.pathname}${window.location.search}`).toBe("/mes");

    await userEvent.click(within(sheet).getByRole("button", { name: "Fechar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Lançar entrada" }));
    expect(await screen.findByRole("dialog", { name: "Lançar" })).toBeInTheDocument();
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
    for (const name of ["Lançamentos", "Próximos meses", "Cofrinhos", "Para onde vai"]) {
      await screen.findByRole("region", { name });
    }
    const order = [
      "Saldo hoje",
      "Contas a pagar",
      "Lançamentos",
      "Termômetro do Mês",
      "Próximos meses",
      "Cofrinhos",
      "Para onde vai",
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
    expect(await within(cofrinhos).findByText("Viagem")).toBeVisible();
    const spending = await screen.findByRole("region", { name: "Para onde vai" });
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
    expect(within(cofrinhos).getByText("Viagem")).toBeVisible();
    expect(within(spending).getByText("Mercado")).toBeInTheDocument();
  });

  it("shows the month's error in the hero and keeps the other cards", async () => {
    const requests = open({
      "GET /api/months/2026-11": { status: 500, body: problem(500, "Falhou.") },
      "GET /api/forecast": { status: 200, body: FORECAST },
    });

    const hero = await screen.findByRole("region", { name: "Saldo hoje" });
    expect(await within(hero).findByText("Não foi possível carregar o mês.")).toBeInTheDocument();
    expect(await within(screen.getByRole("region", { name: "Cofrinhos" })).findByText("Viagem")).toBeVisible();
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
    expect(await screen.findByRole("link", { name: "Ver tudo" })).toHaveAttribute("href", "/para-onde-vai?m=2026-12");
    const switcher = within(hero).getByRole("group", { name: "Mês" });
    expect(switcher).toHaveTextContent("Dezembro 2026");
    await userEvent.click(within(switcher).getByRole("button", { name: "Próximo mês" }));
    expect(router.replace).toHaveBeenCalledWith("/mes?m=2027-01", { scroll: false });
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
        body: [{ ...TRANSACTIONS[1], series: { id: "s1", position: 3, total: 12, last_date: "2027-08-04" } }],
      },
    });

    const row = await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: /Aluguel/,
    });
    expect(row).toHaveTextContent(/^AluguelSaída · 3\/12/);
    expect(within(row).queryByRole("img")).not.toBeInTheDocument();
    expect(within(row).getByText("· 3/12")).toHaveAttribute("aria-hidden", "true");
    expect(within(row).getByText("3 de 12")).toHaveClass("sr-only");
  });

  it("asks how much of a series to delete, then deletes without Desfazer", async () => {
    const member = { ...TRANSACTIONS[1], series: { id: "s1", position: 3, total: 12, last_date: "2027-08-04" } };
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
    expect(within(actions).getByRole("radio", { name: "Só este" })).toBeChecked();
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

  it("deletes only this member by default", async () => {
    const member = { ...TRANSACTIONS[1], series: { id: "s1", position: 1, total: 2, last_date: "2026-12-04" } };
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
    expect(within(actions).getByRole("radio", { name: "Toda a série" })).not.toBeChecked();
    await userEvent.click(within(actions).getByRole("button", { name: "Excluir" }));

    expect(await screen.findByText("Lançamento excluído")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desfazer" })).not.toBeInTheDocument();
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
    expect(within(edit).getByLabelText("Valor")).toHaveValue("1.200,00");
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
    await userEvent.click(await screen.findByRole("button", { name: "Transformar em conta fixa" }));

    const bill = await screen.findByRole("dialog", { name: "Nova conta" });
    expect(within(bill).getByLabelText("Nome")).toHaveValue("Aluguel");
    expect(within(bill).getByLabelText("Vence dia")).toHaveValue("4");
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

  it("expands the capped ledger before jumping to a red day it hides", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    open({
      "GET /api/months/2026-11": { status: 200, body: FORECAST_MONTH },
      "GET /api/transactions": {
        status: 200,
        body: [...FORECAST_TRANSACTIONS, ...["06", "07", "08"].map((day) => spent(`2026-11-${day}`))],
      },
    });

    const first = await screen.findByRole("button", { name: "Ver o dia 23" });
    await within(ledger()).findByRole("button", { name: /Gasto 2026-11-06/ });
    expect(document.getElementById("dia-2026-11-23")).toBeNull();

    fireEvent.click(first);
    const day = document.getElementById("dia-2026-11-23");
    expect(day).not.toBeNull();
    expect(scroll.mock.contexts.at(-1)).toBe(day);
    expect(day).toHaveFocus();
    expect(within(ledger()).getByRole("button", { name: "Mostrar menos" })).toHaveAttribute("aria-expanded", "true");
    scroll.mockRestore();
  });

  it("caps the ledger to the next 3 scheduled days, today and the 6 before, and expands in place keeping focus", async () => {
    open({
      "GET /api/transactions": {
        status: 200,
        body: ["10", "09", "08", "07", "06", "04", "03", "02", "01"].map((day) => spent(`2026-11-${day}`)),
      },
    });

    const toggle = await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: "Ver o mês inteiro (9 dias)",
    });
    const shownDays = () =>
      within(ledger())
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.closest("[id]")?.id);
    expect(shownDays()).toEqual([
      "dia-2026-11-08",
      "dia-2026-11-07",
      "dia-2026-11-06",
      "dia-2026-11-04",
      "dia-2026-11-03",
      "dia-2026-11-02",
      "dia-2026-11-01",
    ]);
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    toggle.focus();
    await userEvent.click(toggle);
    expect(toggle).toHaveTextContent("Mostrar menos");
    expect(toggle).toHaveFocus();
    expect(shownDays()).toHaveLength(9);

    await userEvent.click(toggle);
    expect(toggle).toHaveTextContent("Ver o mês inteiro (9 dias)");
    expect(toggle).toHaveFocus();
    expect(shownDays()).toHaveLength(7);
  });

  it("shows the last 7 days of a past month", async () => {
    setSearch("m=2026-10");
    const october = {
      ...MONTH,
      month: "2026-10",
      days: MONTH.days.map((day) => ({
        ...day,
        date: day.date.replace("-11-", "-10-"),
        is_today: false,
        is_future: false,
      })),
    };
    open({
      "GET /api/months/2026-10": { status: 200, body: october },
      "GET /api/transactions": {
        status: 200,
        body: ["30", "28", "25", "20", "15", "10", "05", "02"].map((day) => spent(`2026-10-${day}`)),
      },
    });

    await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: "Ver o mês inteiro (8 dias)",
    });
    expect(within(ledger()).queryByRole("button", { name: /Gasto 2026-10-02/ })).not.toBeInTheDocument();
    expect(within(ledger()).getByRole("button", { name: /Gasto 2026-10-05/ })).toBeInTheDocument();
    expect(within(ledger()).getByRole("button", { name: /Gasto 2026-10-30/ })).toBeInTheDocument();
  });

  it("filters Lançamentos by Diário or Contas on the loaded month, keeping each day's own balance", async () => {
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
    expect(dayHeadings()).toEqual(["Hoje, 5 novR$ 957,79Apertado"]);
    expect(within(ledger()).getByRole("button", { name: /Compras da semana/ })).toBeInTheDocument();
    expect(within(ledger()).queryByRole("button", { name: /Aluguel/ })).not.toBeInTheDocument();

    await userEvent.click(within(filter()).getByRole("radio", { name: "Contas" }));
    expect(dayHeadings()).toEqual([
      "Agendado · 10 novR$ 957,79Previsto · Apertado",
      "Ontem, 4 novR$ 1.142,10Confortável",
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
    await userEvent.click(within(filter()).getByRole("radio", { name: "Contas" }));
    expect(within(ledger()).getByText("Nenhuma conta neste mês.")).toBeInTheDocument();
    expect(within(ledger()).queryByText("Nenhum lançamento ainda")).not.toBeInTheDocument();
  });

  it("counts the filtered days in Ver o mês inteiro", async () => {
    open({
      "GET /api/transactions": {
        status: 200,
        body: [
          ...["10", "09", "08", "07", "06", "04", "03", "02", "01"].map((day) => spent(`2026-11-${day}`)),
          ...["12", "15"].map((day) => bill(`2026-11-${day}`)),
        ],
      },
    });

    await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: "Ver o mês inteiro (11 dias)",
    });
    await userEvent.click(within(filter()).getByRole("radio", { name: "Diário" }));
    expect(within(ledger()).getByRole("button", { name: "Ver o mês inteiro (9 dias)" })).toBeInTheDocument();
    await userEvent.click(within(filter()).getByRole("radio", { name: "Contas" }));
    expect(within(ledger()).queryByRole("button", { name: /Ver o mês inteiro/ })).not.toBeInTheDocument();
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

  it("goes back to Todos when the month changes, and again on returning to the month left filtered", async () => {
    open({
      "GET /api/months/2026-12": { status: 200, body: { ...MONTH, month: "2026-12" } },
    });

    await within(await screen.findByRole("region", { name: "Lançamentos" })).findByRole("button", {
      name: /Compras da semana/,
    });
    await userEvent.click(within(filter()).getByRole("radio", { name: "Contas" }));
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

  it("keeps an unpaid conta fixa under Contas and out of Diário", async () => {
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
    await userEvent.click(within(filter()).getByRole("radio", { name: "Contas" }));
    expect(within(ledger()).getByRole("listitem", { name: "Aluguel Residencial" })).toBeInTheDocument();
    await userEvent.click(within(filter()).getByRole("radio", { name: "Diário" }));
    expect(within(ledger()).queryByRole("listitem", { name: "Aluguel Residencial" })).not.toBeInTheDocument();
  });

  it("leaves money put in a cofrinho out of Contas and in Todos", async () => {
    open({
      "GET /api/categories": { status: 200, body: WITH_COFRINHOS },
      "GET /api/transactions": { status: 200, body: [TRANSACTIONS[1], MOVEMENTS[1]] },
    });

    await within(await screen.findByRole("region", { name: "Lançamentos" })).findByText("Guardado");
    await userEvent.click(within(filter()).getByRole("radio", { name: "Contas" }));
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
    expect(dayHeadings()).toEqual(["Hoje, 5 novR$ 957,79Apertado"]);
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
    await userEvent.click(await within(strip).findByRole("button", { name: /^dez 2026/ }));

    expect(router.replace).toHaveBeenCalledWith("/mes?m=2026-12", { scroll: false });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it("opens Lançar in Simular on Diário from Posso comprar?, and the next Lançar starts without it", async () => {
    open({
      "GET /api/months/2026-11": { status: 200, body: EMPTY },
      "GET /api/forecast": { status: 200, body: FORECAST },
    });

    const strip = await screen.findByRole("region", { name: "Próximos meses" });
    await userEvent.click(within(strip).getByRole("button", { name: "Posso comprar?" }));
    const sheet = await screen.findByRole("dialog", { name: "Lançar" });
    expect(within(sheet).getByRole("switch", { name: "Simular" })).toBeChecked();
    expect(within(sheet).getByRole("radio", { name: "Diário" })).toBeChecked();

    await userEvent.click(within(sheet).getByRole("button", { name: "Fechar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Lançar entrada" }));
    expect(
      within(await screen.findByRole("dialog", { name: "Lançar" })).getByRole("switch", { name: "Simular" }),
    ).not.toBeChecked();
  });

  it("keeps the month on screen when Próximos meses fails", async () => {
    open({ "GET /api/forecast": { status: 500, body: problem(500, "Erro") } });

    const strip = await screen.findByRole("region", { name: "Próximos meses" });
    expect(await within(strip).findByText("Não foi possível carregar.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Saldo hoje" })).toBeInTheDocument();
    expect(ledger()).toBeInTheDocument();
  });
});
