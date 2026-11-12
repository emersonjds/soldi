import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import {
  BILL_ALUGUEL,
  COMIDA,
  forecastFixture,
  MONTH,
  problem,
  SETTINGS,
  stubApi,
  WITH_COFRINHOS,
} from "@/test/stub-api";

import { PurchaseSimulator } from "./purchase-simulator";

const forecast = (march: string) =>
  forecastFixture("2026-11-10", "2026-11-10", "2027-10-31", [
    ["2026-11-10", "3000.00"],
    ["2027-03-15", march],
    ["2027-03-25", "3000.00"],
  ]);

const outflow = (name: string, amount: string): Schemas["BillOfMonth"] => ({
  amount,
  bill_id: BILL_ALUGUEL.id,
  color: "cat-1",
  due_date: "2027-03-15",
  icon: "receipt",
  is_card: false,
  lands_on: "2027-03-15",
  name,
  overdue: false,
  paid: false,
  transaction_id: null,
});

const MARCH: Schemas["MonthView"] = {
  ...MONTH,
  month: "2027-03",
  bills_of_month: [outflow("Luz", "80.00"), outflow("IPVA 2027", "1000.00"), outflow("Seguro Auto", "500.00")],
};

const NUBANK: Schemas["Bill"] = {
  ...BILL_ALUGUEL,
  id: "b1000000-0000-4000-8000-000000000042",
  name: "Nubank",
  closing_day: 5,
  due_day: 15,
};

const setup = (replies: Record<string, { status: number; body?: unknown }> = {}) => {
  stubApi({
    "GET /api/forecast": { status: 200, body: forecast("1500.00") },
    "GET /api/settings": { status: 200, body: SETTINGS },
    "GET /api/categories": { status: 200, body: WITH_COFRINHOS },
    "GET /api/bills": { status: 200, body: [] },
    "GET /api/months/2026-11": { status: 200, body: MONTH },
    "GET /api/months/2027-03": { status: 200, body: MARCH },
    ...replies,
  });
  renderWithQuery(<PurchaseSimulator />);
};

const typeAmount = async (typed: string) => {
  await userEvent.click(screen.getByLabelText("Valor total estimado"));
  await userEvent.keyboard(typed);
};

const calculate = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Calcular Projeção" }));
  return screen.findByRole("region", { name: "Veredito do orçamento" });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 10, 12));
});

afterEach(() => vi.useRealTimers());

