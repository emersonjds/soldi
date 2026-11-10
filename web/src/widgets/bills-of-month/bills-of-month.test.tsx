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

const card = () => screen.getByRole("region", { name: "Contas do Mês" });
const loaded = () => screen.findByRole("region", { name: "Contas do Mês" });
const rowOf = (name: string) => within(card()).getByRole("listitem", { name });

describe("Contas do Mês", () => {
  beforeEach(() => {
    window.innerWidth = 375;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists the month's bills with due day, amount and a pill; the overdue one is tinted", async () => {
    show();
    await loaded();

    expect(card()).toHaveTextContent("2 obrigações cadastradas");
    expect(within(card()).getByRole("link", { name: "Ver todas" })).toHaveAttribute("href", "/ajustes/contas");

    const rent = rowOf("Aluguel Residencial");
    expect(rent).toHaveTextContent("Vence dia 10/11");
    expect(rent).toHaveTextContent("R$ 2.259,56");
    expect(within(rent).getByRole("button", { name: "Pagar Aluguel Residencial" })).toHaveTextContent("Pagar");

    const power = rowOf("Luz (Enel)");
    expect(power).toHaveTextContent("Venceu dia 02/11");
    expect(power).toHaveClass("bg-expense/10");
    expect(within(power).getByRole("button", { name: "Pagar Luz (Enel), vencida" })).toHaveTextContent("Vencido");

    expect(card()).toHaveTextContent("Próximo vencimento: Aluguel Residencial em 5 dias");
  });

  it("pays with one tap, dated today, and shows Pago at once", async () => {
    const { requests, serverHas } = show(BILLS_OF_MONTH, {
      [`POST /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 201, body: PAYMENT },
    });
    await loaded();
    serverHas([BILLS_OF_MONTH[0], PAID_RENT]);

    await userEvent.click(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Pagar/ }));

    expect(
      await within(rowOf("Aluguel Residencial")).findByRole("button", { name: "Pago: desfazer Aluguel Residencial" }),
    ).toHaveTextContent("Pago");
    expect(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Pago/ })).toHaveClass(
      "text-tier-green-foreground",
    );
    const post = requests.find((request) => request.method === "POST");
    expect(new URL(post?.url ?? "").searchParams.get("month")).toBe("2026-11");
    expect(await post?.json()).toEqual({ date: "2026-11-05" });
  });

  it("says so and goes back to Pagar when paying fails", async () => {
    show(BILLS_OF_MONTH, {
      [`POST /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 409, body: problem(409, "bill-already-paid") },
    });
    await loaded();

    await userEvent.click(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Pagar/ }));

    expect(await screen.findByText("Não foi possível marcar como paga.")).toBeInTheDocument();
    expect(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Pagar/ })).toBeInTheDocument();
  });

  it("undoes a payment with a tap on Pago and says so", async () => {
    const { requests, serverHas } = show([BILLS_OF_MONTH[0], PAID_RENT], {
      [`DELETE /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 204 },
    });
    await loaded();
    serverHas(BILLS_OF_MONTH);

    await userEvent.click(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Pago/ }));

    expect(await screen.findByText("Pagamento desfeito")).toBeInTheDocument();
    expect(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Pagar/ })).toBeInTheDocument();
    const remove = requests.find((request) => request.method === "DELETE");
    expect(new URL(remove?.url ?? "").searchParams.get("month")).toBe("2026-11");
  });

  it("says so when undoing fails", async () => {
    show([PAID_RENT], {
      [`DELETE /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 500, body: problem(500, "Falhou.") },
    });
    await loaded();

    await userEvent.click(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Pago/ }));

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

  it("dates a payment in another month on its due date", async () => {
    const december = BILLS_OF_MONTH.map((bill) => ({ ...bill, due_date: bill.due_date.replace("-11-", "-12-") }));
    const { requests } = show(
      december,
      { [`POST /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 201, body: PAYMENT } },
      "2026-12",
    );
    await loaded();

    await userEvent.click(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Pagar/ }));

    await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
    expect(await requests.find((request) => request.method === "POST")?.json()).toEqual({ date: "2026-12-10" });
  });

  it("lists October's unpaid rent first, says so, and pays it in October on its due date", async () => {
    const { requests } = show([CARRIED_ALUGUEL, ...BILLS_OF_MONTH], {
      [`POST /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 201, body: PAYMENT },
    });
    await loaded();

    expect(card()).toHaveTextContent("2 obrigações cadastradas");
    const october = rowOf("Aluguel Residencial de outubro");
    expect(october).toHaveTextContent("Venceu em outubro");
    await userEvent.click(
      within(october).getByRole("button", { name: "Pagar Aluguel Residencial de outubro, vencida" }),
    );

    await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
    const post = requests.find((request) => request.method === "POST");
    expect(new URL(post?.url ?? "").searchParams.get("month")).toBe("2026-10");
    expect(await post?.json()).toEqual({ date: "2026-10-10" });
    expect(
      within(rowOf("Aluguel Residencial")).getByRole("button", { name: "Pagar Aluguel Residencial" }),
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

    await userEvent.click(within(rowOf("Aluguel Residencial de outubro")).getByRole("button", { name: /^Pagar/ }));
    const paid = await within(rowOf("Aluguel Residencial de outubro")).findByRole("button", {
      name: "Pago: desfazer Aluguel Residencial de outubro",
    });
    expect(paid).toBeDisabled();
    await userEvent.click(paid);
    await userEvent.click(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Pagar/ }));

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
    const date = within(sheet).getByLabelText("Outra data");
    expect(date).toHaveValue("2026-10-10");
    expect(date).toHaveAttribute("min", "2026-10-01");
    expect(date).toHaveAttribute("max", "2026-10-31");
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
  });

  it("filters Pendentes and Pagas on desktop", async () => {
    window.innerWidth = 1440;
    show([BILLS_OF_MONTH[0], PAID_RENT]);
    await loaded();

    const filters = await within(card()).findByRole("radiogroup", { name: "Filtrar contas" });
    await userEvent.click(within(filters).getByRole("radio", { name: "Pagas" }));
    expect(within(card()).queryByRole("listitem", { name: "Luz (Enel)" })).not.toBeInTheDocument();
    expect(rowOf("Aluguel Residencial")).toBeInTheDocument();

    await userEvent.click(within(filters).getByRole("radio", { name: "Pendentes" }));
    expect(within(card()).queryByRole("listitem", { name: "Aluguel Residencial" })).not.toBeInTheDocument();
    expect(rowOf("Luz (Enel)")).toBeInTheDocument();

    await userEvent.click(within(filters).getByRole("radio", { name: "Pendentes" }));
    expect(rowOf("Luz (Enel)")).toBeInTheDocument();
  });

  it("says when a filter has nothing", async () => {
    window.innerWidth = 1440;
    show([PAID_RENT]);
    await loaded();

    await userEvent.click(
      within(await within(card()).findByRole("radiogroup")).getByRole("radio", { name: "Pendentes" }),
    );

    expect(card()).toHaveTextContent("Nenhuma conta aqui.");
  });

  it("celebrates when every bill is paid and counts one bill in the singular", async () => {
    show([PAID_RENT]);
    await loaded();

    expect(card()).toHaveTextContent("1 obrigação cadastrada");
    expect(card()).toHaveTextContent("Todas as contas do mês pagas");
  });

  it("names a bill due today or tomorrow", async () => {
    show([{ ...BILLS_OF_MONTH[1], due_date: "2026-11-05" }]);
    await loaded();
    expect(card()).toHaveTextContent("Próximo vencimento: Aluguel Residencial hoje");
  });

  it("names a bill due tomorrow", async () => {
    show([{ ...BILLS_OF_MONTH[1], due_date: "2026-11-06" }]);
    await loaded();
    expect(card()).toHaveTextContent("Próximo vencimento: Aluguel Residencial amanhã");
  });

  it("invites the first bill when there is none", async () => {
    show([]);
    await loaded();

    expect(card()).toHaveTextContent("Nenhuma conta fixa ainda");
    expect(within(card()).getByRole("link", { name: "Cadastrar contas" })).toHaveAttribute("href", "/ajustes/contas");
    expect(within(card()).queryByRole("link", { name: "Ver todas" })).not.toBeInTheDocument();
  });
});
