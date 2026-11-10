import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { meQuery } from "@/entities/user/session";
import { router } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { ANA, problem, signedIn } from "@/test/stub-api";

import ContaPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

type Reply = { status: number; body?: unknown };

const open = (replies: Record<string, Reply> = {}) => {
  const requests = signedIn(replies);
  const { client } = renderWithQuery(
    <>
      <ContaPage />
      <Toaster />
    </>,
  );
  return { requests, client };
};

const posts = (requests: Request[], path: string) =>
  requests.filter((request) => request.method === "POST" && new URL(request.url).pathname === path);

describe("Ajustes › Minha conta", () => {
  beforeEach(() => router.replace.mockClear());

  it("renames the user and the cached user follows at once", async () => {
    const { requests, client } = open({ "PATCH /api/me": { status: 200, body: { ...ANA, name: "Ana Paula" } } });

    const name = await screen.findByLabelText("Nome");
    expect(name).toHaveValue("Ana");
    expect(name).toHaveAttribute("autocomplete", "name");
    expect(screen.getByRole("heading", { level: 1, name: "Minha conta" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ajustes" })).toHaveAttribute("href", "/ajustes");
    expect(screen.getByLabelText("E-mail")).toHaveValue("ana@example.com");
    expect(screen.getByLabelText("E-mail")).toHaveAttribute("readonly");
    expect(screen.getByText("Para trocar o e-mail, fale com o suporte.")).toBeInTheDocument();

    await userEvent.clear(name);
    await userEvent.type(name, "  Ana Paula  ");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Nome salvo")).toBeInTheDocument();
    const patch = requests.find((request) => request.method === "PATCH");
    expect(await patch?.json()).toEqual({ name: "Ana Paula" });
    expect(client.getQueryData(meQuery.queryKey)?.name).toBe("Ana Paula");
    expect(name).toHaveValue("Ana Paula");
  });

  it("blocks an empty name and one over 60 characters before sending", async () => {
    const { requests } = open();

    const name = await screen.findByLabelText("Nome");
    await userEvent.clear(name);
    await userEvent.type(name, "   ");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("Informe seu nome.")).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");

    await userEvent.clear(name);
    await userEvent.type(name, "a".repeat(61));
    expect(name).toHaveValue("a".repeat(60));
    expect(requests.some((request) => request.method === "PATCH")).toBe(false);
  });

  it("says so when the name is not saved", async () => {
    open({ "PATCH /api/me": { status: 500, body: problem(500, "Falhou.") } });

    await screen.findByLabelText("Nome");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Não foi possível salvar.")).toBeInTheDocument();
  });

  it("changes the password and clears the fields", async () => {
    const { requests, client } = open({ "POST /api/me/password": { status: 204 } });

    const current = await screen.findByLabelText("Senha atual");
    const next = screen.getByLabelText("Nova senha");
    expect(current).toHaveAttribute("autocomplete", "current-password");
    expect(next).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByText("Mínimo de 8 caracteres")).toBeInTheDocument();

    await userEvent.type(current, "senha-antiga");
    await userEvent.type(next, "curta");
    await userEvent.click(screen.getByRole("button", { name: "Trocar senha" }));
    expect(next).toHaveAttribute("aria-invalid", "true");
    expect(posts(requests, "/api/me/password")).toHaveLength(0);

    await userEvent.type(next, "-mas-agora-longa");
    await userEvent.click(screen.getByRole("button", { name: "Trocar senha" }));

    expect(await screen.findByText("Senha trocada. Os outros aparelhos foram desconectados.")).toBeInTheDocument();
    expect(await posts(requests, "/api/me/password")[0].json()).toEqual({
      current_password: "senha-antiga",
      new_password: "curta-mas-agora-longa",
    });
    expect(current).toHaveValue("");
    expect(next).toHaveValue("");
    expect(next).not.toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(client.getMutationCache().getAll()).toHaveLength(0));
  });

  it("counts characters, not code units, and caps the new password at 128", async () => {
    const { requests } = open({ "POST /api/me/password": { status: 204 } });

    await userEvent.type(await screen.findByLabelText("Senha atual"), "senha-antiga");
    const next = screen.getByLabelText("Nova senha");
    await userEvent.click(next);
    await userEvent.paste("😀".repeat(7));
    await userEvent.click(screen.getByRole("button", { name: "Trocar senha" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Mínimo de 8 caracteres");

    await userEvent.clear(next);
    await userEvent.paste("a".repeat(129));
    await userEvent.click(screen.getByRole("button", { name: "Trocar senha" }));
    expect(screen.getByRole("alert")).toHaveTextContent("A senha pode ter até 128 caracteres.");
    expect(posts(requests, "/api/me/password")).toHaveLength(0);

    await userEvent.clear(next);
    await userEvent.paste("😀".repeat(8));
    await userEvent.click(screen.getByRole("button", { name: "Trocar senha" }));
    expect(await screen.findByText("Senha trocada. Os outros aparelhos foram desconectados.")).toBeInTheDocument();
  });

  it("marks the new password when the server refuses its length", async () => {
    open({
      "POST /api/me/password": {
        status: 422,
        body: { ...problem(422, "No."), errors: [{ field: "password", message: "too short" }] },
      },
    });

    await userEvent.type(await screen.findByLabelText("Senha atual"), "senha-antiga");
    const next = screen.getByLabelText("Nova senha");
    await userEvent.type(next, "nova-senha-longa");
    await userEvent.click(screen.getByRole("button", { name: "Trocar senha" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Mínimo de 8 caracteres");
    expect(next).toHaveAttribute("aria-invalid", "true");
    await userEvent.type(next, "x");
    expect(next).not.toHaveAttribute("aria-invalid", "true");
  });

  it("tells a wrong current password apart from any other failure", async () => {
    const { client } = open({
      "POST /api/me/password": {
        status: 422,
        body: { ...problem(422, "No."), type: "urn:soldi:error:wrong-password" },
      },
    });

    const current = await screen.findByLabelText("Senha atual");
    await userEvent.type(current, "errada-demais");
    await userEvent.type(screen.getByLabelText("Nova senha"), "nova-senha-longa");
    await userEvent.click(screen.getByRole("button", { name: "Trocar senha" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Senha atual incorreta");
    expect(await screen.findAllByText("Senha atual incorreta")).toHaveLength(2);
    expect(current).toHaveValue("errada-demais");
    expect(current).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(client.getMutationCache().getAll()).toHaveLength(0));

    await userEvent.type(current, "!");
    expect(current).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says so when the password change fails for another reason", async () => {
    open({ "POST /api/me/password": { status: 500, body: problem(500, "Falhou.") } });

    await userEvent.type(await screen.findByLabelText("Senha atual"), "senha-antiga");
    await userEvent.type(screen.getByLabelText("Nova senha"), "nova-senha-longa");
    await userEvent.click(screen.getByRole("button", { name: "Trocar senha" }));

    expect(await screen.findByText("Não foi possível trocar a senha.")).toBeInTheDocument();
  });

  it("asks to wait when there were too many password attempts", async () => {
    open({ "POST /api/me/password": { status: 429, body: problem(429, "Too many.") } });

    await userEvent.type(await screen.findByLabelText("Senha atual"), "senha-antiga");
    await userEvent.type(screen.getByLabelText("Nova senha"), "nova-senha-longa");
    await userEvent.click(screen.getByRole("button", { name: "Trocar senha" }));

    expect(await screen.findByText("Muitas tentativas. Espere um pouco e tente de novo.")).toBeInTheDocument();
  });

  it("signs out everywhere only after confirming, then goes to sign-in", async () => {
    const { requests, client } = open({ "POST /api/auth/sign-out-everywhere": { status: 204 } });

    expect(await screen.findByRole("button", { name: "Sair" })).toBeInTheDocument();
    client.setQueryData(["months", "2026-11"], { balance: "10.00" });
    await userEvent.click(screen.getByRole("button", { name: "Sair de todos os aparelhos" }));
    let dialog = await screen.findByRole("alertdialog", { name: "Sair de todos os aparelhos?" });
    expect(within(dialog).getByText("Você vai precisar entrar de novo em cada um.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(posts(requests, "/api/auth/sign-out-everywhere")).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Sair de todos os aparelhos" }));
    dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sair de todos" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/entrar"));
    expect(posts(requests, "/api/auth/sign-out-everywhere")).toHaveLength(1);
    expect(client.getQueryData(meQuery.queryKey)).toBeNull();
    expect(
      client
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual([meQuery.queryKey]);
  });

  it("says so when signing out everywhere fails", async () => {
    open({ "POST /api/auth/sign-out-everywhere": { status: 500, body: problem(500, "Falhou.") } });

    await userEvent.click(await screen.findByRole("button", { name: "Sair de todos os aparelhos" }));
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Sair de todos" }),
    );

    expect(await screen.findByText("Não foi possível sair. Tente de novo.")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
