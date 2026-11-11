import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { router } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { problem, signedIn } from "@/test/stub-api";

import AjustesPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

describe("Ajustes", () => {
  it("groups the settings, each one a link to its screen", () => {
    signedIn();
    renderWithQuery(<AjustesPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Ajustes" })).not.toHaveClass("lg:sr-only");
    for (const [name, href] of [
      ["Categorias", "/ajustes/categorias"],
      ["Contas fixas", "/ajustes/contas"],
      ["Termômetro", "/ajustes/termometro"],
      ["Saldo inicial", "/ajustes/saldo-inicial"],
      ["Apagar lançamentos", "/ajustes/apagar"],
      ["Moeda", "/ajustes/moeda"],
      ["Como funciona", "/tour?replay=1"],
      ["Minha conta", "/ajustes/conta"],
    ])
      expect(screen.getByRole("link", { name: new RegExp(`^${name}`) })).toHaveAttribute("href", href);
    expect(screen.getAllByRole("link")).toHaveLength(8);
    expect(screen.queryByRole("link", { name: /Importar/ })).not.toBeInTheDocument();
    expect(screen.getByText("Grupos e subcategorias")).toBeInTheDocument();
    expect(screen.getByText("Mês, ano ou tudo")).toBeInTheDocument();
    expect(screen.getByText("Nome, e-mail e senha")).toBeInTheDocument();
    const conta = within(screen.getByRole("region", { name: "Conta" }));
    expect(conta.getByRole("link", { name: /^Minha conta/ })).toBeInTheDocument();
    expect(screen.queryByText(/em breve/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sair" })).toHaveClass("text-destructive");
  });

  it("signs out and goes to sign-in", async () => {
    const requests = signedIn({ "POST /api/auth/sign-out": { status: 204 } });
    renderWithQuery(<AjustesPage />);

    await userEvent.click(screen.getByRole("button", { name: "Sair" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/entrar"));
    expect(requests.some((request) => request.method === "POST")).toBe(true);
  });

  it("says so when signing out fails", async () => {
    signedIn({ "POST /api/auth/sign-out": { status: 500, body: problem(500, "Falhou.") } });
    renderWithQuery(<AjustesPage />);

    await userEvent.click(screen.getByRole("button", { name: "Sair" }));

    expect(await screen.findByText("Não foi possível sair. Tente de novo.")).toBeInTheDocument();
  });
});
