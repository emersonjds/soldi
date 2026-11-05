import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import {
  CATEGORIES,
  COMIDA,
  ECONOMIA,
  MERCADO,
  problem,
  RESERVA,
  stubApi,
  VIAGEM,
  WITH_COFRINHOS,
} from "@/test/stub-api";

import { CategorySheet } from "./category-sheet";

type Category = Schemas["Category"];

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
const LIST = [...CATEGORIES, PETS, RACAO, VET];

type Reply = { status: number; body?: unknown };

const open = (
  props: { category?: Category; parentId?: string; kind?: Category["kind"] },
  replies: Record<string, Reply> = {},
) => {
  const requests = stubApi({ "GET /api/categories": { status: 200, body: LIST }, ...replies });
  const onSaved = vi.fn();
  const onArchive = vi.fn();
  const onOpenChange = vi.fn();
  renderWithQuery(
    <>
      <CategorySheet kind="daily" open onOpenChange={onOpenChange} onSaved={onSaved} onArchive={onArchive} {...props} />
      <Toaster />
    </>,
  );
  return { requests, onSaved, onArchive, onOpenChange };
};

const options = (sheet: HTMLElement) =>
  within(within(sheet).getByLabelText("Subcategoria de"))
    .getAllByRole("option")
    .map((option) => option.textContent);

const patched = async (requests: Request[]) => {
  await waitFor(() => expect(requests.some((request) => request.method === "PATCH")).toBe(true));
  return requests.find((request) => request.method === "PATCH")?.json();
};

