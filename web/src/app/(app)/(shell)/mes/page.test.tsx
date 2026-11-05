import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { router, setSearch } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { BILLS_OF_MONTH, CATEGORIES, MERCADO, MONTH, problem, signedIn, TRANSACTIONS } from "@/test/stub-api";

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
    expect(within(summary).getByText("R$ 500,00")).toHaveClass("text-income");
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
    expect(within(ledger()).getByRole("button", { name: /Aluguel/ })).toHaveTextContent("AluguelContaR$ 1.200,00");
    expect(within(ledger()).getByText("+ R$ 500,00")).toHaveClass("text-income");
  });

  it("hides entries dated in the future", async () => {
    const later = { ...TRANSACTIONS[0], id: "later", date: "2026-11-20", note: "Show" };
    open({ "GET /api/transactions": { status: 200, body: [later, ...TRANSACTIONS] } });

    await within(await screen.findByRole("region", { name: "Lançamentos" })).findByText("Compras da semana");
    expect(screen.queryByText("Show")).not.toBeInTheDocument();
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
});
