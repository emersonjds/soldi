import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setSearch } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { MONTH, problem, signedIn } from "@/test/stub-api";

import AjustesPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

type Reply = { status: number; body?: unknown };

const open = (replies: Record<string, Reply> = {}) => {
  const requests = signedIn({ "GET /api/months/2026-11": { status: 200, body: MONTH }, ...replies });
  renderWithQuery(<AjustesPage />);
  return requests;
};

const SECTIONS = [
  ["Termômetro & Limites", "termometro", "Calibragem do Termômetro Financeiro"],
  ["Moeda & Saldo Inicial", "moeda", "Moeda & Saldo Inicial"],
  ["Organização (Contas)", "organizacao", "Organização (Contas)"],
  ["Gestão de Dados", "dados", "Gestão de Dados & Zona de Perigo"],
  ["Minha Conta & Segurança", "conta", "Minha Conta & Segurança"],
  ["Ajuda & Como Funciona", "ajuda", "Ajuda & Como Funciona"],
];

const subNav = () => within(screen.getByRole("navigation", { name: "Seções dos ajustes" }));

afterEach(() => vi.unstubAllGlobals());

describe("Ajustes", () => {
  it("titles the page and lists every section in the sub-nav, in order", async () => {
    open();

    expect(screen.getByRole("navigation", { name: "breadcrumb" })).toHaveTextContent("ConfiguraçõesAjustes do Sistema");
    expect(screen.getByRole("heading", { level: 1, name: "Ajustes & Preferências" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Personalize os parâmetros de cálculo do termômetro, organização de contas e segurança dos seus dados",
      ),
    ).toBeInTheDocument();
    expect(
      subNav()
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual(SECTIONS.map(([label, anchor]) => [label, `#${anchor}`]));
    expect(subNav().getByRole("link", { name: "Termômetro & Limites" })).toHaveAttribute("aria-current", "true");
    for (const [, anchor, title] of SECTIONS)
      expect(screen.getByRole("region", { name: title })).toHaveAttribute("id", anchor);
    expect(await screen.findByLabelText("Crítico / Atenção")).toBeInTheDocument();
    expect(screen.getByLabelText("Saldo Inicial da Conta Corrente")).toBeInTheDocument();
    expect(screen.getByText("Projeção em tempo real")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir Lançamentos" })).toBeDisabled();
    expect(await screen.findByText("NOME COMPLETO")).toBeInTheDocument();
  });

  it("links Contas fixas, Categorias and Como funciona, keeping the viewed month, and shows the version", () => {
    setSearch("m=2026-12");
    open();

    expect(screen.getByRole("link", { name: /^Contas fixas/ })).toHaveAttribute("href", "/ajustes/contas?m=2026-12");
    expect(screen.getByRole("link", { name: /^Categorias/ })).toHaveAttribute("href", "/ajustes/categorias?m=2026-12");
    expect(screen.getByRole("link", { name: /^Como funciona/ })).toHaveAttribute("href", "/tour?replay=1&m=2026-12");
    expect(screen.getByText(/^Versão \d+\.\d+\.\d+$/)).toBeInTheDocument();
    setSearch("");
  });

  it("hands the switcher month of ?m= to the delete card", async () => {
    setSearch("m=2025-03");
    open({ "GET /api/transactions/count?period=2025-03": { status: 200, body: { count: 4 } } });

    expect(await screen.findByRole("radio", { name: "Mês selecionado" })).toBeChecked();
    expect(await screen.findByText("Março 2025 (4 registros)")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Ano de 2025" })).toBeInTheDocument();
    setSearch("");
  });

  it("offers a retry when the settings do not load", async () => {
    const requests = open({ "GET /api/settings": { status: 500, body: problem(500, "Falhou.") } });

    const retries = await screen.findAllByRole("button", { name: "Tentar de novo" });
    await userEvent.click(retries[0]);

    await waitFor(() => expect(requests.filter((request) => request.url.endsWith("/api/settings"))).toHaveLength(2));
  });
});
