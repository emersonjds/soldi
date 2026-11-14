import { useState } from "react";

import { onlineManager } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderHookWithQuery, renderWithQuery } from "@/test/render";
import {
  ALUGUEL,
  CATEGORIES,
  COMIDA,
  MERCADO,
  problem,
  RESGATE,
  SALARIO,
  stubApi,
  WITH_MIXED_GROUP,
} from "@/test/stub-api";

import { CategoryChips, useCategoryChips } from "./category-chips";

const CARRO: Schemas["Category"] = {
  id: "c1000000-0000-4000-8000-000000000099",
  name: "Carro",
  kind: "daily",
  icon: "car",
  color: "cat-3",
  is_savings: false,
  is_card_group: false,
};

const PETS: Schemas["Category"] = {
  id: "c1000000-0000-4000-8000-000000000010",
  name: "Pets",
  kind: "daily",
  icon: "paw-print",
  color: "cat-5",
  is_savings: false,
  is_card_group: false,
};
const RACAO: Schemas["Category"] = {
  id: "c1000000-0000-4000-8000-000000000011",
  name: "Ração",
  kind: "daily",
  icon: "bone",
  color: "cat-5",
  is_savings: false,
  is_card_group: false,
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
const NINE_DAILY = [...SIX_DAILY, more("Saúde", 1), more("Casa", 2), more("Gasto", 3), more("Roupas", 4)];

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
  within(screen.getByRole("radiogroup", { name: "Mais usadas" }))
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
  return requests;
};

