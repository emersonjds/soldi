import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import {
  BILL_ALUGUEL,
  BILLS_OF_MONTH,
  CARRIED_ALUGUEL,
  MONTH,
  MOVEMENTS,
  RESGATE,
  stubApi,
  TRANSACTIONS,
  WITH_COFRINHOS,
} from "@/test/stub-api";

import { Ledger, type LedgerFilter } from "./ledger";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

type Due = Schemas["BillOfMonth"];

const CARRO: Schemas["Bill"] = { ...BILL_ALUGUEL, id: "b3000000-0000-4000-8000-000000000001", name: "Carro" };
const PARCELADA: Schemas["Bill"] = { ...CARRO, installments: 12, last_month: "2027-08-01" };
const VARIABLE: Schemas["Bill"] = { ...CARRO, id: "b3000000-0000-4000-8000-000000000002", variable: true };
const CARD: Schemas["Bill"] = {
  ...CARRO,
  id: "b3000000-0000-4000-8000-000000000003",
  name: "Porto",
  amount: null,
  closing_day: 3,
};

/** Parcela Carro, paid on the 4th. */
const PAYMENT: Schemas["Transaction"] = {
  ...TRANSACTIONS[1],
  id: "t3000000-0000-4000-8000-000000000001",
  note: "Parcela Carro",
  recurring_bill_id: CARRO.id,
};

const paidRow = (rest: Partial<Due> = {}): Due => ({
  ...BILLS_OF_MONTH[1],
  bill_id: CARRO.id,
  name: "Carro",
  paid: true,
  transaction_id: PAYMENT.id,
  lands_on: null,
  ...rest,
});

const due = (name: string, rest: Partial<Due> = {}): Due => ({
  ...BILLS_OF_MONTH[1],
  bill_id: `bill-${name}`,
  name,
  lands_on: "2026-11-10",
  ...rest,
});

/** The three unpaid states: a pagar on the 10th, overdue since the 2nd, carried from October. */
const states = (name: string, rest: Partial<Due> = {}): Due[] => [
  due(name, rest),
  due(`${name} vencida`, { due_date: "2026-11-02", overdue: true, lands_on: "2026-11-05", ...rest }),
  due(`${name} antiga`, { ...CARRIED_ALUGUEL, name: `${name} antiga`, bill_id: `old-${name}`, ...rest }),
];

type Setup = {
  transactions?: Schemas["Transaction"][];
  billsOfMonth?: Due[];
  bills?: Schemas["Bill"][];
  filter?: LedgerFilter;
  loading?: boolean;
};

const show = ({ transactions = [], billsOfMonth = [], bills = [], filter = "all", loading = false }: Setup) => {
  stubApi({
    "GET /api/categories": { status: 200, body: [...WITH_COFRINHOS, RESGATE] },
    "GET /api/bills?include_inactive=true": { status: 200, body: bills },
  });
  if (loading) {
    const answer = globalThis.fetch;
    vi.stubGlobal("fetch", (request: Request) =>
      new URL(request.url).pathname === "/api/bills" ? new Promise<Response>(() => undefined) : answer(request),
    );
  }
  renderWithQuery(
    <Ledger
      view={{ ...MONTH, bills_of_month: billsOfMonth }}
      transactions={transactions}
      filter={filter}
      onFilterChange={vi.fn()}
      open
      onOpenChange={vi.fn()}
    />,
  );
};

const row = (name: RegExp) => screen.getByRole("button", { name });
const item = (name: string) => screen.getByRole("listitem", { name });

