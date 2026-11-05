import { useState } from "react";

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import { CATEGORIES, COMIDA, MERCADO, problem, stubApi } from "@/test/stub-api";

import { CategoryChips } from "./category-chips";

const CARRO: Schemas["Category"] = {
  id: "c1000000-0000-4000-8000-000000000099",
  name: "Carro",
  kind: "daily",
  icon: "car",
  color: "cat-3",
};

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

const openCreate = async () => {
  await userEvent.click(await screen.findByRole("button", { name: "Nova categoria" }));
  return screen.findByRole("dialog", { name: "Nova categoria" });
};

describe("CategoryChips", () => {
  beforeEach(() => {
    window.innerWidth = 375;
  });

  it("lists the kind's categories as radios with Nova categoria last", async () => {
    setup();

    const radios = await screen.findAllByRole("radio");
    expect(radios.map((radio) => radio.closest("label")?.textContent)).toEqual([MERCADO.name, COMIDA.name]);
    await userEvent.click(screen.getByRole("radio", { name: "Comida fora" }));
    expect(screen.getByRole("radio", { name: "Comida fora" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Nova categoria" })).toBeInTheDocument();
  });

  it("creates a category with the next free color, selects it and says so", async () => {
    setup();

    const sheet = await openCreate();
    expect(within(sheet).getByLabelText("Nome")).toHaveAttribute("maxlength", "40");
    expect(within(sheet).getByRole("radio", { name: "Padrão" })).toBeChecked();
    expect(within(sheet).getAllByRole("radio")).toHaveLength(16);
    await userEvent.type(within(sheet).getByLabelText("Nome"), "  Carro ");
    await userEvent.click(within(sheet).getByRole("radio", { name: "Carro" }));
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
    expect(await screen.findByRole("radio", { name: "Carro" })).toBeChecked();
  });

  it("asks for a name and sends the default icon, leaving the color to the server when all twelve are taken", async () => {
    const full = Array.from({ length: 12 }, (_, index) => ({
      ...MERCADO,
      id: `c2000000-0000-4000-8000-0000000000${String(index).padStart(2, "0")}`,
      name: `Gasto ${index + 1}`,
      color: `cat-${index + 1}`,
    }));
    const { requests, posted } = setup({}, full);

    const sheet = await openCreate();
    await userEvent.click(within(sheet).getByRole("button", { name: "Criar" }));
    expect(within(sheet).getByText("Informe o nome.")).toBeInTheDocument();
    expect(requests.some((request) => request.method === "POST")).toBe(false);

    await userEvent.type(within(sheet).getByLabelText("Nome"), "Feira{Enter}");
    expect(await posted()).toEqual({ name: "Feira", kind: "daily", icon: "circle-dashed", color: null });
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
