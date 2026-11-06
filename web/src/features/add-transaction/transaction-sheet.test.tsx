import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/test/render";
import {
  CATEGORIES,
  EXTRA,
  MERCADO,
  problem,
  RESERVA,
  SALARIO,
  stubApi,
  TRANSACTIONS,
  WITH_COFRINHOS,
} from "@/test/stub-api";

import { TransactionSheet } from "./transaction-sheet";

const MERCADO_ROW = TRANSACTIONS[0];
const ALUGUEL_ROW = TRANSACTIONS[1];
const MEMBER = { ...ALUGUEL_ROW, series: { id: "s1", position: 3, total: 12 } };

const setup = (props: Partial<Parameters<typeof TransactionSheet>[0]> = {}, replies = {}) => {
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
    fireEvent.change(screen.getByLabelText("Outra data"), { target: { value: "2026-10-28" } });
    expect(screen.getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await sent("POST")).toMatchObject({ date: "2026-10-28" });
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
    expect(screen.getByLabelText("Outra data")).toHaveValue("2026-11-05");
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

  it("takes Outro from 2 to 60 months, inline error otherwise, and warns about short months from day 29", async () => {
    const { requests, sent } = setup();

    await userEvent.type(await screen.findByLabelText("Valor"), "1000");
    fireEvent.change(screen.getByLabelText("Outra data"), { target: { value: "2026-10-31" } });
    await userEvent.click(screen.getByRole("switch", { name: "Repetir" }));
    expect(screen.getByText("Em meses mais curtos, cai no último dia.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Outro" }));
    const months = screen.getByLabelText("Meses");
    await userEvent.type(months, "61");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(screen.getByText("Escolha de 2 a 60 meses.")).toBeInTheDocument();
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
    expect(screen.getByRole("radio", { name: "Só este" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Este e os próximos" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(requests.some((request) => request.method === "PATCH")).toBe(true));
    const patch = requests.find((request) => request.method === "PATCH");
    expect(new URL(patch?.url ?? "").searchParams.get("scope")).toBe("following");
    expect(await screen.findByText("Série atualizada")).toBeInTheDocument();
  });

  it("reads Toda a série on the first member", async () => {
    setup({ transaction: { ...MEMBER, series: { id: "s1", position: 1, total: 12 } } });

    expect(await screen.findByRole("radio", { name: "Toda a série" })).toBeInTheDocument();
  });

  it("is a centered dialog from 1024px", async () => {
    window.innerWidth = 1440;
    setup();

    expect(await screen.findByRole("dialog", { name: "Lançar" })).toHaveAttribute("data-slot", "dialog-content");
  });
});