describe("Ledger captions (SOL-159)", () => {
  it("A1: reads a paid fixa as Conta fixa · paga, never Saída", () => {
    show({ transactions: [PAYMENT], billsOfMonth: [paidRow()], bills: [CARRO] });

    expect(row(/Parcela Carro/)).toHaveTextContent("Conta fixa · paga");
    expect(row(/Parcela Carro/)).not.toHaveTextContent("Saída");
  });

  it("A2: reads a paid parcelada as Parcela X/N · paga and the last one as Última parcela · paga", () => {
    const last = { ...PAYMENT, id: "t3000000-0000-4000-8000-000000000002", note: "Última do carro" };
    show({
      transactions: [PAYMENT, last],
      billsOfMonth: [
        paidRow({ installment: 3, installments: 12 }),
        paidRow({ bill_id: "other", installment: 12, installments: 12, transaction_id: last.id }),
      ],
      bills: [PARCELADA],
    });

    expect(row(/Parcela Carro/)).toHaveTextContent("Parcela 3/12 · paga");
    expect(row(/Última do carro/)).toHaveTextContent("Última parcela · paga");
  });

  it("A3: falls back to the bill when the month has no row for the payment", async () => {
    const fixa = {
      ...PAYMENT,
      id: "t3000000-0000-4000-8000-000000000003",
      note: "Luz",
      recurring_bill_id: VARIABLE.id,
    };
    const fatura = {
      ...PAYMENT,
      id: "t3000000-0000-4000-8000-000000000004",
      note: "Porto",
      recurring_bill_id: CARD.id,
    };
    const lost = { ...PAYMENT, id: "t3000000-0000-4000-8000-000000000005", note: "Sumida", recurring_bill_id: "gone" };
    show({ transactions: [PAYMENT, fixa, fatura, lost], bills: [PARCELADA, { ...VARIABLE, variable: false }, CARD] });

    expect(await screen.findByText("Conta parcelada · paga")).toBeInTheDocument();
    expect(row(/Parcela Carro/)).toHaveTextContent("Conta parcelada · paga");
    expect(row(/Parcela Carro/)).not.toHaveTextContent("/12");
    expect(row(/Luz/)).toHaveTextContent("Conta fixa · paga");
    expect(row(/Porto/)).toHaveTextContent("Fatura · paga");
    expect(row(/Sumida/)).toHaveTextContent("Conta fixa · paga");
  });

  it("A3: reads Conta fixa · paga while the bills are loading", () => {
    show({ transactions: [PAYMENT], bills: [PARCELADA], loading: true });

    expect(row(/Parcela Carro/)).toHaveTextContent("Conta fixa · paga");
  });

  it("A4: reads a paid variable conta as Conta fixa · paga, with no mark, under Valor variável only", async () => {
    const paid = { ...PAYMENT, recurring_bill_id: VARIABLE.id };
    show({ transactions: [paid], billsOfMonth: [paidRow({ variable: true })], bills: [VARIABLE], filter: "variable" });

    expect(await screen.findByRole("button", { name: /Parcela Carro/ })).toHaveTextContent("Conta fixa · paga");
    expect(row(/Parcela Carro/)).not.toHaveTextContent("valor variável");
  });

  it("A4: drops a paid variable conta from Contas fixas once the bills load", async () => {
    const paid = { ...PAYMENT, recurring_bill_id: VARIABLE.id };
    show({ transactions: [paid], billsOfMonth: [paidRow({ variable: true })], bills: [VARIABLE], filter: "fixed" });

    expect(await screen.findByText("Nenhuma conta fixa neste mês.")).toBeInTheDocument();
  });

  it("A5: names the kind of an unpaid fixa, parcelada and last parcela in each state, red with venceu when late", () => {
    show({
      billsOfMonth: [
        ...states("Aluguel"),
        ...states("Carro", { installment: 3, installments: 12 }),
        ...states("Moto", { installment: 12, installments: 12 }),
      ],
    });

    expect(item("Aluguel")).toHaveTextContent("Conta fixa · a pagar");
    expect(item("Aluguel vencida")).toHaveTextContent("Conta fixa · venceu dia 02/11");
    expect(item("Aluguel antiga de outubro")).toHaveTextContent("Conta fixa · venceu em outubro");
    expect(item("Carro")).toHaveTextContent("Parcela 3/12 · a pagar");
    expect(item("Carro vencida")).toHaveTextContent("Parcela 3/12 · venceu dia 02/11");
    expect(item("Carro antiga de outubro")).toHaveTextContent("Parcela 3/12 · venceu em outubro");
    expect(item("Moto")).toHaveTextContent("Última parcela · a pagar");
    expect(item("Moto vencida")).toHaveTextContent("Última parcela · venceu dia 02/11");
    expect(item("Moto antiga de outubro")).toHaveTextContent("Última parcela · venceu em outubro");
    expect(within(item("Carro vencida")).getByText("Parcela 3/12 · venceu dia 02/11")).toHaveClass("text-expense");
  });

  it("A5: marks an unpaid variable row with valor variável", () => {
    show({ billsOfMonth: [due("Luz", { variable: true })] });

    expect(item("Luz")).toHaveTextContent("Conta fixa · a pagar · valor variável");
  });

  it("A6: reads a card's fatura as Fatura, paid or not", () => {
    const paid = { ...PAYMENT, note: "Porto pago", recurring_bill_id: CARD.id };
    show({
      transactions: [paid],
      billsOfMonth: [paidRow({ is_card: true }), ...states("Porto", { is_card: true })],
      bills: [CARD],
    });

    expect(row(/Porto pago/)).toHaveTextContent("Fatura · paga");
    expect(item("Porto")).toHaveTextContent("Fatura · a pagar");
    expect(item("Porto vencida")).toHaveTextContent("Fatura · venceu dia 02/11");
    expect(item("Porto antiga de outubro")).toHaveTextContent("Fatura · venceu em outubro");
  });

  it("A7: keeps Saída, Guardado, Resgatado and the series chip", async () => {
    const member: Schemas["Transaction"] = {
      ...TRANSACTIONS[1],
      id: "t3000000-0000-4000-8000-000000000006",
      note: "Curso",
      series: { id: "s1", position: 1, total: 2, last_date: "2026-12-04", every: "month", open_ended: false },
    };
    const deposit = { ...MOVEMENTS[1], recurring_bill_id: CARRO.id };
    show({ transactions: [TRANSACTIONS[1], member, deposit, MOVEMENTS[0]], bills: [CARRO] });

    expect(await screen.findByRole("button", { name: /Resgate › Reserva/ })).toHaveTextContent("Resgatado");
    expect(row(/Economia › Reserva/)).toHaveTextContent("Guardado");
    expect(row(/^Aluguel/)).toHaveTextContent("Saída");
    expect(row(/Curso/)).toHaveTextContent("↻ Saída · 1/2");
  });

  it("A8: Contas fixas holds paid and unpaid fixas, parceladas and faturas; Diário is empty without daily entries", () => {
    show({
      transactions: [PAYMENT],
      billsOfMonth: [paidRow({ installment: 3, installments: 12 }), due("Porto", { is_card: true }), due("Aluguel")],
      filter: "fixed",
    });

    expect(row(/Parcela 3\/12 · paga/)).toBeInTheDocument();
    expect(item("Porto")).toBeInTheDocument();
    expect(item("Aluguel")).toBeInTheDocument();
  });

  it("A8: Diário shows its empty text when the month holds only contas", () => {
    show({ transactions: [PAYMENT], billsOfMonth: [due("Aluguel")], filter: "daily" });

    expect(screen.getByText("Nenhum gasto diário neste mês.")).toBeInTheDocument();
  });

  it("A9 and A10: names the row by its caption, keeps the bill name on the due row, and wraps the caption", () => {
    show({
      transactions: [PAYMENT],
      billsOfMonth: [paidRow({ installment: 3, installments: 12 }), due("Aluguel Residencial")],
    });

    expect(screen.getByRole("button", { name: /Parcela 3\/12 · paga/ })).toBeInTheDocument();
    expect(item("Aluguel Residencial")).toBeInTheDocument();
    expect(screen.getByText("Parcela 3/12 · paga")).toHaveClass("flex-wrap");
  });
});
