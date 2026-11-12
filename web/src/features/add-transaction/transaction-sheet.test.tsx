import { screen, waitFor, within } from "@testing-library/react";
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

    it("keeps the card on every parcela", async () => {
      const { sent } = setup({}, withCard);

      await userEvent.selectOptions(await cardField(), "Porto");
      await userEvent.click(screen.getByRole("switch", { name: "Parcelar compra" }));
      await userEvent.click(screen.getByRole("radio", { name: "3×" }));
      await userEvent.click(screen.getByLabelText(/^Valor d/));
      await userEvent.keyboard("90");
      await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

      expect(await sent("POST")).toMatchObject({ installments: 3, card_id: PORTO.id });
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

  it("repeats a launch: Repetir on preselects 12x, a preset changes the count and the last month", async () => {
    const { sent } = setup();

    const repeat = await screen.findByRole("switch", { name: "Repetir lançamento (Série)" });
    expect(repeat).not.toBeChecked();
    expect(screen.queryByRole("radio", { name: "12×" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Valor d/), "15000");
    await userEvent.click(repeat);

    expect(screen.getByRole("radio", { name: "12×" })).toBeChecked();
    expect(screen.getByText("12× de R$ 150,00 · repete todo dia 5 até out 2027")).toBeInTheDocument();
    expect(screen.queryByText("Em meses mais curtos, cai no último dia.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "3×" }));
    expect(screen.getByText("3× de R$ 150,00 · repete todo dia 5 até jan 2027")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    expect(await sent("POST")).toMatchObject({ amount: "150.00", repeat_months: 3 });
    expect(await screen.findByText("3 lançamentos criados")).toBeInTheDocument();
  });

  it("tells only the last month while the amount is missing", async () => {
    setup();

    await userEvent.click(await screen.findByRole("switch", { name: "Repetir lançamento (Série)" }));

    expect(screen.getByText("repete todo dia 5 até out 2027")).toBeInTheDocument();
    expect(screen.queryByText(/12× de/)).not.toBeInTheDocument();
  });

  it("takes Outro from 2 to 60 months, inline error otherwise, and warns about short months from day 29", async () => {
    const { requests, sent } = setup();

    await userEvent.type(await screen.findByLabelText(/^Valor d/), "1000");
    await pickDate("Outra data", "2026-10-31");
    await userEvent.click(screen.getByRole("switch", { name: "Repetir lançamento (Série)" }));
    expect(screen.getByText("Em meses mais curtos, cai no último dia.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Outro" }));
    const months = screen.getByLabelText("Meses");
    await userEvent.type(months, "61");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    expect(months).toHaveAccessibleDescription("Escolha de 2 a 60 meses.");
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

    await userEvent.click(await screen.findByRole("switch", { name: "Repetir lançamento (Série)" }));
    await userEvent.click(screen.getByRole("radio", { name: "2×" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    expect(await sent("PATCH")).toMatchObject({ repeat_months: 2 });
    expect(await screen.findByText("2 lançamentos criados")).toBeInTheDocument();
  });

  it("offers no Repetir for a bill payment, saying why", async () => {
    setup({ transaction: { ...ALUGUEL_ROW, recurring_bill_id: "b1" } });

    expect(await screen.findByText("Já é uma conta fixa recorrente.")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Repetir lançamento (Série)" })).not.toBeInTheDocument();
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
    expect(screen.queryByRole("switch", { name: "Repetir lançamento (Série)" })).not.toBeInTheDocument();
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
    expect(screen.queryByRole("switch", { name: "Repetir lançamento (Série)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Tipo" })).not.toBeInTheDocument();
    const scope = screen.getByRole("radiogroup", { name: "Escopo da Alteração" });
    const amount = screen.getByLabelText("Valor por parcela");
    const months = screen.getByRole("radiogroup", { name: "Duração da série" });
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

    const months = await screen.findByRole("radiogroup", { name: "Duração da série" });
    expect(screen.getByText("Duração da série")).toBeVisible();
    expect(within(months).getByRole("radio", { name: "12 meses" })).toBeChecked();
    expect(within(months).getByRole("radio", { name: "3 meses" })).toBeEnabled();
    expect(screen.queryByText(/Série encurtada|Série estendida/)).not.toBeInTheDocument();

    await userEvent.click(within(months).getByRole("radio", { name: "6 meses" }));
    expect(screen.getByText("Série encurtada: Remove os 6 últimos meses. Termina em Março/2027.")).toBeInTheDocument();
    await userEvent.click(within(months).getByRole("radio", { name: "Customizado" }));
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

    await userEvent.click(await screen.findByRole("radio", { name: "6 meses" }));
    expect(screen.getByText("Série encurtada: Remove os 6 últimos meses. Termina em Agosto/2026.")).toBeInTheDocument();
    expect(screen.getByText("Economia projetada de R$ 7.200,00 no orçamento previsto.")).toBeInTheDocument();
  });

  it("projects no saving when an income series shortens", async () => {
    setup({ transaction: { ...TRANSACTIONS[2], series: MEMBER.series } });

    await userEvent.click(await screen.findByRole("radio", { name: "6 meses" }));
    expect(screen.getByText(/Série encurtada/)).toBeInTheDocument();
    expect(screen.queryByText(/Economia projetada/)).not.toBeInTheDocument();
  });

  it("resets to the current total, not 12, on Ciclo Atual", async () => {
    setup({ transaction: { ...MEMBER, series: { ...MEMBER.series, total: 6 } } });

    await userEvent.click(await screen.findByRole("radio", { name: "12 meses" }));
    expect(screen.getByRole("radio", { name: "12 meses" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Ciclo Atual" }));
    expect(screen.getByRole("radio", { name: "6 meses" })).toBeChecked();
    expect(screen.queryByText(/Série estendida/)).not.toBeInTheDocument();
  });

  it("says Remove o último mês for one month and sends no count when it stays on the total", async () => {
    const { sent } = setup({ transaction: MEMBER }, resize);

    await userEvent.click(await screen.findByRole("radio", { name: "Customizado" }));
    const custom = screen.getByLabelText("Meses");
    await userEvent.clear(custom);
    await userEvent.type(custom, "11");
    expect(screen.getByText("Série encurtada: Remove o último mês. Termina em Agosto/2027.")).toBeInTheDocument();
    expect(screen.getByText("Economia projetada de R$ 1.200,00 no orçamento previsto.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "12 meses" }));
    expect(screen.queryByText(/Série encurtada|Série estendida/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));

    expect(await sent("PATCH")).not.toHaveProperty("repeat_months");
    expect(await screen.findByText("Lançamento atualizado")).toBeInTheDocument();
  });

  it("preselects Customizado for a total off the presets and asks for at least the member's position", async () => {
    const { requests } = setup(
      { transaction: { ...MEMBER, series: { ...MEMBER.series, position: 5, total: 7 } } },
      resize,
    );

    expect(await screen.findByRole("radio", { name: "Customizado" })).toBeChecked();
    const custom = screen.getByLabelText("Meses");
    expect(custom).toHaveValue("7");
    expect(screen.getByRole("radio", { name: "3 meses" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "6 meses" })).toBeEnabled();
    await userEvent.clear(custom);
    await userEvent.type(custom, "4");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));

    expect(custom).toHaveAccessibleDescription("Escolha de 5 a 60 meses.");
    expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(0);
  });

  it("saves an edit to the only member left in a series without a count", async () => {
    const { sent } = setup({ transaction: { ...MEMBER, series: { ...MEMBER.series, position: 1, total: 1 } } }, resize);

    const amount = await screen.findByLabelText("Valor por parcela");
    await userEvent.clear(amount);
    await userEvent.type(amount, "9990");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações na Série" }));

    const body = await sent("PATCH");
    expect(body).toMatchObject({ amount: "99.90" });
    expect(body).not.toHaveProperty("repeat_months");
  });

  it("locks Duração da série while the member's date moves and sends no count", async () => {
    const { sent } = setup({ transaction: MEMBER }, resize);

    const months = await screen.findByRole("radiogroup", { name: "Duração da série" });
    await userEvent.click(within(months).getByRole("radio", { name: "6 meses" }));
    expect(screen.getByText(/Série encurtada/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hoje" }));
    expect(within(months).getByRole("radio", { name: "12 meses" })).toBeDisabled();
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
    expect(screen.getByRole("radio", { name: "12 meses" })).toBeDisabled();
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

  it("offers Transformar em conta fixa only for a Saída without Repetir", async () => {
    setup({ billSheet });

    const link = "Criar como Conta Fixa";
    expect(await screen.findByRole("switch", { name: "Repetir lançamento (Série)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: link })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Conta" }));
    expect(screen.getByText(/Prefere transformar em conta fixa recorrente\?/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Repetir lançamento (Série)" }));
    expect(screen.queryByRole("button", { name: link })).not.toBeInTheDocument();
  });

  it("offers no Transformar em conta fixa when the host has no bill sheet", async () => {
    setup({ initialKind: "bill" });

    expect(await screen.findByRole("switch", { name: "Repetir lançamento (Série)" })).toBeInTheDocument();
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

  it("parcela 1.000,01 em 10x: summary and Salvar posts the total once", async () => {
    const { sent } = setup();
    await userEvent.click(screen.getByLabelText(/^Valor d/));
    await userEvent.keyboard("1000,01");
    await userEvent.click(screen.getByRole("switch", { name: "Repetir lançamento (Série)" }));
    await userEvent.click(screen.getByRole("switch", { name: "Parcelar compra" }));
    expect(screen.getByRole("switch", { name: "Repetir lançamento (Série)" })).not.toBeChecked();
    expect(screen.getByRole("radiogroup", { name: "Quantas parcelas" })).toBeInTheDocument();
    expect(screen.getByText("Projeção: 12× de R$ 83,33")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Outro" }));
    await userEvent.type(screen.getByLabelText("Parcelas"), "10");

    expect(screen.getByText("Divide o valor total de R$ 1.000,01 em 10 parcelas automáticas")).toBeInTheDocument();
    expect(screen.getByText("Projeção: 10× de R$ 100,00")).toBeInTheDocument();
    expect(
      screen.getByText("Última parcela será ajustada para R$ 100,01 devido a centavos residuais."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar Lançamento" }).closest(FOOTER)).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

    const body = await sent("POST");
    expect(body).toMatchObject({ amount: "1000.01", installments: 10 });
    expect(body).not.toHaveProperty("repeat_months");
    expect(await screen.findByText("10 parcelas lançadas")).toBeInTheDocument();
  });

  it("sums an even split in one line, and Repetir turns Parcelar off", async () => {
    setup();
    await userEvent.click(screen.getByLabelText(/^Valor d/));
    await userEvent.keyboard("300,00");
    await userEvent.click(await screen.findByRole("switch", { name: "Parcelar compra" }));
    await userEvent.click(screen.getByRole("radio", { name: "3×" }));
    expect(screen.getByText("Divide o valor total de R$ 300,00 em 3 parcelas automáticas")).toBeInTheDocument();
    expect(screen.getByText("Projeção: 3× de R$ 100,00")).toBeInTheDocument();
    expect(screen.queryByText(/centavos residuais/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar como Conta Fixa" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Repetir lançamento (Série)" }));
    expect(screen.getByRole("switch", { name: "Parcelar compra" })).not.toBeChecked();
  });

  it("asks for 2 to 60 parcelas in Outro", async () => {
    const { requests } = setup();
    await userEvent.click(screen.getByLabelText(/^Valor d/));
    await userEvent.keyboard("300,00");
    await userEvent.click(await screen.findByRole("switch", { name: "Parcelar compra" }));
    await userEvent.click(screen.getByRole("radio", { name: "Outro" }));
    const parcelas = screen.getByLabelText("Parcelas");
    await userEvent.type(parcelas, "61");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));
    expect(parcelas).toHaveAccessibleDescription("Escolha de 2 a 60 parcelas.");
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);
  });

  it("refuses a parcela at zero and offers Parcelar only on Saída and Diário", async () => {
    const { requests } = setup();
    await userEvent.click(screen.getByLabelText(/^Valor d/));
    await userEvent.keyboard("0,05");
    await userEvent.click(await screen.findByRole("switch", { name: "Parcelar compra" }));
    await userEvent.click(screen.getByRole("radio", { name: "Outro" }));
    await userEvent.type(screen.getByLabelText("Parcelas"), "6");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Valor pequeno demais para 6 parcelas.");
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);

    await userEvent.click(screen.getByRole("radio", { name: "Entrada" }));
    expect(screen.queryByRole("switch", { name: "Parcelar compra" })).not.toBeInTheDocument();
  });

  it("drops Parcelar on Entrada", async () => {
    setup();
    await userEvent.click(await screen.findByRole("switch", { name: "Parcelar compra" }));
    await userEvent.click(screen.getByRole("radio", { name: "Entrada" }));
    await userEvent.click(screen.getByRole("radio", { name: "Conta" }));
    expect(screen.getByRole("switch", { name: "Parcelar compra" })).not.toBeChecked();
  });

  it("offers no Parcelar when editing", async () => {
    setup({ transaction: MERCADO_ROW });
    await screen.findByRole("dialog", { name: "Editar lançamento" });
    expect(screen.queryByRole("switch", { name: "Parcelar compra" })).not.toBeInTheDocument();
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
    const repeat = screen.getByRole("switch", { name: "Repetir lançamento (Série)" });
    expect(erase.closest(FOOTER)).toBe(save.closest(FOOTER));
    expect(erase.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(repeat.compareDocumentPosition(erase) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sums a series: 12× de R$ 39,90 · repete todo dia 10 até out 2027", async () => {
    setup();
    await userEvent.type(await screen.findByLabelText(/^Valor d/), "3990");
    await pickDate("Outra data", "2026-11-10");
    await userEvent.click(screen.getByRole("switch", { name: "Repetir lançamento (Série)" }));

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
      await userEvent.click(screen.getByRole("switch", { name: "Repetir lançamento (Série)" }));
      expect(screen.getByRole("radio", { name: "Mensal" })).toBeChecked();
      await userEvent.click(screen.getByRole("radio", { name: "Semanal" }));
      expect(screen.getByText("12× de R$ 150,00 · repete toda semana até 21 jan 2027")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("radio", { name: "Anual" }));
      expect(screen.getByText("12× de R$ 150,00 · repete todo ano em 5 nov até 2037")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("radio", { name: "Semanal" }));
      await userEvent.click(screen.getByRole("radio", { name: "3×" }));
      expect(screen.getByText("3× de R$ 150,00 · repete toda semana até 19 nov 2026")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

      expect(await sent("POST")).toMatchObject({ repeat_months: 3, repeat_every: "week" });
      expect(await screen.findByText("3 lançamentos criados")).toBeInTheDocument();
    });

    it("words the custom count in the step's unit", async () => {
      setup();

      await userEvent.click(await screen.findByRole("switch", { name: "Repetir lançamento (Série)" }));
      await userEvent.click(screen.getByRole("radio", { name: "Anual" }));
      await userEvent.click(screen.getByRole("radio", { name: "Outro" }));
      await userEvent.type(screen.getByLabelText("Anos"), "61");
      await userEvent.click(screen.getByRole("button", { name: "Salvar Lançamento" }));

      expect(screen.getByLabelText("Anos")).toHaveAccessibleDescription("Escolha de 2 a 60 anos.");
    });

    it("hides the segment for Parcelar compra and resets it to Mensal when Repetir turns off", async () => {
      setup();

      const repeat = await screen.findByRole("switch", { name: "Repetir lançamento (Série)" });
      await userEvent.click(repeat);
      await userEvent.click(screen.getByRole("radio", { name: "Anual" }));
      await userEvent.click(repeat);
      await userEvent.click(repeat);
      expect(screen.getByRole("radio", { name: "Mensal" })).toBeChecked();
      await userEvent.click(screen.getByRole("switch", { name: "Parcelar compra" }));

      expect(screen.queryByRole("group", { name: "Frequência" })).not.toBeInTheDocument();
    });

    it("edits a weekly series in weeks: eyebrow, chips, resize line and toast", async () => {
      const { sent } = setup({ transaction: WEEKLY }, weekly);

      expect(await screen.findByText("Parte de uma série de 8 semanas")).toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Frequência" })).not.toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "3 semanas" })).toBeEnabled();
      await userEvent.click(screen.getByRole("radio", { name: "6 semanas" }));
      expect(
        screen.getByText("Série encurtada: Remove as 2 últimas semanas. Termina em 26/11/2026."),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole("radio", { name: "Customizado" }));
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
