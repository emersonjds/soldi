import { QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster, toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { router, setSearch } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import {
  ALUGUEL,
  COMBUSTIVEL,
  COMIDA,
  ECONOMIA,
  EXTRA,
  LUZ,
  MERCADO,
  PARCELA,
  problem,
  RESERVA,
  SALARIO,
  signedIn,
  VEICULO,
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
  is_card_group: false,
};
const RACAO: Category = { ...PETS, id: "c1000000-0000-4000-8000-000000000011", name: "Ração", parent_id: PETS.id };
const VET: Category = { ...PETS, id: "c1000000-0000-4000-8000-000000000012", name: "Veterinário", parent_id: PETS.id };
const IMPORTADO: Category = {
  id: "c1000000-0000-4000-8000-000000000040",
  name: "Importado (diário)",
  kind: "daily",
  icon: "circle-dashed",
  color: "cat-12",
  is_savings: false,
  is_card_group: false,
};
/** In the API's order: kind, parent name, then the children by name. */
const LIST = [EXTRA, SALARIO, ALUGUEL, ECONOMIA, RESERVA, VIAGEM, LUZ, COMIDA, IMPORTADO, MERCADO, PETS, RACAO, VET];

const page = () => (
  <>
    <CategoriasPage />
    <Toaster />
  </>
);
let rendered: ReturnType<typeof renderWithQuery>;
/** Renders again with the current `?k=`; the stand-in router changes nothing by itself. */
const rerender = () => rendered.rerender(<QueryClientProvider client={rendered.client}>{page()}</QueryClientProvider>);

const open = (replies: Record<string, Reply> = {}) => {
  const requests = signedIn({ "GET /api/categories": { status: 200, body: LIST }, ...replies });
  rendered = renderWithQuery(page());
  return requests;
};

const sent = (requests: Request[], method: string) => requests.filter((request) => request.method === method);
const list = () => screen.findByRole("list", { name: /^Categorias de / });
const card = async (name: string) => within(await list()).getByRole("listitem", { name });
const names = (element: HTMLElement) =>
  within(element)
    .queryAllByRole("button", { name: /^Editar / })
    .map((button) => button.getAttribute("aria-label"));
/** The sheet once its form arrived with the category list. */
const sheetNamed = async (name: string) => {
  const sheet = await screen.findByRole("dialog", { name });
  await within(sheet).findByLabelText("Nome");
  return sheet;
};

describe("Ajustes › Categorias", () => {
  beforeEach(() => {
    window.innerWidth = 375;
    setSearch("");
    router.replace.mockClear();
  });

  it("opens on Diário with no description, stats or month totals: a card per group with its subcategories", async () => {
    const requests = open();

    const heading = screen.getByRole("heading", { level: 1, name: "Categorias" });
    expect(heading.nextElementSibling).toHaveAccessibleName("Nova categoria");
    const crumbs = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(within(crumbs).getByRole("link", { name: "Ajustes" })).toHaveAttribute("href", "/ajustes");
    expect(within(crumbs).getByText("Categorias")).toHaveAttribute("aria-current", "page");
    const daily = await list();
    expect(screen.getAllByRole("radio").map((tab) => tab.textContent)).toEqual(["Diário", "Contas", "Entradas"]);
    expect(screen.getByRole("radio", { name: "Diário" })).toBeChecked();
    expect(daily).toHaveAccessibleName("Categorias de Diário");
    expect(names(daily)).toEqual([
      "Editar Comida fora",
      "Editar Importado (diário)",
      "Editar Mercado",
      "Editar Pets",
      "Editar Ração",
      "Editar Veterinário",
    ]);
    const pets = await card("Pets");
    expect(within(pets).queryByText(/subcategoria/)).not.toBeInTheDocument();
    expect(names(within(pets).getByRole("list", { name: "Subcategorias de Pets" }))).toEqual([
      "Editar Ração",
      "Editar Veterinário",
    ]);
    expect(within(pets).getByRole("button", { name: "Nova subcategoria em Pets" })).toHaveClass("size-11");
    expect(screen.queryByRole("button", { name: /^Mais ações/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Total no mês")).not.toBeInTheDocument();
    expect(screen.queryByText(/ESTRUTURA ATIVA|MAIOR CONCENTRAÇÃO/)).not.toBeInTheDocument();
    expect(sent(requests, "GET").some((request) => /reports|transactions/.test(request.url))).toBe(false);
  });

  it("keeps Nova categoria disabled over skeleton rows until the list arrives", async () => {
    open();

    expect(screen.getByRole("button", { name: "Nova categoria" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByTestId("row-skeleton").length).toBeGreaterThan(0);
    await list();
    expect(screen.getByRole("button", { name: "Nova categoria" })).toHaveAttribute("aria-disabled", "false");
  });

  it("keeps 44 px targets and 16 px fields", async () => {
    open();
    await list();

    for (const tab of screen.getAllByRole("radio")) expect(tab).toHaveClass("min-h-11");
    expect(screen.getByRole("searchbox", { name: "Buscar categoria" })).toHaveClass("h-11", "text-base");
    expect(screen.getByRole("button", { name: "Editar Ração" })).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Nova categoria" })).toHaveClass("min-h-11");
  });

  it("shows a group of another kind (D26) in each tab with only that tab's subs, no kind label", async () => {
    const created = { ...COMBUSTIVEL, id: "c1000000-0000-4000-8000-000000000050", name: "Pedágio" };
    const requests = open({
      "GET /api/categories": { status: 200, body: [...LIST, VEICULO, COMBUSTIVEL, PARCELA] },
      "POST /api/categories": { status: 201, body: created },
    });

    const daily = await card("Veículo");
    expect(names(within(daily).getByRole("list", { name: "Subcategorias de Veículo" }))).toEqual([
      "Editar Combustível",
    ]);
    expect(within(daily).queryByText(/Fixa|Conta/)).not.toBeInTheDocument();
    await userEvent.click(within(daily).getByRole("button", { name: "Nova subcategoria em Veículo" }));
    const sheet = await sheetNamed("Nova subcategoria");
    expect(within(sheet).getByText("Dentro de Veículo")).toBeInTheDocument();
    expect(within(sheet).getByRole("radio", { name: "Diário" })).toHaveAttribute("data-state", "on");
    await userEvent.type(within(sheet).getByLabelText("Nome"), "Pedágio{Enter}");
    await waitFor(() => expect(sent(requests, "POST")).toHaveLength(1));
    expect(await sent(requests, "POST")[0].json()).toMatchObject({ kind: "daily", parent_id: VEICULO.id });

    setSearch("k=bill");
    rerender();
    expect(screen.getByRole("radio", { name: "Contas" })).toBeChecked();
    const bills = await card("Veículo");
    expect(names(within(bills).getByRole("list", { name: "Subcategorias de Veículo" }))).toEqual(["Editar Parcela"]);
  });

  it("filters groups and subcategories ignoring case and accents", async () => {
    open();
    await list();

    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar categoria" }), "RACAO");
    expect(names(await list())).toEqual(["Editar Pets", "Editar Ração"]);

    await userEvent.clear(screen.getByRole("searchbox", { name: "Buscar categoria" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar categoria" }), "zzz");
    expect(await screen.findByText("Nenhuma categoria encontrada.")).toBeInTheDocument();
  });

  it("switches kind through ?k=, keeping ?m= untouched", async () => {
    setSearch("m=2026-11");
    open();

    await userEvent.click(screen.getByRole("radio", { name: "Entradas" }));

    expect(window.location.pathname + window.location.search).toBe("/ajustes/categorias?m=2026-11&k=income");
  });

  it("reads the kind from ?k=", async () => {
    setSearch("k=income");
    open();

    expect(screen.getByRole("radio", { name: "Entradas" })).toBeChecked();
    expect(names(await list())).toEqual(["Editar Extra", "Editar Salário"]);
  });

  it("retries after an error, then teaches an empty tab and creates in its kind", async () => {
    setSearch("k=bill");
    const requests = open({ "GET /api/categories": { status: 500, body: problem(500, "Falhou.") } });
    const listed = () => sent(requests, "GET").filter((request) => request.url.endsWith("/api/categories"));

    expect(await screen.findByText("Não foi possível carregar as categorias.")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(listed()).toHaveLength(2));

    signedIn({ "GET /api/categories": { status: 200, body: [MERCADO] } });
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Nenhuma categoria de Conta ainda.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Criar categoria" }));
    const sheet = await sheetNamed("Nova categoria");
    expect(within(sheet).getByRole("radio", { name: "Conta" })).toHaveAttribute("data-state", "on");
  });

  it("creates a group of the open kind from Nova categoria, Nome focused", async () => {
    setSearch("k=bill");
    const created = { ...MERCADO, id: "c1000000-0000-4000-8000-000000000030", name: "Internet", kind: "bill" };
    const requests = open({ "POST /api/categories": { status: 201, body: created } });

    await list();
    await userEvent.click(screen.getByRole("button", { name: "Nova categoria" }));
    const sheet = await sheetNamed("Nova categoria");
    expect(within(sheet).getByRole("radio", { name: "Grupo" })).toBeChecked();
    expect(within(sheet).getByRole("radio", { name: "Conta" })).toHaveAttribute("data-state", "on");
    await waitFor(() => expect(within(sheet).getByLabelText("Nome")).toHaveFocus());
    await userEvent.keyboard("Internet");
    await userEvent.click(within(sheet).getByRole("button", { name: "Criar" }));

    await waitFor(() => expect(sent(requests, "POST")).toHaveLength(1));
    expect(await sent(requests, "POST")[0].json()).toMatchObject({ name: "Internet", kind: "bill" });
  });

  it("creates in another Tipo and follows it to its tab", async () => {
    const created = { ...SALARIO, id: "c1000000-0000-4000-8000-000000000031", name: "Bônus" };
    const requests = open({ "POST /api/categories": { status: 201, body: created } });

    await list();
    await userEvent.click(screen.getByRole("button", { name: "Nova categoria" }));
    const sheet = await sheetNamed("Nova categoria");
    await userEvent.click(within(sheet).getByRole("radio", { name: "Entrada" }));
    await userEvent.type(within(sheet).getByLabelText("Nome"), "Bônus");
    await userEvent.click(within(sheet).getByRole("button", { name: "Criar" }));

    await waitFor(() => expect(sent(requests, "POST")).toHaveLength(1));
    expect(await sent(requests, "POST")[0].json()).toMatchObject({ name: "Bônus", kind: "income" });
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe("/ajustes/categorias?k=income"));
  });

  it("creates a subcategory from the group's +, its group read-only", async () => {
    const requests = open({ "POST /api/categories": { status: 201, body: { ...VET, name: "Banho" } } });

    await userEvent.click(within(await card("Pets")).getByRole("button", { name: "Nova subcategoria em Pets" }));
    const sheet = await sheetNamed("Nova subcategoria");
    expect(within(sheet).getByText("Dentro de Pets")).toBeInTheDocument();
    expect(within(sheet).queryByRole("radio", { name: "Subcategoria" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("radiogroup", { name: "Dentro de" })).not.toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getByLabelText("Nome")).toHaveFocus());
    await userEvent.keyboard("Banho{Enter}");

    await waitFor(() => expect(sent(requests, "POST")).toHaveLength(1));
    expect(await sent(requests, "POST")[0].json()).toMatchObject({ name: "Banho", parent_id: PETS.id });
  });

  it("edits from a row tap and gives focus back to the row on close", async () => {
    open();

    const row = within(await list()).getByRole("button", { name: "Editar Ração" });
    await userEvent.click(row);
    const sheet = await sheetNamed("Editar categoria");
    expect(within(sheet).getByLabelText("Nome")).toHaveValue("Ração");
    expect(within(sheet).getByRole("button", { name: "Salvar" })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Fechar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(row).toHaveFocus();
  });

  it("gives focus back to Nova categoria on Esc", async () => {
    open();
    await list();

    const button = screen.getByRole("button", { name: "Nova categoria" });
    await userEvent.click(button);
    await sheetNamed("Nova categoria");
    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(button).toHaveFocus();
  });

  it("marks Economia as the cofrinhos, never deletes it and adds a cofrinho from its +", async () => {
    setSearch("k=bill");
    open();

    const economia = within(await list()).getByRole("button", { name: "Editar Economia" });
    expect(within(economia).getByText("Cofrinhos")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Subcategorias de Economia" })).toHaveTextContent(/Reserva.*Viagem/);
    await userEvent.click(economia);
    const edit = await sheetNamed("Editar categoria");
    expect(within(edit).queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
    await userEvent.click(within(edit).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(within(await card("Economia")).getByRole("button", { name: "Novo cofrinho em Economia" }));
    const sheet = await sheetNamed("Novo cofrinho");
    expect(within(sheet).getByLabelText("Meta")).toBeInTheDocument();
  });

  it("opens the same dialog at 1440 px, with no form docked beside the list", async () => {
    window.innerWidth = 1440;
    open();

    await list();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Nova categoria" }));
    expect(await sheetNamed("Nova categoria")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Editar Ração" }));
    expect(within(await sheetNamed("Editar categoria")).getByLabelText("Nome")).toHaveValue("Ração");
  });

  it("changes the kind once and follows it to its tab", async () => {
    const requests = open({
      [`PATCH /api/categories/${MERCADO.id}`]: { status: 200, body: { ...MERCADO, kind: "bill" } },
    });

    await userEvent.click(within(await list()).getByRole("button", { name: "Editar Mercado" }));
    const sheet = await sheetNamed("Editar categoria");
    await userEvent.click(within(sheet).getByRole("radio", { name: "Conta" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Mudar para Conta?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Mudar tipo" }));

    await waitFor(() => expect(window.location.pathname + window.location.search).toBe("/ajustes/categorias?k=bill"));
    expect(sent(requests, "PATCH")).toHaveLength(1);
  });

  describe("deleting", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const archive = async (name: string) => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(within(await list()).getByRole("button", { name: `Editar ${name}` }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Excluir" }));
      return user;
    };

    it("hides a group with its subcategories, holds the archive while Desfazer shows and sends nothing when undone", async () => {
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

    it("sends nothing when the toast is dismissed after Desfazer", async () => {
      const requests = open({ [`DELETE /api/categories/${PETS.id}`]: { status: 204 } });

      const user = await archive("Pets");
      await screen.findByText("Categoria excluída");
      await user.click(screen.getByRole("button", { name: "Desfazer" }));
      act(() => {
        toast.dismiss();
        vi.advanceTimersByTime(6000);
      });

      expect(sent(requests, "DELETE")).toHaveLength(0);
    });

    it("counts a single subcategory in the singular", async () => {
      open({ "GET /api/categories": { status: 200, body: LIST.filter((category) => category !== VET) } });

      await archive("Pets");

      expect(
        await screen.findByText("1 subcategoria também; lançamentos continuam com a categoria."),
      ).toBeInTheDocument();
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
