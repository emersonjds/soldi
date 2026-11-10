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

const sent = (requests: Request[], method: string, path: string) =>
  requests.filter((request) => request.method === method && new URL(request.url).pathname === path);
const posts = (requests: Request[], path: string) => sent(requests, "POST", path);

const openDeletion = async () => {
  await userEvent.click(await screen.findByRole("button", { name: "Excluir minha conta" }));
  return screen.findByRole("alertdialog", { name: "Excluir sua conta?" });
};

const fillDeletion = async (dialog: HTMLElement, password = "minha-senha-longa") => {
  await userEvent.type(within(dialog).getByLabelText("Senha"), password);
  await userEvent.type(within(dialog).getByLabelText("Digite EXCLUIR para confirmar"), "EXCLUIR");
  await userEvent.click(within(dialog).getByRole("button", { name: "Excluir para sempre" }));
};

const WARNING =
  "Apaga sua conta e todos os seus lançamentos, categorias, contas fixas e cofrinhos. Não dá para desfazer.";

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

  it("deletes the account only once the password and EXCLUIR are typed, then goes to sign-in", async () => {
    const { requests, client } = open({ "DELETE /api/me": { status: 204 } });

    const section = await screen.findByRole("region", { name: "Excluir conta" });
    expect(within(section).getByText(WARNING)).toBeInTheDocument();
    client.setQueryData(["months", "2026-11"], { balance: "10.00" });
    const dialog = await openDeletion();
    expect(within(dialog).getByText(WARNING)).toBeInTheDocument();
    const password = within(dialog).getByLabelText("Senha");
    const confirmation = within(dialog).getByLabelText("Digite EXCLUIR para confirmar");
    const submit = within(dialog).getByRole("button", { name: "Excluir para sempre" });
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(submit).toBeDisabled();

    await userEvent.type(confirmation, "EXCLUIR");
    expect(submit).toBeDisabled();
    await userEvent.type(password, "minha-senha-longa");
    expect(submit).toBeEnabled();
    await userEvent.clear(confirmation);
    await userEvent.type(confirmation, "excluir");
    expect(submit).toBeDisabled();
    await userEvent.clear(confirmation);
    await userEvent.type(confirmation, "EXCLUIR");
    await userEvent.click(submit);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/entrar"));
    expect(await screen.findByText("Sua conta foi excluída.")).toBeInTheDocument();
    const deletions = sent(requests, "DELETE", "/api/me");
    expect(deletions).toHaveLength(1);
    expect(await deletions[0].json()).toEqual({ password: "minha-senha-longa" });
    expect(client.getQueryData(meQuery.queryKey)).toBeNull();
    expect(
      client
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual([meQuery.queryKey]);
  });

  it("marks a wrong password under the field and keeps the dialog open", async () => {
    open({
      "DELETE /api/me": { status: 422, body: { ...problem(422, "No."), type: "urn:soldi:error:wrong-password" } },
    });

    const dialog = await openDeletion();
    await fillDeletion(dialog, "senha-errada");

    expect(await within(dialog).findByText("Senha incorreta")).toBeInTheDocument();
    const password = within(dialog).getByLabelText("Senha");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();

    await userEvent.type(password, "!");
    expect(within(dialog).queryByText("Senha incorreta")).not.toBeInTheDocument();
  });

  it("asks to wait when there were too many deletion attempts", async () => {
    open({ "DELETE /api/me": { status: 429, body: problem(429, "Too many.") } });

    const dialog = await openDeletion();
    await fillDeletion(dialog);

    expect(await within(dialog).findByText("Muitas tentativas. Espere um pouco e tente de novo.")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("says so when the account is not deleted for another reason", async () => {
    open({ "DELETE /api/me": { status: 500, body: problem(500, "Falhou.") } });

    const dialog = await openDeletion();
    await fillDeletion(dialog);

    expect(await within(dialog).findByText("Não foi possível excluir a conta.")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("cancels the deletion without a request and forgets what was typed", async () => {
    const { requests } = open();

    let dialog = await openDeletion();
    await userEvent.type(within(dialog).getByLabelText("Senha"), "minha-senha-longa");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(sent(requests, "DELETE", "/api/me")).toHaveLength(0);

    dialog = await openDeletion();
    expect(within(dialog).getByLabelText("Senha")).toHaveValue("");
  });
});
