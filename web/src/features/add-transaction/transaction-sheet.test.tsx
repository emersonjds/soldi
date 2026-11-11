import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pickDate } from "@/test/pick-date";
import { renderWithQuery } from "@/test/render";
import {
  ALUGUEL,
  BILL_ALUGUEL,
  CATEGORIES,
  EXTRA,
  FORECAST,
  FORECAST_FLAT,
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
const MEMBER = { ...ALUGUEL_ROW, series: { id: "s1", position: 3, total: 12, last_date: "2027-09-04" } };

const FOOTER = '[data-slot="responsive-sheet-footer"]';

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

    const dialog = await screen.findByRole("dialog", { name: "Lançar" });
    expect(dialog).toHaveAttribute("data-slot", "sheet-content");
    expect(within(dialog).getByRole("button", { name: "Salvar" }).closest(FOOTER)).not.toBeNull();
    expect(await screen.findByRole("combobox", { name: "Categoria" })).toHaveTextContent("Mercado");
    expect(screen.getByRole("radio", { name: "Diário" })).toBeChecked();
    await userEvent.keyboard("35,90");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await sent("POST")).toEqual({
      date: "2026-11-05",
      amount: "35.90",
      kind: "daily",
      category_id: MERCADO.id,
      note: null,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(await screen.findByText("Lançado")).toBeInTheDocument();
  });

  it("switches kind, preselects its first category and takes yesterday and a note", async () => {
    const { sent } = setup();

    await userEvent.click(await screen.findByRole("radio", { name: "Entrada" }));
    expect(await screen.findByRole("combobox", { name: "Categoria" })).toHaveTextContent("Salário");
    await userEvent.click(screen.getByRole("combobox", { name: "Categoria" }));
    await userEvent.click(await screen.findByRole("option", { name: "Extra" }));
    await userEvent.type(screen.getByLabelText("Valor"), "abc1.250,00");
    await userEvent.click(screen.getByRole("button", { name: "Ontem" }));
    await userEvent.type(screen.getByLabelText("Observação"), "Freela");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

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

    expect(await screen.findByRole("combobox", { name: "Categoria" })).toHaveTextContent("Reserva");
    expect(screen.getByRole("radio", { name: "Saída" })).toBeChecked();
    await userEvent.keyboard("200,00");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await sent("POST")).toMatchObject({ amount: "200.00", kind: "bill", category_id: RESERVA.id });
  });

  it("takes any date from the date input", async () => {
    const { sent } = setup();

    await userEvent.type(await screen.findByLabelText("Valor"), "10");
    await pickDate("Outra data", "2026-10-28");
    await waitFor(() => expect(screen.getByRole("button", { name: "Outra data, 28/10/2026" })).toHaveFocus());
    expect(screen.getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await sent("POST")).toMatchObject({ date: "2026-10-28" });
  });

  it("offers no day before the opening date: Ontem leaves and the calendar disables it", async () => {
    setup({}, { "GET /api/settings": { status: 200, body: { ...SETTINGS, opening_date: "2026-11-05" } } });

    const dialog = await screen.findByRole("dialog", { name: "Lançar" });
    await waitFor(() => expect(within(dialog).queryByRole("button", { name: "Ontem" })).not.toBeInTheDocument());
    expect(within(dialog).getByRole("button", { name: "Hoje" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Outra data, 05/11/2026" }));

    expect(await screen.findByRole("button", { name: "quarta-feira, 4 de novembro de 2026" })).toBeDisabled();
  });

  it("asks for an amount and a category inline, without calling the API", async () => {
    const { requests } = setup({}, { "GET /api/categories": { status: 200, body: [SALARIO] } });

    await userEvent.click(await screen.findByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Informe um valor")).toBeInTheDocument();
    expect(screen.getByText("Escolha uma categoria")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Valor"), "0");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("Informe um valor")).toBeInTheDocument();
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);
  });

  it("edits a transaction with its values filled in and sends the patch", async () => {
    const { onOpenChange, sent } = setup({ transaction: MERCADO_ROW });

    expect(await screen.findByRole("dialog", { name: "Editar lançamento" })).toBeInTheDocument();
    const amount = screen.getByLabelText("Valor");
    expect(amount).toHaveValue("184,31");
    expect(screen.getByLabelText("Observação")).toHaveValue("Compras da semana");
    expect(await screen.findByRole("combobox", { name: "Categoria" })).toHaveTextContent("Mercado");
    expect(screen.getByRole("button", { name: "Outra data, 05/11/2026" })).toBeInTheDocument();
    await userEvent.clear(amount);
    await userEvent.type(amount, "20000");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

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

  it("tells when the server refuses", async () => {
    setup({}, { "POST /api/transactions": { status: 422, body: problem(422, "amount") } });

    await userEvent.type(await screen.findByLabelText("Valor"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Não foi possível salvar o lançamento.")).toBeInTheDocument();
  });

  it("creates a category from the picker, selects it and keeps the sheet open", async () => {
    const carro = { ...MERCADO, id: "c1000000-0000-4000-8000-000000000099", name: "Carro", icon: "car" };
    setup();

    await userEvent.click(await screen.findByRole("button", { name: "Nova categoria" }));
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Nova" })).getByRole("button", { name: /^Categoria/ }),
    );
    const create = await screen.findByRole("dialog", { name: "Nova categoria" });
    const requests = stubApi({
      "GET /api/categories": { status: 200, body: [...CATEGORIES, carro] },
      "POST /api/categories": { status: 201, body: carro },
    });
    await userEvent.type(within(create).getByLabelText("Nome"), "Carro{Enter}");

    expect(await screen.findByRole("combobox", { name: "Categoria" })).toHaveTextContent("Carro");
    expect(screen.getByRole("dialog", { name: "Lançar" })).toBeInTheDocument();
    expect(requests.filter((request) => request.url.endsWith("/api/transactions"))).toHaveLength(0);
  });

  it("repeats a launch: Repetir on preselects 12x, a preset changes the count and the last month", async () => {
    const { sent } = setup();

    const repeat = await screen.findByRole("switch", { name: "Repetir" });
    expect(repeat).not.toBeChecked();
    expect(screen.queryByRole("radio", { name: "12x" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Valor"), "15000");
    await userEvent.click(repeat);

    expect(screen.getByRole("radio", { name: "12x" })).toBeChecked();
    expect(screen.getByText("12× R$ 150,00 · até out 2027")).toBeInTheDocument();
    expect(screen.queryByText("Em meses mais curtos, cai no último dia.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "3x" }));
    expect(screen.getByText("3× R$ 150,00 · até jan 2027")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await sent("POST")).toMatchObject({ amount: "150.00", repeat_months: 3 });
    expect(await screen.findByText("3 lançamentos criados")).toBeInTheDocument();
  });

  it("tells only the last month while the amount is missing", async () => {
    setup();

    await userEvent.click(await screen.findByRole("switch", { name: "Repetir" }));

    expect(screen.getByText("até out 2027")).toBeInTheDocument();
    expect(screen.queryByText(/12×/)).not.toBeInTheDocument();
  });

  it("takes Outro from 2 to 60 months, inline error otherwise, and warns about short months from day 29", async () => {
    const { requests, sent } = setup();

    await userEvent.type(await screen.findByLabelText("Valor"), "1000");
    await pickDate("Outra data", "2026-10-31");
    await userEvent.click(screen.getByRole("switch", { name: "Repetir" }));
    expect(screen.getByText("Em meses mais curtos, cai no último dia.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Outro" }));
    const months = screen.getByLabelText("Meses");
    await userEvent.type(months, "61");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(months).toHaveAccessibleDescription("Escolha de 2 a 60 meses.");
    expect(months).toHaveAttribute("aria-invalid", "true");
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);
    await userEvent.clear(months);
    await userEvent.type(months, "24");
    expect(screen.getByText("24× R$ 10,00 · até set 2028")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await sent("POST")).toMatchObject({ date: "2026-10-31", repeat_months: 24 });
  });

  it("turns a standalone entry into a series from Editar", async () => {
    const { sent } = setup({ transaction: MERCADO_ROW });

    await userEvent.click(await screen.findByRole("switch", { name: "Repetir" }));
    await userEvent.click(screen.getByRole("radio", { name: "2x" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await sent("PATCH")).toMatchObject({ repeat_months: 2 });
    expect(await screen.findByText("2 lançamentos criados")).toBeInTheDocument();
  });

  it("offers no Repetir for a bill payment, saying why", async () => {
    setup({ transaction: { ...ALUGUEL_ROW, recurring_bill_id: "b1" } });

    expect(await screen.findByText("Já é uma conta fixa recorrente.")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Repetir" })).not.toBeInTheDocument();
  });

  it("offers no Repetir for a resgate", async () => {
    setup({ transaction: { ...TRANSACTIONS[2], cofrinho_id: "c1" } });

    expect(await screen.findByRole("dialog", { name: "Editar lançamento" })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Repetir" })).not.toBeInTheDocument();
    expect(screen.queryByText("Já é uma conta fixa recorrente.")).not.toBeInTheDocument();
  });

  it("edits a series member: Só este by default, Este e os próximos sends the scope", async () => {
    const { requests } = setup(
      { transaction: MEMBER },
      { [`PATCH /api/transactions/${MEMBER.id}`]: { status: 200, body: MEMBER } },
    );

    expect(await screen.findByText("Parte de uma série de 12")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Repetir" })).not.toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Aplicar em" })).toBeInTheDocument();
    expect(screen.getByText("Aplicar em")).toBeVisible();
    expect(screen.getByRole("radio", { name: "Só este" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Este e os próximos" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(requests.some((request) => request.method === "PATCH")).toBe(true));
    const patch = requests.find((request) => request.method === "PATCH");
    expect(new URL(patch?.url ?? "").searchParams.get("scope")).toBe("following");
    expect(await screen.findByText("Série atualizada")).toBeInTheDocument();
  });

  it("reads Toda a série on the first member", async () => {
    setup({ transaction: { ...MEMBER, series: { ...MEMBER.series, position: 1 } } });

    expect(await screen.findByRole("radio", { name: "Toda a série" })).toBeInTheDocument();
  });

  const resize = { [`PATCH /api/transactions/${MEMBER.id}`]: { status: 200, body: MEMBER } };

  it("resizes a series member: Meses na série on the total, chips below the position off, helpers name the change", async () => {
    const { sent } = setup({ transaction: MEMBER }, resize);

    const months = await screen.findByRole("radiogroup", { name: "Meses na série" });
    expect(screen.getByText("Meses na série")).toBeVisible();
    expect(within(months).getByRole("radio", { name: "12x" })).toBeChecked();
    expect(within(months).getByRole("radio", { name: "2x" })).toBeDisabled();
    expect(within(months).getByRole("radio", { name: "3x" })).toBeEnabled();
    expect(screen.queryByText(/Remove|até/)).not.toBeInTheDocument();

    await userEvent.click(within(months).getByRole("radio", { name: "6x" }));
    expect(screen.getByText("Remove os 6 últimos")).toBeInTheDocument();
    await userEvent.click(within(months).getByRole("radio", { name: "Outro" }));
    const custom = screen.getByLabelText("Meses");
    await userEvent.clear(custom);
    await userEvent.type(custom, "15");
    expect(screen.getByText("+3× R$ 1.200,00 · até dez 2027")).toBeInTheDocument();
    const amount = screen.getByLabelText("Valor");
    await userEvent.clear(amount);
    expect(screen.getByText("+3× · até dez 2027")).toBeInTheDocument();
    await userEvent.type(amount, "9990");
    expect(screen.getByText("+3× R$ 99,90 · até dez 2027")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await sent("PATCH")).toMatchObject({ amount: "99.90", repeat_months: 15 });
    expect(await screen.findByText("Série ajustada para 15 meses")).toBeInTheDocument();
  });

  it("says Remove o último for one month and sends no count when it stays on the total", async () => {
    const { sent } = setup({ transaction: MEMBER }, resize);

    await userEvent.click(await screen.findByRole("radio", { name: "Outro" }));
    const custom = screen.getByLabelText("Meses");
    await userEvent.clear(custom);
    await userEvent.type(custom, "11");
    expect(screen.getByText("Remove o último")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "12x" }));
    expect(screen.queryByText(/Remove|até/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

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
    expect(screen.getByRole("radio", { name: "3x" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "6x" })).toBeEnabled();
    await userEvent.clear(custom);
    await userEvent.type(custom, "4");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(custom).toHaveAccessibleDescription("Escolha de 5 a 60 meses.");
    expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(0);
  });

  it("saves an edit to the only member left in a series without a count", async () => {
    const { sent } = setup({ transaction: { ...MEMBER, series: { ...MEMBER.series, position: 1, total: 1 } } }, resize);

    const amount = await screen.findByLabelText("Valor");
    await userEvent.clear(amount);
    await userEvent.type(amount, "9990");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    const body = await sent("PATCH");
    expect(body).toMatchObject({ amount: "99.90" });
    expect(body).not.toHaveProperty("repeat_months");
  });

  it("locks Meses na série while the member's date moves and sends no count", async () => {
    const { sent } = setup({ transaction: MEMBER }, resize);

    const months = await screen.findByRole("radiogroup", { name: "Meses na série" });
    await userEvent.click(within(months).getByRole("radio", { name: "6x" }));
    expect(screen.getByText("Remove os 6 últimos")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hoje" }));
    expect(within(months).getByRole("radio", { name: "12x" })).toBeDisabled();
    expect(screen.queryByText(/Remove|até/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    const body = await sent("PATCH");
    expect(body).toMatchObject({ date: "2026-11-05" });
    expect(body).not.toHaveProperty("repeat_months");
  });

  it("moves the day of this and the following members: helper names the day, toast Série movida", async () => {
    const { sent } = setup({ transaction: MEMBER }, resize);

    await userEvent.click(await screen.findByRole("radio", { name: "Este e os próximos" }));
    await pickDate("Outra data", "2026-11-10");
    expect(screen.getByText("Os próximos também vão para o dia 10.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "12x" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    const body = await sent("PATCH");
    expect(body).toMatchObject({ date: "2026-11-10" });
    expect(body).not.toHaveProperty("repeat_months");
    expect(await screen.findByText("Série movida para o dia 10")).toBeInTheDocument();
  });

  it("says Toda a série on the first member and warns about shorter months from day 29", async () => {
    setup({ transaction: { ...MEMBER, series: { ...MEMBER.series, position: 1 } } });

    await userEvent.click(await screen.findByRole("radio", { name: "Toda a série" }));
    await pickDate("Outra data", "2026-11-28");
    expect(screen.getByText("Toda a série vai para o dia 28.")).toBeInTheDocument();
    await pickDate("Outra data", "2026-11-30");
    expect(
      screen.getByText("Toda a série vai para o dia 30. Nos meses mais curtos, no último dia."),
    ).toBeInTheDocument();
  });

  it("shows no day helper with Só este", async () => {
    setup({ transaction: MEMBER });

    await screen.findByRole("radio", { name: "Só este" });
    await pickDate("Outra data", "2026-12-10");
    expect(screen.queryByText(/va[io] para o dia/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("blocks a month change with Este e os próximos until Só este is chosen", async () => {
    const { requests, sent } = setup({ transaction: MEMBER }, resize);

    await userEvent.click(await screen.findByRole("radio", { name: "Este e os próximos" }));
    await pickDate("Outra data", "2026-12-10");
    expect(screen.getByRole("alert")).toHaveTextContent("Para mudar o mês, use Só este.");
    expect(screen.queryByText(/va[io] para o dia/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(0);

    await userEvent.click(screen.getByRole("radio", { name: "Só este" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

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
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(
      await screen.findByText("Outro lançamento da série está no mesmo mês. Mova-o com Só este antes."),
    ).toBeInTheDocument();
  });

  it("says the save failed when a day move is refused for its date bounds", async () => {
    setup({ transaction: MEMBER }, dateRefused("must be from 2000 to 2100"));

    await userEvent.click(await screen.findByRole("radio", { name: "Este e os próximos" }));
    await pickDate("Outra data", "2026-11-10");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Não foi possível salvar o lançamento.")).toBeInTheDocument();
    expect(screen.queryByText(/Outro lançamento da série/)).not.toBeInTheDocument();
  });

  it("keeps the stored date when its own day is picked again: no month alert, no day helper", async () => {
    const { sent } = setup({ transaction: MEMBER }, resize);

    await userEvent.click(await screen.findByRole("radio", { name: "Este e os próximos" }));
    await pickDate("Outra data", MEMBER.date);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/va[io] para o dia/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await sent("PATCH")).toMatchObject({ date: MEMBER.date });
  });

  it("says the save failed when a day move fails for another reason", async () => {
    setup(
      { transaction: MEMBER },
      { [`PATCH /api/transactions/${MEMBER.id}`]: { status: 500, body: problem(500, "No.") } },
    );

    await userEvent.click(await screen.findByRole("radio", { name: "Este e os próximos" }));
    await pickDate("Outra data", "2026-11-10");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Não foi possível salvar o lançamento.")).toBeInTheDocument();
  });

  it("offers Transformar em conta fixa only for a Saída without Repetir", async () => {
    setup({ billSheet });

    const link = "Transformar em conta fixa";
    expect(await screen.findByRole("switch", { name: "Repetir" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: link })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Saída" }));
    expect(screen.getByText(/Prefere uma conta fixa, sem data pra acabar\?/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Repetir" }));
    expect(screen.queryByRole("button", { name: link })).not.toBeInTheDocument();
  });

  it("offers no Transformar em conta fixa when the host has no bill sheet", async () => {
    setup({ initialKind: "bill" });

    expect(await screen.findByRole("switch", { name: "Repetir" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Transformar em conta fixa" })).not.toBeInTheDocument();
  });

  it("launches the Saída, then turns it into a bill prefilled from it", async () => {
    const { requests, onOpenChange } = setup(
      { billSheet },
      {
        "POST /api/transactions": { status: 201, body: ALUGUEL_ROW },
        "POST /api/bills": { status: 201, body: BILL_ALUGUEL },
      },
    );

    await userEvent.click(await screen.findByRole("radio", { name: "Saída" }));
    expect(await screen.findByRole("combobox", { name: "Categoria" })).toHaveTextContent("Aluguel");
    await userEvent.type(screen.getByLabelText("Valor"), "120000");
    await userEvent.click(screen.getByRole("button", { name: "Transformar em conta fixa" }));
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

    await userEvent.type(await screen.findByLabelText("Valor"), "100");
    await userEvent.type(screen.getByLabelText("Observação"), "Internet");
    await userEvent.click(screen.getByRole("button", { name: "Transformar em conta fixa" }));
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText("Lançado, mas a conta fixa não foi criada.")).toBeInTheDocument();
    const bill = requests.find((request) => request.url.includes("/api/bills"));
    expect(await bill?.json()).toMatchObject({ name: "Internet" });
  });

  it("does not ask for a bill when the launch itself fails", async () => {
    const { requests } = setup(
      { initialKind: "bill", billSheet },
      { "POST /api/transactions": { status: 422, body: problem(422, "amount") } },
    );

    await userEvent.type(await screen.findByLabelText("Valor"), "100");
    await userEvent.click(screen.getByRole("button", { name: "Transformar em conta fixa" }));
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText("Não foi possível salvar o lançamento.")).toBeInTheDocument();
    expect(requests.some((request) => request.url.includes("/api/bills"))).toBe(false);
  });

  it("turns the stored Saída into a bill with the bills call only, ignoring unsaved edits", async () => {
    const { requests } = setup(
      { transaction: ALUGUEL_ROW, billSheet },
      { "POST /api/bills": { status: 422, body: problem(422, "cannot-become-bill") } },
    );

    await userEvent.type(await screen.findByLabelText("Observação"), "Rascunho");
    await userEvent.click(screen.getByRole("button", { name: "Transformar em conta fixa" }));
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText("Não foi possível criar a conta fixa.")).toBeInTheDocument();
    const posts = requests.filter((request) => request.method === "POST");
    expect(posts).toHaveLength(1);
    expect(new URL(posts[0].url).searchParams.get("transaction_id")).toBe(ALUGUEL_ROW.id);
    expect(await posts[0].json()).toEqual({ name: "Aluguel", amount: "1200.00", due_day: 4, category_id: ALUGUEL.id });
  });

  it("offers no Transformar em conta fixa in Editar when the stored entry is not a Saída", async () => {
    setup({ transaction: MERCADO_ROW, billSheet });

    await userEvent.click(await screen.findByRole("radio", { name: "Saída" }));
    expect(screen.queryByRole("button", { name: "Transformar em conta fixa" })).not.toBeInTheDocument();
  });

  const simulated = (forecast = FORECAST) => ({
    "GET /api/forecast": { status: 200, body: forecast },
    "GET /api/settings": { status: 200, body: SETTINGS },
  });

  it("simulates without writing: the verdict follows each keystroke, Descartar closes", async () => {
    const { requests, onOpenChange } = setup({}, simulated());

    await userEvent.click(await screen.findByRole("switch", { name: "Simular" }));
    expect(screen.getByText("Digite um valor para simular.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Saída" }));
    await userEvent.click(screen.getByLabelText("Valor"));
    await userEvent.keyboard("6700,00");

    const simulation = await screen.findByRole("region", { name: "Simulação" });
    expect(await within(simulation).findByRole("status")).toHaveTextContent(
      "Com essa compra, hoje fica no vermelho: -R$ 550,00.",
    );
    const week = within(simulation).getByRole("list", { name: "Próximos 7 dias" });
    expect(within(week).getAllByRole("listitem")).toHaveLength(7);
    expect(within(week).getAllByRole("listitem")[0]).toHaveTextContent("10/11Crítico");
    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Simular" }));
    expect(screen.queryByRole("region", { name: "Simulação" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Simular" }));
    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);
    expect(requests.filter((request) => request.url.endsWith("/api/forecast"))).toHaveLength(1);
  });

  it("writes nothing on Enter while simulating, hides Transformar em conta fixa, and Lançar de verdade saves", async () => {
    const { requests, sent } = setup({ billSheet }, simulated());

    await userEvent.click(await screen.findByRole("switch", { name: "Simular" }));
    await userEvent.click(screen.getByRole("radio", { name: "Saída" }));
    await userEvent.click(screen.getByLabelText("Valor"));
    await userEvent.keyboard("50,00{Enter}");
    fireEvent.submit(screen.getByRole("dialog").querySelector("form") as HTMLFormElement);

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Transformar em conta fixa" })).not.toBeInTheDocument();
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Lançar de verdade" }));
    expect(await sent("POST")).toMatchObject({ amount: "50.00", kind: "bill" });
  });

  it("saves on Enter in Valor when not simulating", async () => {
    const { sent } = setup();
    await screen.findByRole("combobox", { name: "Categoria" });
    await userEvent.keyboard("35,90{Enter}");
    expect(await sent("POST")).toMatchObject({ amount: "35.90", kind: "daily" });
  });

  it("opens on Diário with Simular on when asked", async () => {
    setup({ initialSimulate: true }, simulated());
    expect(await screen.findByRole("switch", { name: "Simular" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Diário" })).toBeChecked();
    expect(screen.getByRole("region", { name: "Simulação" })).toHaveTextContent("Digite um valor para simular.");
  });

  it("says when red days were already there", async () => {
    setup({}, simulated());
    await userEvent.click(await screen.findByRole("switch", { name: "Simular" }));
    await userEvent.click(screen.getByLabelText("Valor"));
    await userEvent.keyboard("100,00");
    await pickDate("Outra data", "2026-11-24");
    expect(await screen.findByRole("status")).toHaveTextContent("Essa compra não cria dia vermelho novo.");
  });

  it("is clear on a flat forecast", async () => {
    setup({}, simulated(FORECAST_FLAT));
    await userEvent.click(await screen.findByRole("switch", { name: "Simular" }));
    await userEvent.click(screen.getByLabelText("Valor"));
    await userEvent.keyboard("50,00");
    expect(await screen.findByRole("status")).toHaveTextContent("Nenhum dia vermelho com essa compra.");
  });

  it("parcela 1.000,01 em 10x: summary, the months strip, and Lançar de verdade posts the total once", async () => {
    const { sent } = setup({}, simulated());
    await userEvent.click(await screen.findByRole("switch", { name: "Simular" }));
    await userEvent.click(screen.getByLabelText("Valor"));
    await userEvent.keyboard("1000,01");
    await userEvent.click(screen.getByRole("switch", { name: "Repetir" }));
    await userEvent.click(screen.getByRole("switch", { name: "Parcelar" }));
    expect(screen.getByRole("switch", { name: "Repetir" })).not.toBeChecked();
    expect(screen.getByRole("radiogroup", { name: "Quantas parcelas" })).toBeInTheDocument();
    expect(screen.getByText("11× R$ 83,33 + R$ 83,38 na última · até out 2027")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Outro" }));
    await userEvent.type(screen.getByLabelText("Parcelas"), "10");

    expect(screen.getByText("9× R$ 100,00 + R$ 100,01 na última · até ago 2027")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Meses com essa compra" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lançar de verdade" }).closest(FOOTER)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Descartar" }).closest(FOOTER)).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Lançar de verdade" }));

    const body = await sent("POST");
    expect(body).toMatchObject({ amount: "1000.01", installments: 10 });
    expect(body).not.toHaveProperty("repeat_months");
    expect(await screen.findByText("10 parcelas lançadas")).toBeInTheDocument();
  });

  it("sums an even split in one line, and Repetir turns Parcelar off", async () => {
    setup();
    await userEvent.click(screen.getByLabelText("Valor"));
    await userEvent.keyboard("300,00");
    await userEvent.click(await screen.findByRole("switch", { name: "Parcelar" }));
    await userEvent.click(screen.getByRole("radio", { name: "3x" }));
    expect(screen.getByText("3× R$ 100,00 · até jan 2027")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Transformar em conta fixa" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Repetir" }));
    expect(screen.getByRole("switch", { name: "Parcelar" })).not.toBeChecked();
  });

  it("asks for 2 to 60 parcelas in Outro", async () => {
    const { requests } = setup();
    await userEvent.click(screen.getByLabelText("Valor"));
    await userEvent.keyboard("300,00");
    await userEvent.click(await screen.findByRole("switch", { name: "Parcelar" }));
    await userEvent.click(screen.getByRole("radio", { name: "Outro" }));
    const parcelas = screen.getByLabelText("Parcelas");
    await userEvent.type(parcelas, "61");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(parcelas).toHaveAccessibleDescription("Escolha de 2 a 60 parcelas.");
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);
  });

  it("refuses a parcela at zero and offers Parcelar only on Saída and Diário", async () => {
    const { requests } = setup();
    await userEvent.click(screen.getByLabelText("Valor"));
    await userEvent.keyboard("0,05");
    await userEvent.click(await screen.findByRole("switch", { name: "Parcelar" }));
    await userEvent.click(screen.getByRole("radio", { name: "Outro" }));
    await userEvent.type(screen.getByLabelText("Parcelas"), "6");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Valor pequeno demais para 6 parcelas.");
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);

    await userEvent.click(screen.getByRole("radio", { name: "Entrada" }));
    expect(screen.queryByRole("switch", { name: "Parcelar" })).not.toBeInTheDocument();
  });

  it("describes Simular with its helper", async () => {
    setup();
    expect(await screen.findByRole("switch", { name: "Simular" })).toHaveAccessibleDescription(
      "Veja o efeito antes de lançar.",
    );
  });

  it("asks for 2 to 60 parcelas to simulate when the count is missing", async () => {
    setup({}, simulated());
    await userEvent.click(await screen.findByRole("switch", { name: "Simular" }));
    await userEvent.click(screen.getByLabelText("Valor"));
    await userEvent.keyboard("300,00");
    await userEvent.click(screen.getByRole("switch", { name: "Parcelar" }));
    await userEvent.click(screen.getByRole("radio", { name: "Outro" }));
    const simulation = screen.getByRole("region", { name: "Simulação" });
    expect(simulation).toHaveTextContent("Escolha de 2 a 60 parcelas para simular.");
    expect(simulation).not.toHaveTextContent("Digite um valor para simular.");
  });

  it("drops Parcelar on Entrada", async () => {
    setup();
    await userEvent.click(await screen.findByRole("switch", { name: "Parcelar" }));
    await userEvent.click(screen.getByRole("radio", { name: "Entrada" }));
    await userEvent.click(screen.getByRole("radio", { name: "Saída" }));
    expect(screen.getByRole("switch", { name: "Parcelar" })).not.toBeChecked();
  });

  it("offers no Simular nor Parcelar when editing", async () => {
    setup({ transaction: MERCADO_ROW });
    await screen.findByRole("dialog", { name: "Editar lançamento" });
    expect(screen.queryByRole("switch", { name: "Simular" })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Parcelar" })).not.toBeInTheDocument();
  });

  it("is a centered dialog from 1024px", async () => {
    window.innerWidth = 1440;
    setup();

    expect(await screen.findByRole("dialog", { name: "Lançar" })).toHaveAttribute("data-slot", "dialog-content");
  });
});