describe("Posso comprar isso?", () => {
  it("opens on the empty form: header, Parâmetros, the tip, Calcular waiting for a value", async () => {
    setup();

    expect(screen.getByRole("heading", { level: 1, name: "Posso comprar isso?" })).toBeInTheDocument();
    expect(screen.getByText("SIMULADOR PREDITIVO")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Simulação sem risco: projeta o impacto futuro no seu fluxo de caixa sem salvar nenhum lançamento na conta real.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Simular nova despesa" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "À vista" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Primeiro vencimento, 10 de Novembro, 2026" })).toBeInTheDocument();
    expect(screen.getByText(/^O Soldi cruza seus lançamentos futuros/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calcular Projeção" })).toBeDisabled();
    expect(screen.queryByText("Comprometimento de Renda")).not.toBeInTheDocument();
    expect(await screen.findByRole("radiogroup", { name: "Categoria" })).toBeInTheDocument();
  });

  it("6× R$ 2.400,00 over a red March: the verdict, the curve, six months and the actions; Testar em 10x fits", async () => {
    setup();
    await typeAmount("2400,00");
    await userEvent.click(screen.getByRole("radio", { name: "6x" }));

    expect(screen.getByText("6 parcelas de R$ 400,00 a partir de Novembro/2026.")).toBeInTheDocument();
    expect(await screen.findByText("80,0% das entradas de novembro")).toBeInTheDocument();

    const verdict = await calculate();
    expect(verdict).toHaveTextContent("VEREDITO DO ORÇAMENTO • ALERTA CRÍTICO");
    expect(verdict).toHaveTextContent("Déficit Projetado");
    expect(
      within(verdict).getByRole("heading", { name: /^Em Março você fica no vermelho: -R\$\s500,00$/ }),
    ).toBeInTheDocument();
    expect(
      await within(verdict).findByText(
        /^A compra cabe com folga em Novembro, Dezembro, Janeiro e Fevereiro, mas a soma da 5ª parcela \(R\$\s400,00\) com as despesas já agendadas \(IPVA 2027 e Seguro Auto\) deixará seu saldo negativo em R\$\s500,00 no dia 15 de Março\.$/,
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Curva de Saldo Projetado (6 Meses)" })).toBeInTheDocument();
    expect(screen.getByText("Comparativo do saldo ao fechar cada mês")).toBeInTheDocument();

    const months = within(
      screen.getByRole("list", { name: "Projeção Mensal Comparativa (Antes vs. Depois)" }),
    ).getAllByRole("listitem");
    expect(months).toHaveLength(6);
    expect(screen.getByText("Vencimento no dia 10 de cada mês")).toBeInTheDocument();
    expect(months[0]).toHaveTextContent(
      /^Novembro 2026.*Saldo Atual:R\$\s3\.000,00Saldo Projetado:R\$\s2\.600,00Parcela 1\/6- R\$\s400,00$/,
    );
    expect(months[4]).toHaveTextContent("CRÍTICO");
    expect(months[4]).toHaveTextContent(/Saldo Atual Original:R\$\s3\.000,00Saldo com Compra:R\$\s1\.000,00/);
    expect(months[4]).toHaveTextContent("Parcela 5/6 (+ IPVA 2027/Seguro Auto)");
    expect(months[3]).not.toHaveTextContent("CRÍTICO");

    expect(screen.getByRole("heading", { name: "O que você gostaria de fazer agora?" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver Detalhe de Março" })).toHaveAttribute("href", "/mes?m=2027-03");
    expect(screen.getByRole("button", { name: "Criar Cofrinho para juntar à vista" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Testar em 10x" }));
    expect(screen.getByRole("radio", { name: "10x" })).toBeChecked();
    expect(await screen.findByRole("heading", { name: "Curva de Saldo Projetado (10 Meses)" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Cabe no orçamento: nenhum mês fica no vermelho." }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "O que você gostaria de fazer agora?" })).not.toBeInTheDocument();
  });

  it("offers the next count up to 12x only, and Criar Cofrinho opens Novo cofrinho with the name and the total", async () => {
    setup({ "GET /api/forecast": { status: 200, body: forecast("30.00") } });
    await userEvent.click(await screen.findByRole("radio", { name: COMIDA.name }));
    await typeAmount("120,00");
    await userEvent.click(screen.getByRole("radio", { name: "12x" }));
    await calculate();

    expect(screen.queryByRole("button", { name: /^Testar em/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Criar Cofrinho para juntar à vista" }));
    const sheet = await screen.findByRole("dialog", { name: "Novo cofrinho" });
    expect(within(sheet).getByRole("textbox", { name: "Nome do agrupador" })).toHaveValue(COMIDA.name);
    expect(within(sheet).getByLabelText("Meta")).toHaveValue("120,00");
  });

  it("fits à vista: the green verdict and no actions; no Comprometimento at income 0", async () => {
    setup({
      "GET /api/forecast": { status: 200, body: forecast("1500.00") },
      "GET /api/months/2026-11": { status: 200, body: { ...MONTH, totals: { ...MONTH.totals, income: "0.00" } } },
    });
    await typeAmount("100,00");

    expect(screen.getByText("Pagamento único em 10 de Novembro, 2026.")).toBeInTheDocument();
    const verdict = await calculate();
    expect(verdict).toHaveTextContent("VEREDITO DO ORÇAMENTO • CABE NO ORÇAMENTO");
    expect(verdict).toHaveTextContent("Sem déficit");
    expect(screen.getByRole("heading", { name: "Curva de Saldo Projetado (1 Mês)" })).toBeInTheDocument();
    expect(screen.queryByText("Comprometimento de Renda")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "O que você gostaria de fazer agora?" })).not.toBeInTheDocument();
  });

  it("says a month was already red without the purchase", async () => {
    setup({ "GET /api/forecast": { status: 200, body: forecast("-100.00") } });
    await typeAmount("2400,00");
    await userEvent.click(screen.getByRole("radio", { name: "6x" }));

    const verdict = await calculate();
    expect(verdict).toHaveTextContent(
      /Março já estava no vermelho sem a compra; com ela, o menor saldo vai a -R\$\s2\.100,00\./,
    );
  });

  it("hides the results when an input changes, and Limpar simulação clears the form", async () => {
    setup();
    await typeAmount("2400,00");
    await calculate();

    await userEvent.click(screen.getByRole("radio", { name: "12x" }));
    expect(screen.queryByRole("region", { name: "Veredito do orçamento" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Limpar simulação" }));
    expect(screen.getByLabelText("Valor total estimado")).toHaveValue("");
    expect(screen.getByRole("radio", { name: "À vista" })).toBeChecked();

    await typeAmount("50,00");
    await userEvent.click(screen.getByRole("button", { name: "Limpar valor" }));
    expect(screen.getByRole("button", { name: "Calcular Projeção" })).toBeDisabled();
  });

  it("lands a purchase on a card on its fatura's due day", async () => {
    setup({ "GET /api/bills": { status: 200, body: [NUBANK] } });
    await userEvent.selectOptions(await screen.findByRole("combobox", { name: "Cartão" }), "Nubank");
    await typeAmount("600,00");

    expect(screen.getByText("Pagamento único em 15 de Dezembro, 2026.")).toBeInTheDocument();
    await calculate();
    const months = within(screen.getByRole("list", { name: /^Projeção Mensal/ })).getAllByRole("listitem");
    expect(months[0]).toHaveTextContent(/Parcela 0\/1Sem alteração$/);
    expect(months[1]).toHaveTextContent(/Parcela 1\/1- R\$\s600,00$/);
  });

  it("offers Tentar de novo when the forecast fails", async () => {
    setup({ "GET /api/forecast": { status: 500, body: problem(500, "Erro") } });
    await typeAmount("100,00");
    await userEvent.click(screen.getByRole("button", { name: "Calcular Projeção" }));

    expect(await screen.findByText("Não foi possível carregar a projeção.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  });
});
