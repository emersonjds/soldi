import { useState } from "react";

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderHookWithQuery, renderWithQuery } from "@/test/render";
import { CATEGORIES, COMIDA, MERCADO, problem, RESGATE, SALARIO, stubApi } from "@/test/stub-api";

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

const LAZER: Schemas["Category"] = { ...CARRO, id: "c1000000-0000-4000-8000-000000000098", name: "Lazer" };

/** In the API's order, Carro and Lazer after Pets. */
const SIX_DAILY = [...WITH_CHILDREN, CARRO, LAZER];

const more = (name: string, index: number): Schemas["Category"] => ({
  ...CARRO,
  id: `c1000000-0000-4000-8000-0000000000${90 + index}`,
  name,
});
/** Nine top-level Diário, one more than the row holds. */
const NINE_DAILY = [...SIX_DAILY, more("Saúde", 1), more("Casa", 2), more("Viagem", 3), more("Roupas", 4)];

const entry = (category: Schemas["Category"], date: string, id: string): Schemas["Transaction"] => ({
  id,
  date,
  amount: "12345.67",
  kind: category.kind,
  category,
});

/** Comida fora twice; Carro and Pets once each, Carro later; three Salário that are not Diário. */
const ENTRIES = [
  entry(COMIDA, "2026-11-03", "e1"),
  entry(COMIDA, "2026-11-04", "e2"),
  entry(PETS, "2026-11-02", "e3"),
  entry(CARRO, "2026-11-05", "e4"),
  entry(SALARIO, "2026-11-01", "e5"),
  entry(SALARIO, "2026-11-02", "e6"),
  entry(SALARIO, "2026-11-03", "e7"),
];

const Picker = ({ entries = [] }: { entries?: Schemas["Transaction"][] }) => {
  const [chosen, setChosen] = useState<Schemas["Category"]>();
  return (
    <>
      <CategoryChips kind="daily" chosen={chosen} onChoose={setChosen} entries={entries} />
      <output aria-label="Escolhida">{chosen?.name}</output>
    </>
  );
};

const chips = () =>
  within(screen.getByRole("radiogroup", { name: "Categoria" }))
    .getAllByRole("radio")
    .map((radio) => radio.textContent);