describe("CategorySheet", () => {
  beforeEach(() => {
    window.innerWidth = 375;
  });

  it("edits a subcategory: its values filled in, the parent choices without itself or other children", async () => {
    const renamed = { ...RACAO, name: "Ração e areia", parent_id: null };
    const { requests, onSaved, onOpenChange } = open(
      { category: RACAO },
      { [`PATCH /api/categories/${RACAO.id}`]: { status: 200, body: renamed } },
    );

    const sheet = await screen.findByRole("dialog", { name: "Editar categoria" });
    expect(within(sheet).getByLabelText("Nome")).toHaveValue("Ração");
    expect(within(sheet).getByRole("radio", { name: "Cor Roxo" })).toBeChecked();
    await waitFor(() => expect(options(sheet)).toEqual(["Nenhuma", "Comida fora", "Mercado", "Pets"]));
    expect(within(sheet).getByLabelText("Subcategoria de")).toHaveValue(PETS.id);
    // A select nested in another renders empty in browsers.
    expect(within(sheet).getByLabelText("Subcategoria de").parentElement?.closest("select")).toBeNull();
    expect(within(sheet).queryByRole("button", { name: "Criar" })).not.toBeInTheDocument();

    await userEvent.clear(within(sheet).getByLabelText("Nome"));
    await userEvent.type(within(sheet).getByLabelText("Nome"), "Ração e areia");
    await userEvent.selectOptions(within(sheet).getByLabelText("Subcategoria de"), "");
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));

    expect(await patched(requests)).toEqual({
      name: "Ração e areia",
      icon: "paw-print",
      color: "cat-5",
      parent_id: null,
    });
    expect(await screen.findByText("Categoria salva")).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSaved).toHaveBeenCalledWith(renamed);
  });

  it("keeps a category with subcategories at the top and leaves itself out of the parents", async () => {
    const { requests } = open(
      { category: PETS },
      { [`PATCH /api/categories/${PETS.id}`]: { status: 200, body: PETS } },
    );

    const sheet = await screen.findByRole("dialog", { name: "Editar categoria" });
    await waitFor(() => expect(within(sheet).getByLabelText("Nome")).toHaveValue("Pets"));
    expect(within(sheet).queryByLabelText("Subcategoria de")).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));

    expect(await patched(requests)).toEqual({ name: "Pets", icon: "paw-print", color: "cat-5", parent_id: null });
  });

  it("offers every other top-level category to one without children", async () => {
    open({ category: MERCADO });

    const sheet = await screen.findByRole("dialog", { name: "Editar categoria" });
    await waitFor(() => expect(options(sheet)).toEqual(["Nenhuma", "Comida fora", "Pets"]));
  });

  it("archives from the sheet", async () => {
    const { onArchive, onOpenChange } = open({ category: COMIDA });

    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Arquivar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onArchive).toHaveBeenCalledWith(COMIDA);
  });

  it("creates with the parent already chosen and offers no archive", async () => {
    const created = { ...RACAO, id: "c1000000-0000-4000-8000-000000000013", name: "Pet shop", color: "cat-3" };
    const { requests } = open({ parentId: PETS.id }, { "POST /api/categories": { status: 201, body: created } });

    const sheet = await screen.findByRole("dialog", { name: "Nova categoria" });
    await waitFor(() => expect(within(sheet).getByLabelText("Subcategoria de")).toHaveValue(PETS.id));
    expect(within(sheet).getByRole("radio", { name: "Ícone paw-print" })).toBeChecked();
    expect(within(sheet).getByRole("radio", { name: "Cor Roxo" })).toBeChecked();
    expect(within(sheet).queryByRole("button", { name: "Arquivar" })).not.toBeInTheDocument();
    await userEvent.type(within(sheet).getByLabelText("Nome"), "Pet shop{Enter}");

    await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
    expect(await requests.find((request) => request.method === "POST")?.json()).toMatchObject({
      name: "Pet shop",
      parent_id: PETS.id,
    });
    expect(await screen.findByText("Categoria criada")).toBeInTheDocument();
  });

  it("says when the new name is taken, or saving fails otherwise", async () => {
    open({ category: MERCADO }, { [`PATCH /api/categories/${MERCADO.id}`]: { status: 409, body: problem(409, "x") } });
    const sheet = await screen.findByRole("dialog", { name: "Editar categoria" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));
    expect(await within(sheet).findByText("Já existe uma categoria com esse nome")).toBeInTheDocument();

    stubApi({
      "GET /api/categories": { status: 200, body: LIST },
      [`PATCH /api/categories/${MERCADO.id}`]: { status: 422, body: problem(422, "nested-subcategory") },
    });
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));
    expect(await within(sheet).findByText("Não foi possível salvar a categoria.")).toBeInTheDocument();
  });

  describe("as a cofrinho, under Economia", () => {
    const cofrinhos = (replies: Record<string, Reply> = {}) => ({
      "GET /api/categories": { status: 200, body: WITH_COFRINHOS },
      ...replies,
    });

    it("creates one with a suggested name, a goal and a deadline", async () => {
      const created = { ...RESERVA, id: "c1000000-0000-4000-8000-000000000030", name: "Viagem" };
      const { requests } = open(
        { kind: "bill", parentId: ECONOMIA.id },
        cofrinhos({ "POST /api/categories": { status: 201, body: created } }),
      );

      const sheet = await screen.findByRole("dialog", { name: "Novo cofrinho" });
      await waitFor(() => expect(within(sheet).getByLabelText("Meta")).toBeInTheDocument());
      expect(within(sheet).queryByLabelText("Subcategoria de")).not.toBeInTheDocument();
      for (const name of ["Reserva de emergência", "Viagem", "Carro", "Casa", "Estudos"])
        expect(within(sheet).getByRole("button", { name })).toBeInTheDocument();
      await userEvent.click(within(sheet).getByRole("button", { name: "Viagem" }));
      expect(within(sheet).getByLabelText("Nome")).toHaveValue("Viagem");
      expect(within(sheet).getByRole("radio", { name: "Ícone plane" })).toBeChecked();
      await userEvent.type(within(sheet).getByLabelText("Meta"), "500000");
      fireEvent.change(within(sheet).getByLabelText("Prazo"), { target: { value: "2027-06-30" } });
      await userEvent.click(within(sheet).getByRole("button", { name: "Criar" }));

      await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
      expect(await requests.find((request) => request.method === "POST")?.json()).toEqual({
        name: "Viagem",
        kind: "bill",
        icon: "plane",
        color: "cat-1",
        parent_id: ECONOMIA.id,
        target: "5000.00",
        deadline: "2027-06-30",
      });
      expect(await screen.findByText("Cofrinho criado")).toBeInTheDocument();
    });

    it("leaves the goal and the deadline out when they are blank", async () => {
      const { requests } = open(
        { kind: "bill", parentId: ECONOMIA.id },
        cofrinhos({ "POST /api/categories": { status: 201, body: VIAGEM } }),
      );

      const sheet = await screen.findByRole("dialog", { name: "Novo cofrinho" });
      await userEvent.type(within(sheet).getByLabelText("Nome"), "Carro novo{Enter}");

      await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
      expect(await requests.find((request) => request.method === "POST")?.json()).toMatchObject({
        target: null,
        deadline: null,
      });
    });

    it("edits one with its goal filled in and clears the deadline", async () => {
      const { requests } = open(
        { kind: "bill", category: RESERVA },
        cofrinhos({ [`PATCH /api/categories/${RESERVA.id}`]: { status: 200, body: RESERVA } }),
      );

      const sheet = await screen.findByRole("dialog", { name: "Editar cofrinho" });
      await waitFor(() => expect(within(sheet).getByLabelText("Meta")).toHaveValue("10.000,00"));
      expect(within(sheet).getByLabelText("Prazo")).toHaveValue("2027-06-30");
      expect(within(sheet).queryByRole("button", { name: "Viagem" })).not.toBeInTheDocument();
      fireEvent.change(within(sheet).getByLabelText("Prazo"), { target: { value: "" } });
      await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));

      expect(await patched(requests)).toEqual({
        name: "Reserva",
        icon: "shield",
        color: "cat-3",
        parent_id: ECONOMIA.id,
        target: "10000.00",
        deadline: null,
      });
      expect(await screen.findByText("Cofrinho salvo")).toBeInTheDocument();
    });

    it("keeps Economia itself at the top and never archives it", async () => {
      open({ kind: "bill", category: ECONOMIA }, cofrinhos());

      const sheet = await screen.findByRole("dialog", { name: "Editar categoria" });
      await waitFor(() => expect(within(sheet).getByLabelText("Nome")).toHaveValue("Economia"));
      expect(within(sheet).queryByLabelText("Subcategoria de")).not.toBeInTheDocument();
      expect(within(sheet).queryByLabelText("Meta")).not.toBeInTheDocument();
      expect(within(sheet).queryByRole("button", { name: "Arquivar" })).not.toBeInTheDocument();
    });
  });
});
