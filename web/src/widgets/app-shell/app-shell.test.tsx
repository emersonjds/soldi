import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setPathname } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { signedIn } from "@/test/stub-api";

import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

describe("AppShell", () => {
  beforeEach(() => {
    window.innerWidth = 375;
    signedIn();
    setPathname("/mes");
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

  it("opens the Lançar sheet from the floating button at 375px", async () => {
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    const tabs = screen.getByRole("navigation", { name: "Navegação principal" });
    await userEvent.click(within(tabs).getByRole("button", { name: "Lançar" }));

    expect(await screen.findByRole("dialog", { name: "Lançar" })).toBeInTheDocument();
  });

  it("shows who is signed in", async () => {
    renderWithQuery(<AppShell>conteúdo</AppShell>);

    expect(await screen.findByText("ana@example.com")).toBeInTheDocument();
  });
});
