import { QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMonth } from "@/entities/month/month-query";
import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import {
  BILL_ALUGUEL,
  BILL_LUZ,
  BILLS_OF_MONTH,
  CARRIED_ALUGUEL,
  MONTH,
  problem,
  signedIn,
  TRANSACTIONS,
} from "@/test/stub-api";

import { BillsOfMonth } from "./bills-of-month";

type Reply = { status: number; body?: unknown };

const PAYMENT = { ...TRANSACTIONS[1], id: "t-paid" };
const PAID_RENT = { ...BILLS_OF_MONTH[1], paid: true, transaction_id: "t-paid" };

/** A month on the server that a test can move forward, as a payment would. */
const show = (
  bills: Schemas["BillOfMonth"][] = BILLS_OF_MONTH,
  replies: Record<string, Reply> = {},
  month = "2026-11",
) => {
  let server: Schemas["MonthView"] = { ...MONTH, month, bills_of_month: bills };
  const requests = signedIn(replies);
  const stubbed = globalThis.fetch;
  vi.stubGlobal("fetch", async (request: Request) => {
    if (new URL(request.url).pathname !== `/api/months/${month}`) return stubbed(request);
    requests.push(request);
    return Response.json(server);
  });
  const Screen = () => {
    const view = useMonth(month);
    return view.data ? <BillsOfMonth view={view.data} /> : null;
  };
  renderWithQuery(
    <>
      <Screen />
      <Toaster />
    </>,
  );
  return {
    requests,
    serverHas: (next: Schemas["BillOfMonth"][]) => {
      server = { ...server, bills_of_month: next };
    },
  };
};

const card = () => screen.getByRole("region", { name: "Contas a pagar" });
const loaded = () => screen.findByRole("region", { name: "Contas a pagar" });
const rowOf = (name: string) => within(card()).getByRole("listitem", { name });
const rows = () =>
  within(card())
    .getAllByRole("listitem")
    .map((row) => row.getAttribute("aria-label"));
const chips = () => within(card()).getByRole("radiogroup", { name: "Filtrar por dia" });

