import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/test/render";
import { anonymous, problem } from "@/test/stub-api";

import AuthLayout from "../layout";
import EsqueciSenhaPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

const renderPage = () =>
  renderWithQuery(
    <AuthLayout>
      <EsqueciSenhaPage />
    </AuthLayout>,
  );

const submit = async (email: string) => {
  await userEvent.type(screen.getByLabelText("E-mail"), email);
  await userEvent.click(screen.getByRole("button", { name: "Enviar link" }));
};

describe("Esqueci minha senha", () => {
  it("asks for the e-mail before calling the API", async () => {
    const requests = anonymous();
    renderPage();

    expect(screen.getByRole("heading", { name: "Esqueci minha senha" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Enviar link" }));

    expect(await screen.findByText("Informe um e-mail válido.")).toBeInTheDocument();
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);
  });

  it("sends the link and says so without telling whether the account exists", async () => {
    const requests = anonymous({ "POST /api/auth/password-reset": { status: 202 } });
    renderPage();

    await submit("ana@example.com");

    expect(
      await screen.findByText(
        "Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha. Ele vale por 1 hora.",
      ),
    ).toHaveFocus();
    expect(screen.getByRole("status")).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("link", { name: "Voltar para Entrar" })).toHaveAttribute("href", "/entrar");
    const sent = requests.find((request) => request.method === "POST");
    expect(await sent?.json()).toEqual({ email: "ana@example.com" });
  });

  it.each([
    [429, "Muitas tentativas. Espere um pouco e tente de novo."],
    [500, "Não foi possível enviar agora. Tente de novo."],
  ])("explains a %i inline", async (status, message) => {
    anonymous({ "POST /api/auth/password-reset": { status, body: problem(status, "x") } });
    renderPage();

    await submit("ana@example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});
