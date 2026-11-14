import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { pickDate } from "@/test/pick-date";
import { renderWithQuery } from "@/test/render";
import {
  ALUGUEL,
  CATEGORIES,
  COMBUSTIVEL,
  COMIDA,
  ECONOMIA,
  EXTRA,
  MERCADO,
  problem,
  RESERVA,
  RESGATE,
  SALARIO,
  stubApi,
  VEICULO,
  VIAGEM,
  WITH_COFRINHOS,
  WITH_MIXED_GROUP,
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
  is_card_group: false,
};
const RACAO: Category = { ...PETS, id: "c1000000-0000-4000-8000-000000000011", name: "Ração", parent_id: PETS.id };
const VET: Category = { ...PETS, id: "c1000000-0000-4000-8000-000000000012", name: "Veterinário", parent_id: PETS.id };
const LIST = [...CATEGORIES, PETS, RACAO, VET];

type Reply = { status: number; body?: unknown };

const rule = (slug: string) => ({ ...problem(422, slug), type: `urn:soldi:error:${slug}` });
const ALL_TAKEN = "Todas as 24 cores estão em uso. Crie como subcategoria ou arquive uma categoria.";
const ALL_TAKEN_EDITING = "Todas as 24 cores estão em uso. Mantenha como subcategoria ou arquive uma categoria.";

