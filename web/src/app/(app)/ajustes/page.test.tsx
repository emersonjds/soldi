import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { router } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { problem, signedIn } from "@/test/stub-api";

import AjustesPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

describe("Ajustes", () => {
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
