import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { router, setSearch } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { problem, REPORT, signedIn, TRANSACTIONS } from "@/test/stub-api";

const WITH_ECONOMIA = {
  ...REPORT,
  groups: [...REPORT.groups, { ...REPORT.groups[1], category_id: "economia-id", name: "Economia" }],
};

import ParaOndeVaiPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

type Reply = { status: number; body?: unknown };

const open = (replies: Record<string, Reply> = {}) => {
  const requests = signedIn({
    "GET /api/reports/categories": { status: 200, body: REPORT },
    "GET /api/transactions": { status: 200, body: [TRANSACTIONS[0]] },
    "GET /api/transactions?month=2026-10": { status: 200, body: [] },
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

  it("opens with the mobile hero, its eyebrow and month switcher, and the month's outflow only", async () => {
    open();

    const hero = screen.getByRole("region", { name: "Para onde vai" });
    expect(hero).toHaveClass("lg:hidden");
    expect(hero).toHaveTextContent("FLUXO DE DESPESAS • CONSOLIDADO");
    await userEvent.click(within(hero).getByRole("button", { name: "Próximo mês" }));
    expect(window.location.pathname + window.location.search).toBe("/para-onde-vai?m=2026-12");

    expect(await screen.findByText("Total gasto")).toBeInTheDocument();
    expect(row("Aluguel")).toHaveTextContent("86,7% das despesas");
    expect(row("Mercado")).toHaveTextContent("R$ 184,31");
    expect(within(legend()).queryByRole("button", { name: /^Salário/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Entradas" })).not.toBeInTheDocument();
  });

  it("lists a group's entries when picked from the keyboard, and clears it on a second press", async () => {
    open();
    await screen.findByText("Total gasto");
    const mercado = row("Mercado");

    mercado.focus();
    await userEvent.keyboard("{Enter}");

    expect(mercado).toHaveAttribute("aria-pressed", "true");
    const entries = screen.getByRole("region", { name: "Lançamentos: Mercado" });
    expect(await within(entries).findByText("Compras da semana")).toBeInTheDocument();

    await userEvent.keyboard("{Enter}");
    expect(mercado).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("region", { name: "Lançamentos: Mercado" })).not.toBeInTheDocument();
  });

  it("says when the entries of a group cannot load and retries", async () => {
    const requests = open({ "GET /api/transactions": { status: 500, body: problem(500, "Falhou.") } });

    await screen.findByText("Total gasto");
    await userEvent.click(row("Mercado"));
    const entries = screen.getByRole("region", { name: "Lançamentos: Mercado" });
    await userEvent.click(await within(entries).findByRole("button", { name: "Tentar de novo" }));

    await waitFor(() =>
      expect(requests.filter((request) => request.url.includes("/api/transactions?month=2026-11"))).toHaveLength(2),
    );
  });

  it("renders nothing while loading, then an error with a retry", async () => {
    const requests = open({ "GET /api/reports/categories": { status: 500, body: problem(500, "Falhou.") } });

    expect(screen.queryByRole("status", { name: "Carregando" })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));

    await waitFor(() =>
      expect(requests.filter((request) => request.url.includes("/api/reports/categories"))).toHaveLength(2),
    );
  });

  const reportMonth = (requests: Request[]) =>
    new URL(
      requests.find((request) => request.url.includes("/api/reports/categories"))?.url ?? "http://x",
    ).searchParams.get("month");

  it("opens the month in the address", async () => {
    setSearch("m=2026-12");
    const requests = open();

    await screen.findByText("Total gasto");
    expect(reportMonth(requests)).toBe("2026-12");
  });

  it("opens with the group named in the address picked", async () => {
    setSearch("m=2026-11&g=economia");
    open({ "GET /api/reports/categories": { status: 200, body: WITH_ECONOMIA } });

    await screen.findByText("Total gasto");
    expect(row("Economia")).toHaveAttribute("aria-pressed", "true");
    expect(row("Mercado")).toHaveAttribute("aria-pressed", "false");
  });

  it("ignores a malformed month", async () => {
    setSearch("m=2026-13");
    const requests = open();

    await screen.findByText("Total gasto");
    expect(reportMonth(requests)).toBe("2026-11");
  });
});
