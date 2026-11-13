import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { KEYPAD_QUERY } from "@/shared/ui/amount-keypad";
import { pickDate } from "@/test/pick-date";
import { renderWithQuery } from "@/test/render";
import {
  ALUGUEL,
  BILL_ALUGUEL,
  CATEGORIES,
  COMIDA,
  EXTRA,
  MERCADO,
  problem,
  RESERVA,
  SALARIO,
  SETTINGS,
  stubApi,
  TRANSACTIONS,
  WITH_COFRINHOS,
} from "@/test/stub-api";

import { TransactionSheet } from "./transaction-sheet";

const MERCADO_ROW = TRANSACTIONS[0];
const ALUGUEL_ROW = TRANSACTIONS[1];
const MEMBER = {
  ...ALUGUEL_ROW,
  series: { id: "s1", position: 3, total: 12, last_date: "2027-09-04", open_ended: false, every: "month" as const },
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
  ...PETS,
  id: "c1000000-0000-4000-8000-000000000011",
  name: "Ração",
  parent_id: PETS.id,
};

const coarse = () => {
  const base = window.matchMedia("");
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    ...base,
    media: query,
    matches: query === KEYPAD_QUERY,
  }));
};

const FOOTER = '[data-slot="responsive-sheet-footer"]';
const DESCRIPTION = "Cadastre uma movimentação pontual ou recorrente";

type SheetProps = Parameters<typeof TransactionSheet>[0];

/** Stands in for the host's bill sheet: saves the prefill as is. */
const billSheet: NonNullable<SheetProps["billSheet"]> = ({ prefill, onCreate }) => (
  <button type="button" onClick={() => onCreate(prefill)}>
    Criar conta
  </button>
);

const setup = (props: Partial<SheetProps> = {}, replies = {}) => {
  const requests = stubApi({
    "GET /api/categories": { status: 200, body: CATEGORIES },
    "POST /api/transactions": { status: 201, body: MERCADO_ROW },
    [`PATCH /api/transactions/${MERCADO_ROW.id}`]: { status: 200, body: MERCADO_ROW },
    ...replies,
  });
  const onOpenChange = vi.fn();
  renderWithQuery(
    <>
      <TransactionSheet open onOpenChange={onOpenChange} {...props} />
      <Toaster />
    </>,
  );
  const sent = async (method: string) => {
    await waitFor(() => expect(requests.some((request) => request.method === method)).toBe(true));
    return requests.find((request) => request.method === method)?.json();
  };
  return { requests, onOpenChange, sent };
};