const setup = (replies = {}, categories = CATEGORIES, entries?: Schemas["Transaction"][]) => {
  const requests = stubApi({
    "GET /api/categories": { status: 200, body: categories },
    "POST /api/categories": { status: 201, body: CARRO },
    ...replies,
  });
  renderWithQuery(
    <>
      <Picker entries={entries} />
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
  await userEvent.click(await screen.findByRole("button", { name: "Ver todas" }));
  await userEvent.click(
    within(await screen.findByRole("dialog", { name: "Categoria" })).getByRole("button", { name: "Nova categoria" }),
  );
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

  it("without entries shows the kind's first eight parents, the preset one leading, as a scrolling radio row", async () => {
    setup({}, NINE_DAILY);

    const row = await screen.findByRole("radiogroup", { name: "Categoria" });
    expect(chips()).toEqual(["Mercado", "Comida fora", "Pets", "Carro", "Lazer", "Saúde", "Casa", "Viagem"]);
    expect(row).toHaveClass("overflow-x-auto", "snap-x");
    expect(within(row).queryByRole("radio", { checked: true })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver todas" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Nova categoria" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Subcategoria" })).not.toBeInTheDocument();
  });

  it("ranks the month's Diário by count, a tie by the latest date, then fills from the preset and API order", async () => {
    setup({}, SIX_DAILY, ENTRIES);

    await screen.findByRole("radiogroup", { name: "Categoria" });
    expect(chips()).toEqual(["Comida fora", "Carro", "Pets", "Mercado", "Lazer"]);
  });

  it("counts a child's entries for its parent, which leads the row while the child stays off it", async () => {
    setup({}, SIX_DAILY, [
      entry(COMIDA, "2026-11-04", "e1"),
      entry(RACAO, "2026-11-02", "e2"),
      entry(RACAO, "2026-11-03", "e3"),
    ]);

    await screen.findByRole("radiogroup", { name: "Categoria" });
    expect(chips()).toEqual(["Pets", "Comida fora", "Mercado", "Carro", "Lazer"]);
    expect(screen.queryByRole("radio", { name: "Pets › Ração" })).not.toBeInTheDocument();
  });

  it("shows fewer chips when the kind has fewer categories", async () => {
    setup();

    await screen.findByRole("radiogroup", { name: "Categoria" });
    expect(chips()).toEqual(["Mercado", "Comida fora"]);
  });

  it("checks a tapped chip and moves along the row with the arrow keys", async () => {
    setup({}, SIX_DAILY);

    const mercado = await screen.findByRole("radio", { name: "Mercado" });
    await userEvent.click(mercado);
    expect(mercado).toHaveAttribute("aria-checked", "true");
    expect(mercado).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    const comida = screen.getByRole("radio", { name: "Comida fora" });
    expect(comida).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(comida).toHaveAttribute("aria-checked", "true");
    expect(mercado).toHaveAttribute("aria-checked", "false");
    await userEvent.click(comida);
    expect(comida).toHaveAttribute("aria-checked", "true");
  });

  it("searches every category from Ver todas and keeps a choice outside the eight in the last slot", async () => {
    setup({}, NINE_DAILY, ENTRIES);

    const more = await screen.findByRole("button", { name: "Ver todas" });
    await userEvent.click(more);
    const sheet = await screen.findByRole("dialog", { name: "Categoria" });
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(
      within(sheet)
        .getAllByRole("option")
        .map((option) => option.getAttribute("aria-label")),
    ).toEqual([
      "Mercado",
      "Comida fora",
      "Pets",
      "Pets › Ração",
      "Carro",
      "Lazer",
      "Saúde",
      "Casa",
      "Viagem",
      "Roupas",
    ]);
    await userEvent.type(within(sheet).getByRole("combobox"), "roup");
    await userEvent.click(within(sheet).getByRole("option", { name: "Roupas" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(chips()).toEqual(["Comida fora", "Carro", "Pets", "Mercado", "Lazer", "Saúde", "Casa", "Roupas"]);
    const roupas = screen.getByRole("radio", { name: "Roupas" });
    expect(roupas).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(roupas).toHaveFocus());
  });

  it("returns focus to Ver todas when its sheet or the create sheet closes with Esc", async () => {
    setup({}, SIX_DAILY);

    const more = await screen.findByRole("button", { name: "Ver todas" });
    await userEvent.click(more);
    await screen.findByRole("dialog", { name: "Categoria" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(more).toHaveFocus());

    await userEvent.click(more);
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Categoria" })).getByRole("button", { name: "Nova categoria" }),
    );
    await screen.findByRole("dialog", { name: "Nova" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(more).toHaveFocus());
  });

  it("shows the picked parent's children as Sub: pills; a pill picks the child, a second tap the parent", async () => {
    setup({}, WITH_CHILDREN);

    await userEvent.click(await screen.findByRole("radio", { name: "Mercado" }));
    expect(screen.queryByRole("radiogroup", { name: "Subcategoria" })).not.toBeInTheDocument();
    const pets = screen.getByRole("radio", { name: "Pets" });
    await userEvent.click(pets);
    const sub = screen.getByRole("radiogroup", { name: "Subcategoria" });
    expect(sub.parentElement).toHaveTextContent(/^Sub:/);
    const racao = within(sub).getByRole("radio", { name: "Pets › Ração" });
    expect(racao).toHaveTextContent("Ração");
    expect(racao).toHaveAttribute("aria-checked", "false");

    await userEvent.click(racao);
    expect(racao).toHaveAttribute("aria-checked", "true");
    expect(pets).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("status", { name: "Escolhida" })).toHaveTextContent("Ração");

    await userEvent.click(racao);
    expect(racao).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("status", { name: "Escolhida" })).toHaveTextContent("Pets");

    await userEvent.click(racao);
    await userEvent.click(pets);
    expect(screen.getByRole("status", { name: "Escolhida" })).toHaveTextContent("Pets");
  });

  it("shows a child picked in Ver todas as its parent circle and its Sub: pill", async () => {
    setup({}, WITH_CHILDREN);

    const more = await screen.findByRole("button", { name: "Ver todas" });
    await userEvent.click(more);
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Categoria" })).getByRole("option", { name: "Pets › Ração" }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("radio", { name: "Pets" })).toHaveAttribute("aria-checked", "true");
    const racao = screen.getByRole("radio", { name: "Pets › Ração" });
    expect(racao).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("status", { name: "Escolhida" })).toHaveTextContent("Ração");
    await waitFor(() => expect(racao).toHaveFocus());
  });

  it("shows eight round placeholders while the categories load", () => {
    stubApi({});
    const { container } = renderWithQuery(<Picker />);

    expect(container.querySelectorAll('[data-slot="skeleton"].rounded-full')).toHaveLength(8);
  });

  it("waits with the placeholders while the month's entries load, so the row never reorders", async () => {
    stubApi({ "GET /api/categories": { status: 200, body: SIX_DAILY } });
    const { client, container } = renderWithQuery(
      <CategoryChips kind="daily" chosen={undefined} onChoose={() => undefined} entries={undefined} />,
    );

    await waitFor(() => expect(client.getQueryData(["categories"])).toBeDefined());
    expect(screen.queryByRole("radiogroup", { name: "Categoria" })).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"].rounded-full')).toHaveLength(8);
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
    const carro = await screen.findByRole("radio", { name: "Carro" });
    expect(carro).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(carro).toHaveFocus());
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
    expect(await screen.findByRole("radio", { name: "Pets › Pet shop" })).toHaveAttribute("aria-checked", "true");
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
