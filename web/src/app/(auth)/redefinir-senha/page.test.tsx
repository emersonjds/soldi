import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { router, setSearch } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { anonymous, fieldProblem, problem } from "@/test/stub-api";

import AuthLayout from "../layout";
import RedefinirSenhaPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

const renderPage = () =>
  renderWithQuery(
    <AuthLayout>
      <RedefinirSenhaPage />
      <Toaster />
    </AuthLayout>,
  );

const submit = async (password: string, repeat: string) => {
  await userEvent.type(screen.getByLabelText("Nova senha"), password);
  await userEvent.type(screen.getByLabelText("Repita a nova senha"), repeat);
  await userEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
};

const posts = (requests: Request[]) => requests.filter((request) => request.method === "POST");

describe("Redefinir senha", () => {
  beforeEach(() => {
    router.replace.mockClear();
    vi.restoreAllMocks();
    setSearch("");
    window.history.replaceState(null, "", "/redefinir-senha#token=abc123");
  });

  it("blocks different passwords before calling the API", async () => {
    const requests = anonymous();
    renderPage();

    expect(screen.getByRole("heading", { name: "Nova senha" })).toBeInTheDocument();
    expect(screen.getByText("Mínimo de 8 caracteres")).toBeInTheDocument();
    await submit("segredo123", "segredo124");

    expect(await screen.findByText("As senhas não são iguais.")).toBeInTheDocument();
    expect(posts(requests)).toHaveLength(0);
  });

  it("blocks a short password before calling the API", async () => {
    const requests = anonymous();
    renderPage();

    await submit("curta", "curta");

    expect(await screen.findByRole("alert")).toHaveTextContent("Mínimo de 8 caracteres");
    expect(posts(requests)).toHaveLength(0);
  });

  it("blocks a password over 128 characters", async () => {
    const requests = anonymous();
    renderPage();
    const long = "a".repeat(129);

    await userEvent.click(screen.getByLabelText("Nova senha"));
    await userEvent.paste(long);
    await userEvent.click(screen.getByLabelText("Repita a nova senha"));
    await userEvent.paste(long);
    await userEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A senha pode ter até 128 caracteres.");
    expect(posts(requests)).toHaveLength(0);
  });

  it("saves the new password and sends to Entrar", async () => {
    const requests = anonymous({ "POST /api/auth/password-reset/confirm": { status: 204 } });
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderPage();

    expect(replaceState).toHaveBeenCalledWith(null, "", "/redefinir-senha");
    expect(window.location.hash).toBe("");

    await submit("segredo123", "segredo123");

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/entrar"));
    expect(await screen.findByText("Senha redefinida. Entre com a nova senha.")).toBeInTheDocument();
    expect(await posts(requests)[0]?.json()).toEqual({ token: "abc123", new_password: "segredo123" });
  });

  it("says the link expired when the server refuses it", async () => {
    anonymous({
      "POST /api/auth/password-reset/confirm": {
        status: 422,
        body: { ...problem(422, "x"), type: "urn:soldi:error:invalid-reset-link" },
      },
    });
    renderPage();

    await submit("segredo123", "segredo123");

    expect(await screen.findByText("Este link expirou ou já foi usado.")).toHaveFocus();
    expect(screen.getByRole("link", { name: "Pedir outro link" })).toHaveAttribute("href", "/esqueci-senha");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("says the link expired when the URL has no token", () => {
    window.history.replaceState(null, "", "/redefinir-senha");
    const requests = anonymous();
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Este link expirou ou já foi usado.");
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(screen.getByRole("link", { name: "Pedir outro link" })).toHaveAttribute("href", "/esqueci-senha");
    expect(screen.queryByRole("button", { name: "Salvar nova senha" })).not.toBeInTheDocument();
    expect(posts(requests)).toHaveLength(0);
  });

  it("ignores a token in the query string", () => {
    window.history.replaceState(null, "", "/redefinir-senha?token=abc123");
    setSearch("token=abc123");
    const requests = anonymous();
    renderPage();

    expect(screen.getByText("Este link expirou ou já foi usado.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvar nova senha" })).not.toBeInTheDocument();
    expect(posts(requests)).toHaveLength(0);
  });

  it("shows the server's refusal of the password on the field", async () => {
    anonymous({ "POST /api/auth/password-reset/confirm": { status: 422, body: fieldProblem(422, "password") } });
    renderPage();

    await submit("segredo123", "segredo123");

    expect(await screen.findByRole("alert")).toHaveTextContent("Mínimo de 8 caracteres");
  });

  it.each([
    [429, "Muitas tentativas. Espere um pouco e tente de novo."],
    [500, "Não foi possível salvar a senha. Tente de novo."],
  ])("explains a %i", async (status, message) => {
    anonymous({ "POST /api/auth/password-reset/confirm": { status, body: problem(status, "x") } });
    renderPage();

    await submit("segredo123", "segredo123");

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
