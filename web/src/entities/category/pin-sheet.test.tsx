import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import { ALUGUEL, CATEGORIES, COMIDA, MERCADO, problem, stubApi, VEICULO, WITH_MIXED_GROUP } from "@/test/stub-api";

import { CategoryChips } from "./category-chips";

const daily = (name: string, index: number): Schemas["Category"] => ({
  id: `d1000000-0000-4000-8000-0000000000${10 + index}`,
  name,
  kind: "daily",
  icon: "tag",
  color: "cat-3",
  is_savings: false,
});
const MORE = ["Pets", "Carro", "Lazer", "Saúde", "Roupas", "Gasto", "Casa"].map(daily);
const NINE = [...CATEGORIES, ...MORE];

const setup = (pins: string[] | null, categories = CATEGORIES, put = { status: 200, body: {} }) => {
  const requests = stubApi({
    "GET /api/categories": { status: 200, body: categories },
    "GET /api/categories/pins": pins
      ? { status: 200, body: { category_ids: pins } }
      : { status: 500, body: problem(500, "Erro") },
    "PUT /api/categories/pins": put,
  });
  renderWithQuery(
    <>
      <CategoryChips kind="daily" chosen={undefined} onChoose={() => undefined} entries={[]} />
      <Toaster />
    </>,
  );
  const sent = async () => {
    await waitFor(() => expect(requests.some((request) => request.method === "PUT")).toBe(true));
    return requests.find((request) => request.method === "PUT")?.json();
  };
  return { sent };
};

const open = async () => {
  await screen.findByRole("radiogroup", { name: "Categoria" });
  await userEvent.click(screen.getByRole("button", { name: "Personalizar" }));
  return screen.findByRole("dialog", { name: "Personalizar categorias" });
};

const names = (sheet: HTMLElement, action: "Desafixar" | "Fixar") =>
  within(sheet)
    .queryAllByRole("button", { name: new RegExp(`^${action} `) })
    .map((button) => button.getAttribute("aria-label")?.slice(action.length + 1));

describe("Personalizar", () => {
  beforeEach(() => {
    window.innerWidth = 375;
  });

  it("lists the row's pins in order and the other tops by name, or says none is pinned", async () => {
    setup([]);
    let sheet = await open();
    expect(within(sheet).getByText("Nenhuma fixada. A lista segue o uso deste mês.")).toBeInTheDocument();
    expect(names(sheet, "Fixar")).toEqual(["Comida fora", "Mercado"]);
    await userEvent.click(within(sheet).getByRole("button", { name: "Cancelar" }));

    await userEvent.click(screen.getByRole("button", { name: "Personalizar" }));
    sheet = await screen.findByRole("dialog", { name: "Personalizar categorias" });
    expect(names(sheet, "Desafixar")).toEqual([]);
  });

  it("moves, unpins and pins, then saves the merged order, keeping another kind's pin in its slot", async () => {
    const { sent } = setup([MERCADO.id, ALUGUEL.id, MORE[0].id], NINE);
    const sheet = await open();
    expect(names(sheet, "Desafixar")).toEqual(["Mercado", "Pets"]);
    expect(within(sheet).getByRole("button", { name: "Subir Mercado" })).toBeDisabled();
    expect(within(sheet).getByRole("button", { name: "Descer Pets" })).toBeDisabled();

    await userEvent.click(within(sheet).getByRole("button", { name: "Descer Mercado" }));
    expect(names(sheet, "Desafixar")).toEqual(["Pets", "Mercado"]);
    await userEvent.click(within(sheet).getByRole("button", { name: "Subir Mercado" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Desafixar Pets" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Fixar Lazer" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Fixar Comida fora" }));
    expect(names(sheet, "Desafixar")).toEqual(["Mercado", "Lazer", "Comida fora"]);
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));

    expect(await sent()).toEqual({ category_ids: [MERCADO.id, ALUGUEL.id, MORE[2].id, COMIDA.id] });
    expect(await screen.findByText("Categorias personalizadas")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("disables Fixar at 8 pinned and says so", async () => {
    setup([COMIDA.id, ...MORE.map((each) => each.id)], NINE);
    const sheet = await open();

    expect(within(sheet).getByRole("button", { name: "Fixar Mercado" })).toBeDisabled();
    expect(within(sheet).getByText("Limite de 8 fixadas.")).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Desafixar Casa" }));
    expect(within(sheet).getByRole("button", { name: "Fixar Mercado" })).toBeEnabled();
    expect(within(sheet).queryByText("Limite de 8 fixadas.")).not.toBeInTheDocument();
  });

  it("notes a pinned mixed group also shows in its other kind", async () => {
    setup([VEICULO.id], WITH_MIXED_GROUP);
    const sheet = await open();

    expect(within(sheet).getByText("Também fixada em Saída.")).toBeInTheDocument();
  });

  it("keeps the sheet and the draft when the save fails", async () => {
    setup([], CATEGORIES, { status: 500, body: problem(500, "Erro") });
    const sheet = await open();
    await userEvent.click(within(sheet).getByRole("button", { name: "Fixar Mercado" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Não foi possível salvar a ordem.")).toBeInTheDocument();
    expect(names(sheet, "Desafixar")).toEqual(["Mercado"]);
  });

  it("offers a retry inside the sheet when the pins fail to load", async () => {
    setup(null);
    const sheet = await open();

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as categorias fixadas.",
    );
    expect(within(sheet).getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  });
});
