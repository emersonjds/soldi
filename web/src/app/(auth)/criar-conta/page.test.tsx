import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { router } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { ANA, anonymous, problem } from "@/test/stub-api";

import CriarContaPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

const fillAndSubmit = async (email: string, password: string) => {
  await userEvent.type(screen.getByLabelText("E-mail"), email);
  await userEvent.type(screen.getByLabelText("Senha"), password);
  await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));
};

describe("Criar conta", () => {
  it("asks for a password of 8 characters or more", async () => {
    const requests = anonymous();
    renderWithQuery(<CriarContaPage />);

    await fillAndSubmit("ana@example.com", "curta");

    expect(await screen.findByText("A senha precisa de pelo menos 8 caracteres.")).toBeInTheDocument();
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/entrar");
  });

  it("creates the account and starts onboarding", async () => {
    const requests = anonymous({ "POST /api/auth/sign-up": { status: 201, body: { ...ANA, onboarded: false } } });
    renderWithQuery(<CriarContaPage />);

    await fillAndSubmit("ana@example.com", "segredo123");

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/onboarding"));
    const signUp = requests.find((request) => request.method === "POST");
    expect(await signUp?.json()).toEqual({ email: "ana@example.com", password: "segredo123" });
  });

  it.each([
    [409, "Este e-mail já tem conta. Entre com ele."],
    [429, "Muitas tentativas. Espere um pouco e tente de novo."],
    [500, "Não foi possível criar a conta. Tente de novo."],
  ])("explains a %i inline", async (status, message) => {
    anonymous({ "POST /api/auth/sign-up": { status, body: problem(status, "x") } });
    renderWithQuery(<CriarContaPage />);

    await fillAndSubmit("ana@example.com", "segredo123");

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("puts the server's field error under the field", async () => {
    anonymous({
      "POST /api/auth/sign-up": {
        status: 422,
        body: { ...problem(422, "Invalid."), errors: [{ field: "email", message: "E-mail inválido." }] },
      },
    });
    renderWithQuery(<CriarContaPage />);

    await fillAndSubmit("ana@example.com", "segredo123");

    expect(await screen.findByText("E-mail inválido.")).toBeInTheDocument();
  });
});
