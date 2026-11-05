import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/test/render";
import { problem, SETTINGS, signedIn } from "@/test/stub-api";

import MoedaPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

type Reply = { status: number; body?: unknown };

const open = (replies: Record<string, Reply> = {}) => {
  const requests = signedIn(replies);
  renderWithQuery(
    <>
      <MoedaPage />
      <Toaster />
    </>,
  );
  return requests;
};

describe("Ajustes › Moeda", () => {
  it("marks the saved currency and saves another one", async () => {
    const requests = open({ "PATCH /api/settings": { status: 200, body: { ...SETTINGS, currency: "EUR" } } });

    expect(await screen.findByRole("radio", { name: "Real BRL" })).toBeChecked();
    expect(screen.getByRole("link", { name: "Ajustes" })).toHaveAttribute("href", "/ajustes");
    await userEvent.click(screen.getByRole("radio", { name: "Euro EUR" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Moeda salva")).toBeInTheDocument();
    const patch = requests.find((request) => request.method === "PATCH");
    expect(await patch?.json()).toEqual({ currency: "EUR" });
  });

  it("says so when saving fails", async () => {
    open({ "PATCH /api/settings": { status: 422, body: problem(422, "currency") } });

    await userEvent.click(await screen.findByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Não foi possível salvar.")).toBeInTheDocument();
  });

  it("offers a retry when the settings do not load", async () => {
    const requests = signedIn({ "GET /api/settings": { status: 500, body: problem(500, "Falhou.") } });
    renderWithQuery(<MoedaPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));

    await waitFor(() => expect(requests.filter((request) => request.url.endsWith("/api/settings"))).toHaveLength(2));
  });
});
