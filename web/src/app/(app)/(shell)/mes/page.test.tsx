import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/test/render";
import { problem, signedIn } from "@/test/stub-api";

import MesPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

describe("Mês", () => {
  it("shows today's balance from the opening balance and the empty month", async () => {
    signedIn();
    renderWithQuery(<MesPage />);

    expect(await screen.findByText("R$ 1.842,10")).toBeInTheDocument();
    expect(screen.getByText("Saldo hoje")).toBeInTheDocument();
    expect(screen.getByText("Nenhum lançamento ainda. Toque em Lançar.")).toBeInTheDocument();
  });

  it("offers a retry when the settings fail to load", async () => {
    const requests = signedIn({ "GET /api/settings": { status: 500, body: problem(500, "Falhou.") } });
    renderWithQuery(<MesPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));

    expect(requests.filter((request) => request.url.endsWith("/api/settings"))).toHaveLength(2);
  });
});