describe("CategoryChips", () => {
  beforeEach(() => {
    window.innerWidth = 375;
  });

  it("without entries shows the kind's first eight parents, the preset one leading, as a scrolling radio row", async () => {
    setup({}, NINE_DAILY);

    const row = await screen.findByRole("radiogroup", { name: "Mais usadas" });
    expect(chips()).toEqual(["Gasto", "Comida fora", "Mercado", "Pets", "Carro", "Lazer", "Saúde", "Casa"]);
    expect(row).toHaveClass("overflow-x-auto", "snap-x");
    expect(within(row).queryByRole("radio", { checked: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver todas" })).not.toBeInTheDocument();
  });

  it("ranks the month's Diário by count, a tie by the latest date, then fills from the preset and API order", async () => {
    setup({}, SIX_DAILY, ENTRIES);

    await screen.findByRole("radiogroup", { name: "Mais usadas" });
    expect(chips()).toEqual(["Comida fora", "Carro", "Pets", "Mercado", "Lazer"]);
  });

  it("counts a child's entries for its parent, which leads the row while the child stays off it", async () => {
    setup({}, SIX_DAILY, [
      entry(COMIDA, "2026-11-04", "e1"),
      entry(RACAO, "2026-11-02", "e2"),
      entry(RACAO, "2026-11-03", "e3"),
    ]);

    await screen.findByRole("radiogroup", { name: "Mais usadas" });
    expect(chips()).toEqual(["Pets", "Comida fora", "Mercado", "Carro", "Lazer"]);
    expect(screen.queryByRole("radio", { name: "Pets › Ração" })).not.toBeInTheDocument();
  });

  it("leads with the pinned parents in their order, a pin unused this month too, then the month's ranking", async () => {
    setup(
      { "GET /api/categories/pins": { status: 200, body: { category_ids: [LAZER.id, ALUGUEL.id, MERCADO.id] } } },
      NINE_DAILY,
      ENTRIES,
    );

    await screen.findByRole("radiogroup", { name: "Mais usadas" });
    expect(chips()).toEqual(["Lazer", "Mercado", "Comida fora", "Carro", "Pets", "Gasto", "Saúde", "Casa"]);
  });

  it("keeps the month's ranking when the pins fail to load", async () => {
    setup({ "GET /api/categories/pins": { status: 500, body: problem(500, "Erro") } }, SIX_DAILY, ENTRIES);

    await screen.findByRole("radiogroup", { name: "Mais usadas" });
    expect(chips()).toEqual(["Comida fora", "Carro", "Pets", "Mercado", "Lazer"]);
    expect(screen.getByRole("button", { name: "Personalizar" })).toBeEnabled();
  });

  it("shows the month's ranking offline, while the pins wait for the network", async () => {
    stubApi({});
    onlineManager.setOnline(false);
    try {
      const { client } = renderWithQuery(<Picker entries={ENTRIES} />);
      client.setQueryData(["categories"], SIX_DAILY);

      await screen.findByRole("radiogroup", { name: "Mais usadas" });
      expect(chips()).toEqual(["Comida fora", "Carro", "Pets", "Mercado", "Lazer"]);
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it("asks for the pins together with the categories", async () => {
    const requests = stubApi({ "GET /api/categories": { status: 200, body: CATEGORIES } });
    renderHookWithQuery(() => useCategoryChips("daily"));

    await waitFor(() =>
      expect(requests.map((request) => new URL(request.url).pathname)).toContain("/api/categories/pins"),
    );
  });

  it("shows fewer chips when the kind has fewer categories", async () => {
    setup();

    await screen.findByRole("radiogroup", { name: "Mais usadas" });
    expect(chips()).toEqual(["Comida fora", "Mercado"]);
  });

  it("checks a tapped chip and moves along the row with the arrow keys", async () => {
    setup({}, SIX_DAILY);

    const mercado = await screen.findByRole("radio", { name: "Mercado" });
    await userEvent.click(mercado);
    expect(mercado).toHaveAttribute("aria-checked", "true");
    expect(mercado).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    const comida = screen.getByRole("radio", { name: "Comida fora" });
    expect(comida).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(comida).toHaveAttribute("aria-checked", "true");
    expect(mercado).toHaveAttribute("aria-checked", "false");
    await userEvent.click(comida);
    expect(comida).toHaveAttribute("aria-checked", "true");
  });

  it("keeps a chosen category outside the eight in the last slot", async () => {
    stubApi({ "GET /api/categories": { status: 200, body: NINE_DAILY } });
    const roupasCategory = NINE_DAILY.find((each) => each.name === "Roupas");
    renderWithQuery(
      <CategoryChips kind="daily" chosen={roupasCategory} onChoose={() => undefined} entries={ENTRIES} />,
    );

    const roupas = await screen.findByRole("radio", { name: "Roupas" });
    expect(chips()).toEqual(["Comida fora", "Carro", "Pets", "Gasto", "Mercado", "Lazer", "Saúde", "Roupas"]);
    expect(roupas).toHaveAttribute("aria-checked", "true");
  });

  it("shows a chosen child as its parent's circle, with no Sub: pills", async () => {
    stubApi({ "GET /api/categories": { status: 200, body: WITH_CHILDREN } });
    renderWithQuery(<CategoryChips kind="daily" chosen={RACAO} onChoose={() => undefined} entries={[]} />);

    expect(await screen.findByRole("radio", { name: "Pets" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("Sub:")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Pets › Ração" })).not.toBeInTheDocument();
  });

  it("filters the row by the search, ignoring case and accents", async () => {
    stubApi({ "GET /api/categories": { status: 200, body: NINE_DAILY } });
    renderWithQuery(
      <CategoryChips kind="daily" chosen={undefined} onChoose={() => undefined} entries={[]} search=" SAUDE " />,
    );

    await screen.findByRole("radiogroup", { name: "Mais usadas" });
    expect(chips()).toEqual(["Saúde"]);
  });

  describe("with a parent of another kind (D26)", () => {
    it("chooses its first child of the kind from its circle, never the parent itself", async () => {
      setup({}, WITH_MIXED_GROUP);

      const veiculo = await screen.findByRole("radio", { name: "Veículo" });
      expect(chips()).not.toContain("Parcela");
      await userEvent.click(veiculo);
      expect(screen.getByRole("status", { name: "Escolhida" })).toHaveTextContent("Combustível");
      expect(veiculo).toHaveAttribute("aria-checked", "true");
    });

    it("lets its own kind choose it", async () => {
      stubApi({ "GET /api/categories": { status: 200, body: WITH_MIXED_GROUP } });
      const Bill = () => {
        const [chosen, setChosen] = useState<Schemas["Category"]>();
        return (
          <>
            <CategoryChips kind="bill" chosen={chosen} onChoose={setChosen} entries={[]} />
            <output aria-label="Escolhida">{chosen?.name}</output>
          </>
        );
      };
      renderWithQuery(<Bill />);

      await userEvent.click(await screen.findByRole("radio", { name: "Veículo" }));
      expect(screen.getByRole("status", { name: "Escolhida" })).toHaveTextContent("Veículo");
    });
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
    expect(screen.queryByRole("radiogroup", { name: "Mais usadas" })).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"].rounded-full')).toHaveLength(8);
  });
});

describe("useCategoryChips", () => {
  it("never offers Resgate, which only the Cofrinhos screen writes", async () => {
    stubApi({ "GET /api/categories": { status: 200, body: [...CATEGORIES, RESGATE] } });
    const { result } = renderHookWithQuery(() => useCategoryChips("income"));

    await waitFor(() => expect(result.current.data?.map((each) => each.name)).toEqual([SALARIO.name, "Extra"]));
  });
});
