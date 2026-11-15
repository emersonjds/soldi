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
const ALL_TAKEN = "Todas as 24 cores estão em uso. Crie como subcategoria ou exclua uma categoria.";
const ALL_TAKEN_EDITING = "Todas as 24 cores estão em uso. Mantenha como subcategoria ou exclua uma categoria.";

const open = (
  props: {
    category?: Category;
    parentId?: string;
    kind?: Category["kind"];
    onKindChange?: (kind: Category["kind"]) => void;
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
  within(within(sheet).getByLabelText("Dentro de"))
    .getAllByRole("option")
    .map((option) => option.textContent);

const choose = async (option: "Grupo" | "Subcategoria") => {
  const sheet = await sheetNamed("Nova categoria");
  await userEvent.click(within(sheet).getByRole("radio", { name: option }));
};

/** The sheet once its form arrived with the category list. */
const sheetNamed = async (name: string | RegExp) => {
  const sheet = await screen.findByRole("dialog", { name });
  await within(sheet).findByLabelText("Nome");
  return sheet;
};

const parentList = () => screen.findByRole("radiogroup", { name: "Dentro de" });

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

/** Opens the icon and color pickers under `Ícone e cor`. */
const restyle = (sheet: HTMLElement) => userEvent.click(within(sheet).getByRole("button", { name: "Trocar" }));

describe("CategorySheet", () => {
  beforeEach(() => {
    window.innerWidth = 375;
  });

  it("opens Nova categoria on a 48 px, 16 px Nome with focus, in plain words and a sticky Criar", async () => {
    open({});

    const sheet = await sheetNamed("Nova categoria");
    const name = within(sheet).getByLabelText("Nome");
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveClass("h-12", "text-base");
    expect(name).toHaveAttribute("maxlength", "40");
    expect(name).toHaveAttribute("placeholder", "Ex.: Educação");
    expect(within(sheet).getByRole("radiogroup", { name: "Grupo ou subcategoria" })).toBeInTheDocument();
    expect(screen.getByText("Nome, tipo, ícone e cor.")).toHaveClass("sr-only");
    expect(sheet).not.toHaveTextContent(
      /Categoria Pai|agrupador|Tipo de Fluxo|Cor de Destaque|Ícone Representativo|Configuração|Prévia/,
    );
    const footer = within(sheet).getByRole("button", { name: "Criar" }).parentElement;
    expect(footer).toHaveAttribute("data-slot", "responsive-sheet-footer");
    expect(footer).toHaveClass("sticky", "bottom-0");
    expect(within(sheet).queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
  });

  it("shows the icon and color behind Trocar, with a Cor heading", async () => {
    open({});

    const sheet = await sheetNamed("Nova categoria");
    expect(within(sheet).getByText("Ícone e cor")).toBeInTheDocument();
    const trocar = within(sheet).getByRole("button", { name: "Trocar" });
    expect(trocar).toHaveClass("min-h-11");
    expect(trocar).toHaveAttribute("aria-expanded", "false");
    expect(within(sheet).queryByRole("radio", { name: /^Ícone / })).not.toBeInTheDocument();
    await restyle(sheet);

    expect(trocar).toHaveAttribute("aria-expanded", "true");
    expect(within(sheet).getByRole("radio", { name: "Ícone circle-dashed" })).toBeChecked();
    expect(within(sheet).getByRole("group", { name: "Cor" })).toBeInTheDocument();
  });

  it("says what is missing under the field and moves the focus there", async () => {
    const { requests } = open({});

    const sheet = await sheetNamed("Nova categoria");
    await userEvent.click(within(sheet).getByRole("button", { name: "Criar" }));
    expect(within(sheet).getByRole("alert")).toHaveTextContent("Informe o nome.");
    expect(within(sheet).getByLabelText("Nome")).toHaveFocus();

    await userEvent.click(within(sheet).getByRole("radio", { name: "Subcategoria" }));
    expect(within(sheet).getByLabelText("Nome")).toHaveAttribute("placeholder", "Ex.: Farmácia");
    await userEvent.type(within(sheet).getByLabelText("Nome"), "Feira");
    await userEvent.click(within(sheet).getByRole("button", { name: "Criar" }));
    expect(await within(sheet).findByText("Escolha o grupo.")).toHaveAttribute("role", "alert");
    expect(within(await parentList()).getAllByRole("radio")[0]).toHaveFocus();
    expect(requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("says the name is taken in its Tipo under Nome, focuses it and keeps the sheet open", async () => {
    const { onOpenChange } = open({}, { "POST /api/categories": { status: 409, body: problem(409, "x") } });

    const sheet = await sheetNamed("Nova categoria");
    await userEvent.type(within(sheet).getByLabelText("Nome"), "Mercado{Enter}");

    const alert = await within(sheet).findByText('Já existe "Mercado" em Diário.');
    expect(alert).toHaveAttribute("role", "alert");
    await waitFor(() => expect(within(sheet).getByLabelText("Nome")).toHaveFocus());
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("keeps the values and says to try again when creating fails", async () => {
    open({}, { "POST /api/categories": { status: 500, body: problem(500, "x") } });

    const sheet = await sheetNamed("Nova categoria");
    await userEvent.type(within(sheet).getByLabelText("Nome"), "Feira{Enter}");

    expect(await within(sheet).findByText("Não foi possível criar a categoria. Tente de novo.")).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Nome")).toHaveValue("Feira");
  });

  it("reads Criando… and disables Criar while saving", async () => {
    stubApi({ "GET /api/categories": { status: 200, body: LIST } });
    const answer = globalThis.fetch;
    vi.stubGlobal("fetch", (request: Request) =>
      request.method === "POST" ? new Promise(() => undefined) : answer(request),
    );
    renderWithQuery(<CategorySheet kind="daily" open onOpenChange={vi.fn()} />);

    const sheet = await sheetNamed("Nova categoria");
    await userEvent.type(within(sheet).getByLabelText("Nome"), "Feira{Enter}");

    expect(await within(sheet).findByRole("button", { name: "Criando…" })).toBeDisabled();
  });

  it("titles a + from a group Nova subcategoria, its group read-only and Tipo only on its side", async () => {
    const { requests } = open(
      { parentId: PETS.id, onKindChange: vi.fn() },
      { "POST /api/categories": { status: 201, body: RACAO } },
    );

    const sheet = await sheetNamed("Nova subcategoria");
    expect(within(sheet).getByText("Dentro de Pets")).toBeInTheDocument();
    expect(within(sheet).queryByRole("radiogroup", { name: "Grupo ou subcategoria" })).not.toBeInTheDocument();
    expect(within(sheet).getByLabelText("Nome")).toHaveAttribute("placeholder", "Ex.: Farmácia");
    const kinds = within(sheet).getByRole("radiogroup", { name: "Tipo" });
    expect(
      within(kinds)
        .getAllByRole("radio")
        .map((radio) => radio.textContent),
    ).toEqual(["Diário", "Conta"]);
    expect(within(sheet).getByText("Ícone")).toBeInTheDocument();
    expect(within(sheet).getByText("Usa a cor de Pets")).toBeInTheDocument();
    await userEvent.click(within(kinds).getByRole("radio", { name: "Conta" }));
    await userEvent.type(within(sheet).getByLabelText("Nome"), "Plano{Enter}");

    expect(await posted(requests)).toMatchObject({ kind: "bill", parent_id: PETS.id });
  });

  it("hides Tipo for a + under an income group", async () => {
    open({ kind: "income", parentId: SALARIO.id, onKindChange: vi.fn() });

    const sheet = await sheetNamed("Nova subcategoria");
    expect(within(sheet).getByText("Dentro de Salário")).toBeInTheDocument();
    expect(within(sheet).queryByRole("radiogroup", { name: "Tipo" })).not.toBeInTheDocument();
  });

  it("edits a subcategory: its values filled in, the parent choices without itself or other children", async () => {
    const renamed = { ...RACAO, name: "Ração e areia", parent_id: null };
    const { requests, onSaved, onOpenChange } = open(
      { category: RACAO },
      { [`PATCH /api/categories/${RACAO.id}`]: { status: 200, body: renamed } },
    );

    const sheet = await sheetNamed("Editar categoria");
    expect(within(sheet).getByLabelText("Nome")).toHaveValue("Ração");
    await waitFor(() =>
      expect(options(sheet)).toEqual(["Nenhum (é um grupo)", "Aluguel", "Luz", "Comida fora", "Mercado", "Pets"]),
    );
    expect(within(sheet).getByText("Usa a cor de Pets")).toBeInTheDocument();
    expect(within(sheet).queryByRole("radio", { name: /^Cor / })).not.toBeInTheDocument();
    expect(within(sheet).getByLabelText("Dentro de")).toHaveValue(PETS.id);
    // A select nested in another renders empty in browsers.
    expect(within(sheet).getByLabelText("Dentro de").parentElement?.closest("select")).toBeNull();
    expect(within(sheet).queryByRole("button", { name: "Criar" })).not.toBeInTheDocument();

    await userEvent.clear(within(sheet).getByLabelText("Nome"));
    await userEvent.type(within(sheet).getByLabelText("Nome"), "Ração e areia");
    await userEvent.selectOptions(within(sheet).getByLabelText("Dentro de"), "");
    expect(within(sheet).queryByText("Usa a cor de Pets")).not.toBeInTheDocument();
    await restyle(sheet);
    expect(within(sheet).getByRole("radio", { name: "Cor Azul" })).toBeChecked();
    expect(within(sheet).queryByRole("radio", { name: "Cor Roxo" })).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));

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

    const sheet = await sheetNamed("Editar categoria");
    await waitFor(() => expect(within(sheet).getByLabelText("Nome")).toHaveValue("Pets"));
    expect(within(sheet).queryByLabelText("Dentro de")).not.toBeInTheDocument();
    await restyle(sheet);
    expect(within(sheet).getByRole("radio", { name: "Cor Roxo" })).toBeChecked();
    expect(within(sheet).getByRole("radio", { name: "Cor Roxo" })).toBeEnabled();
    expect(within(sheet).queryByRole("radio", { name: "Cor Âmbar" })).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));

    expect(await patched(requests)).toEqual({ name: "Pets", icon: "paw-print", color: "cat-5", parent_id: null });
  });

  it("offers every other top-level category to one without children", async () => {
    open({ category: MERCADO });

    const sheet = await sheetNamed("Editar categoria");
    await waitFor(() =>
      expect(options(sheet)).toEqual(["Nenhum (é um grupo)", "Aluguel", "Luz", "Comida fora", "Pets"]),
    );
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

      const sheet = await sheetNamed("Editar categoria");
      await restyle(sheet);
      await waitFor(() => expect(within(sheet).getByRole("radio", { name: "Cor Ciano" })).toBeChecked());
      expect(within(sheet).queryByRole("radio", { name: "Cor Âmbar" })).not.toBeInTheDocument();
      expect(within(sheet).queryByRole("radio", { name: "Cor Índigo" })).not.toBeInTheDocument();
      await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));

      expect(await patched(requests)).toEqual({ name: "Veículo", icon: "car", color: "cat-8", parent_id: null });
    });

    it("offers a Diário child every outflow top-level", async () => {
      open({ category: COMBUSTIVEL }, { "GET /api/categories": { status: 200, body: WITH_MIXED_GROUP } });
      const sheet = await sheetNamed("Editar categoria");
      await waitFor(() =>
        expect(options(sheet)).toEqual(["Nenhum (é um grupo)", "Aluguel", "Luz", "Comida fora", "Mercado", "Veículo"]),
      );
      expect(within(sheet).getByText("Usa a cor de Veículo")).toBeInTheDocument();
    });

    it("keeps Economia out of a Diário child's parents", async () => {
      open({ category: MERCADO }, { "GET /api/categories": { status: 200, body: WITH_COFRINHOS } });
      const sheet = await sheetNamed("Editar categoria");
      await waitFor(() => expect(options(sheet)).toEqual(["Nenhum (é um grupo)", "Aluguel", "Luz", "Comida fora"]));
    });

    it("creates a Diário subcategory under a Saída top-level", async () => {
      const { requests } = open({}, { "POST /api/categories": { status: 201, body: COMBUSTIVEL } });
      await choose("Subcategoria");
      await userEvent.click(await within(await parentList()).findByRole("radio", { name: "Aluguel" }));

      const sheet = await sheetNamed("Nova categoria");
      expect(within(sheet).getByText("Usa a cor de Aluguel")).toBeInTheDocument();
      await userEvent.type(within(sheet).getByLabelText("Nome"), "Gás{Enter}");

      expect(await posted(requests)).toEqual({ name: "Gás", kind: "daily", icon: "home", parent_id: ALUGUEL.id });
    });
  });

  it("retries when the list fails to load, the form waiting for it", async () => {
    open({}, { "GET /api/categories": { status: 500, body: problem(500, "Falhou.") } });
    const sheet = await screen.findByRole("dialog", { name: "Nova categoria" });

    const retry = await within(sheet).findByRole("button", { name: "Tentar de novo" });
    expect(within(sheet).queryByLabelText("Nome")).not.toBeInTheDocument();
    stubApi({ "GET /api/categories": { status: 200, body: LIST } });
    await userEvent.click(retry);

    expect(await within(sheet).findByLabelText("Nome")).toBeInTheDocument();
  });

  it("deletes from the sticky footer, under Salvar", async () => {
    const { onArchive, onOpenChange } = open({ category: COMIDA });

    const sheet = await sheetNamed("Editar categoria");
    const excluir = within(sheet).getByRole("button", { name: "Excluir" });
    expect(excluir.parentElement).toHaveAttribute("data-slot", "responsive-sheet-footer");
    expect(excluir.previousElementSibling).toHaveAccessibleName("Salvar");
    await userEvent.click(excluir);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onArchive).toHaveBeenCalledWith(COMIDA);
  });

  it("creates with the parent already chosen and offers no archive", async () => {
    const created = { ...RACAO, id: "c1000000-0000-4000-8000-000000000013", name: "Pet shop", color: "cat-3" };
    const { requests } = open({ parentId: PETS.id }, { "POST /api/categories": { status: 201, body: created } });

    const sheet = await sheetNamed("Nova subcategoria");
    expect(within(sheet).getByText("Dentro de Pets")).toBeInTheDocument();
    expect(within(sheet).queryByRole("radio", { name: "Subcategoria" })).not.toBeInTheDocument();
    expect(sheet.querySelector("select")).toBeNull();
    await restyle(sheet);
    expect(within(sheet).getByRole("radio", { name: "Ícone paw-print" })).toBeChecked();
    expect(within(sheet).getByText("Usa a cor de Pets")).toBeInTheDocument();
    expect(within(sheet).queryByRole("radio", { name: /^Cor / })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
    await userEvent.type(within(sheet).getByLabelText("Nome"), "Pet shop{Enter}");

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
    await choose("Grupo");

    const sheet = await sheetNamed("Nova categoria");
    await restyle(sheet);
    await waitFor(() => expect(within(sheet).getByRole("radio", { name: "Cor Azul" })).toBeChecked());
    expect(within(sheet).getAllByRole("radio", { name: /^Cor / })).toHaveLength(21);
    expect(within(sheet).queryByRole("radio", { name: "Cor Âmbar" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("radio", { name: "Cor Laranja" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("radio", { name: "Cor Roxo" })).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("radio", { name: "Cor Rosa" }));
    expect(within(sheet).getByRole("radio", { name: "Cor Rosa" })).toBeChecked();
    expect(sheet.querySelector("select")).toBeNull();
    await userEvent.type(within(sheet).getByLabelText("Nome"), "Feira{Enter}");

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
    await choose("Grupo");

    const sheet = await sheetNamed("Nova categoria");
    expect(await within(sheet).findByText(ALL_TAKEN)).toBeInTheDocument();
    expect(within(sheet).queryByRole("radio", { name: /^Cor / })).not.toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Criar" })).toBeDisabled();
    await userEvent.type(within(sheet).getByLabelText("Nome"), "Feira{Enter}");
    expect(requests.some((request) => request.method === "POST")).toBe(false);

    await choose("Subcategoria");
    expect(await parents()).toContain("Gasto 1");
    expect(within(sheet).queryByText(ALL_TAKEN)).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("group", { name: "Cor" })).not.toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Criar" })).toBeEnabled();
  });

  it("goes straight to the cofrinho form when Economia arrives after the sheet opened", async () => {
    stubApi({ "GET /api/categories": { status: 200, body: WITH_COFRINHOS } });
    const { rerender, client } = renderWithQuery(<CategorySheet kind="bill" open onOpenChange={vi.fn()} />);
    await sheetNamed("Nova categoria");

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
    const sheet = await sheetNamed("Editar categoria");
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));
    expect(await within(sheet).findByText("Essa cor já é de outra categoria.")).toBeInTheDocument();

    stubApi({
      "GET /api/categories": { status: 200, body: LIST },
      [`PATCH /api/categories/${MERCADO.id}`]: { status: 422, body: rule("palette-full") },
    });
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));
    expect(await within(sheet).findByText(ALL_TAKEN_EDITING)).toBeInTheDocument();
  });

  it("counts Resgate, listed only with include_system, among the colors taken", async () => {
    const resgate: Category = { ...RESGATE, color: "cat-1" };
    stubApi({
      "GET /api/categories": { status: 200, body: [EXTRA, SALARIO] },
      "GET /api/categories?include_system=true": { status: 200, body: [EXTRA, SALARIO, resgate] },
    });
    renderWithQuery(<CategorySheet kind="income" open onOpenChange={vi.fn()} />);

    const sheet = await sheetNamed("Nova categoria");
    await restyle(sheet);
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

    const sheet = await sheetNamed("Editar categoria");
    await userEvent.selectOptions(await within(sheet).findByLabelText("Dentro de"), "");
    expect(within(sheet).getByText(ALL_TAKEN_EDITING)).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("says when the new name is taken, or saving fails otherwise", async () => {
    open({ category: MERCADO }, { [`PATCH /api/categories/${MERCADO.id}`]: { status: 409, body: problem(409, "x") } });
    const sheet = await sheetNamed("Editar categoria");
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));
    expect(await within(sheet).findByText('Já existe "Mercado" em Diário.')).toBeInTheDocument();

    stubApi({
      "GET /api/categories": { status: 200, body: LIST },
      [`PATCH /api/categories/${MERCADO.id}`]: { status: 422, body: problem(422, "nested-subcategory") },
    });
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));
    expect(await within(sheet).findByText("Não foi possível salvar a categoria. Tente de novo.")).toBeInTheDocument();
  });

  describe("choosing what to create", () => {
    it("opens on Grupo, with Subcategoria a segment away", async () => {
      open({});

      const sheet = await sheetNamed("Nova categoria");
      expect(within(sheet).getByRole("radio", { name: "Grupo" })).toBeChecked();
      expect(within(sheet).getByRole("radio", { name: "Subcategoria" })).not.toBeChecked();
      expect(within(sheet).queryByRole("radiogroup", { name: "Dentro de" })).not.toBeInTheDocument();
      expect(within(sheet).queryByRole("radiogroup", { name: "Tipo" })).not.toBeInTheDocument();
    });

    it("creates a subcategory from the kind's top-levels, no select anywhere", async () => {
      const created = { ...RACAO, id: "c1000000-0000-4000-8000-000000000013", name: "Pet shop" };
      const { requests } = open({}, { "POST /api/categories": { status: 201, body: created } });
      await choose("Subcategoria");

      expect(await parents()).toEqual(["Aluguel", "Luz", "Comida fora", "Mercado", "Pets"]);
      const sheet = screen.getByRole("dialog", { name: "Nova categoria" });
      await userEvent.click(within(sheet).getByRole("radio", { name: "Pets" }));
      expect(within(sheet).getByText("Usa a cor de Pets")).toBeInTheDocument();
      expect(within(sheet).queryByRole("radio", { name: /^Cor / })).not.toBeInTheDocument();
      expect(sheet.querySelector("select")).toBeNull();
      await userEvent.type(within(sheet).getByLabelText("Nome"), "Pet shop{Enter}");

      expect(await posted(requests)).toEqual({
        name: "Pet shop",
        kind: "daily",
        icon: "paw-print",
        parent_id: PETS.id,
      });
    });

    it("switches the parent, keeping the name typed", async () => {
      const { requests } = open({}, { "POST /api/categories": { status: 201, body: MERCADO } });
      await choose("Subcategoria");
      const group = await parentList();
      await userEvent.click(await within(group).findByRole("radio", { name: "Pets" }));
      const sheet = screen.getByRole("dialog", { name: "Nova categoria" });
      await userEvent.type(within(sheet).getByLabelText("Nome"), "Feira");

      await userEvent.click(within(group).getByRole("radio", { name: "Mercado" }));
      expect(within(sheet).getByLabelText("Nome")).toHaveValue("Feira");
      await userEvent.click(within(sheet).getByRole("button", { name: "Criar" }));
      expect(await posted(requests)).toMatchObject({ name: "Feira", parent_id: MERCADO.id });
    });

    it("asks for the parent before creating a subcategory", async () => {
      const { requests } = open({});
      await choose("Subcategoria");

      const sheet = screen.getByRole("dialog", { name: "Nova categoria" });
      await userEvent.type(within(sheet).getByLabelText("Nome"), "Feira{Enter}");
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
      await choose("Subcategoria");

      expect(await parents()).toEqual(["Aluguel", "Economia", "Luz", "Comida fora", "Mercado"]);
      expect(screen.queryByRole("searchbox", { name: "Buscar categoria" })).not.toBeInTheDocument();
      await userEvent.click(within(await parentList()).getByRole("radio", { name: "Economia" }));
      const sheet = await sheetNamed("Novo cofrinho");
      expect(within(sheet).getByLabelText("Meta")).toBeInTheDocument();
      await userEvent.type(within(sheet).getByLabelText("Nome"), "Casa{Enter}");

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
      await choose("Subcategoria");

      expect(await parents()).toHaveLength(9);
      await userEvent.type(screen.getByRole("searchbox", { name: "Buscar categoria" }), "SAUDE");
      expect(await parents()).toEqual(["Saúde"]);
    });

    it("drops the chosen parent when the Tipo moves to the other side", async () => {
      const { requests } = open({ onKindChange: vi.fn() });
      await choose("Subcategoria");
      await userEvent.click(await within(await parentList()).findByRole("radio", { name: "Pets" }));

      await userEvent.click(screen.getByRole("radio", { name: "Entrada" }));
      expect(await parents()).toEqual(["Extra", "Salário"]);
      expect(within(await parentList()).queryByRole("radio", { checked: true })).not.toBeInTheDocument();
      await userEvent.type(screen.getByLabelText("Nome"), "Bônus{Enter}");

      expect(await screen.findByText("Escolha o grupo.")).toBeInTheDocument();
      expect(requests.some((request) => request.method === "POST")).toBe(false);
    });

    it("lists the current color first, its name beside the title", async () => {
      open({ category: ALUGUEL });
      const sheet = await sheetNamed("Editar categoria");
      await restyle(sheet);

      const colors = await within(sheet).findByRole("group", { name: "Cor" });
      expect(within(colors).getAllByRole("radio")[0]).toHaveAccessibleName("Cor Índigo");
      expect(within(colors).getByText("Índigo")).toBeInTheDocument();
    });

    it("says when the kind has no parent to link", async () => {
      open({ kind: "income" }, { "GET /api/categories": { status: 200, body: [] } });
      await choose("Subcategoria");

      expect(await within(await parentList()).findByText("Nenhum grupo deste tipo.")).toBeInTheDocument();
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
      expect(within(sheet).queryByLabelText("Dentro de")).not.toBeInTheDocument();
      expect(within(sheet).queryByRole("radio", { name: "Subcategoria" })).not.toBeInTheDocument();
      for (const name of ["Reserva de emergência", "Viagem", "Carro", "Casa", "Estudos"])
        expect(within(sheet).getByRole("button", { name })).toBeInTheDocument();
      expect(within(sheet).getByText("Usa a cor de Economia")).toBeInTheDocument();
      expect(within(sheet).queryByRole("radio", { name: /^Cor / })).not.toBeInTheDocument();
      await userEvent.click(within(sheet).getByRole("button", { name: "Viagem" }));
      expect(within(sheet).getByLabelText("Nome")).toHaveValue("Viagem");
      expect(within(sheet).getByLabelText("Nome")).toHaveAttribute("placeholder", "Ex.: Viagem");
      expect(within(sheet).queryByText(/^Dentro de/)).not.toBeInTheDocument();
      await restyle(sheet);
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
      await userEvent.type(within(sheet).getByLabelText("Nome"), "Casa");
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

      const sheet = await sheetNamed("Editar categoria");
      await waitFor(() => expect(within(sheet).getByLabelText("Nome")).toHaveValue("Economia"));
      expect(within(sheet).queryByLabelText("Dentro de")).not.toBeInTheDocument();
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
      expect(within(sheet).getByRole("radio", { name: "Conta" })).toHaveAttribute("data-state", "off");

      for (const category of [ECONOMIA, RESERVA, SALARIO]) {
        cleanup();
        edit(category);
        sheet = await editSheet();
        if (category === RESERVA) await within(sheet).findByLabelText("Meta");
        expect(within(sheet).queryByRole("radio", { name: "Conta" })).not.toBeInTheDocument();
      }

      cleanup();
      edit(ALUGUEL);
      sheet = await editSheet();
      expect(within(sheet).getByRole("radio", { name: "Conta" })).toHaveAttribute("data-state", "on");
    });

    it("asks before changing, and Cancelar sends nothing", async () => {
      const { requests } = edit(PORTO);
      const sheet = await editSheet();
      await userEvent.click(within(sheet).getByRole("radio", { name: "Conta" }));

      const confirm = await screen.findByRole("alertdialog", { name: "Mudar para Conta?" });
      expect(
        within(confirm).getByText("Todos os lançamentos de Porto passam a ser Conta. O saldo não muda."),
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
      await userEvent.clear(within(sheet).getByLabelText("Nome"));
      await userEvent.type(within(sheet).getByLabelText("Nome"), "Porto Seguro");
      await userEvent.click(within(sheet).getByRole("radio", { name: "Conta" }));
      const confirm = await screen.findByRole("alertdialog", { name: "Mudar para Conta?" });
      await userEvent.click(within(confirm).getByRole("button", { name: "Mudar tipo" }));

      expect(await patched(requests)).toEqual({ kind: "bill" });
      await waitFor(() => expect(onKindChange).toHaveBeenCalledWith("bill"));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(within(sheet).getByRole("radio", { name: "Conta" })).toHaveAttribute("data-state", "on");
      expect(within(sheet).getByLabelText("Nome")).toHaveValue("Porto Seguro");
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
      await userEvent.click(within(sheet).getByRole("radio", { name: "Conta" }));
      const confirm = await screen.findByRole("alertdialog", { name: "Mudar para Conta?" });
      await userEvent.click(within(confirm).getByRole("button", { name: "Mudar tipo" }));

      expect(await within(confirm).findByRole("alert")).toHaveTextContent(message);
      expect(screen.queryByText("Server words.")).not.toBeInTheDocument();
      expect(onKindChange).not.toHaveBeenCalled();
      expect(within(sheet).getByRole("radio", { name: "Diário", hidden: true })).toHaveAttribute("data-state", "on");
    });
  });
});
