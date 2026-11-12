import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { router, setSearch } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import {
  ALUGUEL,
  COMIDA,
  ECONOMIA,
  EXTRA,
  LUZ,
  MERCADO,
  problem,
  RESERVA,
  SALARIO,
  signedIn,
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
};
const RACAO: Category = { ...PETS, id: "c1000000-0000-4000-8000-000000000011", name: "Ração", parent_id: PETS.id };
const VET: Category = { ...PETS, id: "c1000000-0000-4000-8000-000000000012", name: "Veterinário", parent_id: PETS.id };
const IMPORTADO: Category = {
  id: "c1000000-0000-4000-8000-000000000020",
  name: "Importado (diário)",
  kind: "daily",
  icon: "circle-dashed",
  color: "cat-12",
  is_savings: false,
};
/** In the API's order: kind, parent name, then the children by name. */
const LIST = [EXTRA, SALARIO, ALUGUEL, ECONOMIA, RESERVA, VIAGEM, LUZ, COMIDA, IMPORTADO, MERCADO, PETS, RACAO, VET];

const EMPTY_REPORT = { month: "2026-11", outflow_total: "0", income_total: "0", outflow: [], income: [], groups: [] };
const REPORT = {
  ...EMPTY_REPORT,
  outflow_total: "565.00",
  outflow: [{ ...RACAO, category_id: RACAO.id, amount: "300.00", pct: "53.1", previous_amount: "0" }],
  groups: [
    {
      ...PETS,
      category_id: PETS.id,
      amount: "300.00",
      pct: "53.1",
      previous_amount: "0",
      delta_pct: null,
      children: [RACAO.id],
    },
  ],
};

