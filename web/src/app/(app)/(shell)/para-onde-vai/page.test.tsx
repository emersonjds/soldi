import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { router, setSearch } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { problem, REPORT, signedIn, TRANSACTIONS } from "@/test/stub-api";

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
const decorative = (text: string) => screen.getByText(text).closest("[aria-hidden]");

describe("Para onde vai", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
    setSearch("");
    router.replace.mockClear();
  });

  it("shows the month's outflow in the center and each category with its share and change", async () => {
    open();

    expect(screen.getByRole("region", { name: "Para onde vai" })).not.toHaveClass("lg:sr-only");
    expect(await screen.findByText("Saídas do mês")).toBeInTheDocument();
    expect(screen.getByText("R$ 1.384,31").parentElement).toHaveClass("text-[28px]");
    expect(screen.getByRole("radio", { name: "Saídas" })).toBeChecked();
    expect(screen.getByRole("region", { name: "Por categoria" })).toContainElement(
      screen.getByRole("heading", { level: 2, name: "Por categoria" }),
    );

    expect(row("Aluguel")).toHaveTextContent("Aluguel87% das saídas−6% em relação ao mês anteriorR$ 1.200,00");
    expect(within(row("Aluguel")).getByText("−6%")).toHaveClass("text-tier-green-foreground");
    expect(row("Mercado")).toHaveTextContent("Mercado13% das saídas+18% em relação ao mês anteriorR$ 184,31");
    expect(within(row("Mercado")).getByText("+18%")).toHaveClass("text-tier-red-foreground");

    const top = screen.getByRole("region", { name: "Top 5" });
    expect(top).toHaveAttribute("data-slot", "card");
    expect(screen.getByRole("region", { name: "Por categoria" })).toHaveAttribute("data-slot", "card");
    expect(
      within(top)
        .getAllByRole("listitem")
        .map((item) => item.textContent?.replace(/\s/g, " ")),
    ).toEqual(["AluguelR$ 1.200,00 (86,7%)", "MercadoR$ 184,31 (13,3%)"]);
  });

  it("switches to income, with no change badge when there was nothing before", async () => {
    open();

    await userEvent.click(await screen.findByRole("radio", { name: "Entradas" }));

    expect(screen.getByText("Entradas do mês")).toBeInTheDocument();
    expect(row("Salário")).toHaveTextContent(/^Salário100% das entradasR\$ 500,00$/);
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
    expect(new URL(filtered?.url ?? "http://x").searchParams.get("category_id")).toBeNull();

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
      "GET /api/reports/categories": {
        status: 200,
        body: { ...REPORT, outflow: [], outflow_total: "0.00", groups: REPORT.groups.slice(2) },
      },
    });

    expect(await screen.findByText("Nenhum gasto neste mês ainda.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Top 5" })).not.toBeInTheDocument();
    expect(decorative("Aluguel")).toHaveClass("pointer-events-none", "select-none", "opacity-50", "saturate-50");
  });

  it("says when nothing came in yet", async () => {
    open({
      "GET /api/reports/categories": {
        status: 200,
        body: { ...REPORT, income: [], income_total: "0.00", groups: REPORT.groups.slice(0, 2) },
      },
    });

    await userEvent.click(await screen.findByRole("radio", { name: "Entradas" }));

    expect(screen.getByText("Nenhuma entrada neste mês ainda.")).toBeInTheDocument();
    expect(decorative("+ R$ 5.000,00")).toHaveClass("pointer-events-none", "select-none", "opacity-50", "saturate-50");
  });

  it("shows a skeleton while loading, then an error with a retry", async () => {
    const requests = open({ "GET /api/reports/categories": { status: 500, body: problem(500, "Falhou.") } });

    expect(screen.getByRole("status", { name: "Carregando" })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));

    await waitFor(() =>
      expect(requests.filter((request) => request.url.includes("/api/reports/categories"))).toHaveLength(2),
    );
  });

  const reportMonth = (requests: Request[]) =>
    new URL(
      requests.find((request) => request.url.includes("/api/reports/categories"))?.url ?? "http://x",
    ).searchParams.get("month");

  it("opens the month in the address and leaves the switcher to the shell", async () => {
    setSearch("m=2026-12");
    const requests = open();

    await screen.findByText("Saídas do mês");
    expect(reportMonth(requests)).toBe("2026-12");
    expect(screen.queryByRole("group", { name: "Mês" })).not.toBeInTheDocument();
  });

  it("ignores a malformed month", async () => {
    setSearch("m=2026-13");
    const requests = open();

    await screen.findByText("Saídas do mês");
    expect(reportMonth(requests)).toBe("2026-11");
  });
});
