import { useState } from "react";

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderHookWithQuery, renderWithQuery } from "@/test/render";
import { CATEGORIES, MERCADO, problem, RESGATE, SALARIO, stubApi } from "@/test/stub-api";

import { CategoryChips, useCategoryChips } from "./category-chips";

const CARRO: Schemas["Category"] = {
  id: "c1000000-0000-4000-8000-000000000099",
  name: "Carro",
  kind: "daily",
  icon: "car",
  color: "cat-3",
  is_savings: false,
};

const PETS: Schemas["Category"] = {
  id: "c1000000-0000-4000-8000-000000000010",
  name: "Pets",
  kind: "daily",
  icon: "paw-print",
  color: "cat-5",
  is_savings: false,
};
const RACAO: Schemas["Category"] = {
  id: "c1000000-0000-4000-8000-000000000011",
  name: "Ração",
  kind: "daily",
  icon: "bone",
  color: "cat-5",
  is_savings: false,
  parent_id: PETS.id,
};
/** In the API's order: kind, parent name, then the children by name. */
const WITH_CHILDREN = [...CATEGORIES, PETS, RACAO];

const Picker = () => {
  const [chosen, setChosen] = useState<Schemas["Category"]>();
  return <CategoryChips kind="daily" chosen={chosen} onChoose={setChosen} />;
};

const setup = (replies = {}, categories = CATEGORIES) => {
  const requests = stubApi({
    "GET /api/categories": { status: 200, body: categories },
    "POST /api/categories": { status: 201, body: CARRO },
    ...replies,
  });
  renderWithQuery(
    <>
      <Picker />
      <Toaster />
    </>,
  );
  const posted = async () => {
    await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
    return requests.find((request) => request.method === "POST")?.json();
  };
  return { requests, posted };
};

/** Through the chooser: a top-level category, or a subcategory of `parent`. */
const openCreate = async (parent?: string) => {
  await userEvent.click(await screen.findByRole("button", { name: "Nova categoria" }));
  const chooser = await screen.findByRole("dialog", { name: "Nova" });
  await userEvent.click(within(chooser).getByRole("button", { name: parent ? /^Subcategoria/ : /^Categoria/ }));
  if (parent)
    await userEvent.click(
      await within(await screen.findByRole("dialog", { name: "Subcategoria de qual categoria?" })).findByRole(
        "option",
        { name: parent },
      ),
    );
  return screen.findByRole("dialog", { name: "Nova categoria" });
};

