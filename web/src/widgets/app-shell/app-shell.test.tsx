import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { router, setPathname, setSearch } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { CATEGORIES, signedIn, TRANSACTIONS } from "@/test/stub-api";

import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

describe("AppShell", () => {
  beforeEach(() => {
    window.innerWidth = 375;
    signedIn();
    setPathname("/mes");
    setSearch("");
  });

  it("marks the current screen in the bottom tab bar and the sidebar", () => {
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const tabs = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(within(tabs).getByRole("link", { name: "Mês" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "Ajustes" })).not.toHaveAttribute("aria-current");
    for (const label of ["Para onde vai", "Cofrinhos"]) {
      expect(within(tabs).getByRole("link", { name: label })).toBeInTheDocument();
    }

    const sidebar = screen.getByRole("navigation", { name: "Menu lateral" });
    expect(within(sidebar).getByRole("link", { name: "Mês" })).toHaveAttribute("data-active", "true");
    expect(screen.getByText("conteúdo")).toBeInTheDocument();
  });

  it("takes the logo to today's month from the sidebar and the top bar", () => {
    setPathname("/ajustes/categorias");
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const logos = screen.getAllByRole("link", { name: "Soldi, ir para hoje" });
    expect(logos).toHaveLength(2);
    for (const logo of logos) expect(logo).toHaveAttribute("href", "/mes");
  });

  it("keeps Ajustes marked on its sub-screens", () => {
    setPathname("/ajustes/contas");
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const tabs = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(within(tabs).getByRole("link", { name: "Ajustes" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "Mês" })).not.toHaveAttribute("aria-current");
  });

  it("opens the Lançar sheet from the floating button at 375px", async () => {
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const tabs = screen.getByRole("navigation", { name: "Navegação principal" });
    await userEvent.click(within(tabs).getByRole("button", { name: "Lançar" }));

    expect(await screen.findByRole("dialog", { name: "Lançar" })).toBeInTheDocument();
  });

  it("saves a Diário in three taps from the floating button: Lançar, amount, Salvar", async () => {
    const requests = signedIn({
      "GET /api/categories": { status: 200, body: CATEGORIES },
      "POST /api/transactions": { status: 201, body: TRANSACTIONS[0] },
    });
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const tabs = screen.getByRole("navigation", { name: "Navegação principal" });
    await userEvent.click(within(tabs).getByRole("button", { name: "Lançar" }));
    expect(await screen.findByRole("combobox", { name: "Categoria" })).toHaveTextContent("Mercado");
    await userEvent.keyboard("12");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("hands Transformar em conta fixa to the bill sheet", async () => {
    signedIn({ "GET /api/categories": { status: 200, body: CATEGORIES } });
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const tabs = screen.getByRole("navigation", { name: "Navegação principal" });
    await userEvent.click(within(tabs).getByRole("button", { name: "Lançar" }));
    await userEvent.click(await screen.findByRole("radio", { name: "Saída" }));
    await userEvent.type(screen.getByLabelText("Valor"), "12");
    await userEvent.click(await screen.findByRole("button", { name: "Transformar em conta fixa" }));

    expect(await screen.findByRole("dialog", { name: "Nova conta" })).toBeInTheDocument();
  });

  it("opens the Lançar sheet from the top bar and closes it", async () => {
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const sidebar = screen.getByRole("complementary", { name: "Barra lateral" });
    expect(within(sidebar).queryByRole("button", { name: "Lançar" })).not.toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("banner")).getByRole("button", { name: "Lançar" }));
    expect(await screen.findByRole("dialog", { name: "Lançar" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("groups the sidebar into Menu and Configurações", () => {
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const sidebar = screen.getByRole("navigation", { name: "Menu lateral" });
    const links = (group: string) =>
      within(within(sidebar).getByRole("group", { name: group }))
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]);
    expect(links("Menu")).toEqual([
      ["Mês", "/mes"],
      ["Para onde vai", "/para-onde-vai"],
      ["Cofrinhos", "/economia"],
    ]);
    expect(links("Configurações")).toEqual([
      ["Contas Fixas", "/ajustes/contas"],
      ["Ajustes", "/ajustes"],
    ]);
  });

  it("marks Contas Fixas, not Ajustes, in the sidebar on its screen", () => {
    setPathname("/ajustes/contas");
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const sidebar = screen.getByRole("navigation", { name: "Menu lateral" });
    expect(within(sidebar).getByRole("link", { name: "Contas Fixas" })).toHaveAttribute("aria-current", "page");
    expect(within(sidebar).getByRole("link", { name: "Ajustes" })).not.toHaveAttribute("aria-current");
    expect(within(screen.getByRole("banner")).getByText("Contas Fixas")).toBeInTheDocument();
  });

  it.each([
    ["/mes", "Mês", true],
    ["/para-onde-vai", "Para onde vai", true],
    ["/economia", "Cofrinhos", false],
    ["/ajustes/categorias", "Ajustes", false],
  ])("titles the top bar on %s and shows the month switcher only on month pages", (path, title, month) => {
    setPathname(path);
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const bar = screen.getByRole("banner");
    expect(within(bar).getByText(title, { selector: "p" })).toBeInTheDocument();
    expect(within(bar).queryAllByRole("group", { name: "Mês" })).toHaveLength(month ? 1 : 0);
  });

  it("moves the month in the address from the top bar, never before the opening month", async () => {
    setPathname("/para-onde-vai");
    setSearch("m=2026-12");
    router.replace.mockClear();
    const { unmount } = renderWithQuery(<AppShell>conteúdo</AppShell>);

    const bar = screen.getByRole("banner");
    expect(within(bar).getByText("Dezembro 2026")).toBeInTheDocument();
    await userEvent.click(within(bar).getByRole("button", { name: "Próximo mês" }));
    expect(router.replace).toHaveBeenLastCalledWith("/para-onde-vai?m=2027-01", { scroll: false });
    unmount();

    setSearch("m=2026-11");
    renderWithQuery(<AppShell>conteúdo</AppShell>);
    await waitFor(() =>
      expect(within(screen.getByRole("banner")).getByRole("button", { name: "Mês anterior" })).toBeDisabled(),
    );
  });

  it("takes the sidebar user card and the top-bar avatar to Minha conta", async () => {
    signedIn({ "POST /api/auth/sign-out": { status: 204 } });
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const email = await screen.findByText("ana@example.com");
    const card = screen.getByRole("link", { name: "Minha conta, Ana" });
    expect(card).toHaveAttribute("href", "/ajustes/conta");
    expect(card).toContainElement(email);
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Minha conta" })).toHaveAttribute("href", "/ajustes/conta");

    await userEvent.click(screen.getByRole("button", { name: "Sair" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/entrar"));
  });

  it("shows who is signed in", async () => {
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    expect(await screen.findByText("ana@example.com")).toBeInTheDocument();
  });
});
