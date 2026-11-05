import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { router, setSearch } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { ALUGUEL, COMIDA, EXTRA, LUZ, MERCADO, problem, SALARIO, signedIn } from "@/test/stub-api";

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
  name: "Importado (gasto)",
  kind: "daily",
  icon: "circle-dashed",
  color: "cat-12",
  is_savings: false,
};
/** In the API's order: kind, parent name, then the children by name. */
const LIST = [EXTRA, SALARIO, ALUGUEL, LUZ, COMIDA, IMPORTADO, MERCADO, PETS, RACAO, VET];

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
      "Editar Importado (gasto)",
      "Editar Mercado",
      "Editar Pets",
      "Editar Ração",
      "Editar Veterinário",
    ]);
    const children = within(daily).getByRole("list", { name: "Subcategorias de Pets" });
    expect(names(children)).toEqual(["Editar Ração", "Editar Veterinário"]);
    expect(within(daily).getAllByRole("button", { name: /^Nova subcategoria em / })).toHaveLength(4);
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
    const sheet = await screen.findByRole("dialog", { name: "Nova categoria" });
    expect(within(sheet).getByLabelText("Subcategoria de")).toHaveValue("");
    await userEvent.type(within(sheet).getByLabelText("Nome"), "Internet{Enter}");

    await waitFor(() => expect(sent(requests, "POST")).toHaveLength(1));
    expect(await sent(requests, "POST")[0].json()).toMatchObject({ name: "Internet", kind: "bill" });
  });

  it("creates a subcategory from the parent's +", async () => {
    open();

    await userEvent.click(await screen.findByRole("button", { name: "Nova subcategoria em Pets" }));
    const sheet = await screen.findByRole("dialog", { name: "Nova categoria" });
    expect(within(sheet).getByLabelText("Subcategoria de")).toHaveValue(PETS.id);
  });

  it("opens the edit sheet from a row", async () => {
    open();

    await userEvent.click(within(await list()).getByRole("button", { name: "Editar Ração" }));
    const sheet = await screen.findByRole("dialog", { name: "Editar categoria" });
    expect(within(sheet).getByLabelText("Nome")).toHaveValue("Ração");
  });

  describe("archiving", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const archive = async (name: string) => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(within(await list()).getByRole("button", { name: `Editar ${name}` }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Arquivar" }));
      return user;
    };

    it("hides a parent with its subcategories, holds the archive while Desfazer shows and sends nothing when undone", async () => {
      const requests = open({ [`DELETE /api/categories/${PETS.id}`]: { status: 204 } });

      const user = await archive("Pets");

      expect(await screen.findByText("Categoria arquivada")).toBeInTheDocument();
      expect(screen.getByText("2 subcategorias também")).toBeInTheDocument();
      expect(names(await list())).toEqual(["Editar Comida fora", "Editar Importado (gasto)", "Editar Mercado"]);
      await user.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(await screen.findByRole("button", { name: "Editar Veterinário" })).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(6000));
      expect(sent(requests, "DELETE")).toHaveLength(0);
    });

    it("archives once the toast is gone; one subcategory alone says nothing more", async () => {
      const requests = open({ [`DELETE /api/categories/${RACAO.id}`]: { status: 204 } });

      await archive("Ração");
      await screen.findByText("Categoria arquivada");
      expect(screen.queryByText(/também/)).not.toBeInTheDocument();
      expect(sent(requests, "DELETE")).toHaveLength(0);
      act(() => vi.advanceTimersByTime(6000));

      await waitFor(() => expect(sent(requests, "DELETE")).toHaveLength(1));
    });

    it("brings the category back and says so when archiving fails", async () => {
      open({ [`DELETE /api/categories/${COMIDA.id}`]: { status: 500, body: problem(500, "Falhou.") } });

      await archive("Comida fora");
      await screen.findByText("Categoria arquivada");
      act(() => vi.advanceTimersByTime(6000));

      expect(await screen.findByText("Não foi possível arquivar a categoria.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Editar Comida fora" })).toBeInTheDocument();
    });
  });
});
