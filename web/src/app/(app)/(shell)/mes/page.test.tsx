import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { router, setSearch } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import {
  BILLS_OF_MONTH,
  CARRIED_ALUGUEL,
  CATEGORIES,
  ECONOMIA,
  FORECAST,
  FORECAST_MONTH,
  FORECAST_TRANSACTIONS,
  MERCADO,
  MONTH,
  MOVEMENTS,
  problem,
  signedIn,
  TRANSACTIONS,
  WITH_COFRINHOS,
} from "@/test/stub-api";

import MesPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

type Reply = { status: number; body?: unknown };

const open = (replies: Record<string, Reply> = {}) => {
  const requests = signedIn({
    "GET /api/months/2026-11": { status: 200, body: MONTH },
    "GET /api/transactions": { status: 200, body: TRANSACTIONS },
    "GET /api/categories": { status: 200, body: CATEGORIES },
    ...replies,
  });
  renderWithQuery(
    <>
      <MesPage />
      <Toaster />
    </>,
  );
  return requests;
};

const ledger = () => screen.getByRole("region", { name: "Lançamentos" });

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

  it("shows today's balance and tier, the month summary and the thermometer from the server", async () => {
    open();

    const hero = await screen.findByRole("region", { name: "Saldo hoje" });
    expect(within(hero).getByText("R$ 957,79")).toBeInTheDocument();
    expect(within(hero).getByText("Apertado")).toBeInTheDocument();
    expect(within(hero).getByText("Novembro 2026")).toBeInTheDocument();

    const summary = screen.getByRole("region", { name: "Resumo do mês" });
    expect(within(summary).getByText("R$ 500,00")).toHaveClass("text-income-text");
    expect(within(summary).getByText("R$ 1.384,31")).toBeInTheDocument();
    expect(within(summary).getByText("R$ 957,79")).toBeInTheDocument();
    expect(within(summary).getByText("Apertado")).toBeInTheDocument();

    const thermometer = screen.getByRole("region", { name: "Termômetro do Mês" });
    expect(within(thermometer).getByRole("meter")).toHaveAttribute("aria-valuetext", "Apertado");
    expect(thermometer).toHaveTextContent(
      "Você comprometeu 277% da renda. Com as contas em aberto, seu mês termina em R$ 957,79.",
    );
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
    expect(screen.getByRole("region", { name: "Termômetro do Mês" })).toHaveTextContent("Guardou R$ 250,00 este mês.");

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

  it("invites the first entry when the month is empty and has no income yet", async () => {
    const empty = { ...MONTH, totals: { ...MONTH.totals, income: "0.00", outflow: "0.00" } };
    open({
      "GET /api/months/2026-11": { status: 200, body: empty },
      "GET /api/transactions": { status: 200, body: [] },
    });

    expect(await screen.findByText("Nenhum lançamento ainda")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Termômetro do Mês" })).toHaveTextContent(
      "Nenhuma entrada ainda este mês. Com as contas em aberto",
    );
    await userEvent.click(screen.getByRole("button", { name: "Lançar agora" }));
    expect(await screen.findByRole("dialog", { name: "Lançar" })).toBeInTheDocument();
  });

  it("opens Lançar on Entrada from the Entradas card", async () => {
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Lançar entrada" }));
    expect(await screen.findByRole("dialog", { name: "Lançar" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Entrada" })).toBeChecked();
  });

  it("opens Lançar on Entrada with a one-time hint when coming from the tour", async () => {
    setSearch("lancar=1");
    window.history.replaceState(null, "", "/mes?lancar=1");
    open();

    const sheet = await screen.findByRole("dialog", { name: "Lançar" });
    expect(within(sheet).getByText("Comece pela sua primeira entrada do mês")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Entrada" })).toBeChecked();
    expect(`${window.location.pathname}${window.location.search}`).toBe("/mes");

    await userEvent.click(within(sheet).getByRole("button", { name: "Fechar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Lançar entrada" }));
    expect(await screen.findByRole("dialog", { name: "Lançar" })).toBeInTheDocument();
    expect(screen.queryByText("Comece pela sua primeira entrada do mês")).not.toBeInTheDocument();
  });

  it("puts Contas do Mês between the summary and the thermometer, and a negative projection in red", async () => {
    open({
      "GET /api/months/2026-11": {
        status: 200,
        body: { ...MONTH, projected_balance: "-312.40", projected_tier: "light_red", bills_of_month: BILLS_OF_MONTH },
      },
    });

    const bills = await screen.findByRole("region", { name: "Contas do Mês" });
    const summary = screen.getByRole("region", { name: "Resumo do mês" });
    const thermometer = screen.getByRole("region", { name: "Termômetro do Mês" });
    expect(summary.compareDocumentPosition(bills) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bills.compareDocumentPosition(thermometer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(bills).getByRole("listitem", { name: "Luz (Enel)" })).toHaveTextContent("Vencido");
    expect(within(summary).getByText("-R$ 312,40")).toHaveClass("text-expense");
    expect(within(thermometer).getByText("-R$ 312,40")).toHaveClass("text-expense");
  });

  it("shows a skeleton while loading, then an error card with a retry", async () => {
    const requests = open({ "GET /api/months/2026-11": { status: 500, body: problem(500, "Falhou.") } });

    expect(screen.getByRole("status", { name: "Carregando" })).toBeInTheDocument();
    expect(await screen.findByText("Não foi possível carregar o mês.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

    await waitFor(() =>
      expect(requests.filter((request) => request.url.endsWith("/api/months/2026-11"))).toHaveLength(2),
    );
  });

  it("opens the month in the address and moves through months with the arrows", async () => {
    setSearch("m=2026-12");
    const requests = open({
      "GET /api/months/2026-12": { status: 200, body: { ...MONTH, month: "2026-12" } },
      "GET /api/transactions": { status: 200, body: [] },
    });

    expect(await screen.findByText("Dezembro 2026")).toBeInTheDocument();
    expect(requests.some((request) => request.url.endsWith("/api/transactions?month=2026-12"))).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(router.replace).toHaveBeenLastCalledWith("/mes?m=2027-01", { scroll: false });
  });

  it("ignores a malformed month in the address and stops at the opening month", async () => {
    setSearch("m=nope");
    open();

    expect(await screen.findByText("Novembro 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mês anterior" })).toBeDisabled();
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
        body: [{ ...TRANSACTIONS[1], series: { id: "s1", position: 3, total: 12 } }],
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
    const member = { ...TRANSACTIONS[1], series: { id: "s1", position: 3, total: 12 } };
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
    const member = { ...TRANSACTIONS[1], series: { id: "s1", position: 1, total: 2 } };
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

  it("warns of the first red day and the worst day; a tap jumps to the day, rings it for 2 s and names the cause", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    open({
      "GET /api/months/2026-11": { status: 200, body: FORECAST_MONTH },
      "GET /api/transactions": { status: 200, body: FORECAST_TRANSACTIONS },
    });

    const hero = await screen.findByRole("region", { name: "Saldo hoje" });
    const first = await within(hero).findByRole("button", { name: /^Dia 23 fica no vermelho: -R\$\s675,00$/ });
    expect(
      within(hero).getByRole("button", { name: /^Pior dia: 28\/11, -R\$\s2\.916,00 · recupera em 30\/11$/ }),
    ).toBeVisible();
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

    const hero = await screen.findByRole("region", { name: "Saldo hoje" });
    const first = await within(hero).findByRole("button", { name: /^Dia 23 fica no vermelho/ });

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

  it("says nothing in the hero when no day ahead is red", async () => {
    open();

    const hero = await screen.findByRole("region", { name: "Saldo hoje" });
    expect(within(hero).queryByText(/no vermelho/)).not.toBeInTheDocument();
  });

  it("opens a month from Próximos meses at the top of the screen", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    open({ "GET /api/forecast": { status: 200, body: FORECAST } });

    const strip = await screen.findByRole("region", { name: "Próximos meses" });
    await userEvent.click(await within(strip).findByRole("button", { name: /^dez 2026/ }));

    expect(router.replace).toHaveBeenCalledWith("/mes?m=2026-12", { scroll: false });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it("keeps the month on screen when Próximos meses fails", async () => {
    open({ "GET /api/forecast": { status: 500, body: problem(500, "Erro") } });

    const strip = await screen.findByRole("region", { name: "Próximos meses" });
    expect(await within(strip).findByText("Não foi possível carregar.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Saldo hoje" })).toBeInTheDocument();
    expect(ledger()).toBeInTheDocument();
  });
});
