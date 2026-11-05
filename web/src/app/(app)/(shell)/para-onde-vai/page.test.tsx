import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { router, setSearch } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { MERCADO, problem, REPORT, signedIn, TRANSACTIONS } from "@/test/stub-api";

import ParaOndeVaiPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

type Reply = { status: number; body?: unknown };

const open = (replies: Record<string, Reply> = {}) => {
  const requests = signedIn({
    "GET /api/reports/categories": { status: 200, body: REPORT },
    "GET /api/transactions": { status: 200, body: [TRANSACTIONS[0]] },
    ...replies,
  });
  renderWithQuery(<ParaOndeVaiPage />);
  return requests;
};

const legend = () => screen.getByRole("list", { name: "Categorias" });
const row = (name: string) => within(legend()).getByRole("button", { name: new RegExp(`^${name}`) });

describe("Para onde vai", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
    setSearch("");
    router.replace.mockClear();
  });

  it("shows the month's outflow in the center and each category with its share and change", async () => {
    open();

    expect(screen.getByRole("heading", { level: 1, name: "Para onde vai" })).toBeInTheDocument();
    expect(await screen.findByText("Saídas do mês")).toBeInTheDocument();
    expect(screen.getByText("R$ 1.384,31")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Saídas" })).toBeChecked();

    expect(row("Aluguel")).toHaveTextContent("Aluguel87%−6% em relação ao mês anteriorR$ 1.200,00");
    expect(within(row("Aluguel")).getByText("−6%")).toHaveClass("text-income");
    expect(row("Mercado")).toHaveTextContent("Mercado13%+18% em relação ao mês anteriorR$ 184,31");
    expect(within(row("Mercado")).getByText("+18%")).toHaveClass("text-expense");

    const top = screen.getByRole("region", { name: "Top 5" });
    expect(
      within(top)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Aluguel86,7%", "Mercado13,3%"]);
  });

  it("switches to income, with no change badge when there was nothing before", async () => {
    open();

    await userEvent.click(await screen.findByRole("radio", { name: "Entradas" }));

    expect(screen.getByText("Entradas do mês")).toBeInTheDocument();
    expect(row("Salário")).toHaveTextContent(/^Salário100%R\$ 500,00$/);
    expect(screen.queryByText("Aluguel")).not.toBeInTheDocument();
  });

  it("filters the entries by the category chosen from the keyboard, and clears the filter", async () => {
    const requests = open();
    const mercado = await screen.findByRole("button", { name: /^Mercado/ });

    mercado.focus();
    await userEvent.keyboard("{Enter}");

    expect(mercado).toHaveAttribute("aria-pressed", "true");
    const entries = await screen.findByRole("region", { name: "Lançamentos de Mercado" });
    expect(await within(entries).findByText("Compras da semana")).toBeInTheDocument();
    expect(entries).toHaveTextContent("5 nov");
    const filtered = requests.find((request) => request.url.includes("/api/transactions"));
    expect(new URL(filtered?.url ?? "http://x").searchParams.get("category_id")).toBe(MERCADO.id);

    await userEvent.click(within(entries).getByRole("button", { name: "Limpar filtro" }));
    expect(mercado).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("region", { name: "Lançamentos de Mercado" })).not.toBeInTheDocument();
  });

  it("tapping the chosen category again clears the filter", async () => {
    open();
    const mercado = await screen.findByRole("button", { name: /^Mercado/ });

    await userEvent.click(mercado);
    await userEvent.click(mercado);

    expect(mercado).toHaveAttribute("aria-pressed", "false");
  });

  it("says when the entries of a category cannot load and retries", async () => {
    const requests = open({ "GET /api/transactions": { status: 500, body: problem(500, "Falhou.") } });

    await userEvent.click(await screen.findByRole("button", { name: /^Mercado/ }));
    const entries = screen.getByRole("region", { name: "Lançamentos de Mercado" });
    await userEvent.click(await within(entries).findByRole("button", { name: "Tentar de novo" }));

    await waitFor(() =>
      expect(requests.filter((request) => request.url.includes("/api/transactions"))).toHaveLength(2),
    );
  });

  it("says when nothing was spent yet", async () => {
    open({
      "GET /api/reports/categories": { status: 200, body: { ...REPORT, outflow: [], outflow_total: "0.00" } },
    });

    expect(await screen.findByText("Nenhum gasto neste mês ainda.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Top 5" })).not.toBeInTheDocument();
  });

  it("says when nothing came in yet", async () => {
    open({ "GET /api/reports/categories": { status: 200, body: { ...REPORT, income: [], income_total: "0.00" } } });

    await userEvent.click(await screen.findByRole("radio", { name: "Entradas" }));

    expect(screen.getByText("Nenhuma entrada neste mês ainda.")).toBeInTheDocument();
  });

  it("shows a skeleton while loading, then an error with a retry", async () => {
    const requests = open({ "GET /api/reports/categories": { status: 500, body: problem(500, "Falhou.") } });

    expect(screen.getByRole("status", { name: "Carregando" })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));

    await waitFor(() =>
      expect(requests.filter((request) => request.url.includes("/api/reports/categories"))).toHaveLength(2),
    );
  });

  it("opens the month in the address and moves with the switcher", async () => {
    setSearch("m=2026-12");
    const requests = open();

    expect(await screen.findByText("Dezembro 2026")).toBeInTheDocument();
    const report = requests.find((request) => request.url.includes("/api/reports/categories"));
    expect(new URL(report?.url ?? "http://x").searchParams.get("month")).toBe("2026-12");
    await userEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(router.replace).toHaveBeenLastCalledWith("/para-onde-vai?m=2027-01", { scroll: false });
  });

  it("ignores a malformed month and stops at the opening month", async () => {
    setSearch("m=2026-13");
    open();

    expect(await screen.findByText("Novembro 2026")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Mês anterior" })).toBeDisabled());
  });
});
