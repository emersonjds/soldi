import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { router } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { ANA, anonymous, problem } from "@/test/stub-api";

import AuthLayout from "../layout";
import EntrarPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

const renderPage = () =>
  renderWithQuery(
    <AuthLayout>
      <EntrarPage />
    </AuthLayout>,
  );

const fillAndSubmit = async (email: string, password: string) => {
  await userEvent.type(screen.getByLabelText("E-mail"), email);
  await userEvent.type(screen.getByLabelText("Senha"), password);
  await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
};

describe("Entrar", () => {
  beforeEach(() => {
    router.replace.mockClear();
  });

  it("shows the brand, the form and a way to create an account", () => {
    anonymous();
    renderPage();

    expect(screen.getByText("Seu mês no verde.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Criar conta" })).toHaveAttribute("href", "/criar-conta");
    expect(screen.getByRole("link", { name: "Esqueci minha senha" })).toHaveAttribute("href", "/esqueci-senha");
  });

  it("checks the fields before calling the API", async () => {
    const requests = anonymous();
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Informe um e-mail válido.")).toBeInTheDocument();
    expect(screen.getByText("Informe a senha.")).toBeInTheDocument();
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);
  });

  it("signs in and opens the month", async () => {
    const requests = anonymous({ "POST /api/auth/sign-in": { status: 200, body: ANA } });
    renderPage();

    await fillAndSubmit("ana@example.com", "segredo123");

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mes"));
    const signIn = requests.find((request) => request.method === "POST");
    expect(await signIn?.json()).toEqual({ email: "ana@example.com", password: "segredo123" });
  });

  it("sends a user who has not onboarded to onboarding", async () => {
    anonymous({ "POST /api/auth/sign-in": { status: 200, body: { ...ANA, onboarded: false, tour_seen: false } } });
    renderPage();

    await fillAndSubmit("ana@example.com", "segredo123");

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/onboarding"));
  });

  it.each([
    [401, "E-mail ou senha incorretos"],
    [429, "Muitas tentativas. Espere um pouco e tente de novo."],
    [500, "Não foi possível entrar. Tente de novo."],
  ])("explains a %i inline", async (status, message) => {
    anonymous({ "POST /api/auth/sign-in": { status, body: problem(status, "x") } });
    renderPage();

    await fillAndSubmit("ana@example.com", "errada");

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
