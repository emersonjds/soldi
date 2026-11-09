import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { router, setSearch } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import {
  ALUGUEL,
  COMIDA,
  ECONOMIA,
  EXTRA,
  LUZ,
  MERCADO,
  problem,
  RESERVA,
  SALARIO,
  signedIn,
  VIAGEM,
} from "@/test/stub-api";

import CategoriasPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

type Category = Schemas["Category"];
type Reply = { status: number; body?: unknown };

const PETS: Category = {
  id: "c1000000-0000-4000-8000-000000000010",
  name: "Pets",
  kind: "daily",
  icon: "paw-print",
  color: "cat-5",
  is_savings: false,
};
const RACAO: Category = { ...PETS, id: "c1000000-0000-4000-8000-000000000011", name: "Ração", parent_id: PETS.id };
const VET: Category = { ...PETS, id: "c1000000-0000-4000-8000-000000000012", name: "Veterinário", parent_id: PETS.id };
const IMPORTADO: Category = {
  id: "c1000000-0000-4000-8000-000000000020",
  name: "Importado (diário)",
  kind: "daily",
  icon: "circle-dashed",
  color: "cat-12",
  is_savings: false,
};
/** In the API's order: kind, parent name, then the children by name. */
const LIST = [EXTRA, SALARIO, ALUGUEL, ECONOMIA, RESERVA, VIAGEM, LUZ, COMIDA, IMPORTADO, MERCADO, PETS, RACAO, VET];

const open = (replies: Record<string, Reply> = {}) => {
  const requests = signedIn({ "GET /api/categories": { status: 200, body: LIST }, ...replies });
  renderWithQuery(
    <>
      <CategoriasPage />
      <Toaster />
    </>,
  );
  return requests;
};

const sent = (requests: Request[], method: string) => requests.filter((request) => request.method === method);
const list = () => screen.findByRole("list", { name: /^Categorias de / });
const menu = async (name: string, user = userEvent.setup()) => {
  await user.click(within(await list()).getByRole("button", { name: `Mais ações de ${name}` }));
  const items = within(await screen.findByRole("menu")).getAllByRole("menuitem");
  return { user, items, labels: items.map((item) => item.textContent) };
};
const names = (element: HTMLElement) =>
  within(element)
    .queryAllByRole("button", { name: /^Editar / })
    .map((button) => button.getAttribute("aria-label"));

