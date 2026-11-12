import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { router, setPathname, setSearch } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { ANA, CATEGORIES, MONTH, problem, signedIn, TRANSACTIONS } from "@/test/stub-api";

import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

describe("AppShell", () => {
  beforeEach(() => {
    window.innerWidth = 375;
    signedIn();
    setPathname("/mes");
    setSearch("");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("marks the current screen in the bottom tab bar and the sidebar", () => {
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const tabs = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(within(tabs).getByRole("link", { name: "Mês" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "Ajustes" })).not.toHaveAttribute("aria-current");
    for (const label of ["Para onde vai", "Economia"]) {
      expect(within(tabs).getByRole("link", { name: label })).toBeInTheDocument();
    }

    const sidebar = screen.getByRole("navigation", { name: "Menu lateral" });
    expect(within(sidebar).getByRole("link", { name: "Mês" })).toHaveAttribute("data-active", "true");
    expect(screen.getByText("conteúdo")).toBeInTheDocument();
  });

  it("takes the sidebar logo and the app bar's ● Soldi to today's month", () => {
    setPathname("/ajustes/categorias");
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const logos = screen.getAllByRole("link", { name: "Soldi, ir para hoje" });
    expect(logos).toHaveLength(2);
    for (const logo of logos) expect(logo).toHaveAttribute("href", "/mes");
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "Soldi, ir para hoje" })).toHaveClass(
      "lg:hidden",
    );
  });

  it.each([
    ["/mes", "Mês"],
    ["/para-onde-vai", "Para Onde Vai"],
    ["/economia", "Economia"],
    ["/ajustes", "Ajustes"],
    ["/ajustes/conta", "Minha Conta"],
    ["/ajustes/moeda", "Moeda"],
    ["/ajustes/termometro", "Termômetro"],
    ["/ajustes/saldo-inicial", "Saldo Inicial"],
    ["/ajustes/apagar", "Apagar Lançamentos"],
    ["/ajustes/contas", "Contas Fixas"],
    ["/ajustes/categorias", "Categorias"],
  ])(
    "reads ● Soldi, the page name and the avatar in the mobile app bar on %s, with no greeting",
    async (path, name) => {
      signedIn({}, { ...ANA, name: "Ana Paula Souza" });
      setPathname(path);
      renderWithQuery(<AppShell>conteúdo</AppShell>);

      const bar = screen.getByRole("banner");
      expect(within(bar).getByText(name, { selector: "p" })).toHaveClass("lg:hidden");
      const avatar = within(bar).getByRole("link", { name: "Minha conta" });
      expect(avatar).toHaveAttribute("href", "/ajustes/conta");
      expect(await within(avatar).findByText("APS")).toBeInTheDocument();
      expect(screen.queryByText(/^Olá/)).not.toBeInTheDocument();
    },
  );

  it("keeps Ajustes marked on its sub-screens", () => {
    setPathname("/ajustes/contas");
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const tabs = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(within(tabs).getByRole("link", { name: "Ajustes" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "Mês" })).not.toHaveAttribute("aria-current");
  });

  it("docks five slots to the bottom, the raised Lançar button centered and the current tab in primary", () => {
    setPathname("/para-onde-vai");
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const tabs = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(tabs).toHaveClass("inset-x-0", "bottom-0", "border-t", "bg-card", "pb-[env(safe-area-inset-bottom)]");
    const order = [...tabs.querySelectorAll("a, button")].map((el) => el.getAttribute("aria-label") ?? el.textContent);
    expect(order).toEqual(["Mês", "Para onde vai", "Lançar", "Economia", "Ajustes"]);
    expect(within(tabs).getByRole("link", { name: "Economia" })).toHaveAttribute("href", "/economia");
    expect(within(tabs).getByRole("link", { name: "Para onde vai" })).toHaveClass("text-primary");
    expect(within(tabs).getByRole("link", { name: "Mês" })).toHaveClass("text-muted-foreground");
    expect(within(tabs).getByRole("link", { name: "Mês" })).not.toHaveClass("text-primary");
    const fab = within(tabs).getByRole("button", { name: "Lançar" });
    expect(fab).toHaveClass("size-14");
    expect(fab).not.toHaveAttribute("aria-current");
  });

  it("keeps the content's last row above the tab bar", () => {
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    expect(screen.getByRole("main")).toHaveClass("pb-(--tabbar-space)");
  });

  it("opens the Lançar sheet from the floating button at 375px", async () => {
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const tabs = screen.getByRole("navigation", { name: "Navegação principal" });
    await userEvent.click(within(tabs).getByRole("button", { name: "Lançar" }));

    expect(await screen.findByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ })).toBeInTheDocument();
  });

  it("saves a Diário in three taps from the floating button: Lançar, amount, Salvar", async () => {
    const requests = signedIn({
      "GET /api/categories": { status: 200, body: CATEGORIES },
      "POST /api/transactions": { status: 201, body: TRANSACTIONS[0] },
    });
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const tabs = screen.getByRole("navigation", { name: "Navegação principal" });
    await userEvent.click(within(tabs).getByRole("button", { name: "Lançar" }));
    expect(await screen.findByRole("radio", { name: "Mercado" })).toHaveAttribute("aria-checked", "true");
    await userEvent.keyboard("12");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("hands Transformar em conta fixa to the bill sheet", async () => {
    signedIn({ "GET /api/categories": { status: 200, body: CATEGORIES } });
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const tabs = screen.getByRole("navigation", { name: "Navegação principal" });
    await userEvent.click(within(tabs).getByRole("button", { name: "Lançar" }));
    await userEvent.click(await screen.findByRole("radio", { name: "Conta" }));
    await userEvent.type(screen.getByLabelText(/^Valor d/), "12");
    await userEvent.click(await screen.findByRole("button", { name: "Criar como Conta Fixa" }));

    expect(await screen.findByRole("dialog", { name: "Nova conta" })).toBeInTheDocument();
  });

  it("opens the Lançar sheet from the top bar and closes it", async () => {
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const sidebar = screen.getByRole("complementary", { name: "Barra lateral" });
    expect(within(sidebar).queryByRole("button", { name: "Lançar" })).not.toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("banner")).getByRole("button", { name: "Lançar" }));
    expect(await screen.findByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ })).toBeInTheDocument();

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

  it("opens Lançar in Simular from Posso comprar isso?, never marked, and the next Lançar starts without it", async () => {
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const sidebar = screen.getByRole("navigation", { name: "Menu lateral" });
    const menu = within(sidebar).getByRole("group", { name: "Menu" });
    const simulate = within(menu).getByRole("button", { name: "Posso comprar isso?" });
    expect(simulate).not.toHaveAttribute("aria-current");
    expect(
      within(menu)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Mês", "Para onde vai", "Cofrinhos", "Posso comprar isso?"]);
    await userEvent.click(simulate);
    const sheet = await screen.findByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
    expect(within(sheet).getByRole("switch", { name: "Simular" })).toBeChecked();
    expect(within(sheet).getByRole("radio", { name: "Diário" })).toBeChecked();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(within(screen.getByRole("banner")).getByRole("button", { name: "Lançar" }));
    expect(
      within(await screen.findByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ })).getByRole("switch", {
        name: "Simular",
      }),
    ).not.toBeChecked();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(simulate);
    await screen.findByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const tabs = screen.getByRole("navigation", { name: "Navegação principal" });
    await userEvent.click(within(tabs).getByRole("button", { name: "Lançar" }));
    expect(
      within(await screen.findByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ })).getByRole("switch", {
        name: "Simular",
      }),
    ).not.toBeChecked();
  });

  it("marks Contas Fixas, not Ajustes, in the sidebar on its screen", () => {
    setPathname("/ajustes/contas");
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const sidebar = screen.getByRole("navigation", { name: "Menu lateral" });
    expect(within(sidebar).getByRole("link", { name: "Contas Fixas" })).toHaveAttribute("aria-current", "page");
    expect(within(sidebar).getByRole("link", { name: "Ajustes" })).not.toHaveAttribute("aria-current");
  });

  it("shows the month switcher on Para onde vai in the top bar only, leaving mobile to the page hero", () => {
    setPathname("/para-onde-vai");
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const bar = screen.getByRole("banner");
    expect(within(bar).getByRole("group", { name: "Mês" }).parentElement).toHaveClass("hidden", "lg:block");
    expect(within(screen.getByRole("main")).queryByRole("group", { name: "Mês" })).not.toBeInTheDocument();
  });

  it("leaves the mobile switcher of Mês to its hero, keeping the top bar's", () => {
    setPathname("/mes");
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    expect(within(screen.getByRole("banner")).getByRole("group", { name: "Mês" })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).queryByRole("group", { name: "Mês" })).not.toBeInTheDocument();
  });

  it.each(["/economia", "/ajustes", "/ajustes/contas", "/ajustes/categorias", "/ajustes/conta"])(
    "hides the month switcher on %s, a page that does not read the month",
    (path) => {
      setPathname(path);
      setSearch("m=2026-12");
      renderWithQuery(<AppShell>conteúdo</AppShell>);

      expect(screen.queryByRole("group", { name: "Mês" })).not.toBeInTheDocument();
      expect(screen.getByRole("main").firstElementChild).toBeNull();
      expect(within(screen.getByRole("banner")).getByRole("button", { name: "Lançar" })).toBeInTheDocument();
    },
  );

  it("keeps the viewed month when moving from Mês to Para onde vai through the sidebar", async () => {
    setSearch("m=2026-12");
    const { unmount } = renderWithQuery(<AppShell>conteúdo</AppShell>);

    const link = within(screen.getByRole("navigation", { name: "Menu lateral" })).getByRole("link", {
      name: "Para onde vai",
    });
    expect(link).toHaveAttribute("href", "/para-onde-vai?m=2026-12");
    await userEvent.click(link);
    unmount();

    setPathname("/para-onde-vai");
    renderWithQuery(<AppShell>conteúdo</AppShell>);
    expect(within(screen.getByRole("banner")).getByText("Dezembro 2026")).toBeInTheDocument();
    expect(
      within(screen.getByRole("navigation", { name: "Menu lateral" })).getByRole("link", { name: "Para onde vai" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("carries the viewed month through the sidebar and the tab bar, and the logo back to today", () => {
    setSearch("m=2026-12");
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const sidebar = screen.getByRole("navigation", { name: "Menu lateral" });
    expect(within(sidebar).getByRole("link", { name: "Contas Fixas" })).toHaveAttribute(
      "href",
      "/ajustes/contas?m=2026-12",
    );
    expect(within(sidebar).getByRole("link", { name: "Mês" })).toHaveAttribute("href", "/mes?m=2026-12");
    const tabs = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(within(tabs).getByRole("link", { name: "Economia" })).toHaveAttribute("href", "/economia?m=2026-12");
    for (const logo of screen.getAllByRole("link", { name: "Soldi, ir para hoje" })) {
      expect(logo).toHaveAttribute("href", "/mes");
    }
  });

  it.each(["m=x%26lancar%3D1", "m=garbage"])("carries no ?m= that is not a month (%s)", (query) => {
    setSearch(query);
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const sidebar = screen.getByRole("navigation", { name: "Menu lateral" });
    expect(within(sidebar).getByRole("link", { name: "Mês" })).toHaveAttribute("href", "/mes");
    const tabs = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(within(tabs).getByRole("link", { name: "Mês" })).toHaveAttribute("href", "/mes");
  });

  it("shows today's tier left of Lançar, whatever month is viewed, and nothing until it arrives", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
    setSearch("m=2026-12");
    const requests = signedIn({ "GET /api/months/2026-11": { status: 200, body: MONTH } });
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const bar = screen.getByRole("banner");
    expect(within(bar).queryByRole("img", { name: /^Saldo hoje/ })).not.toBeInTheDocument();
    const pill = await within(bar).findByRole("img", { name: "Saldo hoje: Apertado" });
    expect(pill).toHaveTextContent(/^Apertado$/);
    expect(pill).toHaveAttribute("title", "Saldo hoje");
    expect(pill).toHaveClass("hidden", "lg:block");
    const launch = within(bar).getByRole("button", { name: "Lançar" });
    expect(pill.compareDocumentPosition(launch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(bar).queryByRole("button", { name: /Saldo hoje/ })).not.toBeInTheDocument();
    const months = requests
      .map((request) => new URL(request.url).pathname)
      .filter((path) => path.startsWith("/api/months"));
    expect(months).toEqual(["/api/months/2026-11"]);
  });

  it("leaves the tier pill out when today's month fails", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
    const requests = signedIn({ "GET /api/months/2026-11": { status: 500, body: problem(500, "Falhou.") } });
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    await waitFor(() => expect(requests.some((request) => request.url.endsWith("/api/months/2026-11"))).toBe(true));
    await screen.findByText("ana@example.com");
    expect(screen.queryByRole("img", { name: /^Saldo hoje/ })).not.toBeInTheDocument();
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

  it("takes the sidebar user card and the top-bar avatar to Minha conta, with the version under it and no sign-out", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "0.34.0");
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const email = await screen.findByText("ana@example.com");
    const card = screen.getByRole("link", { name: "Minha conta, Ana" });
    expect(card).toHaveAttribute("href", "/ajustes/conta");
    expect(card).toContainElement(email);
    expect(card.textContent).toBe("AAnaana@example.com");
    const sidebar = screen.getByRole("complementary", { name: "Barra lateral" });
    expect(within(sidebar).queryByRole("button", { name: "Sair" })).not.toBeInTheDocument();
    const version = within(sidebar).getByText("v0.34.0");
    expect(version).toHaveClass("text-muted-foreground");
    expect(card.compareDocumentPosition(version) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const avatar = within(screen.getByRole("banner")).getByRole("link", { name: "Minha conta" });
    expect(avatar).toHaveAttribute("href", "/ajustes/conta");
    expect(avatar).toHaveClass("size-11");
    expect(avatar.firstElementChild).toHaveClass("size-10");
  });

  it("shows who is signed in", async () => {
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    expect(await screen.findByText("ana@example.com")).toBeInTheDocument();
  });
});