describe("CategoryChips", () => {
  beforeEach(() => {
    window.innerWidth = 375;
  });

  it("below 640px picks from a searchable sheet, parents first and their children under them", async () => {
    setup({}, WITH_CHILDREN);

    const trigger = await screen.findByRole("combobox", { name: "Categoria" });
    expect(trigger).toHaveTextContent("Escolher categoria");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await userEvent.click(trigger);

    const sheet = await screen.findByRole("dialog", { name: "Categoria" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      within(sheet)
        .getAllByRole("option")
        .map((option) => option.getAttribute("aria-label")),
    ).toEqual(["Mercado", "Comida fora", "Pets", "Pets › Ração"]);
    await userEvent.type(within(sheet).getByRole("combobox"), "raç");
    expect(
      within(sheet)
        .getAllByRole("option")
        .map((option) => option.getAttribute("aria-label")),
    ).toEqual(["Pets › Ração"]);
    await userEvent.click(within(sheet).getByRole("option", { name: "Pets › Ração" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveTextContent("Pets › Ração");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Nova categoria" })).toBeInTheDocument();
  });

  it("uses the same searchable picker at 1440px, with children as Pai › Filho", async () => {
    window.innerWidth = 1440;
    setup({}, WITH_CHILDREN);

    const trigger = await screen.findByRole("combobox", { name: "Categoria" });
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await userEvent.click(trigger);
    const sheet = await screen.findByRole("dialog", { name: "Categoria" });
    await userEvent.click(within(sheet).getByRole("option", { name: "Pets › Ração" }));
    expect(trigger).toHaveTextContent("Pets › Ração");
    expect(screen.getByRole("button", { name: "Nova categoria" })).toBeInTheDocument();
  });

  it("creates a category with the next free color, selects it and says so", async () => {
    setup();

    const sheet = await openCreate();
    expect(within(sheet).getByLabelText("Nome")).toHaveAttribute("maxlength", "40");
    expect(within(sheet).getByRole("radio", { name: "Ícone circle-dashed" })).toBeChecked();
    expect(within(sheet).getAllByRole("radio", { name: /^Ícone / })).toHaveLength(16);
    expect(within(sheet).getByRole("radio", { name: "Cor Azul" })).toBeChecked();
    await userEvent.type(within(sheet).getByLabelText("Nome"), "  Carro ");
    await userEvent.click(within(sheet).getByRole("radio", { name: "Ícone car" }));
    const requests = stubApi({
      "GET /api/categories": { status: 200, body: [...CATEGORIES, CARRO] },
      "POST /api/categories": { status: 201, body: CARRO },
    });
    await userEvent.click(within(sheet).getByRole("button", { name: "Criar" }));

    await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
    expect(await requests.find((request) => request.method === "POST")?.json()).toEqual({
      name: "Carro",
      kind: "daily",
      icon: "car",
      color: "cat-3",
    });
    expect(await screen.findByText("Categoria criada")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("combobox", { name: "Categoria" })).toHaveTextContent("Carro");
  });

  it("asks for a name and, with all 24 colors taken, still creates a subcategory in the parent's icon and color", async () => {
    const full = Array.from({ length: 24 }, (_, index) => ({
      ...MERCADO,
      id: `c2000000-0000-4000-8000-0000000000${String(index).padStart(2, "0")}`,
      name: `Gasto ${index + 1}`,
      color: `cat-${index + 1}`,
    }));
    const { requests, posted } = setup({}, full);

    const sheet = await openCreate("Gasto 1");
    expect(
      within(sheet).queryByText("Todas as 24 cores estão em uso. Crie como subcategoria ou arquive uma categoria."),
    ).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Criar" }));
    expect(within(sheet).getByText("Informe o nome.")).toBeInTheDocument();
    expect(requests.some((request) => request.method === "POST")).toBe(false);

    await userEvent.type(within(sheet).getByLabelText("Nome"), "Feira{Enter}");
    expect(await posted()).toEqual({ name: "Feira", kind: "daily", icon: MERCADO.icon, parent_id: full[0].id });
  });

  it("creates a subcategory with a searched icon in the parent's color", async () => {
    setup({}, WITH_CHILDREN);
    const sheet = await openCreate("Pets");

    await userEvent.type(within(sheet).getByLabelText("Nome"), "Pet shop");
    await userEvent.type(within(sheet).getByLabelText("Buscar ícone"), "dog");
    await userEvent.click(await within(sheet).findByRole("radio", { name: "Ícone dog" }));
    expect(within(sheet).getByText("Usa a cor de Pets")).toBeInTheDocument();
    expect(within(sheet).queryByRole("radio", { name: /^Cor / })).not.toBeInTheDocument();
    const created = {
      ...RACAO,
      id: "c1000000-0000-4000-8000-000000000012",
      name: "Pet shop",
      icon: "dog",
      color: "cat-5",
    };
    const requests = stubApi({
      "GET /api/categories": { status: 200, body: [...WITH_CHILDREN, created] },
      "POST /api/categories": { status: 201, body: created },
    });
    await userEvent.click(within(sheet).getByRole("button", { name: "Criar" }));

    await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
    expect(await requests.find((request) => request.method === "POST")?.json()).toEqual({
      name: "Pet shop",
      kind: "daily",
      icon: "dog",
      parent_id: PETS.id,
    });
    expect(await screen.findByRole("combobox", { name: "Categoria" })).toHaveTextContent("Pets › Pet shop");
  });

  it("says when the name is taken", async () => {
    setup({ "POST /api/categories": { status: 409, body: problem(409, "already-exists") } });

    const sheet = await openCreate();
    await userEvent.type(within(sheet).getByLabelText("Nome"), "Mercado{Enter}");

    expect(await within(sheet).findByText("Já existe uma categoria com esse nome")).toBeInTheDocument();
  });

  it("says when the server refuses for another reason", async () => {
    setup({ "POST /api/categories": { status: 422, body: problem(422, "name") } });

    const sheet = await openCreate();
    await userEvent.type(within(sheet).getByLabelText("Nome"), "Feira{Enter}");

    expect(await within(sheet).findByText("Não foi possível criar a categoria.")).toBeInTheDocument();
  });
});

describe("useCategoryChips", () => {
  it("never offers Resgate, which only the Cofrinhos screen writes", async () => {
    stubApi({ "GET /api/categories": { status: 200, body: [...CATEGORIES, RESGATE] } });
    const { result } = renderHookWithQuery(() => useCategoryChips("income"));

    await waitFor(() => expect(result.current.data?.map((each) => each.name)).toEqual([SALARIO.name, "Extra"]));
  });
});