describe("Ajustes › Categorias", () => {
  beforeEach(() => {
    window.innerWidth = 375;
    setSearch("");
    router.replace.mockClear();
  });

  it("opens on Diário: each parent with its subcategories under it, imported ones too", async () => {
    open();

    expect(screen.getByRole("heading", { level: 1, name: "Categorias" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ajustes" })).toHaveAttribute("href", "/ajustes");
    expect(screen.getByRole("radio", { name: "Diário" })).toBeChecked();
    const daily = await list();
    expect(daily).toHaveAccessibleName("Categorias de Diário");
    expect(names(daily)).toEqual([
      "Editar Comida fora",
      "Editar Importado (diário)",
      "Editar Mercado",
      "Editar Pets",
      "Editar Ração",
      "Editar Veterinário",
    ]);
    const children = within(daily).getByRole("list", { name: "Subcategorias de Pets" });
    expect(names(children)).toEqual(["Editar Ração", "Editar Veterinário"]);
    expect(within(daily).getAllByRole("button", { name: /^Mais ações de / })).toHaveLength(6);
    expect(within(daily).queryByRole("button", { name: /^Nova subcategoria em / })).not.toBeInTheDocument();
  });

  it("offers Editar, Nova subcategoria and Excluir on a top-level row's kebab", async () => {
    open();

    expect((await menu("Pets")).labels).toEqual(["Editar", "Nova subcategoria em Pets", "Excluir"]);
  });

  it("offers Editar and Excluir on a subcategory's kebab", async () => {
    open();

    expect((await menu("Ração")).labels).toEqual(["Editar", "Excluir"]);
  });

  it("treats Importado like any category", async () => {
    open();

    expect((await menu("Importado (diário)")).labels).toEqual([
      "Editar",
      "Nova subcategoria em Importado (diário)",
      "Excluir",
    ]);
  });

  it("opens the edit sheet from the kebab's Editar", async () => {
    open();

    const { user, items } = await menu("Veterinário");
    await user.click(items[0]);

    const sheet = await screen.findByRole("dialog", { name: "Editar categoria" });
    expect(within(sheet).getByLabelText("Nome")).toHaveValue("Veterinário");
  });

  it("opens the kebab with Enter and gives focus back to it on Esc", async () => {
    open();
    const user = userEvent.setup();

    const kebab = within(await list()).getByRole("button", { name: "Mais ações de Mercado" });
    kebab.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(kebab).toHaveFocus();
  });

  it("switches kind through ?k=", async () => {
    open();

    await userEvent.click(screen.getByRole("radio", { name: "Entrada" }));

    expect(router.replace).toHaveBeenCalledWith("/ajustes/categorias?k=income", { scroll: false });
  });

  it("reads the kind from ?k=", async () => {
    setSearch("k=income");
    open();

    expect(screen.getByRole("radio", { name: "Entrada" })).toBeChecked();
    expect(names(await list())).toEqual(["Editar Extra", "Editar Salário"]);
  });

  it("says when a kind has no categories yet, and retries after an error", async () => {
    setSearch("k=bill");
    const requests = open({ "GET /api/categories": { status: 500, body: problem(500, "Falhou.") } });

    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(sent(requests, "GET").filter((r) => r.url.includes("categories"))).toHaveLength(2));

    signedIn({ "GET /api/categories": { status: 200, body: [MERCADO] } });
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Nenhuma categoria aqui ainda")).toBeInTheDocument();
  });

  it("creates a category of the open kind from the header", async () => {
    setSearch("k=bill");
    const created = { ...MERCADO, id: "c1000000-0000-4000-8000-000000000030", name: "Internet", kind: "bill" };
    const requests = open({ "POST /api/categories": { status: 201, body: created } });

    await list();
    await userEvent.click(screen.getByRole("button", { name: "Nova categoria" }));
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Nova" })).getByRole("button", { name: /^Categoria/ }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Nova categoria" });
    expect(sheet.querySelector("select")).toBeNull();
    await userEvent.type(within(sheet).getByLabelText("Nome"), "Internet{Enter}");

    await waitFor(() => expect(sent(requests, "POST")).toHaveLength(1));
    expect(await sent(requests, "POST")[0].json()).toMatchObject({ name: "Internet", kind: "bill" });
  });

  it("creates a subcategory from the parent's kebab, skipping the chooser the header opened before", async () => {
    open();

    await userEvent.click(within(await list()).getByRole("button", { name: "Editar Pets" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Nova categoria" }));
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Nova" })).getByRole("button", { name: "Fechar" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const { user, items } = await menu("Pets");
    await user.click(items[1]);
    const sheet = await screen.findByRole("dialog", { name: "Nova categoria" });
    expect(within(sheet).getByText("Em Pets")).toBeInTheDocument();
    expect(sheet.querySelector("select")).toBeNull();
  });

  it("opens the edit sheet from a row", async () => {
    open();

    await userEvent.click(within(await list()).getByRole("button", { name: "Editar Ração" }));
    const sheet = await screen.findByRole("dialog", { name: "Editar categoria" });
    expect(within(sheet).getByLabelText("Nome")).toHaveValue("Ração");
  });

  it("marks Economia as the cofrinhos, never deletes it and creates one from its kebab", async () => {
    setSearch("k=bill");
    open();

    const economia = within(await list()).getByRole("button", { name: "Editar Economia" });
    expect(within(economia).getByText("Cofrinhos")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Subcategorias de Economia" })).toHaveTextContent("ReservaViagem");
    const { user, items, labels } = await menu("Economia");
    expect(labels).toEqual(["Editar", "Novo cofrinho em Economia"]);
    await user.click(items[1]);

    const sheet = await screen.findByRole("dialog", { name: "Novo cofrinho" });
    expect(within(sheet).getByLabelText("Meta")).toBeInTheDocument();
  });

  describe("deleting", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const archive = async (name: string) => {
      const { user } = await menu(name, userEvent.setup({ advanceTimers: vi.advanceTimersByTime }));
      await user.click(screen.getByRole("menuitem", { name: "Excluir" }));
      return user;
    };

    it("hides a parent with its subcategories, holds the archive while Desfazer shows and sends nothing when undone", async () => {
      const requests = open({ [`DELETE /api/categories/${PETS.id}`]: { status: 204 } });

      const user = await archive("Pets");

      expect(await screen.findByText("Categoria excluída")).toBeInTheDocument();
      expect(screen.getByText("2 subcategorias também; lançamentos continuam com a categoria.")).toBeInTheDocument();
      expect(names(await list())).toEqual(["Editar Comida fora", "Editar Importado (diário)", "Editar Mercado"]);
      await user.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(await screen.findByRole("button", { name: "Editar Veterinário" })).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(6000));
      expect(sent(requests, "DELETE")).toHaveLength(0);
    });

    it("counts a single subcategory in the singular", async () => {
      open({ "GET /api/categories": { status: 200, body: LIST.filter((category) => category !== VET) } });

      await archive("Pets");

      expect(
        await screen.findByText("1 subcategoria também; lançamentos continuam com a categoria."),
      ).toBeInTheDocument();
    });

    it("deletes from the edit sheet the same way", async () => {
      open();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      await user.click(within(await list()).getByRole("button", { name: "Editar Mercado" }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Excluir" }));

      expect(await screen.findByText("Categoria excluída")).toBeInTheDocument();
      expect(screen.getByText("Lançamentos continuam com a categoria.")).toBeInTheDocument();
    });

    it("deletes once the toast is gone; a subcategory only says the entries stay", async () => {
      const requests = open({ [`DELETE /api/categories/${RACAO.id}`]: { status: 204 } });

      await archive("Ração");
      await screen.findByText("Subcategoria excluída");
      expect(screen.getByText("Lançamentos continuam com a categoria.")).toBeInTheDocument();
      expect(screen.queryByText(/também/)).not.toBeInTheDocument();
      expect(sent(requests, "DELETE")).toHaveLength(0);
      act(() => vi.advanceTimersByTime(6000));

      await waitFor(() => expect(sent(requests, "DELETE")).toHaveLength(1));
    });

    it("says to take the money out first when a cofrinho still holds some", async () => {
      setSearch("k=bill");
      open({
        [`DELETE /api/categories/${RESERVA.id}`]: {
          status: 422,
          body: { ...problem(422, "No."), type: "urn:soldi:error:cofrinho-not-empty" },
        },
      });

      await archive("Reserva");
      await screen.findByText("Cofrinho excluído");
      act(() => vi.advanceTimersByTime(6000));

      expect(await screen.findByText("Resgate tudo antes de excluir.")).toBeInTheDocument();
    });

    it("brings the category back and says so when deleting fails", async () => {
      open({ [`DELETE /api/categories/${COMIDA.id}`]: { status: 500, body: problem(500, "Falhou.") } });

      await archive("Comida fora");
      await screen.findByText("Categoria excluída");
      act(() => vi.advanceTimersByTime(6000));

      expect(await screen.findByText("Não foi possível excluir a categoria.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Editar Comida fora" })).toBeInTheDocument();
    });
  });
});
