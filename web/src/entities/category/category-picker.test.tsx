import { useState } from "react";

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import { CARTAO, ECONOMIA, problem, RESERVA, SALARIO, stubApi } from "@/test/stub-api";

import { CategoryPicker } from "./category-picker";

type Category = Schemas["Category"];
type Kind = Schemas["CategoryKind"];

const top = (id: string, name: string, kind: Kind, color: string): Category => ({
  id: `c4000000-0000-4000-8000-0000000000${id}`,
  name,
  kind,
  icon: "tag",
  color,
  is_savings: false,
  is_card_group: false,
});
const sub = (id: string, name: string, kind: Kind, parent: Category): Category => ({
  ...top(id, name, kind, parent.color),
  parent_id: parent.id,
});

const ALIMENTACAO = top("01", "Alimentação", "daily", "cat-1");
const MERCADO = sub("02", "Mercado", "daily", ALIMENTACAO);
const FAMILIA = top("03", "Família", "daily", "cat-2");
const ESCOLA = sub("04", "Escola", "daily", FAMILIA);
const MESADA = sub("05", "Mesada", "bill", FAMILIA);
const CASA = top("06", "Casa", "bill", "cat-3");
const LUZ = sub("07", "Luz", "bill", CASA);
const LIST = [SALARIO, ALIMENTACAO, MERCADO, FAMILIA, ESCOLA, MESADA, CASA, LUZ, CARTAO, ECONOMIA, RESERVA];

const Harness = ({
  kind = "daily",
  onChosen = vi.fn(),
  onNewCard,
  kindLocked,
}: {
  kind?: Kind;
  onChosen?: (category: Category) => void;
  onNewCard?: () => void;
  kindLocked?: boolean;
}) => {
  const [chosen, setChosen] = useState<Category>();
  return (
    <>
      <CategoryPicker
        kind={kind}
        chosen={chosen}
        onChoose={(category) => {
          setChosen(category);
          onChosen(category);
        }}
        entries={[]}
        onNewCard={onNewCard}
        kindLocked={kindLocked}
      />
      <Toaster />
    </>
  );
};

const setup = (props: Parameters<typeof Harness>[0] = {}, replies = {}) => {
  const requests = stubApi({ "GET /api/categories": { status: 200, body: LIST }, ...replies });
  const onChosen = vi.fn();
  renderWithQuery(<Harness onChosen={onChosen} {...props} />);
  return { requests, onChosen };
};

const field = () => screen.getByRole("button", { name: /^Categoria/ });

const openPicker = async () => {
  await userEvent.click(field());
  const sheet = await screen.findByRole("dialog", { name: "Categoria" });
  await within(sheet).findAllByRole("region");
  return sheet;
};

const groups = (sheet: HTMLElement) =>
  within(sheet)
    .getAllByRole("region")
    .map((region) => region.getAttribute("aria-label"));