const open = (replies: Record<string, Reply> = {}) => {
  const requests = signedIn({
    "GET /api/categories": { status: 200, body: LIST },
    "GET /api/reports/categories": { status: 200, body: EMPTY_REPORT },
    "GET /api/transactions": { status: 200, body: [] },
    ...replies,
  });
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
const card = async (name: string) => within(await list()).getByRole("listitem", { name });
const menu = async (name: string, user = userEvent.setup()) => {
  await user.click(within(await list()).getByRole("button", { name: `Mais ações de ${name}` }));
  const items = within(await screen.findByRole("menu")).getAllByRole("menuitem");
  return { user, items, labels: items.map((item) => item.textContent) };
};
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

  it("opens on Gastos Diários: a card per parent with its subcategories, imported ones too", async () => {
    open();

    expect(screen.getByRole("heading", { level: 1, name: "Categorias & Subcategorias" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configurações" })).toHaveAttribute("href", "/ajustes");
    expect(screen.getByText("Gestão de Categorias")).toBeInTheDocument();
    const daily = await list();
    expect(screen.getByRole("radio", { name: "Gastos Diários (4)" })).toBeChecked();
    expect(screen.getAllByRole("radio").map((tab) => tab.textContent)).toEqual([
      "Gastos Diários (4)",
      "Contas Fixas (3)",
      "Entradas & Receitas (2)",
    ]);
    expect(daily).toHaveAccessibleName("Categorias de Gastos Diários");
    expect(names(daily)).toEqual([
      "Editar Comida fora",
      "Editar Importado (diário)",
      "Editar Mercado",
      "Editar Pets",
      "Editar Ração",
      "Editar Veterinário",
    ]);
    const pets = await card("Pets");
    expect(within(pets).getByText("Diário · 2 subcategorias")).toBeInTheDocument();
    expect(names(within(pets).getByRole("list", { name: "Subcategorias de Pets" }))).toEqual([
      "Editar Ração",
      "Editar Veterinário",
    ]);
    expect(within(daily).getAllByRole("button", { name: /^Mais ações de / })).toHaveLength(4);
  });

  it("counts the active structure across kinds", async () => {
    open();

    const tile = await screen.findByRole("region", { name: "ESTRUTURA ATIVA" });
    expect(tile).toHaveTextContent("9categorias principais");
    expect(within(tile).getByText("4 subcategorias vinculadas")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "MAIOR CONCENTRAÇÃO" })).not.toBeInTheDocument();
  });

  it("shows the month's totals, entry counts and the largest group", async () => {
    setSearch("m=2026-11");
    const entry = { id: "t1", date: "2026-11-05", amount: "300.00", kind: "daily", note: "", category: RACAO };
    open({
      "GET /api/reports/categories": { status: 200, body: REPORT },
      "GET /api/transactions": { status: 200, body: [entry] },
    });

    const top = await screen.findByRole("region", { name: "MAIOR CONCENTRAÇÃO" });
    expect(top).toHaveTextContent("Pets(Ração)");
    expect(within(top).getByText("53,1% dos gastos de Nov")).toBeInTheDocument();
    const pets = await card("Pets");
    expect(within(pets).getByText("Total no mês").nextSibling).toHaveTextContent(/300,00/);
    const racao = within(pets).getByRole("button", { name: "Editar Ração" });
    expect(racao).toHaveTextContent(/1 lanç\..*300,00/);
    expect(within(pets).getByRole("button", { name: "Editar Veterinário" })).toHaveTextContent(/^Veterinário.*0,00$/);
    expect(within(await card("Mercado")).getByText("Total no mês").nextSibling).toHaveTextContent(/0,00/);
  });

  it("filters parents and children ignoring case and accents", async () => {
    open();
    await list();

    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar categoria" }), "RACAO");
    expect(names(await list())).toEqual(["Editar Pets", "Editar Ração"]);

    await userEvent.clear(screen.getByRole("searchbox", { name: "Buscar categoria" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar categoria" }), "zzz");
    expect(await screen.findByText("Nenhuma categoria encontrada.")).toBeInTheDocument();
  });

  it("offers Editar and Excluir on a parent's kebab", async () => {
    open();

    expect(within(await list()).queryByRole("button", { name: "Mais ações de Ração" })).not.toBeInTheDocument();
    expect((await menu("Pets")).labels).toEqual(["Editar", "Excluir"]);
  });

  it("opens the edit sheet from the kebab's Editar", async () => {
    open();

    const { user, items } = await menu("Mercado");
    await user.click(items[0]);

    const sheet = await screen.findByRole("dialog", { name: "Editar Categoria" });
    expect(within(sheet).getByLabelText("Nome do agrupador")).toHaveValue("Mercado");
  });

  it("opens the kebab with Enter and gives focus back to it on Esc", async () => {
    open();
    const user = userEvent.setup();

    const kebab = within(await list()).getByRole("button", { name: "Mais ações de Mercado" });
    kebab.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(kebab).toHaveFocus();
  });

  it("switches kind through ?k=, keeping the month", async () => {
    setSearch("m=2026-11");
    open();

    await userEvent.click(screen.getByRole("radio", { name: /^Entradas & Receitas/ }));

    expect(router.replace).toHaveBeenCalledWith("/ajustes/categorias?m=2026-11&k=income", { scroll: false });
  });

  it("reads the kind from ?k=", async () => {
    setSearch("k=income");
    open();

    expect(screen.getByRole("radio", { name: /^Entradas & Receitas/ })).toBeChecked();
    expect(names(await list())).toEqual(["Editar Extra", "Editar Salário"]);
  });

  it("says when a kind has no categories yet, and retries after an error", async () => {
    setSearch("k=bill");
    const requests = open({ "GET /api/categories": { status: 500, body: problem(500, "Falhou.") } });
    const listed = () => sent(requests, "GET").filter((request) => request.url.endsWith("/api/categories"));

    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(listed()).toHaveLength(2));

    signedIn({ "GET /api/categories": { status: 200, body: [MERCADO] } });
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Nenhuma categoria aqui ainda")).toBeInTheDocument();
  });

  it("creates a category of the open kind from the header", async () => {
    setSearch("k=bill");
    const created = { ...MERCADO, id: "c1000000-0000-4000-8000-000000000030", name: "Internet", kind: "bill" };
    const requests = open({ "POST /api/categories": { status: 201, body: created } });

    await list();
    await userEvent.click(screen.getByRole("button", { name: "Nova Categoria" }));
    const sheet = await screen.findByRole("dialog", { name: "Nova Categoria" });
    expect(within(sheet).getByRole("radio", { name: "Categoria Pai" })).toBeChecked();
    expect(within(sheet).getByRole("radio", { name: "Fixa" })).toBeChecked();
    await userEvent.type(within(sheet).getByLabelText("Nome do agrupador"), "Internet{Enter}");

    await waitFor(() => expect(sent(requests, "POST")).toHaveLength(1));
    expect(await sent(requests, "POST")[0].json()).toMatchObject({ name: "Internet", kind: "bill" });
  });

  it("creates in another Tipo de Fluxo and follows it to its tab", async () => {
    const created = { ...SALARIO, id: "c1000000-0000-4000-8000-000000000031", name: "Bônus" };
    const requests = open({ "POST /api/categories": { status: 201, body: created } });

    await list();
    await userEvent.click(screen.getByRole("button", { name: "Nova Categoria" }));
    const sheet = await screen.findByRole("dialog", { name: "Nova Categoria" });
    await userEvent.click(within(sheet).getByRole("radio", { name: "Entrada" }));
    await userEvent.type(within(sheet).getByLabelText("Nome do agrupador"), "Bônus");
    expect(within(sheet).getByText("Prévia em tempo real").parentElement).toHaveTextContent("Bônus");
    await userEvent.click(within(sheet).getByRole("button", { name: "Criar Categoria" }));

    await waitFor(() => expect(sent(requests, "POST")).toHaveLength(1));
    expect(await sent(requests, "POST")[0].json()).toMatchObject({ name: "Bônus", kind: "income" });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/ajustes/categorias?k=income", { scroll: false }));
  });

  it("creates a subcategory from the card's Adicionar subcategoria, its parent preset", async () => {
    const requests = open({ "POST /api/categories": { status: 201, body: { ...VET, name: "Banho" } } });

    await userEvent.click(within(await card("Pets")).getByRole("button", { name: "Adicionar subcategoria" }));
    const sheet = await screen.findByRole("dialog", { name: "Nova Categoria" });
    expect(within(sheet).getByRole("radio", { name: "Subcategoria" })).toBeChecked();
    const parents = within(sheet).getByRole("radiogroup", { name: "Vincular à Categoria Pai" });
    expect(within(parents).getByRole("radio", { name: "Pets" })).toBeChecked();
    expect(within(sheet).queryByRole("group", { name: /^Cor de Destaque/ })).not.toBeInTheDocument();
    await userEvent.type(within(sheet).getByLabelText("Nome do agrupador"), "Banho{Enter}");

    await waitFor(() => expect(sent(requests, "POST")).toHaveLength(1));
    expect(await sent(requests, "POST")[0].json()).toMatchObject({ name: "Banho", parent_id: PETS.id });
  });

  it("opens the edit sheet from a row", async () => {
    open();

    await userEvent.click(within(await list()).getByRole("button", { name: "Editar Ração" }));
    const sheet = await screen.findByRole("dialog", { name: "Editar Categoria" });
    expect(within(sheet).getByLabelText("Nome do agrupador")).toHaveValue("Ração");
    expect(within(sheet).getByRole("button", { name: "Salvar Categoria" })).toBeInTheDocument();
  });

  it("marks Economia as the cofrinhos, never deletes it and adds a cofrinho from its card", async () => {
    setSearch("k=bill");
    open();

    const economia = within(await list()).getByRole("button", { name: "Editar Economia" });
    expect(within(economia).getByText("Cofrinhos")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Subcategorias de Economia" })).toHaveTextContent(/Reserva.*Viagem/);
    expect((await menu("Economia")).labels).toEqual(["Editar"]);
    await userEvent.keyboard("{Escape}");
    await userEvent.click(within(await card("Economia")).getByRole("button", { name: "Adicionar cofrinho" }));

    const sheet = await screen.findByRole("dialog", { name: "Novo cofrinho" });
    expect(within(sheet).getByLabelText("Meta")).toBeInTheDocument();
  });

  it("keeps the form in a side panel at 1280 px and up", async () => {
    window.innerWidth = 1440;
    open();

    const panel = await screen.findByRole("complementary", { name: "Nova Categoria" });
    expect(within(panel).getByText("Configuração")).toBeInTheDocument();
    await userEvent.click(within(await list()).getByRole("button", { name: "Editar Ração" }));

    const editing = await screen.findByRole("complementary", { name: "Editar Categoria" });
    expect(within(editing).getByLabelText("Nome do agrupador")).toHaveValue("Ração");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  describe("deleting", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const archive = async (name: string) => {
      const { user } = await menu(name, userEvent.setup({ advanceTimers: vi.advanceTimersByTime }));
      await user.click(screen.getByRole("menuitem", { name: "Excluir" }));
      return user;
    };

    const archiveFromSheet = async (name: string) => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(within(await list()).getByRole("button", { name: `Editar ${name}` }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Excluir" }));
      return user;
    };

    it("hides a parent with its subcategories, holds the archive while Desfazer shows and sends nothing when undone", async () => {
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

    it("counts a single subcategory in the singular", async () => {
      open({ "GET /api/categories": { status: 200, body: LIST.filter((category) => category !== VET) } });

      await archive("Pets");

      expect(
        await screen.findByText("1 subcategoria também; lançamentos continuam com a categoria."),
      ).toBeInTheDocument();
    });

    it("deletes from the edit sheet the same way", async () => {
      open();

      await archiveFromSheet("Mercado");

      expect(await screen.findByText("Categoria excluída")).toBeInTheDocument();
      expect(screen.getByText("Lançamentos continuam com a categoria.")).toBeInTheDocument();
    });

    it("deletes once the toast is gone; a subcategory only says the entries stay", async () => {
      const requests = open({ [`DELETE /api/categories/${RACAO.id}`]: { status: 204 } });

      await archiveFromSheet("Ração");
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

      await archiveFromSheet("Reserva");
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