describe("TransactionSheet", () => {
  beforeEach(() => {
    window.innerWidth = 375;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves a Diário with the defaults: type the amount, tap Salvar", async () => {
    const { onOpenChange, sent } = setup();

    const dialog = await screen.findByRole("dialog", { name: "Novo Registro" });
    expect(dialog).toHaveAttribute("data-slot", "sheet-content");
    expect(dialog).toHaveAccessibleDescription(DESCRIPTION);
    expect(within(dialog).getByText(DESCRIPTION)).toHaveClass("sr-only");
    expect(within(dialog).getByRole("button", { name: "Salvar Lançamento" }).closest(FOOTER)).not.toBeNull();
    expect(await screen.findByRole("radio", { name: "Comida fora" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Diário" })).toBeChecked();
    await userEvent.keyboard("35,90");
    expect(screen.getByLabelText("Valor do gasto")).toHaveValue("35,90");
    expect(screen.getByText(",90")).toHaveClass("text-muted-foreground");
    expect(screen.getByText("Quando foi?")).not.toHaveClass("sr-only");
    expect(screen.getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Outra data" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    expect(await sent("POST")).toEqual({
      date: "2026-11-05",
      amount: "35.90",
      kind: "daily",
      category_id: COMIDA.id,
      note: null,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(await screen.findByText("Lançado")).toBeInTheDocument();
  });

  it("shows the keypad on a coarse pointer under 1024 px, with the system keyboard closed", async () => {
    const base = window.matchMedia("");
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      ...base,
      media: query,
      matches: query === KEYPAD_QUERY,
    }));
    setup();

    const amount = await screen.findByLabelText(/^Valor d/);
    expect(amount).toHaveAttribute("inputmode", "none");
    await userEvent.click(screen.getByRole("button", { name: "4" }));
    await userEvent.click(screen.getByRole("button", { name: "2" }));
    expect(amount).toHaveValue("42,00");
  });

  it("types 12.345,67 on the keypad like a calculator and Apagar drops the last cent typed", async () => {
    coarse();
    setup();

    const amount = await screen.findByLabelText(/^Valor d/);
    for (const key of ["1", "2", "3", "4", "5", ",", "6", "7"])
      await userEvent.click(screen.getByRole("button", { name: key }));
    expect(amount).toHaveValue("12.345,67");
    await userEvent.click(screen.getByRole("button", { name: "Apagar" }));
    expect(amount).toHaveValue("12.345,60");
  });

  it("saves a subcategory picked from the parent's Sub: pills", async () => {
    const { sent } = setup({}, { "GET /api/categories": { status: 200, body: [...CATEGORIES, PETS, RACAO] } });

    await userEvent.click(await screen.findByRole("radio", { name: "Pets" }));
    await userEvent.click(screen.getByRole("radio", { name: "Pets › Ração" }));
    await userEvent.type(screen.getByLabelText(/^Valor d/), "4590");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    expect(await sent("POST")).toMatchObject({ amount: "45.90", category_id: RACAO.id });
  });

  it("keeps the numeric system keyboard and no keypad elsewhere", async () => {
    setup();

    expect(await screen.findByLabelText(/^Valor d/)).toHaveAttribute("inputmode", "numeric");
    expect(screen.queryByRole("button", { name: "Apagar" })).not.toBeInTheDocument();
  });

  it("ranks the category row by the current month's entries and keeps the preset chosen", async () => {
    const used = TRANSACTIONS.map((row) => ({ ...row, kind: "daily" as const, category: COMIDA }));
    setup({}, { "GET /api/transactions?month=2026-11": { status: 200, body: used } });

    const row = await screen.findByRole("radiogroup", { name: "Categoria" });
    await waitFor(() =>
      expect(
        within(row)
          .getAllByRole("radio")
          .map((radio) => radio.textContent),
      ).toEqual(["Comida fora", "Mercado"]),
    );
    expect(within(row).getByRole("radio", { name: "Comida fora" })).toHaveAttribute("aria-checked", "true");
  });

  it("switches kind, preselects its first category and takes yesterday and a note", async () => {
    const { sent } = setup();

    await userEvent.click(await screen.findByRole("radio", { name: "Entrada" }));
    expect(await screen.findByRole("radio", { name: "Salário" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("button", { name: "Ver todas" }));
    await userEvent.click(await screen.findByRole("option", { name: "Extra" }));
    await userEvent.type(screen.getByLabelText("Valor da entrada"), "abc1.250,00");
    await userEvent.click(screen.getByRole("button", { name: "Ontem" }));
    const note = screen.getByRole("textbox", { name: "Observação" });
    expect(note).toHaveAttribute("placeholder", "Adicionar nota ou observação...");
    expect(screen.queryByRole("button", { name: "Limpar observação" })).not.toBeInTheDocument();
    await userEvent.type(note, "Rascunho");
    await userEvent.click(screen.getByRole("button", { name: "Limpar observação" }));
    expect(note).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Limpar observação" })).not.toBeInTheDocument();
    await userEvent.type(note, "Freela");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    expect(await sent("POST")).toEqual({
      date: "2026-11-04",
      amount: "1250.00",
      kind: "income",
      category_id: EXTRA.id,
      note: "Freela",
    });
  });

  it("opens as a Saída in the given cofrinho, labelled under Economia", async () => {
    const { sent } = setup(
      { initialKind: "bill", initialCategory: RESERVA },
      { "GET /api/categories": { status: 200, body: WITH_COFRINHOS } },
    );

    expect(await screen.findByRole("radio", { name: "Economia › Reserva" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Conta" })).toBeChecked();
    await userEvent.keyboard("200,00");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    expect(await sent("POST")).toMatchObject({ amount: "200.00", kind: "bill", category_id: RESERVA.id });
  });

  it("takes any date from the date input", async () => {
    const { sent } = setup();

    await userEvent.type(await screen.findByLabelText(/^Valor d/), "10");
    await pickDate("Outra data", "2026-10-28");
    await waitFor(() => expect(screen.getByRole("button", { name: "Outra data, 28/10/2026" })).toHaveFocus());
    expect(screen.getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    expect(await sent("POST")).toMatchObject({ date: "2026-10-28" });
  });

  it("offers no day before the opening date: Ontem leaves and the calendar disables it", async () => {
    setup({}, { "GET /api/settings": { status: 200, body: { ...SETTINGS, opening_date: "2026-11-05" } } });

    const dialog = await screen.findByRole("dialog", { name: "Novo Registro" });
    await waitFor(() => expect(within(dialog).queryByRole("button", { name: "Ontem" })).not.toBeInTheDocument());
    expect(within(dialog).getByRole("button", { name: "Hoje" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Outra data" }));

    expect(await screen.findByRole("button", { name: "quarta-feira, 4 de novembro de 2026" })).toBeDisabled();
  });

  it("asks for an amount and a category inline, without calling the API", async () => {
    const { requests } = setup({}, { "GET /api/categories": { status: 200, body: [SALARIO] } });

    await userEvent.click(await screen.findByRole("button", { name: "Salvar Lançamento" }));
    expect(await screen.findByText("Informe um valor")).toBeInTheDocument();
    const row = screen.getByRole("radiogroup", { name: "Categoria" });
    expect(row).toHaveAttribute("aria-invalid", "true");
    expect(row).toHaveAccessibleDescription("Escolha uma categoria");

    await userEvent.type(screen.getByLabelText(/^Valor d/), "0");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));
    expect(screen.getByText("Informe um valor")).toBeInTheDocument();
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);
  });

  it("edits a transaction with its values filled in and sends the patch", async () => {
    const { onOpenChange, sent } = setup({ transaction: MERCADO_ROW });

    expect(await screen.findByRole("dialog", { name: "Editar lançamento" })).toBeInTheDocument();
    const amount = screen.getByLabelText(/^Valor d/);
    expect(amount).toHaveValue("184,31");
    expect(screen.getByLabelText("Observação")).toHaveValue("Compras da semana");
    expect(await screen.findByRole("radio", { name: "Mercado" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.clear(amount);
    await userEvent.type(amount, "20000");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    expect(await sent("PATCH")).toEqual({
      date: "2026-11-05",
      amount: "200.00",
      kind: "daily",
      category_id: MERCADO_ROW.category.id,
      note: "Compras da semana",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(await screen.findByText("Lançamento atualizado")).toBeInTheDocument();
  });

  describe("on a credit card (D28)", () => {
    const PORTO: Schemas["Bill"] = {
      id: "b1000000-0000-4000-8000-000000000009",
      category_id: BILL_ALUGUEL.category_id,
      name: "Porto",
      amount: null,
      closing_day: 3,
      due_day: 10,
      active: true,
    };
    const withCard = { "GET /api/bills": { status: 200, body: [BILL_ALUGUEL, PORTO] } };
    const cardField = () => screen.findByRole("combobox", { name: "Cartão" });

    it("offers Cartão on Diário with Nenhum first and posts the card", async () => {
      const { sent } = setup({}, withCard);

      const field = await cardField();
      expect(
        within(field)
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual(["Nenhum", "Porto"]);
      expect(field).toHaveValue("");
      await userEvent.selectOptions(field, "Porto");
      await userEvent.type(screen.getByLabelText(/^Valor d/), "3590");
      await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

      expect(await sent("POST")).toMatchObject({ kind: "daily", amount: "35.90", card_id: PORTO.id });
    });

    it("hides Cartão with no card", async () => {
      setup({}, { "GET /api/bills": { status: 200, body: [BILL_ALUGUEL] } });

      expect(await screen.findByRole("radio", { name: "Comida fora" })).toBeInTheDocument();
      expect(screen.queryByRole("combobox", { name: "Cartão" })).not.toBeInTheDocument();
    });

    it("drops the card when the kind leaves Diário", async () => {
      const { sent } = setup({}, withCard);

      await userEvent.selectOptions(await cardField(), "Porto");
      await userEvent.click(screen.getByRole("radio", { name: "Conta" }));
      expect(screen.queryByRole("combobox", { name: "Cartão" })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("radio", { name: "Diário" }));
      expect(await cardField()).toHaveValue("");
      await userEvent.click(screen.getByRole("radio", { name: "Conta" }));
      await userEvent.click(screen.getByLabelText(/^Valor d/));
      await userEvent.keyboard("10");
      await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

      expect(await sent("POST")).not.toHaveProperty("card_id");
    });

    it("keeps the card on every member of a counted Recorrente", async () => {
      const { sent } = setup({}, withCard);

      await userEvent.selectOptions(await cardField(), "Porto");
      await userEvent.click(screen.getByRole("switch", { name: "Recorrente" }));
      await userEvent.click(screen.getByRole("radio", { name: "3" }));
      await userEvent.click(screen.getByLabelText(/^Valor d/));
      await userEvent.keyboard("90");
      await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

      expect(await sent("POST")).toMatchObject({ repeat_months: 3, repeat_every: "month", card_id: PORTO.id });
    });

    it("sends Sempre on a card spend as an open series on the card", async () => {
      const { sent } = setup({}, withCard);

      await userEvent.selectOptions(await cardField(), "Porto");
      await userEvent.click(screen.getByRole("switch", { name: "Recorrente" }));
      expect(screen.getByRole("radio", { name: "Sempre" })).toBeChecked();
      await userEvent.click(screen.getByLabelText(/^Valor d/));
      await userEvent.keyboard("2190");
      await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

      const body = await sent("POST");
      expect(body).toMatchObject({ amount: "21.90", open_ended: true, repeat_every: "month", card_id: PORTO.id });
      expect(body).not.toHaveProperty("repeat_months");
    });

    it("preselects the card when editing and Nenhum takes it off", async () => {
      const { sent } = setup({ transaction: { ...MERCADO_ROW, card_id: PORTO.id } }, withCard);

      const field = await cardField();
      await waitFor(() => expect(field).toHaveValue(PORTO.id));
      await userEvent.selectOptions(field, "Nenhum");
      await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

      expect(await sent("PATCH")).toMatchObject({ card_id: null });
    });
  });

  it("tells when the server refuses", async () => {
    setup({}, { "POST /api/transactions": { status: 422, body: problem(422, "amount") } });

    await userEvent.type(await screen.findByLabelText(/^Valor d/), "5");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    expect(await screen.findByText("Não foi possível salvar o lançamento.")).toBeInTheDocument();
  });

  it("creates a category from the picker, selects it and keeps the sheet open", async () => {
    const carro = { ...MERCADO, id: "c1000000-0000-4000-8000-000000000099", name: "Carro", icon: "car" };
    setup();

    await userEvent.click(await screen.findByRole("button", { name: "Ver todas" }));
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Categoria" })).getByRole("button", { name: "Nova categoria" }),
    );
    const create = await screen.findByRole("dialog", { name: "Nova Categoria" });
    const requests = stubApi({
      "GET /api/categories": { status: 200, body: [...CATEGORIES, carro] },
      "POST /api/categories": { status: 201, body: carro },
    });
    await userEvent.type(within(create).getByLabelText("Nome do agrupador"), "Carro{Enter}");

    expect(await screen.findByRole("radio", { name: "Carro" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("dialog", { name: "Novo Registro" })).toBeInTheDocument();
    expect(requests.filter((request) => request.url.endsWith("/api/transactions"))).toHaveLength(0);
  });

  it("repeats a launch: Recorrente on preselects Sempre, a count changes the summary and the POST", async () => {
    const { sent } = setup();

    const repeat = await screen.findByRole("switch", { name: "Recorrente" });
    expect(repeat).not.toBeChecked();
    expect(screen.queryByRole("radio", { name: "Sempre" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Valor d/), "15000");
    await userEvent.click(repeat);

    const counts = screen.getByRole("radiogroup", { name: "Quantas vezes" });
    expect(
      within(counts)
        .getAllByRole("radio")
        .map((chip) => chip.textContent),
    ).toEqual(["Sempre", "2", "3", "6", "12", "Outro"]);
    expect(screen.getByText("Quantas vezes")).toBeVisible();
    expect(screen.getByRole("radio", { name: "Sempre" })).toBeChecked();
    expect(screen.getByText("Repete todo dia 5, sem data para parar.")).toBeInTheDocument();
    expect(screen.queryByText("Em meses mais curtos, cai no último dia.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "3" }));
    expect(screen.getByText("3× de R$ 150,00 · repete todo dia 5 até jan 2027")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    const body = await sent("POST");
    expect(body).toMatchObject({ amount: "150.00", repeat_months: 3, repeat_every: "month" });
    expect(body).not.toHaveProperty("open_ended");
    expect(await screen.findByText("3 lançamentos criados")).toBeInTheDocument();
  });

  it("sends Sempre on an Entrada as an open series, with no Começa na parcela", async () => {
    const { sent } = setup({ initialKind: "income" });

    await userEvent.type(await screen.findByLabelText(/^Valor d/), "500000");
    await userEvent.click(screen.getByRole("switch", { name: "Recorrente" }));
    expect(screen.queryByRole("button", { name: "Já começou em outra parcela?" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "6" }));
    expect(screen.queryByRole("button", { name: "Já começou em outra parcela?" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Sempre" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    const body = await sent("POST");
    expect(body).toMatchObject({ kind: "income", amount: "5000.00", open_ended: true, repeat_every: "month" });
    expect(body).not.toHaveProperty("repeat_months");
    expect(await screen.findByText("Lançado")).toBeInTheDocument();
  });

  it("refuses Sempre on a Conta, offering Criar como Conta Fixa; a count still submits", async () => {
    const { requests, sent } = setup({ initialKind: "bill", billSheet });

    await userEvent.type(await screen.findByLabelText(/^Valor d/), "9000");
    await userEvent.click(screen.getByRole("switch", { name: "Recorrente" }));
    expect(screen.getByRole("radio", { name: "Sempre" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Criar como Conta Fixa" })).toBeInTheDocument();
    expect(screen.queryByText(/sem data para parar/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);

    await userEvent.click(screen.getByRole("radio", { name: "3" }));
    expect(screen.queryByRole("button", { name: "Criar como Conta Fixa" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));
    expect(await sent("POST")).toMatchObject({ kind: "bill", repeat_months: 3 });
  });

  it("converts a Conta on Sempre into a bill from the plain entry", async () => {
    const { requests } = setup(
      { initialKind: "bill", billSheet },
      {
        "POST /api/transactions": { status: 201, body: ALUGUEL_ROW },
        "POST /api/bills": { status: 201, body: BILL_ALUGUEL },
      },
    );

    await userEvent.type(await screen.findByLabelText(/^Valor d/), "9000");
    await userEvent.click(screen.getByRole("switch", { name: "Recorrente" }));
    await userEvent.click(screen.getByRole("button", { name: "Criar como Conta Fixa" }));
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText("Conta fixa criada")).toBeInTheDocument();
    const post = requests.find((request) => request.url.endsWith("/api/transactions"));
    const body = await post?.json();
    expect(body).toMatchObject({ kind: "bill", amount: "90.00" });
    expect(body).not.toHaveProperty("open_ended");
    expect(body).not.toHaveProperty("repeat_every");
  });

  it("words Sempre in each step: todo dia, toda {weekday}, todo dia/mês", async () => {
    setup();

    await userEvent.click(await screen.findByRole("switch", { name: "Recorrente" }));
    await userEvent.click(screen.getByRole("radio", { name: "Semanal" }));
    expect(screen.getByText("Repete toda quinta-feira, sem data para parar.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Anual" }));
    expect(screen.getByText("Repete todo 5/11, sem data para parar.")).toBeInTheDocument();
    await pickDate("Outra data", "2026-11-01");
    await userEvent.click(screen.getByRole("radio", { name: "Semanal" }));
    expect(screen.getByText("Repete todo domingo, sem data para parar.")).toBeInTheDocument();
  });

  it("starts a counted Recorrente at a later parcela: hidden on Sempre, 1 to N, posted as parcelas", async () => {
    const { requests, sent } = setup();

    await userEvent.type(await screen.findByLabelText(/^Valor d/), "10000");
    await userEvent.click(screen.getByRole("switch", { name: "Recorrente" }));
    const link = "Já começou em outra parcela?";
    expect(screen.queryByRole("button", { name: link })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "6" }));
    expect(screen.queryByLabelText("Começa na parcela")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: link }));
    const first = screen.getByLabelText("Começa na parcela");
    expect(first).toHaveValue("1");
    expect(first).toHaveClass("text-base");
    await userEvent.clear(first);
    await userEvent.type(first, "7");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    expect(first).toHaveAccessibleDescription("Escolha de 1 a 6.");
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);
    await userEvent.clear(first);
    await userEvent.type(first, "4");
    expect(screen.getByText("3× de R$ 100,00 · repete todo dia 5 até jan 2027")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    const body = await sent("POST");
    expect(body).toMatchObject({ amount: "600.00", installments: 6, first_installment: 4 });
    expect(body).not.toHaveProperty("repeat_months");
    expect(body).not.toHaveProperty("repeat_every");
    expect(await screen.findByText("3 lançamentos criados")).toBeInTheDocument();
  });

  it("sends a count from parcela 1 as a plain repeat", async () => {
    const { sent } = setup();

    await userEvent.type(await screen.findByLabelText(/^Valor d/), "10000");
    await userEvent.click(screen.getByRole("switch", { name: "Recorrente" }));
    await userEvent.click(screen.getByRole("radio", { name: "2" }));
    await userEvent.click(screen.getByRole("button", { name: "Já começou em outra parcela?" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    const body = await sent("POST");
    expect(body).toMatchObject({ amount: "100.00", repeat_months: 2 });
    expect(body).not.toHaveProperty("first_installment");
  });

  it("clears every Recorrente field from the payload when it turns off", async () => {
    const { sent } = setup();

    await userEvent.type(await screen.findByLabelText(/^Valor d/), "10000");
    const repeat = screen.getByRole("switch", { name: "Recorrente" });
    await userEvent.click(repeat);
    await userEvent.click(screen.getByRole("radio", { name: "Semanal" }));
    await userEvent.click(screen.getByRole("radio", { name: "6" }));
    await userEvent.click(repeat);
    expect(screen.queryByRole("radiogroup", { name: "Quantas vezes" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    const body = await sent("POST");
    for (const field of ["repeat_months", "repeat_every", "open_ended", "installments", "first_installment"])
      expect(body).not.toHaveProperty(field);
  });

  it("keeps the duration chips and fields thumb-sized at 375px", async () => {
    setup();

    await userEvent.click(await screen.findByRole("switch", { name: "Recorrente" }));
    const counts = screen.getByRole("radiogroup", { name: "Quantas vezes" });
    expect(counts).toHaveClass("grid-cols-3");
    for (const chip of within(counts).getAllByRole("radio")) expect(chip).toHaveClass("h-11");
    await userEvent.click(screen.getByRole("radio", { name: "Outro" }));
    expect(screen.getByLabelText("Meses")).toHaveClass("text-base", "md:text-base");
  });

  it("tells only the last month while the amount is missing", async () => {
    setup();

    await userEvent.click(await screen.findByRole("switch", { name: "Recorrente" }));
    await userEvent.click(screen.getByRole("radio", { name: "12" }));

    expect(screen.getByText("repete todo dia 5 até out 2027")).toBeInTheDocument();
    expect(screen.queryByText(/12× de/)).not.toBeInTheDocument();
  });

  it("takes Outro from 2 to 60 months, inline error otherwise, and warns about short months from day 29", async () => {
    const { requests, sent } = setup();

    await userEvent.type(await screen.findByLabelText(/^Valor d/), "1000");
    await pickDate("Outra data", "2026-10-31");
    await userEvent.click(screen.getByRole("switch", { name: "Recorrente" }));
    expect(screen.getByText("Em meses mais curtos, cai no último dia.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Outro" }));
    const months = screen.getByLabelText("Meses");
    await userEvent.type(months, "61");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    expect(months).toHaveAccessibleDescription("Escolha de 2 a 60 vezes.");
    expect(months).toHaveAttribute("aria-invalid", "true");
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);
    await userEvent.clear(months);
    await userEvent.type(months, "24");
    expect(screen.getByText("24× de R$ 10,00 · repete todo dia 31 até set 2028")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    expect(await sent("POST")).toMatchObject({ date: "2026-10-31", repeat_months: 24 });
  });

  it("turns a standalone entry into a series from Editar", async () => {
    const { sent } = setup({ transaction: MERCADO_ROW });

    await userEvent.click(await screen.findByRole("switch", { name: "Recorrente" }));
    await userEvent.click(screen.getByRole("radio", { name: "2" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    expect(await sent("PATCH")).toMatchObject({ repeat_months: 2 });
    expect(await screen.findByText("2 lançamentos criados")).toBeInTheDocument();
  });

  it("offers no Repetir for a bill payment, saying why", async () => {
    setup({ transaction: { ...ALUGUEL_ROW, recurring_bill_id: "b1" } });

    expect(await screen.findByText("Já é uma conta fixa recorrente.")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Recorrente" })).not.toBeInTheDocument();
  });

  it("keeps a bill payment a Saída: no Tipo to pick, and a refused kind says why", async () => {
    const payment = { ...ALUGUEL_ROW, recurring_bill_id: "b1" };
    setup(
      { transaction: payment },
      {
        [`PATCH /api/transactions/${payment.id}`]: {
          status: 422,
          body: {
            ...problem(422, "Invalid."),
            errors: [{ field: "kind", message: "a conta fixa payment stays a Saída" }],
          },
        },
      },
    );

    await screen.findByRole("dialog", { name: "Editar lançamento" });
    expect(screen.queryByRole("radio", { name: "Diário" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Entrada" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    expect(await screen.findByText("Um pagamento de conta fixa continua sendo Saída.")).toBeInTheDocument();
  });

  it("offers no Repetir for a resgate", async () => {
    setup({ transaction: { ...TRANSACTIONS[2], cofrinho_id: "c1" } });

    expect(await screen.findByRole("dialog", { name: "Editar lançamento" })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Recorrente" })).not.toBeInTheDocument();
    expect(screen.queryByText("Já é uma conta fixa recorrente.")).not.toBeInTheDocument();
  });

  it("edits a series member as Stitch draws it: chip, title, the member, Escopo first, then value, duration and day", async () => {
    window.innerWidth = 1440;
    const { requests } = setup(
      { transaction: MEMBER, onDelete: vi.fn() },
      { [`PATCH /api/transactions/${MEMBER.id}`]: { status: 200, body: MEMBER } },
    );

    const dialog = await screen.findByRole("dialog", { name: "Editar Lançamento Recorrente" });
    expect(within(dialog).getByText("Parte de uma série de 12 meses")).toBeInTheDocument();
    expect(within(dialog).getByText(/^Você está editando/)).toHaveTextContent(
      'Você está editando a parcela 3 de 12: "Aluguel" (R$ 1.200,00)',
    );
    expect(screen.queryByRole("switch", { name: "Recorrente" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Tipo" })).not.toBeInTheDocument();
    const scope = screen.getByRole("radiogroup", { name: "Escopo da Alteração" });
    const amount = screen.getByLabelText("Valor por parcela");
    const months = screen.getByRole("radiogroup", { name: "Quantas vezes" });
    const day = screen.getByText("Dia de vencimento");
    const note = screen.getByLabelText("Observação");
    const follows = (first: Element, second: Element) =>
      expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    follows(scope, amount);
    follows(amount, months);
    follows(months, day);
    follows(day, note);
    expect(screen.getByRole("radio", { name: "Só este lançamento" })).toBeChecked();
    expect(screen.getByText("Novo valor aplicado só a esta cobrança.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Este e os próximos" }));
    expect(screen.getByText("Novo valor monetário aplicado a partir desta cobrança.")).toBeInTheDocument();
    const footer = screen.getByRole("button", { name: "Salvar Alterações na Série" }).closest(FOOTER) as HTMLElement;
    expect(footer).toHaveTextContent(/^Excluir da Série\.\.\.CancelarSalvar Alterações na Série$/);
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));

    await waitFor(() => expect(requests.some((request) => request.method === "PATCH")).toBe(true));
    const patch = requests.find((request) => request.method === "PATCH");
    expect(new URL(patch?.url ?? "").searchParams.get("scope")).toBe("following");
    expect(await screen.findByText("Série atualizada")).toBeInTheDocument();
  });

  it("reads Toda a série on the first member", async () => {
    setup({ transaction: { ...MEMBER, series: { ...MEMBER.series, position: 1 } } });

    expect(await screen.findByRole("radio", { name: "Toda a série (12 lançamentos)" })).toBeInTheDocument();
  });

  it("closes and hands Excluir da Série... to the host", async () => {
    const onDelete = vi.fn();
    const { onOpenChange } = setup({ transaction: MEMBER, onDelete });

    await userEvent.click(await screen.findByRole("button", { name: "Excluir da Série..." }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("offers no Excluir da Série... without a host to delete", async () => {
    setup({ transaction: MEMBER });

    await screen.findByRole("button", { name: "Salvar Alterações na Série" });
    expect(screen.queryByRole("button", { name: "Excluir da Série..." })).not.toBeInTheDocument();
  });

  const resize = { [`PATCH /api/transactions/${MEMBER.id}`]: { status: 200, body: MEMBER } };

  it("resizes a series member: Duração da série on the total, chips below the position off, helpers name the change", async () => {
    const { sent } = setup({ transaction: MEMBER }, resize);

    const months = await screen.findByRole("radiogroup", { name: "Quantas vezes" });
    expect(screen.getByText("Quantas vezes")).toBeVisible();
    expect(within(months).getByRole("radio", { name: "12" })).toBeChecked();
    expect(within(months).getByRole("radio", { name: "3" })).toBeEnabled();
    expect(screen.queryByText(/Série encurtada|Série estendida/)).not.toBeInTheDocument();

    await userEvent.click(within(months).getByRole("radio", { name: "6" }));
    expect(screen.getByText("Série encurtada: Remove os 6 últimos meses. Termina em Março/2027.")).toBeInTheDocument();
    await userEvent.click(within(months).getByRole("radio", { name: "Outro" }));
    const custom = screen.getByLabelText("Meses");
    await userEvent.clear(custom);
    await userEvent.type(custom, "15");
    expect(screen.getByText("Série estendida: Adiciona 3 meses. Termina em Dezembro/2027.")).toBeInTheDocument();
    expect(screen.queryByText(/Economia projetada/)).not.toBeInTheDocument();
    const amount = screen.getByLabelText("Valor por parcela");
    await userEvent.clear(amount);
    await userEvent.type(amount, "9990");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));

    expect(await sent("PATCH")).toMatchObject({ amount: "99.90", repeat_months: 15 });
    expect(await screen.findByText("Série ajustada com sucesso para 15 meses futuros.")).toBeInTheDocument();
  });

  it("shortens 12 to 6 from a March 2026 first member: ends Agosto/2026 and projects the saving", async () => {
    const first = {
      ...MEMBER,
      date: "2026-03-04",
      series: { id: "s1", position: 1, total: 12, last_date: "2027-02-04", open_ended: false, every: "month" as const },
    };
    setup({ transaction: first }, { [`PATCH /api/transactions/${MEMBER.id}`]: { status: 200, body: first } });

    await userEvent.click(await screen.findByRole("radio", { name: "6" }));
    expect(screen.getByText("Série encurtada: Remove os 6 últimos meses. Termina em Agosto/2026.")).toBeInTheDocument();
    expect(screen.getByText("Economia projetada de R$ 7.200,00 no orçamento previsto.")).toBeInTheDocument();
  });

  it("projects no saving when an income series shortens", async () => {
    setup({ transaction: { ...TRANSACTIONS[2], series: MEMBER.series } });

    await userEvent.click(await screen.findByRole("radio", { name: "6" }));
    expect(screen.getByText(/Série encurtada/)).toBeInTheDocument();
    expect(screen.queryByText(/Economia projetada/)).not.toBeInTheDocument();
  });

  it("resets to the current total, not 12, on Ciclo Atual", async () => {
    setup({ transaction: { ...MEMBER, series: { ...MEMBER.series, total: 6 } } });

    await userEvent.click(await screen.findByRole("radio", { name: "12" }));
    expect(screen.getByRole("radio", { name: "12" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Ciclo Atual" }));
    expect(screen.getByRole("radio", { name: "6" })).toBeChecked();
    expect(screen.queryByText(/Série estendida/)).not.toBeInTheDocument();
  });

  it("says Remove o último mês for one month and sends no count when it stays on the total", async () => {
    const { sent } = setup({ transaction: MEMBER }, resize);

    await userEvent.click(await screen.findByRole("radio", { name: "Outro" }));
    const custom = screen.getByLabelText("Meses");
    await userEvent.clear(custom);
    await userEvent.type(custom, "11");
    expect(screen.getByText("Série encurtada: Remove o último mês. Termina em Agosto/2027.")).toBeInTheDocument();
    expect(screen.getByText("Economia projetada de R$ 1.200,00 no orçamento previsto.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "12" }));
    expect(screen.queryByText(/Série encurtada|Série estendida/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));

    expect(await sent("PATCH")).not.toHaveProperty("repeat_months");
    expect(await screen.findByText("Lançamento atualizado")).toBeInTheDocument();
  });

  it("preselects Outro for a total off the presets and asks for at least the member's position", async () => {
    const { requests } = setup(
      { transaction: { ...MEMBER, series: { ...MEMBER.series, position: 5, total: 7 } } },
      resize,
    );

    expect(await screen.findByRole("radio", { name: "Outro" })).toBeChecked();
    const custom = screen.getByLabelText("Meses");
    expect(custom).toHaveValue("7");
    expect(screen.getByRole("radio", { name: "3" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "6" })).toBeEnabled();
    await userEvent.clear(custom);
    await userEvent.type(custom, "4");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));

    expect(custom).toHaveAccessibleDescription("Escolha de 5 a 60 vezes.");
    expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(0);
  });

  it("keeps Sempre off a bounded series in Editar", async () => {
    setup({ transaction: MEMBER }, resize);

    expect(await screen.findByRole("radio", { name: "12" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Sempre" })).toBeDisabled();
  });

  it("reads an open series as Sempre in Editar and sends no count", async () => {
    const open = { ...MEMBER, series: { ...MEMBER.series, open_ended: true } };
    const { sent } = setup({ transaction: open }, resize);

    expect(await screen.findByRole("radio", { name: "Sempre" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "6" })).toBeDisabled();
    expect(screen.queryByText(/Série encurtada|Série estendida/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));

    const body = await sent("PATCH");
    expect(body).not.toHaveProperty("repeat_months");
    expect(body).not.toHaveProperty("open_ended");
  });

  describe("Parar recorrência and Tornar sem fim", () => {
    const open = { ...MEMBER, series: { ...MEMBER.series, open_ended: true } };
    const patches = (requests: Request[]) => requests.filter((request) => request.method === "PATCH");

    it("stops an open member from this one on, toasts, and Desfazer reopens it", async () => {
      const { requests } = setup({ transaction: open }, resize);

      expect(await screen.findByText("Lançamento recorrente, todo mês")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Tornar sem fim" })).not.toBeInTheDocument();
      const stop = screen.getByRole("button", { name: "Parar recorrência" });
      expect(stop).toHaveClass("h-12", "text-base");
      await userEvent.click(stop);

      expect(await screen.findByText("Recorrência parada. Sai dos próximos meses.")).toBeInTheDocument();
      const [first] = patches(requests);
      expect(new URL(first.url).searchParams.get("scope")).toBeNull();
      expect(await first.json()).toEqual({ open_ended: false });

      // The sheet stays open under a mocked onOpenChange; its overlay blocks pointer events.
      fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
      await waitFor(() => expect(patches(requests)).toHaveLength(2));
      expect(await patches(requests)[1].json()).toEqual({ open_ended: true });
    });

    it("reads a weekly open member as toda semana", async () => {
      setup({ transaction: { ...open, series: { ...open.series, every: "week" as const } } }, resize);

      expect(await screen.findByText("Lançamento recorrente, toda semana")).toBeInTheDocument();
    });

    it("shows its fixed copy when the stop would touch a paid fatura, never the server's", async () => {
      setup(
        { transaction: open },
        {
          [`PATCH /api/transactions/${MEMBER.id}`]: {
            status: 422,
            body: { type: "urn:soldi:error:fatura-paid", title: "Paid.", status: 422, detail: "Server words." },
          },
        },
      );

      await userEvent.click(await screen.findByRole("button", { name: "Parar recorrência" }));

      expect(await screen.findByText("Essa fatura já foi paga.")).toBeInTheDocument();
      expect(screen.queryByText("Server words.")).not.toBeInTheDocument();
    });

    it("falls back to the generic copy on any other refusal", async () => {
      setup(
        { transaction: open },
        { [`PATCH /api/transactions/${MEMBER.id}`]: { status: 500, body: problem(500, "Boom") } },
      );

      await userEvent.click(await screen.findByRole("button", { name: "Parar recorrência" }));

      expect(await screen.findByText("Não foi possível salvar o lançamento.")).toBeInTheDocument();
    });

    it("turns a bounded member into an open series", async () => {
      const { sent } = setup({ transaction: MEMBER }, resize);

      expect(await screen.findByText("Parte de uma série de 12 meses")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Parar recorrência" })).not.toBeInTheDocument();
      const turn = screen.getByRole("button", { name: "Tornar sem fim" });
      expect(turn).toHaveClass("h-12", "text-base");
      await userEvent.click(turn);

      expect(await sent("PATCH")).toEqual({ open_ended: true });
      expect(await screen.findByText("Série atualizada")).toBeInTheDocument();
    });

    it("offers neither on an entry outside a series", async () => {
      setup({ transaction: ALUGUEL_ROW });

      await screen.findByLabelText("Observação");
      expect(screen.queryByRole("button", { name: "Parar recorrência" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Tornar sem fim" })).not.toBeInTheDocument();
    });
  });

  it("saves an edit to the only member left in a series without a count or a scope to pick", async () => {
    const { requests } = setup(
      { transaction: { ...MEMBER, series: { ...MEMBER.series, position: 1, total: 1 } } },
      resize,
    );

    const amount = await screen.findByLabelText("Valor por parcela");
    expect(screen.queryByRole("radiogroup", { name: "Escopo da Alteração" })).not.toBeInTheDocument();
    await userEvent.clear(amount);
    await userEvent.type(amount, "9990");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));

    await waitFor(() => expect(requests.some((request) => request.method === "PATCH")).toBe(true));
    const patch = requests.find((request) => request.method === "PATCH");
    expect(new URL(patch?.url ?? "").searchParams.get("scope")).toBe("this");
    const body = await patch?.json();
    expect(body).toMatchObject({ amount: "99.90" });
    expect(body).not.toHaveProperty("repeat_months");
  });

  it("pads the selected duration chip so its check clears the edge", async () => {
    setup();

    await userEvent.click(await screen.findByRole("switch", { name: "Recorrente" }));
    for (const name of ["Sempre", "6", "Outro"]) {
      await userEvent.click(screen.getByRole("radio", { name }));
      expect(screen.getByRole("radio", { name })).toHaveClass("gap-1.5", "pl-3!");
    }
  });

  it("locks Duração da série while the member's date moves and sends no count", async () => {
    const { sent } = setup({ transaction: MEMBER }, resize);

    const months = await screen.findByRole("radiogroup", { name: "Quantas vezes" });
    await userEvent.click(within(months).getByRole("radio", { name: "6" }));
    expect(screen.getByText(/Série encurtada/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hoje" }));
    expect(within(months).getByRole("radio", { name: "12" })).toBeDisabled();
    expect(screen.queryByText(/Série encurtada|Série estendida/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));

    const body = await sent("PATCH");
    expect(body).toMatchObject({ date: "2026-11-05" });
    expect(body).not.toHaveProperty("repeat_months");
  });

  it("moves the day of this and the following members: the note shows only after the day changes, toast Série movida", async () => {
    const { sent } = setup({ transaction: MEMBER }, resize);

    await userEvent.click(await screen.findByRole("radio", { name: "Este e os próximos" }));
    expect(screen.queryByText(/serão movidos/)).not.toBeInTheDocument();
    await pickDate("Outra data", "2026-11-10");
    expect(
      screen.getByText("Os próximos lançamentos também serão movidos automaticamente para o dia 10."),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "12" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));

    const body = await sent("PATCH");
    expect(body).toMatchObject({ date: "2026-11-10" });
    expect(body).not.toHaveProperty("repeat_months");
    expect(await screen.findByText("Série movida para o dia 10")).toBeInTheDocument();
  });

  it("says Toda a série on the first member and warns about shorter months from day 29", async () => {
    setup({ transaction: { ...MEMBER, series: { ...MEMBER.series, position: 1 } } });

    await userEvent.click(await screen.findByRole("radio", { name: "Toda a série (12 lançamentos)" }));
    await pickDate("Outra data", "2026-11-28");
    expect(screen.getByText("Toda a série vai para o dia 28.")).toBeInTheDocument();
    await pickDate("Outra data", "2026-11-30");
    expect(
      screen.getByText("Toda a série vai para o dia 30. Nos meses mais curtos, no último dia."),
    ).toBeInTheDocument();
  });

  it("shows no day helper with Só este", async () => {
    setup({ transaction: MEMBER });

    await screen.findByRole("radio", { name: "Só este lançamento" });
    await pickDate("Outra data", "2026-12-10");
    expect(screen.queryByText(/para o dia/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("blocks a month change with Este e os próximos until Só este is chosen", async () => {
    const { requests, sent } = setup({ transaction: MEMBER }, resize);

    await userEvent.click(await screen.findByRole("radio", { name: "Este e os próximos" }));
    await pickDate("Outra data", "2026-12-10");
    expect(screen.getByRole("alert")).toHaveTextContent("Para mudar o mês, use Só este.");
    expect(screen.queryByText(/para o dia/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));
    expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(0);

    await userEvent.click(screen.getByRole("radio", { name: "Só este lançamento" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));

    expect(await sent("PATCH")).toMatchObject({ date: "2026-12-10" });
    expect(await screen.findByText("Lançamento atualizado")).toBeInTheDocument();
  });

  const dateRefused = (message: string) => ({
    [`PATCH /api/transactions/${MEMBER.id}`]: {
      status: 422,
      body: { ...problem(422, "Invalid."), errors: [{ field: "date", message }] },
    },
  });

  it("tells a shared month apart from any other failure of a day move", async () => {
    setup({ transaction: MEMBER }, dateRefused("must not move a series with two entries in one month"));

    await userEvent.click(await screen.findByRole("radio", { name: "Este e os próximos" }));
    await pickDate("Outra data", "2026-11-10");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));

    expect(
      await screen.findByText("Outro lançamento da série está no mesmo mês. Mova-o com Só este antes."),
    ).toBeInTheDocument();
  });

  it("says the save failed when a day move is refused for its date bounds", async () => {
    setup({ transaction: MEMBER }, dateRefused("must be from 2000 to 2100"));

    await userEvent.click(await screen.findByRole("radio", { name: "Este e os próximos" }));
    await pickDate("Outra data", "2026-11-10");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));

    expect(await screen.findByText("Não foi possível salvar o lançamento.")).toBeInTheDocument();
    expect(screen.queryByText(/Outro lançamento da série/)).not.toBeInTheDocument();
  });

  it("keeps the stored date when its own day is picked again: no month alert, no day helper", async () => {
    const { sent } = setup({ transaction: MEMBER }, resize);

    await userEvent.click(await screen.findByRole("radio", { name: "Este e os próximos" }));
    await pickDate("Outra data", MEMBER.date);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/para o dia/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));

    expect(await sent("PATCH")).toMatchObject({ date: MEMBER.date });
  });

  it("says the save failed when a day move fails for another reason", async () => {
    setup(
      { transaction: MEMBER },
      { [`PATCH /api/transactions/${MEMBER.id}`]: { status: 500, body: problem(500, "No.") } },
    );

    await userEvent.click(await screen.findByRole("radio", { name: "Este e os próximos" }));
    await pickDate("Outra data", "2026-11-10");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));

    expect(await screen.findByText("Não foi possível salvar o lançamento.")).toBeInTheDocument();
  });

  it("offers Transformar em conta fixa only for a Saída without a counted Recorrente", async () => {
    setup({ billSheet });

    const link = "Criar como Conta Fixa";
    expect(await screen.findByRole("switch", { name: "Recorrente" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: link })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Conta" }));
    expect(screen.getByText(/Prefere transformar em conta fixa recorrente\?/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Recorrente" }));
    expect(screen.getByRole("button", { name: link })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "12" }));
    expect(screen.queryByRole("button", { name: link })).not.toBeInTheDocument();
  });

  it("offers no Transformar em conta fixa when the host has no bill sheet", async () => {
    setup({ initialKind: "bill" });

    expect(await screen.findByRole("switch", { name: "Recorrente" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar como Conta Fixa" })).not.toBeInTheDocument();
  });

  it("launches the Saída, then turns it into a bill prefilled from it", async () => {
    const { requests, onOpenChange } = setup(
      { billSheet },
      {
        "POST /api/transactions": { status: 201, body: ALUGUEL_ROW },
        "POST /api/bills": { status: 201, body: BILL_ALUGUEL },
      },
    );

    await userEvent.click(await screen.findByRole("radio", { name: "Conta" }));
    expect(await screen.findByRole("radio", { name: "Aluguel" })).toHaveAttribute("aria-checked", "true");
    await userEvent.type(screen.getByLabelText(/^Valor d/), "120000");
    await userEvent.click(screen.getByRole("button", { name: "Criar como Conta Fixa" }));
    expect(requests.some((request) => request.method === "POST")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText("Conta fixa criada")).toBeInTheDocument();
    const posts = requests.filter((request) => request.method === "POST");
    expect(posts.map((request) => new URL(request.url).pathname)).toEqual(["/api/transactions", "/api/bills"]);
    expect(await posts[0].json()).toMatchObject({ amount: "1200.00", kind: "bill", category_id: ALUGUEL.id });
    expect(new URL(posts[1].url).searchParams.get("transaction_id")).toBe(ALUGUEL_ROW.id);
    expect(await posts[1].json()).toEqual({ name: "Aluguel", amount: "1200.00", due_day: 5, category_id: ALUGUEL.id });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("says the entry was launched when the bill is refused", async () => {
    const { requests } = setup(
      { initialKind: "bill", billSheet },
      {
        "POST /api/transactions": { status: 201, body: ALUGUEL_ROW },
        "POST /api/bills": { status: 422, body: problem(422, "cannot-become-bill") },
      },
    );

    await userEvent.type(await screen.findByLabelText(/^Valor d/), "100");
    await userEvent.type(screen.getByLabelText("Observação"), "Internet");
    await userEvent.click(screen.getByRole("button", { name: "Criar como Conta Fixa" }));
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText("Lançado, mas a conta fixa não foi criada.")).toBeInTheDocument();
    const bill = requests.find((request) => request.method === "POST" && request.url.includes("/api/bills"));
    expect(await bill?.json()).toMatchObject({ name: "Internet" });
  });

  it("does not ask for a bill when the launch itself fails", async () => {
    const { requests } = setup(
      { initialKind: "bill", billSheet },
      { "POST /api/transactions": { status: 422, body: problem(422, "amount") } },
    );

    await userEvent.type(await screen.findByLabelText(/^Valor d/), "100");
    await userEvent.click(screen.getByRole("button", { name: "Criar como Conta Fixa" }));
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText("Não foi possível salvar o lançamento.")).toBeInTheDocument();
    expect(requests.some((request) => request.method === "POST" && request.url.includes("/api/bills"))).toBe(false);
  });

  it("turns the stored Saída into a bill with the bills call only, ignoring unsaved edits", async () => {
    const { requests } = setup(
      { transaction: ALUGUEL_ROW, billSheet },
      { "POST /api/bills": { status: 422, body: problem(422, "cannot-become-bill") } },
    );

    await userEvent.type(await screen.findByLabelText("Observação"), "Rascunho");
    await userEvent.click(screen.getByRole("button", { name: "Criar como Conta Fixa" }));
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText("Não foi possível criar a conta fixa.")).toBeInTheDocument();
    const posts = requests.filter((request) => request.method === "POST");
    expect(posts).toHaveLength(1);
    expect(new URL(posts[0].url).searchParams.get("transaction_id")).toBe(ALUGUEL_ROW.id);
    expect(await posts[0].json()).toEqual({ name: "Aluguel", amount: "1200.00", due_day: 4, category_id: ALUGUEL.id });
  });

  it("offers no Transformar em conta fixa in Editar when the stored entry is not a Saída", async () => {
    setup({ transaction: MERCADO_ROW, billSheet });

    await userEvent.click(await screen.findByRole("radio", { name: "Conta" }));
    expect(screen.queryByRole("button", { name: "Criar como Conta Fixa" })).not.toBeInTheDocument();
  });

  it("saves on Enter in Valor", async () => {
    const { sent } = setup();
    await screen.findByRole("radiogroup", { name: "Categoria" });
    await userEvent.keyboard("35,90{Enter}");
    expect(await sent("POST")).toMatchObject({ amount: "35.90", kind: "daily" });
  });

  it("is a 560px centered dialog from 1024px: Novo Lançamento, its description shown, Hoje with the day, no Quando foi?, no Enter hint", async () => {
    window.innerWidth = 1440;
    setup();

    const dialog = await screen.findByRole("dialog", { name: "Novo Lançamento" });
    expect(dialog).toHaveAttribute("data-slot", "dialog-content");
    expect(within(dialog).getByText(DESCRIPTION)).not.toHaveClass("sr-only");
    expect(screen.getByRole("button", { name: "Hoje (5 nov)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Quando foi?")).toHaveClass("sr-only");
    const footer = screen.getByRole("button", { name: "Salvar Lançamento" }).closest(FOOTER) as HTMLElement;
    expect(footer).toHaveTextContent(/^CancelarSalvar Lançamento$/);
    expect(dialog).toHaveClass("sm:max-w-[560px]");
  });

  it("keeps the description for screen readers only in Editar from 1024px", async () => {
    window.innerWidth = 1440;
    setup({ transaction: MERCADO_ROW });

    const dialog = await screen.findByRole("dialog", { name: "Editar lançamento" });
    expect(within(dialog).getByText(DESCRIPTION)).toHaveClass("sr-only");
  });

  it("closes on Cancelar from 1024px without writing", async () => {
    window.innerWidth = 1440;
    const { requests, onOpenChange } = setup();

    await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);
  });

  it("offers only Salvar Lançamento, full width, in the pinned footer under 1024 px", async () => {
    setup();

    const save = await screen.findByRole("button", { name: "Salvar Lançamento" });
    expect(save.closest(FOOTER)).not.toBeNull();
    expect(save).toHaveClass("w-full");
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    expect(screen.queryByText("Enter ↵")).not.toBeInTheDocument();
  });

  it("keeps Enter in the note from saving", async () => {
    const { requests } = setup();
    await screen.findByRole("radiogroup", { name: "Categoria" });
    await userEvent.keyboard("35,90");
    await userEvent.type(screen.getByLabelText("Observação"), "Feira{Enter}");

    expect(screen.getByLabelText("Observação")).toHaveValue("Feira");
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);
  });

  it("docks the keypad in the pinned footer right above Salvar Lançamento, under the whole form", async () => {
    coarse();
    setup();

    const erase = await screen.findByRole("button", { name: "Apagar" });
    const save = screen.getByRole("button", { name: "Salvar Lançamento" });
    const repeat = screen.getByRole("switch", { name: "Recorrente" });
    expect(erase.closest(FOOTER)).toBe(save.closest(FOOTER));
    expect(erase.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(repeat.compareDocumentPosition(erase) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sums a series: 12× de R$ 39,90 · repete todo dia 10 até out 2027", async () => {
    setup();
    await userEvent.type(await screen.findByLabelText(/^Valor d/), "3990");
    await pickDate("Outra data", "2026-11-10");
    await userEvent.click(screen.getByRole("switch", { name: "Recorrente" }));
    await userEvent.click(screen.getByRole("radio", { name: "12" }));

    expect(screen.getByText("12× de R$ 39,90 · repete todo dia 10 até out 2027")).toBeInTheDocument();
  });

  describe("series step", () => {
    const WEEKLY = {
      ...MEMBER,
      series: { id: "s1", position: 3, total: 8, last_date: "2026-12-10", open_ended: false, every: "week" as const },
    };
    const weekly = { [`PATCH /api/transactions/${WEEKLY.id}`]: { status: 200, body: WEEKLY } };

    it("picks Mensal, Semanal or Anual under Repetir: the summary follows and the POST carries the step", async () => {
      const { sent } = setup();

      await userEvent.type(await screen.findByLabelText(/^Valor d/), "15000");
      expect(screen.queryByRole("group", { name: "Frequência" })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("switch", { name: "Recorrente" }));
      expect(screen.getByRole("radio", { name: "Mensal" })).toBeChecked();
      await userEvent.click(screen.getByRole("radio", { name: "12" }));
      await userEvent.click(screen.getByRole("radio", { name: "Semanal" }));
      expect(screen.getByText("12× de R$ 150,00 · repete toda semana até 21 jan 2027")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("radio", { name: "Anual" }));
      expect(screen.getByText("12× de R$ 150,00 · repete todo ano em 5 nov até 2037")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("radio", { name: "Semanal" }));
      await userEvent.click(screen.getByRole("radio", { name: "3" }));
      expect(screen.getByText("3× de R$ 150,00 · repete toda semana até 19 nov 2026")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

      expect(await sent("POST")).toMatchObject({ repeat_months: 3, repeat_every: "week" });
      expect(await screen.findByText("3 lançamentos criados")).toBeInTheDocument();
    });

    it("words the custom count in the step's unit", async () => {
      setup();

      await userEvent.click(await screen.findByRole("switch", { name: "Recorrente" }));
      await userEvent.click(screen.getByRole("radio", { name: "Anual" }));
      await userEvent.click(screen.getByRole("radio", { name: "Outro" }));
      await userEvent.type(screen.getByLabelText("Anos"), "61");
      await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

      expect(screen.getByLabelText("Anos")).toHaveAccessibleDescription("Escolha de 2 a 60 vezes.");
    });

    it("resets the step to Mensal and the count to Sempre when Recorrente turns off", async () => {
      setup();

      const repeat = await screen.findByRole("switch", { name: "Recorrente" });
      await userEvent.click(repeat);
      await userEvent.click(screen.getByRole("radio", { name: "Anual" }));
      await userEvent.click(screen.getByRole("radio", { name: "3" }));
      await userEvent.click(repeat);
      expect(screen.queryByRole("radiogroup", { name: "Frequência" })).not.toBeInTheDocument();
      await userEvent.click(repeat);
      expect(screen.getByRole("radio", { name: "Mensal" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "Sempre" })).toBeChecked();
    });

    it("edits a weekly series in weeks: eyebrow, chips, resize line and toast", async () => {
      const { sent } = setup({ transaction: WEEKLY }, weekly);

      expect(await screen.findByText("Parte de uma série de 8 semanas")).toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Frequência" })).not.toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "3" })).toBeEnabled();
      await userEvent.click(screen.getByRole("radio", { name: "6" }));
      expect(
        screen.getByText("Série encurtada: Remove as 2 últimas semanas. Termina em 26/11/2026."),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole("radio", { name: "Outro" }));
      const custom = screen.getByLabelText("Semanas");
      await userEvent.clear(custom);
      await userEvent.type(custom, "10");
      expect(screen.getByText("Série estendida: Adiciona 2 semanas. Termina em 24/12/2026.")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));

      expect(await sent("PATCH")).toMatchObject({ repeat_months: 10 });
      expect(await screen.findByText("Série ajustada com sucesso para 10 semanas futuras.")).toBeInTheDocument();
    });

    it("moves a weekly series inside its week only, naming the weekday", async () => {
      const { requests } = setup({ transaction: WEEKLY }, weekly);

      await userEvent.click(await screen.findByRole("radio", { name: "Este e os próximos" }));
      await pickDate("Outra data", "2026-11-10");
      expect(screen.getByRole("alert")).toHaveTextContent("Para mudar a semana, use Só este.");
      await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));
      expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(0);

      await pickDate("Outra data", "2026-11-02");
      expect(
        screen.getByText("Os próximos lançamentos também serão movidos automaticamente para segunda-feira."),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));

      expect(await screen.findByText("Série movida para segunda-feira")).toBeInTheDocument();
    });

    it("tells a shared week apart", async () => {
      setup({ transaction: WEEKLY }, dateRefused("must not move a series with two entries in one week"));

      await userEvent.click(await screen.findByRole("radio", { name: "Este e os próximos" }));
      await pickDate("Outra data", "2026-11-02");
      await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));

      expect(
        await screen.findByText("Outro lançamento da série está na mesma semana. Mova-o com Só este antes."),
      ).toBeInTheDocument();
    });
  });

  describe("Toda a série from a middle member", () => {
    it("asks first: Cancelar saves nothing, confirming sends scope=all", async () => {
      const { requests } = setup({ transaction: MEMBER }, resize);

      await userEvent.click(await screen.findByRole("radio", { name: "Toda a série (12 lançamentos)" }));
      const amount = screen.getByLabelText("Valor por parcela");
      await userEvent.clear(amount);
      await userEvent.type(amount, "9990");
      await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));
      const ask = await screen.findByRole("alertdialog", { name: "Alterar toda a série?" });
      expect(ask).toHaveTextContent("2 lançamentos anteriores a este também mudam, inclusive em meses já fechados.");
      await userEvent.click(within(ask).getByRole("button", { name: "Cancelar" }));
      expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(0);

      await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));
      await userEvent.click(
        within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Alterar toda a série" }),
      );

      await waitFor(() => expect(requests.some((request) => request.method === "PATCH")).toBe(true));
      const patch = requests.find((request) => request.method === "PATCH");
      expect(new URL(patch?.url ?? "").searchParams.get("scope")).toBe("all");
      expect(await screen.findByText("Série atualizada")).toBeInTheDocument();
    });

    it("says the whole series moves under Toda a série", async () => {
      setup({ transaction: MEMBER });

      await userEvent.click(await screen.findByRole("radio", { name: "Toda a série (12 lançamentos)" }));
      await pickDate("Outra data", "2026-11-10");

      expect(screen.getByText("Toda a série vai para o dia 10.")).toBeInTheDocument();
    });
  });
});