describe("Contas a pagar", () => {
  beforeEach(() => {
    window.innerWidth = 375;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("heads with the next bill, the open total and the paid count; each row has a round check and a status", async () => {
    show();
    await loaded();

    expect(card()).toHaveTextContent("Próxima: Aluguel Residencial · dia 10 · em 5 dias");
    expect(card()).toHaveTextContent(/Em aberto: R\$\s2\.543,66/);
    expect(card()).toHaveTextContent("0 de 2 pagas");
    expect(within(card()).getByRole("link", { name: "Ver todas" })).toHaveAttribute("href", "/ajustes/contas");

    const rent = rowOf("Aluguel Residencial");
    expect(rent).toHaveTextContent("Vence dia 10/11");
    expect(rent).toHaveTextContent("R$ 2.259,56");
    const check = within(rent).getByRole("button", { name: "Marcar Aluguel Residencial como paga" });
    expect(check).toHaveAttribute("aria-pressed", "false");
    expect(check).toHaveClass("size-11");
    expect(check.firstElementChild).toHaveClass("size-6", "motion-safe:duration-150");

    const power = rowOf("Luz (Enel)");
    expect(power).toHaveTextContent("Venceu dia 02/11");
    expect(power).toHaveClass("bg-expense/10");
    expect(rows()).toEqual(["Luz (Enel)", "Aluguel Residencial"]);
  });

  it("puts a 44 px chip per due day with a dot per unpaid bill; a tap filters, a second tap clears", async () => {
    show([...BILLS_OF_MONTH, { ...PAID_RENT, bill_id: "water", name: "Água" }]);
    await loaded();

    const ten = within(chips()).getByRole("radio", { name: "dia 10, 1 conta a pagar" });
    expect(ten).toHaveTextContent("dia 10");
    expect(ten).toHaveClass("h-11");
    expect(within(ten).getAllByTestId("unpaid-dot")).toHaveLength(1);
    expect(within(chips()).getByRole("radio", { name: "dia 02, 1 conta a pagar" })).toBeInTheDocument();

    await userEvent.click(ten);
    expect(ten).toHaveAttribute("aria-checked", "true");
    expect(rows()).toEqual(["Aluguel Residencial", "Água"]);

    await userEvent.click(ten);
    expect(ten).toHaveAttribute("aria-checked", "false");
    expect(rows()).toEqual(["Luz (Enel)", "Aluguel Residencial", "Água"]);
  });

  it("names a day whose bills are all paid", async () => {
    show([PAID_RENT]);
    await loaded();
    const ten = within(chips()).getByRole("radio", { name: "dia 10, nenhuma conta a pagar" });
    expect(within(ten).queryByTestId("unpaid-dot")).not.toBeInTheDocument();
  });

  it("gives October's unpaid rent its own chip, first, and its overdue badge (D17)", async () => {
    show([CARRIED_ALUGUEL, ...BILLS_OF_MONTH]);
    await loaded();

    const days = within(chips()).getAllByRole("radio");
    expect(days.map((chip) => chip.getAttribute("aria-label"))).toEqual([
      "dia 10/10, 1 conta a pagar",
      "dia 02, 1 conta a pagar",
      "dia 10, 1 conta a pagar",
    ]);
    expect(card()).toHaveTextContent("0 de 3 pagas");
    expect(card()).toHaveTextContent(/Em aberto: R\$\s4\.803,22/);

    await userEvent.click(days[0]);
    expect(rows()).toEqual(["Aluguel Residencial de outubro"]);
    expect(rowOf("Aluguel Residencial de outubro")).toHaveTextContent("Venceu em outubro");
    expect(rowOf("Aluguel Residencial de outubro")).toHaveClass("bg-expense/10");
  });

  it("clears the day filter when the month changes", async () => {
    signedIn();
    const november = { ...MONTH, bills_of_month: BILLS_OF_MONTH };
    const december = {
      ...MONTH,
      month: "2026-12",
      bills_of_month: BILLS_OF_MONTH.map((bill) => ({
        ...bill,
        overdue: false,
        due_date: bill.due_date.replace("-11-", "-12-"),
      })),
    };
    const { client, rerender } = renderWithQuery(<BillsOfMonth view={november} />);
    await userEvent.click(within(chips()).getByRole("radio", { name: "dia 10, 1 conta a pagar" }));
    expect(rows()).toEqual(["Aluguel Residencial"]);

    rerender(
      <QueryClientProvider client={client}>
        <BillsOfMonth view={december} />
      </QueryClientProvider>,
    );
    expect(rows()).toEqual(["Luz (Enel)", "Aluguel Residencial"]);
    expect(within(chips()).getByRole("radio", { name: "dia 10, 1 conta a pagar" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(card()).toHaveTextContent("Próxima: Luz (Enel) · dia 02 · em 27 dias");
  });

  it("pays from the round check, dated today, and shows Pago at once", async () => {
    const { requests, serverHas } = show(BILLS_OF_MONTH, {
      [`POST /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 201, body: PAYMENT },
    });
    await loaded();
    serverHas([BILLS_OF_MONTH[0], PAID_RENT]);

    await userEvent.click(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Marcar/ }));

    const check = await within(rowOf("Aluguel Residencial")).findByRole("button", {
      name: "Desmarcar Aluguel Residencial",
    });
    expect(check).toHaveAttribute("aria-pressed", "true");
    expect(rowOf("Aluguel Residencial")).toHaveTextContent("Pago");
    await waitFor(() => expect(card()).toHaveTextContent("1 de 2 pagas"));
    const post = requests.find((request) => request.method === "POST");
    expect(new URL(post?.url ?? "").searchParams.get("month")).toBe("2026-11");
    expect(await post?.json()).toEqual({ date: "2026-11-05" });
  });

  it("says so and unticks when paying fails", async () => {
    show(BILLS_OF_MONTH, {
      [`POST /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 409, body: problem(409, "bill-already-paid") },
    });
    await loaded();

    await userEvent.click(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Marcar/ }));

    expect(await screen.findByText("Não foi possível marcar como paga.")).toBeInTheDocument();
    expect(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Marcar/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("undoes a payment from the round check and says so", async () => {
    const { requests, serverHas } = show([BILLS_OF_MONTH[0], PAID_RENT], {
      [`DELETE /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 204 },
    });
    await loaded();
    serverHas(BILLS_OF_MONTH);

    await userEvent.click(
      within(rowOf("Aluguel Residencial")).getByRole("button", { name: "Desmarcar Aluguel Residencial" }),
    );

    expect(await screen.findByText("Pagamento desfeito")).toBeInTheDocument();
    expect(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Marcar/ })).toBeInTheDocument();
    const remove = requests.find((request) => request.method === "DELETE");
    expect(new URL(remove?.url ?? "").searchParams.get("month")).toBe("2026-11");
  });

  it("says so when undoing fails", async () => {
    show([PAID_RENT], {
      [`DELETE /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 500, body: problem(500, "Falhou.") },
    });
    await loaded();

    await userEvent.click(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Desmarcar/ }));

    expect(await screen.findByText("Não foi possível desfazer o pagamento.")).toBeInTheDocument();
  });

  it("opens Pagar from the amount to pay another value on another day", async () => {
    const { requests } = show(BILLS_OF_MONTH, {
      [`POST /api/bills/${BILL_LUZ.id}/pay`]: { status: 201, body: PAYMENT },
    });
    await loaded();

    await userEvent.click(within(rowOf("Luz (Enel)")).getByRole("button", { name: /ajustar pagamento de Luz / }));
    const sheet = await screen.findByRole("dialog", { name: "Pagar Luz (Enel)" });
    const amount = within(sheet).getByLabelText("Valor");
    expect(amount).toHaveValue("284,10");
    expect(within(sheet).getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.clear(amount);
    await userEvent.click(within(sheet).getByRole("button", { name: "Confirmar" }));
    expect(within(sheet).getByText("Informe um valor")).toBeInTheDocument();

    await userEvent.type(amount, "300,00");
    await userEvent.click(within(sheet).getByRole("button", { name: "Ontem" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
    const post = requests.find((request) => request.method === "POST");
    expect(await post?.json()).toEqual({ date: "2026-11-04", amount: "300.00" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("dates a payment in a future month on its due date and names its first bill", async () => {
    const december = BILLS_OF_MONTH.map((bill) => ({
      ...bill,
      overdue: false,
      due_date: bill.due_date.replace("-11-", "-12-"),
    }));
    const { requests } = show(
      december,
      { [`POST /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 201, body: PAYMENT } },
      "2026-12",
    );
    await loaded();
    expect(card()).toHaveTextContent("Próxima: Luz (Enel) · dia 02 · em 27 dias");

    await userEvent.click(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Marcar/ }));

    await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
    expect(await requests.find((request) => request.method === "POST")?.json()).toEqual({ date: "2026-12-10" });
  });

  it("names no next bill in a past month with one left unpaid", async () => {
    show(
      [
        { ...BILLS_OF_MONTH[0], due_date: "2026-10-02" },
        { ...PAID_RENT, due_date: "2026-10-10" },
      ],
      {},
      "2026-10",
    );
    await loaded();

    expect(card()).not.toHaveTextContent("Próxima");
    expect(card()).toHaveTextContent("1 de 2 pagas");
    expect(rowOf("Luz (Enel)")).toHaveTextContent("Venceu dia 02/10");
  });

  it("pays October's unpaid rent in October on its due date", async () => {
    const { requests } = show([CARRIED_ALUGUEL, ...BILLS_OF_MONTH], {
      [`POST /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 201, body: PAYMENT },
    });
    await loaded();

    await userEvent.click(
      within(rowOf("Aluguel Residencial de outubro")).getByRole("button", {
        name: "Marcar Aluguel Residencial de outubro como paga",
      }),
    );

    await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
    const post = requests.find((request) => request.method === "POST");
    expect(new URL(post?.url ?? "").searchParams.get("month")).toBe("2026-10");
    expect(await post?.json()).toEqual({ date: "2026-10-10" });
    expect(
      within(rowOf("Aluguel Residencial")).getByRole("button", { name: "Marcar Aluguel Residencial como paga" }),
    ).toBeInTheDocument();
  });

  it("opens Pagar for October's rent in October", async () => {
    show([CARRIED_ALUGUEL, ...BILLS_OF_MONTH]);
    await loaded();

    await userEvent.click(
      within(rowOf("Aluguel Residencial de outubro")).getByRole("button", { name: /ajustar pagamento/ }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Pagar Aluguel Residencial" });
    expect(sheet).toHaveTextContent("Conta de outubro: a data do pagamento fica em outubro.");
  });

  it("ticks October's rent at once in November and ignores a second tap while paying", async () => {
    show([CARRIED_ALUGUEL, ...BILLS_OF_MONTH]);
    await loaded();
    const sent: Request[] = [];
    const stubbed = globalThis.fetch;
    vi.stubGlobal("fetch", (request: Request) => {
      if (request.method === "GET") return stubbed(request);
      sent.push(request);
      return new Promise<Response>(() => undefined);
    });

    await userEvent.click(within(rowOf("Aluguel Residencial de outubro")).getByRole("button", { name: /^Marcar/ }));
    const paid = await within(rowOf("Aluguel Residencial de outubro")).findByRole("button", {
      name: "Desmarcar Aluguel Residencial de outubro",
    });
    expect(paid).toBeDisabled();
    await userEvent.click(paid);
    await userEvent.click(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Marcar/ }));

    expect(sent.map((request) => `${request.method} ${new URL(request.url).search}`)).toEqual(["POST ?month=2026-10"]);
  });

  it("keeps an October payment inside October: no Hoje or Ontem, dated on its due day", async () => {
    const { requests } = show([CARRIED_ALUGUEL, ...BILLS_OF_MONTH], {
      [`POST /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 201, body: PAYMENT },
    });
    await loaded();

    await userEvent.click(
      within(rowOf("Aluguel Residencial de outubro")).getByRole("button", { name: /ajustar pagamento/ }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Pagar Aluguel Residencial" });
    expect(within(sheet).queryByRole("button", { name: "Hoje" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Ontem" })).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Outra data, 10/10/2026" }));
    expect(await screen.findByRole("button", { name: "quinta-feira, 1 de outubro de 2026" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ir para o mês anterior" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "sábado, 31 de outubro de 2026" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ir para o próximo mês" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("grid")).not.toBeInTheDocument());
    expect(
      within(sheet).getByRole("button", { name: "Confirmar" }).closest('[data-slot="responsive-sheet-footer"]'),
    ).not.toBeNull();
    await userEvent.click(within(sheet).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
    const post = requests.find((request) => request.method === "POST");
    expect(new URL(post?.url ?? "").searchParams.get("month")).toBe("2026-10");
    expect(await post?.json()).toMatchObject({ date: "2026-10-10" });
  });

  it("names the year of a carried month from another year", async () => {
    show([{ ...CARRIED_ALUGUEL, due_date: "2025-12-10" }, ...BILLS_OF_MONTH]);
    await loaded();
    expect(rowOf("Aluguel Residencial de dezembro de 2025")).toHaveTextContent("Venceu em dezembro de 2025");
    expect(within(chips()).getByRole("radio", { name: "dia 10/12, 1 conta a pagar" })).toBeInTheDocument();
  });

  it("filters Pendentes and Pagas on desktop", async () => {
    window.innerWidth = 1440;
    show([BILLS_OF_MONTH[0], PAID_RENT]);
    await loaded();

    const filters = await within(card()).findByRole("radiogroup", { name: "Filtrar contas" });
    await userEvent.click(within(filters).getByRole("radio", { name: "Pagas" }));
    expect(rows()).toEqual(["Aluguel Residencial"]);

    await userEvent.click(within(filters).getByRole("radio", { name: "Pendentes" }));
    expect(rows()).toEqual(["Luz (Enel)"]);

    await userEvent.click(within(filters).getByRole("radio", { name: "Pendentes" }));
    expect(rows()).toEqual(["Luz (Enel)"]);
  });

  it("says when a filter has nothing", async () => {
    window.innerWidth = 1440;
    show([PAID_RENT]);
    await loaded();

    await userEvent.click(
      within(within(card()).getByRole("radiogroup", { name: "Filtrar contas" })).getByRole("radio", {
        name: "Pendentes",
      }),
    );

    expect(card()).toHaveTextContent("Nenhuma conta aqui.");
  });

  it("celebrates when every bill is paid", async () => {
    show([PAID_RENT]);
    await loaded();

    expect(card()).toHaveTextContent("Todas as contas do mês pagas");
    expect(card()).toHaveTextContent("1 de 1 pagas");
    expect(card()).toHaveTextContent(/Em aberto: R\$\s0,00/);
    expect(rowOf("Aluguel Residencial")).toHaveTextContent("Pago");
  });

  it("names a bill due today", async () => {
    show([{ ...BILLS_OF_MONTH[1], due_date: "2026-11-05" }]);
    await loaded();
    expect(card()).toHaveTextContent("Vence hoje: Aluguel Residencial");
  });

  it("names a bill due tomorrow", async () => {
    show([{ ...BILLS_OF_MONTH[1], due_date: "2026-11-06" }]);
    await loaded();
    expect(card()).toHaveTextContent("Próxima: Aluguel Residencial · dia 06 · amanhã");
  });

  it("renders nothing without a bill (D25)", () => {
    signedIn();
    renderWithQuery(<BillsOfMonth view={{ ...MONTH, bills_of_month: [] }} />);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
