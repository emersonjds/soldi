import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/test/render";
import { signedIn } from "@/test/stub-api";

import { SettingsNav } from "./settings-nav";

const IDS = ["termometro", "moeda", "organizacao", "dados", "conta", "ajuda"];

/** The sections with their viewport tops, in a 1000 px window over a 5000 px page scrolled to `scrollY`. */
const layout = (tops: number[], scrollY = 0) => {
  for (const [index, id] of IDS.entries()) {
    const section = document.getElementById(id);
    if (section) section.getBoundingClientRect = () => ({ top: tops[index] }) as DOMRect;
  }
  vi.stubGlobal("innerHeight", 1000);
  vi.stubGlobal("scrollY", scrollY);
  Object.defineProperty(document.documentElement, "scrollHeight", { value: 5000, configurable: true });
  act(() => {
    fireEvent.scroll(window);
  });
};

const open = () => {
  signedIn();
  renderWithQuery(
    <>
      <SettingsNav />
      {IDS.map((id) => (
        <section key={id} id={id} />
      ))}
    </>,
  );
};

const current = () =>
  within(screen.getByRole("navigation", { name: "Seções dos ajustes" })).getByRole("link", { current: true });

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("SettingsNav", () => {
  it("marks the last section whose top passed the upper 40% of the window", () => {
    open();
    expect(current()).toHaveTextContent("Termômetro & Limites");

    layout([-900, -300, 200, 700, 1400, 2100]);
    expect(current()).toHaveTextContent("Organização (Contas)");

    layout([-900, -300, 401, 700, 1400, 2100]);
    expect(current()).toHaveTextContent("Moeda & Saldo Inicial");
  });

  it("marks the last section at the bottom of the page, however short", () => {
    open();

    layout([-3000, -2500, -2000, -1200, -100, 600], 4000);

    expect(current()).toHaveTextContent("Ajuda & Como Funciona");
  });

  it("scrolls to the address's section once the settings arrive", async () => {
    const scrolled = vi.fn();
    window.history.replaceState(null, "", "/ajustes#conta");
    open();
    const conta = document.getElementById("conta");
    if (conta) conta.scrollIntoView = scrolled;

    await waitFor(() => expect(scrolled).toHaveBeenCalledOnce());
  });
});