const open = (
  props: {
    category?: Category;
    parentId?: string;
    kind?: Category["kind"];
    onKindChange?: (kind: Category["kind"]) => void;
    onUseExisting?: (category: Category) => void;
    note?: string | null;
  },
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
  within(within(sheet).getByLabelText("Grupo"))
    .getAllByRole("option")
    .map((option) => option.textContent);

const choose = async (option: "Grupo novo" | "Dentro de um grupo") => {
  const sheet = await sheetNamed("Nova Categoria");
  await userEvent.click(within(sheet).getByRole("radio", { name: option }));
};

/** The sheet once its form arrived with the category list. */
const sheetNamed = async (name: string | RegExp) => {
  const sheet = await screen.findByRole("dialog", { name });
  await within(sheet).findByLabelText("Nome do agrupador");
  return sheet;
};

const parentList = () => screen.findByRole("radiogroup", { name: "Escolher grupo" });

const parents = async () => {
  const group = await parentList();
  await within(group).findAllByRole("radio");
  return within(group)
    .getAllByRole("radio")
    .map((radio) => radio.closest("label")?.textContent);
};

const posted = async (requests: Request[]) => {
  await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
  return requests.find((request) => request.method === "POST")?.json();
};

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

    const sheet = await sheetNamed("Editar Categoria");
    expect(within(sheet).getByLabelText("Nome do agrupador")).toHaveValue("Ração");
    await waitFor(() =>
      expect(options(sheet)).toEqual(["Nenhuma", "Aluguel", "Luz", "Comida fora", "Mercado", "Pets"]),
    );
    expect(within(sheet).getByText("Usa a cor de Pets")).toBeInTheDocument();
    expect(within(sheet).queryByRole("radio", { name: /^Cor / })).not.toBeInTheDocument();
    expect(within(sheet).getByLabelText("Grupo")).toHaveValue(PETS.id);
    // A select nested in another renders empty in browsers.
    expect(within(sheet).getByLabelText("Grupo").parentElement?.closest("select")).toBeNull();
    expect(within(sheet).queryByRole("button", { name: "Criar Categoria" })).not.toBeInTheDocument();

    await userEvent.clear(within(sheet).getByLabelText("Nome do agrupador"));
    await userEvent.type(within(sheet).getByLabelText("Nome do agrupador"), "Ração e areia");
    await userEvent.selectOptions(within(sheet).getByLabelText("Grupo"), "");
    expect(within(sheet).queryByText("Usa a cor de Pets")).not.toBeInTheDocument();
    expect(within(sheet).getByRole("radio", { name: "Cor Azul" })).toBeChecked();
    expect(within(sheet).queryByRole("radio", { name: "Cor Roxo" })).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar Categoria" }));

    expect(await patched(requests)).toEqual({
      name: "Ração e areia",
      icon: "paw-print",
      color: "cat-3",
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

    const sheet = await sheetNamed("Editar Categoria");
    await waitFor(() => expect(within(sheet).getByLabelText("Nome do agrupador")).toHaveValue("Pets"));
    expect(within(sheet).queryByLabelText("Grupo")).not.toBeInTheDocument();
    expect(within(sheet).getByRole("radio", { name: "Cor Roxo" })).toBeChecked();
    expect(within(sheet).getByRole("radio", { name: "Cor Roxo" })).toBeEnabled();
    expect(within(sheet).queryByRole("radio", { name: "Cor Âmbar" })).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar Categoria" }));

    expect(await patched(requests)).toEqual({ name: "Pets", icon: "paw-print", color: "cat-5", parent_id: null });
  });

  it("offers every other top-level category to one without children", async () => {
    open({ category: MERCADO });

    const sheet = await sheetNamed("Editar Categoria");
    await waitFor(() => expect(options(sheet)).toEqual(["Nenhuma", "Aluguel", "Luz", "Comida fora", "Pets"]));
  });

  describe("with a group of another kind (D26)", () => {
    it("edits it in its own kind from the Diário list, its colors taken in every kind it shows in", async () => {
      const { requests } = open(
        { category: VEICULO },
        {
          "GET /api/categories": { status: 200, body: WITH_MIXED_GROUP },
          [`PATCH /api/categories/${VEICULO.id}`]: { status: 200, body: VEICULO },
        },
      );

      const sheet = await sheetNamed("Editar Categoria");
      await waitFor(() => expect(within(sheet).getByRole("radio", { name: "Cor Ciano" })).toBeChecked());
      expect(within(sheet).queryByRole("radio", { name: "Cor Âmbar" })).not.toBeInTheDocument();
      expect(within(sheet).queryByRole("radio", { name: "Cor Índigo" })).not.toBeInTheDocument();
      await userEvent.click(within(sheet).getByRole("button", { name: "Salvar Categoria" }));

      expect(await patched(requests)).toEqual({ name: "Veículo", icon: "car", color: "cat-8", parent_id: null });
    });

    it("offers a Diário child every outflow top-level", async () => {
      open({ category: COMBUSTIVEL }, { "GET /api/categories": { status: 200, body: WITH_MIXED_GROUP } });
      const sheet = await sheetNamed("Editar Categoria");
      await waitFor(() =>
        expect(options(sheet)).toEqual(["Nenhuma", "Aluguel", "Luz", "Comida fora", "Mercado", "Veículo"]),
      );
      expect(within(sheet).getByText("Usa a cor de Veículo")).toBeInTheDocument();
    });

    it("keeps Economia out of a Diário child's parents", async () => {
      open({ category: MERCADO }, { "GET /api/categories": { status: 200, body: WITH_COFRINHOS } });
      const sheet = await sheetNamed("Editar Categoria");
      await waitFor(() => expect(options(sheet)).toEqual(["Nenhuma", "Aluguel", "Luz", "Comida fora"]));
    });

    it("creates a Diário subcategory under a Saída top-level", async () => {
      const { requests } = open({}, { "POST /api/categories": { status: 201, body: COMBUSTIVEL } });
      await choose("Dentro de um grupo");
      await userEvent.click(await within(await parentList()).findByRole("radio", { name: "Aluguel" }));

      const sheet = await sheetNamed("Nova Categoria");
      expect(within(sheet).getByText("Usa a cor de Aluguel")).toBeInTheDocument();
      await userEvent.type(within(sheet).getByLabelText("Nome do agrupador"), "Gás{Enter}");

      expect(await posted(requests)).toEqual({ name: "Gás", kind: "daily", icon: "home", parent_id: ALUGUEL.id });
    });
  });

  it("retries when the list fails to load, the form waiting for it, and tags the header Configuração", async () => {
    open({}, { "GET /api/categories": { status: 500, body: problem(500, "Falhou.") } });
    const sheet = await screen.findByRole("dialog", { name: "Nova Categoria" });
    expect(within(sheet).getByText("Configuração")).toBeInTheDocument();

    const retry = await within(sheet).findByRole("button", { name: "Tentar de novo" });
    expect(within(sheet).queryByLabelText("Nome do agrupador")).not.toBeInTheDocument();
    stubApi({ "GET /api/categories": { status: 200, body: LIST } });
    await userEvent.click(retry);

    expect(await within(sheet).findByLabelText("Nome do agrupador")).toBeInTheDocument();
  });

  it("deletes from the sheet", async () => {
    const { onArchive, onOpenChange } = open({ category: COMIDA });

    await userEvent.click(within(await sheetNamed("Editar Categoria")).getByRole("button", { name: "Excluir" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onArchive).toHaveBeenCalledWith(COMIDA);
  });

  it("creates with the parent already chosen and offers no archive", async () => {
    const created = { ...RACAO, id: "c1000000-0000-4000-8000-000000000013", name: "Pet shop", color: "cat-3" };
    const { requests } = open({ parentId: PETS.id }, { "POST /api/categories": { status: 201, body: created } });

    const sheet = await sheetNamed("Nova Categoria");
    expect(within(sheet).queryByRole("radiogroup", { name: "Escolher grupo" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("radio", { name: "Dentro de um grupo" })).not.toBeInTheDocument();
    expect(sheet.querySelector("select")).toBeNull();
    expect(within(sheet).getByRole("radio", { name: "Ícone paw-print" })).toBeChecked();
    expect(within(sheet).getByText("Usa a cor de Pets")).toBeInTheDocument();
    expect(within(sheet).queryByRole("radio", { name: /^Cor / })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
    await userEvent.type(within(sheet).getByLabelText("Nome do agrupador"), "Pet shop{Enter}");

    await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
    expect(await requests.find((request) => request.method === "POST")?.json()).toEqual({
      name: "Pet shop",
      kind: "daily",
      icon: "paw-print",
      parent_id: PETS.id,
    });
    expect(await screen.findByText("Categoria criada")).toBeInTheDocument();
  });

  it("starts a new one on the first free color, offering only free ones, with no parent field", async () => {
    const { requests } = open({}, { "POST /api/categories": { status: 201, body: PETS } });
    await choose("Grupo novo");

    const sheet = await sheetNamed("Nova Categoria");
    await waitFor(() => expect(within(sheet).getByRole("radio", { name: "Cor Azul" })).toBeChecked());
    expect(within(sheet).getAllByRole("radio", { name: /^Cor / })).toHaveLength(21);
    expect(within(sheet).queryByRole("radio", { name: "Cor Âmbar" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("radio", { name: "Cor Laranja" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("radio", { name: "Cor Roxo" })).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("radio", { name: "Cor Rosa" }));
    expect(within(sheet).getByRole("radio", { name: "Cor Rosa" })).toBeChecked();
    expect(sheet.querySelector("select")).toBeNull();
    expect(within(sheet).queryByText(/^Em /)).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Trocar" })).not.toBeInTheDocument();
    await userEvent.type(within(sheet).getByLabelText("Nome do agrupador"), "Feira{Enter}");

    expect(await posted(requests)).toEqual({ name: "Feira", kind: "daily", icon: "circle-dashed", color: "cat-9" });
  });

  it("with all 24 colors taken creates no new top-level category", async () => {
    const full = Array.from({ length: 24 }, (_, index) => ({
      ...MERCADO,
      id: `c2000000-0000-4000-8000-0000000000${String(index).padStart(2, "0")}`,
      name: `Gasto ${index + 1}`,
      color: `cat-${index + 1}`,
    }));
    const { requests } = open({}, { "GET /api/categories": { status: 200, body: full } });
    await choose("Grupo novo");

    const sheet = await sheetNamed("Nova Categoria");
    expect(await within(sheet).findByText(ALL_TAKEN)).toBeInTheDocument();
    expect(within(sheet).queryByRole("radio", { name: /^Cor / })).not.toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Criar Categoria" })).toBeDisabled();
    await userEvent.type(within(sheet).getByLabelText("Nome do agrupador"), "Feira{Enter}");
    expect(requests.some((request) => request.method === "POST")).toBe(false);

    await choose("Dentro de um grupo");
    expect(await parents()).toContain("Gasto 1");
    expect(within(sheet).queryByText(ALL_TAKEN)).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("group", { name: "Cor de Destaque" })).not.toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Criar Categoria" })).toBeEnabled();
  });

  it("goes straight to the cofrinho form when Economia arrives after the sheet opened", async () => {
    stubApi({ "GET /api/categories": { status: 200, body: WITH_COFRINHOS } });
    const { rerender, client } = renderWithQuery(<CategorySheet kind="bill" open onOpenChange={vi.fn()} />);
    await sheetNamed("Nova Categoria");

    rerender(
      <QueryClientProvider client={client}>
        <CategorySheet kind="bill" open onOpenChange={vi.fn()} parentId={ECONOMIA.id} />
      </QueryClientProvider>,
    );

    expect(await sheetNamed("Novo cofrinho")).toBeInTheDocument();
  });

  it("says when the color is taken or the palette is full", async () => {
    open(
      { category: MERCADO },
      { [`PATCH /api/categories/${MERCADO.id}`]: { status: 422, body: rule("color-taken") } },
    );
    const sheet = await sheetNamed("Editar Categoria");
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar Categoria" }));
    expect(await within(sheet).findByText("Essa cor já é de outra categoria")).toBeInTheDocument();

    stubApi({
      "GET /api/categories": { status: 200, body: LIST },
      [`PATCH /api/categories/${MERCADO.id}`]: { status: 422, body: rule("palette-full") },
    });
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar Categoria" }));
    expect(await within(sheet).findByText(ALL_TAKEN_EDITING)).toBeInTheDocument();
  });

  it("counts Resgate, listed only with include_system, among the colors taken", async () => {
    const resgate: Category = { ...RESGATE, color: "cat-1" };
    stubApi({
      "GET /api/categories": { status: 200, body: [EXTRA, SALARIO] },
      "GET /api/categories?include_system=true": { status: 200, body: [EXTRA, SALARIO, resgate] },
    });
    renderWithQuery(<CategorySheet kind="income" open onOpenChange={vi.fn()} />);

    const sheet = await sheetNamed("Nova Categoria");
    await waitFor(() => expect(within(sheet).getByRole("radio", { name: "Cor Laranja" })).toBeChecked());
    expect(within(sheet).queryByRole("radio", { name: "Cor Âmbar" })).not.toBeInTheDocument();
  });

  it("asks to keep a subcategory under its parent when every color is taken", async () => {
    const full = Array.from({ length: 24 }, (_, index) => ({
      ...MERCADO,
      id: `c2000000-0000-4000-8000-0000000000${String(index).padStart(2, "0")}`,
      name: `Gasto ${index + 1}`,
      color: `cat-${index + 1}`,
    }));
    const child: Category = {
      ...MERCADO,
      id: "c3000000-0000-4000-8000-000000000001",
      name: "Feira",
      parent_id: full[0].id,
    };
    open({ category: child }, { "GET /api/categories": { status: 200, body: [...full, child] } });

    const sheet = await sheetNamed("Editar Categoria");
    await userEvent.selectOptions(await within(sheet).findByLabelText("Grupo"), "");
    expect(within(sheet).getByText(ALL_TAKEN_EDITING)).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Salvar Categoria" })).toBeDisabled();
  });

  it("says when the new name is taken, or saving fails otherwise", async () => {
    open({ category: MERCADO }, { [`PATCH /api/categories/${MERCADO.id}`]: { status: 409, body: problem(409, "x") } });
    const sheet = await sheetNamed("Editar Categoria");
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar Categoria" }));
    expect(await within(sheet).findByText("Já existe uma categoria com esse nome")).toBeInTheDocument();

    stubApi({
      "GET /api/categories": { status: 200, body: LIST },
      [`PATCH /api/categories/${MERCADO.id}`]: { status: 422, body: problem(422, "nested-subcategory") },
    });
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar Categoria" }));
    expect(await within(sheet).findByText("Não foi possível salvar a categoria.")).toBeInTheDocument();
  });

  describe("choosing what to create", () => {
    it("opens on Grupo novo, with Dentro de um grupo a segment away", async () => {
      open({});

      const sheet = await sheetNamed("Nova Categoria");
      expect(within(sheet).getByRole("radio", { name: "Grupo novo" })).toBeChecked();
      expect(within(sheet).getByRole("radio", { name: "Dentro de um grupo" })).not.toBeChecked();
      expect(within(sheet).queryByRole("radiogroup", { name: "Escolher grupo" })).not.toBeInTheDocument();
      expect(within(sheet).queryByText("Quando acontece")).not.toBeInTheDocument();
    });

    it("creates a subcategory from the kind's top-levels, no select anywhere", async () => {
      const created = { ...RACAO, id: "c1000000-0000-4000-8000-000000000013", name: "Pet shop" };
      const { requests } = open({}, { "POST /api/categories": { status: 201, body: created } });
      await choose("Dentro de um grupo");

      expect(await parents()).toEqual(["Aluguel", "Luz", "Comida fora", "Mercado", "Pets"]);
      const sheet = screen.getByRole("dialog", { name: "Nova Categoria" });
      await userEvent.click(within(sheet).getByRole("radio", { name: "Pets" }));
      expect(within(sheet).getByText("Usa a cor de Pets")).toBeInTheDocument();
      expect(within(sheet).queryByRole("radio", { name: /^Cor / })).not.toBeInTheDocument();
      expect(sheet.querySelector("select")).toBeNull();
      await userEvent.type(within(sheet).getByLabelText("Nome do agrupador"), "Pet shop{Enter}");

      expect(await posted(requests)).toEqual({
        name: "Pet shop",
        kind: "daily",
        icon: "paw-print",
        parent_id: PETS.id,
      });
    });

    it("switches the parent, keeping the name typed", async () => {
      const { requests } = open({}, { "POST /api/categories": { status: 201, body: MERCADO } });
      await choose("Dentro de um grupo");
      const group = await parentList();
      await userEvent.click(await within(group).findByRole("radio", { name: "Pets" }));
      const sheet = screen.getByRole("dialog", { name: "Nova Categoria" });
      await userEvent.type(within(sheet).getByLabelText("Nome do agrupador"), "Feira");

      await userEvent.click(within(group).getByRole("radio", { name: "Mercado" }));
      expect(within(sheet).getByLabelText("Nome do agrupador")).toHaveValue("Feira");
      await userEvent.click(within(sheet).getByRole("button", { name: "Criar Categoria" }));
      expect(await posted(requests)).toMatchObject({ name: "Feira", parent_id: MERCADO.id });
    });

    it("asks for the parent before creating a subcategory", async () => {
      const { requests } = open({});
      await choose("Dentro de um grupo");

      const sheet = screen.getByRole("dialog", { name: "Nova Categoria" });
      await userEvent.type(within(sheet).getByLabelText("Nome do agrupador"), "Feira{Enter}");
      expect(await within(sheet).findByText("Escolha o grupo.")).toBeInTheDocument();
      expect(requests.some((request) => request.method === "POST")).toBe(false);
    });

    it("leads Economia to the cofrinho form, titled and toasted as a cofrinho", async () => {
      const casa = { ...VIAGEM, id: "c1000000-0000-4000-8000-000000000099", name: "Casa" };
      open(
        { kind: "bill" },
        {
          "GET /api/categories": { status: 200, body: WITH_COFRINHOS },
          "POST /api/categories": { status: 201, body: casa },
        },
      );
      await choose("Dentro de um grupo");

      expect(await parents()).toEqual(["Aluguel", "Economia", "Luz", "Comida fora", "Mercado"]);
      expect(screen.queryByRole("searchbox", { name: "Buscar categoria" })).not.toBeInTheDocument();
      await userEvent.click(within(await parentList()).getByRole("radio", { name: "Economia" }));
      const sheet = await sheetNamed("Novo cofrinho");
      expect(within(sheet).getByLabelText("Meta")).toBeInTheDocument();
      await userEvent.type(within(sheet).getByLabelText("Nome do agrupador"), "Casa{Enter}");

      expect(await screen.findByText("Cofrinho criado")).toBeInTheDocument();
    });

    it("filters the parents ignoring case and accents once there are more than 8", async () => {
      const extra = ["Saúde", "Lazer", "Pets 2", "Casa"].map((name, index) => ({
        ...MERCADO,
        id: `c3000000-0000-4000-8000-00000000000${index}`,
        name,
        color: `cat-${index + 10}`,
      }));
      open({}, { "GET /api/categories": { status: 200, body: [...LIST, ...extra] } });
      await choose("Dentro de um grupo");

      expect(await parents()).toHaveLength(9);
      await userEvent.type(screen.getByRole("searchbox", { name: "Buscar categoria" }), "SAUDE");
      expect(await parents()).toEqual(["Saúde"]);
    });

    it("drops Economia when Quando acontece moves to Diário", async () => {
      const { requests } = open(
        { kind: "bill", onKindChange: vi.fn() },
        { "GET /api/categories": { status: 200, body: WITH_COFRINHOS } },
      );
      await choose("Dentro de um grupo");
      await userEvent.click(within(await parentList()).getByRole("radio", { name: "Economia" }));

      await userEvent.click(screen.getByRole("radio", { name: "Diário" }));
      expect(await parents()).toEqual(["Aluguel", "Luz", "Comida fora", "Mercado"]);
      expect(within(await parentList()).queryByRole("radio", { checked: true })).not.toBeInTheDocument();
      await userEvent.type(screen.getByLabelText("Nome do agrupador"), "Bônus{Enter}");

      expect(await screen.findByText("Escolha o grupo.")).toBeInTheDocument();
      expect(requests.some((request) => request.method === "POST")).toBe(false);
    });

    it("lists the current color first, its name beside the title", async () => {
      open({ category: ALUGUEL });
      const sheet = await sheetNamed("Editar Categoria");

      const colors = await within(sheet).findByRole("group", { name: "Cor de Destaque" });
      expect(within(colors).getAllByRole("radio")[0]).toHaveAccessibleName("Cor Índigo");
      expect(within(colors).getByText("Índigo")).toBeInTheDocument();
    });

    it("says when the kind has no parent to link", async () => {
      open({ kind: "income" }, { "GET /api/categories": { status: 200, body: [] } });
      await choose("Dentro de um grupo");

      expect(await within(await parentList()).findByText("Nenhum grupo deste tipo.")).toBeInTheDocument();
    });
  });

  describe("from a group's + in Lançar (SOL-140)", () => {
    const ALIMENTACAO: Category = {
      ...PETS,
      id: "c1000000-0000-4000-8000-000000000040",
      name: "Alimentação",
      color: "cat-13",
    };
    const PADARIA: Category = {
      ...ALIMENTACAO,
      id: "c1000000-0000-4000-8000-000000000041",
      name: "Padaria",
      parent_id: ALIMENTACAO.id,
    };
    const FAMILIA: Category = { ...PETS, id: "c1000000-0000-4000-8000-000000000042", name: "Família", color: "cat-14" };
    const ESCOLA: Category = {
      ...FAMILIA,
      id: "c1000000-0000-4000-8000-000000000043",
      name: "Escola",
      parent_id: FAMILIA.id,
    };
    const PLANO: Category = {
      ...FAMILIA,
      id: "c1000000-0000-4000-8000-000000000044",
      name: "Plano de saúde",
      kind: "bill",
      parent_id: FAMILIA.id,
    };
    const CASA: Category = { ...ALUGUEL, id: "c1000000-0000-4000-8000-000000000045", name: "Casa", color: "cat-15" };
    const LUZ: Category = { ...ALUGUEL, id: "c1000000-0000-4000-8000-000000000046", name: "Luz", parent_id: CASA.id };
    const GROUPS = [ALIMENTACAO, PADARIA, FAMILIA, ESCOLA, PLANO, CASA, LUZ, MERCADO];
    const groups = { "GET /api/categories": { status: 200, body: GROUPS } };
    const OLD_WORDS = /Tipo de Fluxo|Categoria Pai|Vincular à/i;

    it("locks a single-kind group: no segmented, no group picker, no colors, no Quando acontece", async () => {
      const { requests } = open(
        { parentId: ALIMENTACAO.id, onKindChange: vi.fn() },
        { ...groups, "POST /api/categories": { status: 201, body: PADARIA } },
      );

      const sheet = await sheetNamed("Nova Categoria");
      expect(
        within(sheet).queryByRole("radiogroup", { name: "Grupo novo ou dentro de um grupo" }),
      ).not.toBeInTheDocument();
      expect(within(sheet).queryByRole("radio", { name: "Grupo novo" })).not.toBeInTheDocument();
      expect(within(sheet).queryByText("Escolher grupo")).not.toBeInTheDocument();
      expect(within(sheet).queryByRole("radio", { name: /^Cor / })).not.toBeInTheDocument();
      expect(within(sheet).queryByText("Quando acontece")).not.toBeInTheDocument();
      expect(within(sheet).getByText("Usa a cor de Alimentação")).toBeInTheDocument();
      await userEvent.type(within(sheet).getByLabelText("Nome do agrupador"), "Padaria{Enter}");

      expect(await posted(requests)).toEqual({
        name: "Padaria",
        kind: "daily",
        icon: "paw-print",
        parent_id: ALIMENTACAO.id,
      });
    });

    it("offers Quando acontece on a mixed group, set to Lançar's kind", async () => {
      open({ parentId: FAMILIA.id, kind: "bill", onKindChange: vi.fn() }, groups);

      const sheet = await sheetNamed("Nova Categoria");
      expect(within(sheet).getByText("Quando acontece")).toBeInTheDocument();
      expect(within(sheet).getByRole("radio", { name: "Fixa" })).toHaveAttribute("data-state", "on");
      expect(within(sheet).getByRole("radio", { name: "Diário" })).toHaveAttribute("data-state", "off");
      expect(within(sheet).queryByRole("radio", { name: "Entrada" })).not.toBeInTheDocument();
      expect(within(sheet).queryByRole("radio", { name: "Grupo novo" })).not.toBeInTheDocument();
    });

    it("opens a new group on Grupo novo, Quando acontece without Entrada; none on Entrada", async () => {
      open({ onKindChange: vi.fn() }, groups);

      let sheet = await sheetNamed("Nova Categoria");
      expect(within(sheet).getByRole("radiogroup", { name: "Grupo novo ou dentro de um grupo" })).toBeInTheDocument();
      expect(within(sheet).getByRole("radio", { name: "Grupo novo" })).toBeChecked();
      expect(within(sheet).getByRole("radio", { name: "Dentro de um grupo" })).not.toBeChecked();
      expect(within(sheet).getByText("Quando acontece")).toBeInTheDocument();
      expect(within(sheet).getByRole("radio", { name: "Diário" })).toHaveAttribute("data-state", "on");
      expect(within(sheet).getByRole("radio", { name: "Fixa" })).toBeInTheDocument();
      expect(within(sheet).queryByRole("radio", { name: "Entrada" })).not.toBeInTheDocument();
      expect(sheet.textContent).not.toMatch(OLD_WORDS);

      cleanup();
      open({ kind: "income", onKindChange: vi.fn() }, groups);
      sheet = await sheetNamed("Nova Categoria");
      expect(within(sheet).queryByText("Quando acontece")).not.toBeInTheDocument();
    });

    it("points to a same-name category of the other outflow kind and uses it", async () => {
      const onUseExisting = vi.fn();
      const { requests } = open({ onUseExisting }, groups);

      const sheet = await sheetNamed("Nova Categoria");
      await userEvent.type(within(sheet).getByLabelText("Nome do agrupador"), "luz");
      expect(within(sheet).getByText('"Luz" já existe em Casa, para outro tipo de gasto.')).toBeInTheDocument();
      await userEvent.click(within(sheet).getByRole("button", { name: "Usar esta categoria" }));
      expect(onUseExisting).toHaveBeenCalledWith(LUZ);
      expect(requests.some((request) => request.method === "POST")).toBe(false);

      await userEvent.clear(within(sheet).getByLabelText("Nome do agrupador"));
      await userEvent.type(within(sheet).getByLabelText("Nome do agrupador"), "Casa");
      expect(within(sheet).getByText('"Casa" já existe, para outro tipo de gasto.')).toBeInTheDocument();
    });

    it("says nothing about the other kind without onUseExisting", async () => {
      open({}, groups);

      const sheet = await sheetNamed("Nova Categoria");
      await userEvent.type(within(sheet).getByLabelText("Nome do agrupador"), "Luz");
      expect(within(sheet).queryByText(/já existe/)).not.toBeInTheDocument();
      expect(within(sheet).queryByRole("button", { name: "Usar esta categoria" })).not.toBeInTheDocument();
    });

    it("puts a same-kind 409 under the name, marks it invalid and keeps the focus there", async () => {
      open({}, { ...groups, "POST /api/categories": { status: 409, body: problem(409, "x") } });

      const sheet = await sheetNamed("Nova Categoria");
      const name = within(sheet).getByLabelText("Nome do agrupador");
      await userEvent.type(name, "Mercado");
      await userEvent.click(within(sheet).getByRole("button", { name: "Criar Categoria" }));

      const field = name.closest("[data-slot=field]") as HTMLElement;
      expect(await within(field).findByText("Já existe uma categoria com esse nome")).toBeInTheDocument();
      expect(name).toHaveAttribute("aria-invalid", "true");
      await waitFor(() => expect(name).toHaveFocus());
      expect(within(sheet).getAllByText("Já existe uma categoria com esse nome")).toHaveLength(1);
    });

    it("never shows the old words, editing included", async () => {
      open({ category: ESCOLA, onKindChange: vi.fn() }, groups);

      const sheet = await sheetNamed("Editar Categoria");
      await waitFor(() => expect(within(sheet).getByText("Quando acontece")).toBeInTheDocument());
      expect(within(sheet).getByLabelText("Grupo")).toHaveValue(FAMILIA.id);
      expect(sheet.textContent).not.toMatch(OLD_WORDS);
      expect(within(sheet).queryByLabelText(OLD_WORDS)).not.toBeInTheDocument();
    });
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

      const sheet = await sheetNamed("Novo cofrinho");
      await waitFor(() => expect(within(sheet).getByLabelText("Meta")).toBeInTheDocument());
      expect(within(sheet).queryByLabelText("Grupo")).not.toBeInTheDocument();
      expect(within(sheet).queryByRole("radio", { name: "Dentro de um grupo" })).not.toBeInTheDocument();
      for (const name of ["Reserva de emergência", "Viagem", "Carro", "Casa", "Estudos"])
        expect(within(sheet).getByRole("button", { name })).toBeInTheDocument();
      expect(within(sheet).getByText("Usa a cor de Economia")).toBeInTheDocument();
      expect(within(sheet).queryByRole("radio", { name: /^Cor / })).not.toBeInTheDocument();
      await userEvent.click(within(sheet).getByRole("button", { name: "Viagem" }));
      expect(within(sheet).getByLabelText("Nome do agrupador")).toHaveValue("Viagem");
      expect(within(sheet).getByRole("radio", { name: "Ícone plane" })).toBeChecked();
      await userEvent.type(within(sheet).getByLabelText("Meta"), "500000");
      await pickDate("Prazo", "2027-06-30", sheet);
      await userEvent.click(within(sheet).getByRole("button", { name: "Criar" }));

      await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
      expect(await requests.find((request) => request.method === "POST")?.json()).toEqual({
        name: "Viagem",
        kind: "bill",
        icon: "plane",
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

      const sheet = await sheetNamed("Novo cofrinho");
      await userEvent.type(within(sheet).getByLabelText("Nome do agrupador"), "Carro novo{Enter}");

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

      const sheet = await sheetNamed("Editar cofrinho");
      await waitFor(() => expect(within(sheet).getByLabelText("Meta")).toHaveValue("10.000,00"));
      expect(within(sheet).getByRole("button", { name: "Prazo, 30/06/2027" })).toBeInTheDocument();
      expect(within(sheet).queryByRole("button", { name: "Viagem" })).not.toBeInTheDocument();
      await userEvent.click(within(sheet).getByRole("button", { name: "Remover prazo" }));
      expect(within(sheet).getByRole("button", { name: "Prazo" })).toHaveTextContent("Escolher data");
      expect(within(sheet).queryByRole("button", { name: "Remover prazo" })).not.toBeInTheDocument();
      await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));

      expect(await patched(requests)).toEqual({
        name: "Reserva",
        icon: "shield",
        parent_id: ECONOMIA.id,
        target: "10000.00",
        deadline: null,
      });
      expect(await screen.findByText("Cofrinho salvo")).toBeInTheDocument();
    });

    it("describes a new one in one line, counting characters up to 140", async () => {
      const { requests } = open(
        { kind: "bill", parentId: ECONOMIA.id },
        cofrinhos({ "POST /api/categories": { status: 201, body: VIAGEM } }),
      );

      const sheet = await sheetNamed("Novo cofrinho");
      const note = await within(sheet).findByLabelText("Descrição (opcional)");
      expect(note).toHaveAttribute("placeholder", "Ex.: Início planejado após consolidar a Reserva de Emergência.");
      expect(within(sheet).getByText("0/140")).toBeInTheDocument();
      await userEvent.type(within(sheet).getByLabelText("Nome do agrupador"), "Casa");
      await userEvent.click(note);
      await userEvent.paste("a".repeat(141));
      expect(within(sheet).getByText("141/140")).toHaveClass("text-destructive");
      await userEvent.click(within(sheet).getByRole("button", { name: "Criar" }));
      expect(within(sheet).getByText("Use até 140 caracteres.")).toBeInTheDocument();
      expect(requests.some((request) => request.method === "POST")).toBe(false);

      await userEvent.clear(note);
      await userEvent.paste("Início planejado 🏠");
      expect(within(sheet).getByText("18/140")).toBeInTheDocument();
      await userEvent.click(within(sheet).getByRole("button", { name: "Criar" }));

      await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
      expect(await requests.find((request) => request.method === "POST")?.json()).toMatchObject({
        note: "Início planejado 🏠",
      });
    });

    it("edits the stored note and clears it with null", async () => {
      const { requests } = open(
        { kind: "bill", category: RESERVA, note: "Para imprevistos" },
        cofrinhos({ [`PATCH /api/categories/${RESERVA.id}`]: { status: 200, body: RESERVA } }),
      );

      const sheet = await sheetNamed("Editar cofrinho");
      const note = await within(sheet).findByLabelText("Descrição (opcional)");
      expect(note).toHaveValue("Para imprevistos");
      await userEvent.clear(note);
      await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));

      expect(await patched(requests)).toMatchObject({ note: null });
    });

    it("keeps Economia itself at the top and never archives it", async () => {
      open({ kind: "bill", category: ECONOMIA }, cofrinhos());

      const sheet = await sheetNamed("Editar Categoria");
      await waitFor(() => expect(within(sheet).getByLabelText("Nome do agrupador")).toHaveValue("Economia"));
      expect(within(sheet).queryByLabelText("Grupo")).not.toBeInTheDocument();
      expect(within(sheet).queryByLabelText("Meta")).not.toBeInTheDocument();
      expect(within(sheet).queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
    });
  });

  describe("changing the kind (SOL-101)", () => {
    const PORTO: Category = { ...MERCADO, id: "c1000000-0000-4000-8000-000000000030", name: "Porto", color: "cat-9" };
    const KINDS_LIST = [...LIST, ECONOMIA, RESERVA, PORTO];

    const edit = (category: Category, replies: Record<string, Reply> = {}) =>
      open({ category }, { "GET /api/categories": { status: 200, body: KINDS_LIST }, ...replies });

    const editSheet = () => sheetNamed(/^Editar /);

    it("shows Tipo for a Diário subcategory and a Fixa top-level, never for Economia, a cofrinho or income", async () => {
      edit(RACAO);
      let sheet = await editSheet();
      expect(await within(sheet).findByRole("radio", { name: "Diário" })).toHaveAttribute("data-state", "on");
      expect(within(sheet).getByRole("radio", { name: "Fixa" })).toHaveAttribute("data-state", "off");

      for (const category of [ECONOMIA, RESERVA, SALARIO]) {
        cleanup();
        edit(category);
        sheet = await editSheet();
        if (category === RESERVA) await within(sheet).findByLabelText("Meta");
        expect(within(sheet).queryByRole("radio", { name: "Fixa" })).not.toBeInTheDocument();
      }

      cleanup();
      edit(ALUGUEL);
      sheet = await editSheet();
      expect(within(sheet).getByRole("radio", { name: "Fixa" })).toHaveAttribute("data-state", "on");
    });

    it("asks before changing, and Cancelar sends nothing", async () => {
      const { requests } = edit(PORTO);
      const sheet = await editSheet();
      await userEvent.click(within(sheet).getByRole("radio", { name: "Fixa" }));

      const confirm = await screen.findByRole("alertdialog", { name: "Mudar para Saída?" });
      expect(
        within(confirm).getByText("Todos os lançamentos de Porto passam a ser Saída. O saldo não muda."),
      ).toBeInTheDocument();
      await userEvent.click(within(confirm).getByRole("button", { name: "Cancelar" }));

      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      await userEvent.click(within(sheet).getByRole("radio", { name: "Diário" }));
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(within(sheet).getByRole("radio", { name: "Diário" })).toHaveAttribute("data-state", "on");
      expect(requests.some((request) => request.method === "PATCH")).toBe(false);
    });

    it("changes the kind alone, refreshes the months, entries and reports, and switches the list", async () => {
      const onKindChange = vi.fn();
      const requests = stubApi({
        "GET /api/categories": { status: 200, body: KINDS_LIST },
        [`PATCH /api/categories/${PORTO.id}`]: { status: 200, body: { ...PORTO, kind: "bill" } },
      });
      const { client } = renderWithQuery(
        <CategorySheet kind="daily" open onOpenChange={vi.fn()} category={PORTO} onKindChange={onKindChange} />,
      );
      const invalidate = vi.spyOn(client, "invalidateQueries");
      const sheet = await editSheet();
      await userEvent.clear(within(sheet).getByLabelText("Nome do agrupador"));
      await userEvent.type(within(sheet).getByLabelText("Nome do agrupador"), "Porto Seguro");
      await userEvent.click(within(sheet).getByRole("radio", { name: "Fixa" }));
      const confirm = await screen.findByRole("alertdialog", { name: "Mudar para Saída?" });
      await userEvent.click(within(confirm).getByRole("button", { name: "Mudar tipo" }));

      expect(await patched(requests)).toEqual({ kind: "bill" });
      await waitFor(() => expect(onKindChange).toHaveBeenCalledWith("bill"));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(within(sheet).getByRole("radio", { name: "Fixa" })).toHaveAttribute("data-state", "on");
      expect(within(sheet).getByLabelText("Nome do agrupador")).toHaveValue("Porto Seguro");
      for (const key of ["categories", "month", "transactions", "report"])
        expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
    });

    it.each([
      [409, "duplicate-name", "Já existe uma categoria com esse nome no outro tipo."],
      [422, "kind-locked", "O tipo dessa categoria não pode mudar."],
      [422, "category-has-bills", "Uma conta fixa usa essa categoria. Arquive a conta antes de mudar para Diário."],
      [422, "palette-full", "Todas as 24 cores estão em uso no outro tipo. Arquive uma categoria e tente de novo."],
      [404, "not-found", "Essa categoria não existe mais."],
      [500, "boom", "Não foi possível mudar o tipo."],
    ])("words a %i %s in pt-BR, never the server's detail", async (status, slug, message) => {
      const onKindChange = vi.fn();
      stubApi({
        "GET /api/categories": { status: 200, body: KINDS_LIST },
        [`PATCH /api/categories/${PORTO.id}`]: { status, body: { ...rule(slug), status, detail: "Server words." } },
      });
      renderWithQuery(
        <CategorySheet kind="daily" open onOpenChange={vi.fn()} category={PORTO} onKindChange={onKindChange} />,
      );
      const sheet = await editSheet();
      await userEvent.click(within(sheet).getByRole("radio", { name: "Fixa" }));
      const confirm = await screen.findByRole("alertdialog", { name: "Mudar para Saída?" });
      await userEvent.click(within(confirm).getByRole("button", { name: "Mudar tipo" }));

      expect(await within(confirm).findByRole("alert")).toHaveTextContent(message);
      expect(screen.queryByText("Server words.")).not.toBeInTheDocument();
      expect(onKindChange).not.toHaveBeenCalled();
      expect(within(sheet).getByRole("radio", { name: "Diário", hidden: true })).toHaveAttribute("data-state", "on");
    });
  });
});