describe("CategoryPicker", () => {
  beforeEach(() => {
    window.innerWidth = 375;
  });

  it("opens one sheet with search, Mais usadas, every Diário group and Novo grupo; a child is chosen and closes it", async () => {
    const { onChosen } = setup();

    expect(field()).toHaveTextContent("Escolher categoria");
    expect(field()).toHaveClass("min-h-12");
    const sheet = await openPicker();
    const search = within(sheet).getByRole("searchbox", { name: "Buscar categoria" });
    expect(search).toHaveAttribute("placeholder", "Buscar categoria");
    expect(search).toHaveClass("text-base");
    // The sheet body is a scrolling flex column: without shrink-0 the 48 px row collapses to its text.
    expect(search.parentElement).toHaveClass("h-12", "shrink-0");
    expect(await within(sheet).findByText("Mais usadas")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Personalizar" })).toBeInTheDocument();
    expect(groups(sheet)).toEqual(["Alimentação", "Família"]);
    expect(within(sheet).getByRole("button", { name: "Novo grupo" })).toHaveClass("min-h-11");
    expect(within(sheet).queryByText("Ver todas")).not.toBeInTheDocument();
    expect(within(sheet).queryByText(/Excluir|Arquivar/)).not.toBeInTheDocument();

    const mercado = within(within(sheet).getByRole("region", { name: "Alimentação" })).getByRole("button", {
      name: "Mercado",
    });
    expect(mercado).toHaveClass("min-h-11");
    await userEvent.click(mercado);

    expect(onChosen).toHaveBeenCalledWith(MERCADO);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(field()).toHaveTextContent("Alimentação › Mercado");
  });

  it("lists only Entrada groups on Entrada", async () => {
    setup({ kind: "income" });

    expect(groups(await openPicker())).toEqual(["Salário"]);
  });

  it("shows a group of another kind as a header only over its Conta subcategory, named once (D26)", async () => {
    const { onChosen } = setup({ kind: "bill" });

    const sheet = await openPicker();
    expect(groups(sheet)).toEqual(expect.arrayContaining(["Casa", "Cartão", "Economia", "Família"]));
    expect(groups(sheet)).not.toContain("Alimentação");
    const familia = within(sheet).getByRole("region", { name: "Família" });
    expect(within(familia).queryByRole("button", { name: "Família" })).not.toBeInTheDocument();
    expect(within(familia).queryByRole("button", { name: "Escola" })).not.toBeInTheDocument();
    await userEvent.click(within(familia).getByRole("button", { name: "Mesada" }));

    expect(onChosen).toHaveBeenCalledWith(MESADA);
  });

  it("chooses a group of the kind itself from its header", async () => {
    const { onChosen } = setup({ kind: "bill" });

    const sheet = await openPicker();
    await userEvent.click(
      within(within(sheet).getByRole("region", { name: "Casa" })).getByRole("button", { name: "Casa" }),
    );

    expect(onChosen).toHaveBeenCalledWith(CASA);
  });

  it("creates a subcategory from a group's +, locked to it, chosen and closed", async () => {
    const padaria = sub("08", "Padaria", "daily", ALIMENTACAO);
    const { requests, onChosen } = setup({}, { "POST /api/categories": { status: 201, body: padaria } });

    const sheet = await openPicker();
    const plus = within(sheet).getByRole("button", { name: "Adicionar subcategoria em Alimentação" });
    expect(plus).toHaveClass("size-11");
    await userEvent.click(plus);
    const form = await screen.findByRole("dialog", { name: "Nova Categoria" });
    const name = await within(form).findByLabelText("Nome do agrupador");
    expect(within(form).queryByRole("radiogroup", { name: "Escolher grupo" })).not.toBeInTheDocument();
    await userEvent.type(name, "Padaria");
    await userEvent.click(within(form).getByRole("button", { name: "Criar Categoria" }));

    await waitFor(() => expect(onChosen).toHaveBeenCalledWith(padaria));
    expect(await requests.find((request) => request.method === "POST")?.json()).toMatchObject({
      name: "Padaria",
      parent_id: ALIMENTACAO.id,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("creates a group from Novo grupo", async () => {
    const lazer = top("09", "Lazer", "daily", "cat-4");
    const { onChosen } = setup({}, { "POST /api/categories": { status: 201, body: lazer } });

    await userEvent.click(within(await openPicker()).getByRole("button", { name: "Novo grupo" }));
    const form = await screen.findByRole("dialog", { name: "Nova Categoria" });
    expect(within(form).getByRole("radio", { name: "Grupo novo" })).toBeChecked();
    expect(within(form).getByText("Quando acontece")).toBeInTheDocument();
    await userEvent.type(within(form).getByLabelText("Nome do agrupador"), "Lazer{Enter}");

    await waitFor(() => expect(onChosen).toHaveBeenCalledWith(lazer));
  });

  it("uses a same-name category of the other kind instead of creating one", async () => {
    const { requests, onChosen } = setup();

    await userEvent.click(within(await openPicker()).getByRole("button", { name: "Novo grupo" }));
    const form = await screen.findByRole("dialog", { name: "Nova Categoria" });
    await userEvent.type(within(form).getByLabelText("Nome do agrupador"), "Luz");
    await userEvent.click(within(form).getByRole("button", { name: "Usar esta categoria" }));

    expect(onChosen).toHaveBeenCalledWith(LUZ);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("opens Novo cartão from the card group, never the category form; no + on Economia", async () => {
    const onNewCard = vi.fn();
    setup({ kind: "bill", onNewCard });

    const sheet = await openPicker();
    const cartao = within(sheet).getByRole("region", { name: "Cartão" });
    expect(within(cartao).queryByRole("button", { name: /^Adicionar subcategoria/ })).not.toBeInTheDocument();
    await userEvent.click(within(cartao).getByRole("button", { name: "Novo cartão" }));

    expect(onNewCard).toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Nova Categoria" })).not.toBeInTheDocument();
    const economia = within(sheet).getByRole("region", { name: "Economia" });
    expect(within(economia).queryByRole("button", { name: /^Adicionar/ })).not.toBeInTheDocument();
  });

  it("opens the subcategory form from the card group without onNewCard", async () => {
    setup({ kind: "bill" });

    await userEvent.click(within(await openPicker()).getByRole("button", { name: "Adicionar subcategoria em Cartão" }));

    expect(await screen.findByRole("dialog", { name: "Nova Categoria" })).toBeInTheDocument();
  });

  it("filters the groups and their children, and teaches Novo grupo when nothing matches", async () => {
    setup();

    const sheet = await openPicker();
    const search = within(sheet).getByRole("searchbox", { name: "Buscar categoria" });
    await userEvent.type(search, "MERC");
    expect(groups(sheet)).toEqual(["Alimentação"]);
    expect(
      within(within(sheet).getByRole("region", { name: "Alimentação" })).getByRole("button", { name: "Mercado" }),
    ).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, "zzz");
    expect(within(sheet).getByText("Nenhuma categoria encontrada.")).toBeInTheDocument();
    expect(within(sheet).queryByRole("region")).not.toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Novo grupo" })).toBeInTheDocument();
  });

  it("says Nenhuma categoria ainda when the kind has none, Novo grupo still there", async () => {
    setup({}, { "GET /api/categories": { status: 200, body: [SALARIO] } });

    await userEvent.click(field());
    const sheet = await screen.findByRole("dialog", { name: "Categoria" });
    expect(await within(sheet).findByText("Nenhuma categoria ainda")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Novo grupo" })).toBeInTheDocument();
  });

  it("offers a retry when the categories fail, with no list and no pinned row", async () => {
    setup({}, { "GET /api/categories": { status: 500, body: problem(500, "Falhou.") } });

    await userEvent.click(field());
    const sheet = await screen.findByRole("dialog", { name: "Categoria" });
    expect(await within(sheet).findByText("Não foi possível carregar as categorias.")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
    expect(within(sheet).queryByText("Mais usadas")).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("region")).not.toBeInTheDocument();
  });

  it("shows the pinned row's placeholders and three group placeholders while loading", async () => {
    vi.stubGlobal("fetch", () => new Promise(() => undefined));
    renderWithQuery(<Harness />);

    await userEvent.click(field());
    const sheet = await screen.findByRole("dialog", { name: "Categoria" });
    expect(sheet.querySelectorAll('[data-slot="skeleton"].rounded-full')).toHaveLength(8);
    expect(sheet.querySelectorAll('[data-slot="skeleton"].rounded-2xl')).toHaveLength(3);
  });

  it("ties the error to the field", () => {
    stubApi({ "GET /api/categories": { status: 200, body: LIST } });
    renderWithQuery(
      <CategoryPicker kind="daily" chosen={undefined} onChoose={vi.fn()} entries={[]} error="Escolha uma categoria" />,
    );

    expect(field()).toHaveAccessibleDescription("Escolha uma categoria");
    expect(field()).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps every flow on the kind when kindLocked: no Quando acontece, no Usar esta categoria", async () => {
    setup({ kindLocked: true });

    await userEvent.click(within(await openPicker()).getByRole("button", { name: "Novo grupo" }));
    const form = await screen.findByRole("dialog", { name: "Nova Categoria" });
    await userEvent.type(within(form).getByLabelText("Nome do agrupador"), "Luz");

    expect(within(form).queryByText("Quando acontece")).not.toBeInTheDocument();
    expect(within(form).queryByRole("button", { name: "Usar esta categoria" })).not.toBeInTheDocument();
  });

  it("clears the search when the sheet closes", async () => {
    setup();

    const sheet = await openPicker();
    await userEvent.type(within(sheet).getByRole("searchbox", { name: "Buscar categoria" }), "MERC");
    await userEvent.click(within(sheet).getByRole("button", { name: "Mercado" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const reopened = await openPicker();
    expect(within(reopened).getByRole("searchbox", { name: "Buscar categoria" })).toHaveValue("");
    expect(groups(reopened)).toContain("Família");
  });

  it("returns focus to the Categoria field when a choice or Esc closes the sheet", async () => {
    setup();

    await userEvent.click(within(await openPicker()).getByRole("button", { name: "Mercado" }));
    await waitFor(() => expect(field()).toHaveFocus());

    await openPicker();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(field()).toHaveFocus());
  });

  it("returns focus to the group's + when the subcategory form closes on Esc, and to the field once it saves", async () => {
    const padaria = sub("08", "Padaria", "daily", ALIMENTACAO);
    setup({}, { "POST /api/categories": { status: 201, body: padaria } });

    const sheet = await openPicker();
    const plus = within(sheet).getByRole("button", { name: "Adicionar subcategoria em Alimentação" });
    await userEvent.click(plus);
    await screen.findByRole("dialog", { name: "Nova Categoria" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Nova Categoria" })).not.toBeInTheDocument());
    await waitFor(() => expect(plus).toHaveFocus());

    await userEvent.click(plus);
    const form = await screen.findByRole("dialog", { name: "Nova Categoria" });
    await userEvent.type(await within(form).findByLabelText("Nome do agrupador"), "Padaria");
    await userEvent.click(within(form).getByRole("button", { name: "Criar Categoria" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(field()).toHaveFocus());
  });
});
