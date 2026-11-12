import { StrictMode } from "react";

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { meQuery, type User } from "@/entities/user/session";
import { renderWithQuery } from "@/test/render";
import { ANA, anonymous, problem } from "@/test/stub-api";

import AuthLayout from "../layout";
import VerificarEmailPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

const renderPage = () =>
  renderWithQuery(
    <StrictMode>
      <AuthLayout>
        <VerificarEmailPage />
      </AuthLayout>
    </StrictMode>,
  );

const CONFIRM = "POST /api/auth/email-verification/confirm";

const posts = (requests: Request[]) => requests.filter((request) => request.method === "POST");

const expectInvalid = () => {
  expect(screen.getByRole("heading", { name: "Link inválido ou expirado" })).toBeInTheDocument();
  expect(screen.getByText("Peça um novo link em Ajustes › Minha Conta.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ir para Ajustes" })).toHaveAttribute("href", "/ajustes#conta");
};

describe("/verificar-email", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/verificar-email#token=abc123");
  });

  it("says it is verifying while the confirmation is on its way", () => {
    vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("Verificando seu e-mail…");
  });

  it("confirms once under StrictMode, clears the token from the URL and invalidates the user", async () => {
    const requests = anonymous({ [CONFIRM]: { status: 204 } });
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { client } = renderPage();
    const unverified: User = { ...ANA, email_verified: false };
    client.setQueryData(meQuery.queryKey, unverified);

    expect(await screen.findByRole("heading", { name: "E-mail verificado" })).toBeInTheDocument();
    expect(screen.getByText("Pronto: seu e-mail está confirmado.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para o Soldi" })).toHaveAttribute("href", "/mes");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/verificar-email");
    expect(window.location.hash).toBe("");
    expect(posts(requests)).toHaveLength(1);
    expect(await posts(requests)[0]?.json()).toEqual({ token: "abc123" });
    expect(client.getQueryState(meQuery.queryKey)?.isInvalidated).toBe(true);
  });

  it("says the link is invalid when the URL has no token", () => {
    window.history.replaceState(null, "", "/verificar-email");
    const requests = anonymous();
    renderPage();

    expectInvalid();
    expect(posts(requests)).toHaveLength(0);
  });

  it("says the link is invalid when the server refuses it", async () => {
    anonymous({
      [CONFIRM]: { status: 422, body: { ...problem(422, "x"), type: "urn:soldi:error:invalid-verification-link" } },
    });
    renderPage();

    await screen.findByRole("heading", { name: "Link inválido ou expirado" });
    expectInvalid();
  });

  it("asks to wait after too many attempts", async () => {
    anonymous({ [CONFIRM]: { status: 429, body: problem(429, "x") } });
    renderPage();

    expect(await screen.findByText("Muitas tentativas. Tente de novo mais tarde.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).not.toBeInTheDocument();
  });

  it("offers a retry with the same token after another failure", async () => {
    anonymous({ [CONFIRM]: { status: 500, body: problem(500, "x") } });
    renderPage();

    expect(await screen.findByText("Não foi possível verificar agora.")).toBeInTheDocument();
    const requests = anonymous({ [CONFIRM]: { status: 204 } });
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

    expect(await screen.findByRole("heading", { name: "E-mail verificado" })).toBeInTheDocument();
    expect(await posts(requests)[0]?.json()).toEqual({ token: "abc123" });
  });
});
