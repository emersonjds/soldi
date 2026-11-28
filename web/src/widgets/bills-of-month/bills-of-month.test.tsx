import { QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMonth } from "@/entities/month/month-query";
import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import {
  BILL_ALUGUEL,
  BILL_LUZ,
  BILLS,
  BILLS_OF_MONTH,
  CARRIED_ALUGUEL,
  CATEGORIES,
  MERCADO,
  MONTH,
  problem,
  signedIn,
  TRANSACTIONS,
} from "@/test/stub-api";

import { BillsOfMonth } from "./bills-of-month";

type Reply = { status: number; body?: unknown };

const PAYMENT = { ...TRANSACTIONS[1], id: "t-paid" };
const PAID_RENT = { ...BILLS_OF_MONTH[1], paid: true, transaction_id: "t-paid" };
const FATURA: Schemas["BillOfMonth"] = {
  ...BILLS_OF_MONTH[1],
  bill_id: "card-porto",
  name: "Porto",
  amount: "450.00",
  is_card: true,
};

const SPOTIFY: Schemas["Transaction"] = {
  id: "t1",
  date: "2026-10-12",
  amount: "39.90",
  kind: "daily",
  category: MERCADO,
  note: "Spotify",
  card_id: "card-porto",
  series: { id: "s-spotify", position: 1, total: 1, last_date: "2026-10-12", every: "month", open_ended: true },
};
const PORTO_FATURA: Schemas["CardFatura"] = {
  month: "2026-11",
  total: "450.00",
  carried: "0.00",
  paid: "0.00",
  entries: [SPOTIFY],
  ahead: [],
};
const FATURA_REPLIES: Record<string, Reply> = {
  "GET /api/months/2026-11/faturas/card-porto": { status: 200, body: PORTO_FATURA },
  "GET /api/categories": { status: 200, body: CATEGORIES },
  "GET /api/bills": { status: 200, body: [] },
};

/** A month on the server that a test can move forward, as a payment would. */
const show = (
  bills: Schemas["BillOfMonth"][] = BILLS_OF_MONTH,
  replies: Record<string, Reply> = {},
  month = "2026-11",
) => {
  let server: Schemas["MonthView"] = { ...MONTH, month, bills_of_month: bills };
  const requests = signedIn({ "GET /api/transactions": { status: 200, body: [] }, ...replies });
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
/** A caption whose leading dot sits in its own span (SOL-165). */
const captionOf = (text: string) => (_: string, element: Element | null) =>
  element?.tagName === "SPAN" && element.textContent === text && element.parentElement?.textContent !== text;
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

  it("heads with the count, the paid badge and the next bill; each row has a round check, a caption and a pill", async () => {
    show();
    await loaded();

    expect(card()).toHaveTextContent("Contas a pagar");
    expect(card()).not.toHaveTextContent("Contas do Mês");
    expect(card()).not.toHaveTextContent("obrigações");
    expect(card()).toHaveTextContent("0 de 2 pagas");
    expect(card()).toHaveTextContent("1 vencida Próxima: dia 10 · R$ 2.259,56");
    expect(within(card()).queryByRole("link", { name: "Ver todas" })).not.toBeInTheDocument();
    const manage = within(card()).getByRole("link", { name: "Gerenciar contas fixas" });
    expect(manage).toHaveAttribute("href", "/ajustes/contas");
    expect(manage).toHaveClass("min-h-11");
    expect(within(card()).queryByRole("heading", { level: 3 })).not.toBeInTheDocument();

    const rent = rowOf("Aluguel Residencial");
    expect(within(rent).getByText("Aluguel Residencial")).toHaveClass("line-clamp-2", "break-words");
    expect(rent).toHaveTextContent("Vence dia 10/11");
    expect(rent).toHaveTextContent("Vence dia 10");
    expect(within(rent).getByRole("button", { name: "Pagar Aluguel Residencial" })).toHaveTextContent("Pagar");
    expect(rent).toHaveTextContent("R$ 2.259,56");
    const check = within(rent).getByRole("button", { name: "Marcar Aluguel Residencial como paga" });
    expect(check).toHaveAttribute("aria-pressed", "false");
    expect(check).toHaveClass("size-11");
    expect(check.firstElementChild).toHaveClass("size-6", "motion-safe:duration-150");

    const power = rowOf("Luz (Enel)");
    expect(power).toHaveTextContent("Venceu dia 02/11");
    expect(power).toHaveTextContent("Atrasada desde 2 nov");
    expect(within(power).getByRole("button", { name: "Marcar Luz (Enel) como paga" })).toHaveTextContent("!");
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

    await userEvent.click(days[0]);
    expect(rows()).toEqual(["Aluguel Residencial de outubro"]);
    expect(rowOf("Aluguel Residencial de outubro")).toHaveTextContent("Atrasada desde 10 out");
    expect(rowOf("Aluguel Residencial de outubro")).not.toHaveTextContent("5 nov");
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
    expect(card()).toHaveTextContent("Próxima: dia 02 · R$ 284,10");
  });

  it("pays from the round check, dated today, and shows Pago at once", async () => {
    const { requests, serverHas } = show(BILLS_OF_MONTH, {
      [`POST /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 201, body: PAYMENT },
    });
    await loaded();
    serverHas([BILLS_OF_MONTH[0], PAID_RENT]);

    await userEvent.click(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Marcar/ }));

    const check = await within(rowOf("Aluguel Residencial")).findByRole("button", {
      name: "Não paguei Aluguel Residencial",
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

  it("says its own words when paying fails on a rule another screen words differently (SOL-173)", async () => {
    show(BILLS_OF_MONTH, {
      [`POST /api/bills/${BILL_ALUGUEL.id}/pay`]: {
        status: 429,
        body: { ...problem(429, "Texto do servidor."), type: "urn:soldi:error:rate-limited" },
      },
    });
    await loaded();

    await userEvent.click(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Marcar/ }));

    expect(await screen.findByText("Não foi possível marcar como paga.")).toBeInTheDocument();
    expect(screen.queryByText(/Muitas alterações seguidas/)).not.toBeInTheDocument();
  });

  it("undoes a payment from the round check and says so", async () => {
    const { requests, serverHas } = show([BILLS_OF_MONTH[0], PAID_RENT], {
      [`DELETE /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 204 },
    });
    await loaded();
    serverHas(BILLS_OF_MONTH);

    await userEvent.click(
      within(rowOf("Aluguel Residencial")).getByRole("button", { name: "Não paguei Aluguel Residencial" }),
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

    await userEvent.click(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Não paguei/ }));

    expect(await screen.findByText("Não foi possível desfazer o pagamento.")).toBeInTheDocument();
    expect(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Não paguei/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  describe("a conta fixa pays itself on its due day (SOL-186)", () => {
    const PAID_ON = { ...PAYMENT, date: "2026-11-03" };
    const ON_THE_3RD = { "GET /api/transactions": { status: 200, body: [PAID_ON] } };
    const LUZ: Schemas["BillOfMonth"] = {
      ...BILLS_OF_MONTH[1],
      bill_id: "b-luz",
      name: "Luz",
      amount: "180.00",
      due_date: "2026-11-25",
      variable: true,
    };

    it("tells on desktop that an open fixa pays itself, but not one due today, a variable one or a paid one", async () => {
      const today = { ...BILLS_OF_MONTH[1], bill_id: "b-net", name: "Internet", due_date: "2026-11-05" };
      show([BILLS_OF_MONTH[1], today, LUZ, { ...PAID_RENT, bill_id: "b-paid", name: "Água" }]);
      await loaded();

      const rent = rowOf("Aluguel Residencial");
      expect(within(rent).getByText("Vence dia 10 · paga sozinha")).toHaveClass("hidden", "lg:flex");
      expect(within(rent).getByText("Vence dia 10/11")).toHaveClass("lg:hidden", "whitespace-nowrap");
      expect(within(rent).getByRole("button", { name: "Marcar Aluguel Residencial como paga" })).toBeInTheDocument();
      for (const name of ["Internet", "Luz", "Água"]) expect(rowOf(name)).not.toHaveTextContent("paga sozinha");
    });

    it("names a paid fixa's check and pill Não paguei; one tap undoes, and Desfazer pays it again on its date and amount", async () => {
      const { requests, serverHas } = show([PAID_RENT], {
        ...ON_THE_3RD,
        [`DELETE /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 204 },
        [`POST /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 201, body: PAID_ON },
      });
      await loaded();
      const rent = rowOf("Aluguel Residencial");
      await waitFor(() => expect(rent).toHaveTextContent("Pago no prazo"));
      const check = within(rent).getByRole("button", { name: "Não paguei Aluguel Residencial" });
      expect(check).toHaveAttribute("title", "Não paguei");
      expect(check).toHaveAttribute("aria-pressed", "true");
      expect(within(rent).getByRole("button", { name: "Pago, Aluguel Residencial: não paguei" })).toHaveTextContent(
        "✓ Pago",
      );
      serverHas(BILLS_OF_MONTH.slice(1));

      await userEvent.click(check);
      expect(await screen.findByText("Pagamento desfeito")).toBeInTheDocument();
      expect(requests.filter((request) => request.method === "DELETE")).toHaveLength(1);
      await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));

      await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
      const post = requests.find((request) => request.method === "POST");
      expect(new URL(post?.url ?? "").searchParams.get("month")).toBe("2026-11");
      expect(await post?.json()).toEqual({ date: "2026-11-03", amount: "2259.56" });
    });

    it("says so when Desfazer fails", async () => {
      const { serverHas } = show([PAID_RENT], {
        [`DELETE /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 204 },
        [`POST /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 500, body: problem(500, "Falhou.") },
      });
      await loaded();
      serverHas(BILLS_OF_MONTH.slice(1));

      await userEvent.click(within(rowOf("Aluguel Residencial")).getByRole("button", { name: /^Não paguei/ }));
      await userEvent.click(await screen.findByRole("button", { name: "Desfazer" }));

      expect(await screen.findByText("Não foi possível marcar como paga.")).toBeInTheDocument();
    });

    it("opens a paid fixa's payment from its amount to fix the value, with no Excluir, once the payment is loaded", async () => {
      show([PAID_RENT, { ...PAID_RENT, bill_id: "b-missing", name: "Água", transaction_id: "t-missing" }], {
        ...ON_THE_3RD,
        "GET /api/categories": { status: 200, body: CATEGORIES },
      });
      await loaded();

      expect(
        within(rowOf("Água")).getByRole("button", { name: /^R\$\s2\.259,56: ajustar valor pago de Água$/ }),
      ).toBeDisabled();
      const amount = within(rowOf("Aluguel Residencial")).getByRole("button", {
        name: /^R\$\s2\.259,56: ajustar valor pago de Aluguel Residencial$/,
      });
      await waitFor(() => expect(amount).toBeEnabled());
      await userEvent.click(amount);

      const sheet = await screen.findByRole("dialog", { name: "Editar lançamento" });
      expect(within(sheet).queryByRole("button", { name: /Excluir/ })).not.toBeInTheDocument();
    });

    it("keeps Desmarcar on a paid variable bill, with no amount button, and its toast's Desfazer re-pays the paid amount", async () => {
      const { requests } = show([{ ...LUZ, paid: true, transaction_id: "t-paid" }], {
        ...ON_THE_3RD,
        "DELETE /api/bills/b-luz/pay": { status: 204 },
        "POST /api/bills/b-luz/pay": { status: 201, body: PAID_ON },
      });
      await loaded();
      const row = rowOf("Luz");
      await waitFor(() => expect(row).toHaveTextContent("Pago no prazo"));
      expect(within(row).getByRole("button", { name: "Pago, Luz" })).toBeInTheDocument();
      expect(within(row).queryByRole("button", { name: /ajustar/ })).not.toBeInTheDocument();

      await userEvent.click(within(row).getByRole("button", { name: "Desmarcar Luz" }));
      await userEvent.click(await screen.findByRole("button", { name: "Desfazer" }));

      await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
      expect(await requests.find((request) => request.method === "POST")?.json()).toEqual({
        date: "2026-11-03",
        amount: "180.00",
      });
    });

    it("undoes a fatura's payment with no Desfazer", async () => {
      show([{ ...FATURA, paid: true, transaction_id: "t-paid" }], {
        "DELETE /api/bills/card-porto/pay": { status: 204 },
      });
      await loaded();

      await userEvent.click(within(rowOf("Fatura Porto")).getByRole("button", { name: "Desmarcar Fatura Porto" }));

      expect(await screen.findByText("Pagamento desfeito")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Desfazer" })).not.toBeInTheDocument();
    });
  });

  it("opens Pagar from the amount to pay another value on another day", async () => {
    const { requests } = show(BILLS_OF_MONTH, {
      [`POST /api/bills/${BILL_LUZ.id}/pay`]: { status: 201, body: PAYMENT },
    });
    await loaded();

    await userEvent.click(within(rowOf("Luz (Enel)")).getByRole("button", { name: /ajustar pagamento de Luz / }));
    const sheet = await screen.findByRole("dialog", { name: "Luz (Enel) · novembro" });
    const amount = within(sheet).getByLabelText("Valor de novembro");
    expect(amount).toHaveValue("284,10");
    expect(within(sheet).getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.clear(amount);
    await userEvent.click(within(sheet).getByRole("button", { name: "Pagar" }));
    expect(within(sheet).getByText("Informe um valor")).toBeInTheDocument();

    await userEvent.type(amount, "300,00");
    await userEvent.click(within(sheet).getByRole("button", { name: "Ontem" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Pagar" }));

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
    expect(card()).toHaveTextContent("Próxima: dia 02 · R$ 284,10");

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
    const sheet = await screen.findByRole("dialog", { name: "Aluguel Residencial · outubro" });
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
      name: "Não paguei Aluguel Residencial de outubro",
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
    const sheet = await screen.findByRole("dialog", { name: "Aluguel Residencial · outubro" });
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
      within(sheet).getByRole("button", { name: "Pagar" }).closest('[data-slot="responsive-sheet-footer"]'),
    ).not.toBeNull();
    await userEvent.click(within(sheet).getByRole("button", { name: "Pagar" }));

    await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
    const post = requests.find((request) => request.method === "POST");
    expect(new URL(post?.url ?? "").searchParams.get("month")).toBe("2026-10");
    expect(await post?.json()).toMatchObject({ date: "2026-10-10" });
  });

  it("names the year of a carried month from another year", async () => {
    show([{ ...CARRIED_ALUGUEL, due_date: "2025-12-10" }, ...BILLS_OF_MONTH]);
    await loaded();
    expect(rowOf("Aluguel Residencial de dezembro de 2025")).toHaveTextContent("Atrasada desde 10 dez");
    expect(within(chips()).getByRole("radio", { name: "dia 10/12, 1 conta a pagar" })).toBeInTheDocument();
  });

  it("celebrates when every bill is paid", async () => {
    show([PAID_RENT]);
    await loaded();

    expect(card()).toHaveTextContent("Todas as contas do mês pagas");
    expect(card()).toHaveTextContent("1 de 1 paga");
    expect(card()).not.toHaveTextContent("1 de 1 pagas");
    expect(rowOf("Aluguel Residencial")).toHaveTextContent("Pago");
  });

  it("counts a single bill in the singular", async () => {
    show([{ ...BILLS_OF_MONTH[1], due_date: "2026-11-05" }]);
    await loaded();
    expect(card()).toHaveTextContent("0 de 1 paga");
    expect(card()).toHaveTextContent("Próxima: dia 05 · R$ 2.259,56");
  });

  it("pays from the Pagar pill like the round check, and the mobile Pago toggle undoes it", async () => {
    const { requests, serverHas } = show(BILLS_OF_MONTH, {
      [`POST /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 201, body: PAYMENT },
      [`DELETE /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 204 },
    });
    await loaded();
    serverHas([BILLS_OF_MONTH[0], PAID_RENT]);

    await userEvent.click(
      within(rowOf("Aluguel Residencial")).getByRole("button", { name: "Pagar Aluguel Residencial" }),
    );

    const toggle = await within(rowOf("Aluguel Residencial")).findByRole("button", {
      name: "Pago, Aluguel Residencial: não paguei",
    });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    const post = requests.find((request) => request.method === "POST");
    expect(await post?.json()).toEqual({ date: "2026-11-05" });

    serverHas(BILLS_OF_MONTH);
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);

    expect(await screen.findByText("Pagamento desfeito")).toBeInTheDocument();
    expect(requests.some((request) => request.method === "DELETE")).toBe(true);
  });

  it("tells a payment on time from a late one, and says nothing without its date", async () => {
    const early = {
      ...PAID_RENT,
      bill_id: "early",
      name: "Internet",
      due_date: "2026-11-02",
      transaction_id: "t-early",
    };
    const unknown = { ...PAID_RENT, bill_id: "unknown", name: "Água", transaction_id: "t-missing" };
    show([early, PAID_RENT, unknown], {
      "GET /api/transactions": {
        status: 200,
        body: [
          { ...PAYMENT, date: "2026-11-12" },
          { ...PAYMENT, id: "t-early", date: "2026-11-02" },
        ],
      },
    });
    await loaded();

    await waitFor(() => expect(rowOf("Aluguel Residencial")).toHaveTextContent("Vence dia 10 · Pago com atraso"));
    expect(rowOf("Internet")).toHaveTextContent("Venceu dia 02 · Pago no prazo");
    expect(rowOf("Água")).not.toHaveTextContent("Pago no prazo");
    expect(rowOf("Água")).not.toHaveTextContent("Pago com atraso");
  });

  describe("a parcelado conta fixa (SOL-118)", () => {
    const FIES: Schemas["BillOfMonth"] = {
      ...BILLS_OF_MONTH[1],
      bill_id: "bill-fies",
      name: "Fies",
      due_date: "2026-12-10",
      overdue: false,
      installment: 5,
      installments: 6,
    };

    const nameLine = (name: string) => within(rowOf(name)).getByText("Fies").parentElement;

    it("reads the parcela and its last month after the name, wrapping under it at 375 px before the amount moves", async () => {
      show([{ ...FIES, installment: 4 }], {}, "2026-12");
      await loaded();
      expect(nameLine("Fies")).toHaveTextContent("Fies · Parcela 4/6 · termina em fev/27");
      expect(nameLine("Fies")).toHaveClass("flex-wrap");
      expect(within(rowOf("Fies")).getByText(captionOf("· Parcela 4/6 · termina em fev/27"))).not.toHaveClass(
        "whitespace-nowrap",
      );
    });

    it("gives the name the whole line below 1024 px: the parcela goes under it without its leading dot (SOL-165)", async () => {
      show([{ ...FIES, installment: 4 }], {}, "2026-12");
      await loaded();
      const parcela = within(rowOf("Fies")).getByText(captionOf("· Parcela 4/6 · termina em fev/27"));
      expect(parcela).toHaveClass("basis-full", "lg:basis-auto");
      expect(within(parcela).getByText("·")).toHaveClass("hidden", "lg:inline");
    });

    it("names the last parcela", async () => {
      show([{ ...FIES, installment: 6 }], {}, "2026-12");
      await loaded();
      expect(nameLine("Fies")).toHaveTextContent("Fies · Última parcela");
      expect(rowOf("Fies")).not.toHaveTextContent("termina em");
      expect(rowOf("Fies")).not.toHaveTextContent("6/6");
    });

    it("keeps a carried parcela's position and says when it was due", async () => {
      show([{ ...FIES, installment: 4, due_date: "2026-11-10", overdue: true }], {}, "2026-12");
      await loaded();
      expect(nameLine("Fies de novembro")).toHaveTextContent(
        "Fies · Parcela 4/6 · termina em jan/27 · venceu em novembro",
      );
    });

    it("leaves a bill without parcelas as it was", async () => {
      show([{ ...FIES, name: "Inglês", installment: null, installments: null }], {}, "2026-12");
      await loaded();
      expect(within(rowOf("Inglês")).getByText("Inglês")).toHaveTextContent(/^Inglês$/);
      expect(rowOf("Inglês")).not.toHaveTextContent(/·(?! paga sozinha)/);
    });
  });

  describe("groups by kind of amount (SOL-153)", () => {
    const AGUA: Schemas["BillOfMonth"] = {
      ...BILLS_OF_MONTH[1],
      bill_id: "b-agua",
      name: "Água",
      amount: "430.00",
      due_date: "2026-11-25",
      variable: true,
    };
    const PARCELADO = { ...BILLS_OF_MONTH[1], installment: 2, installments: 6 };
    const PORTO = { ...FATURA, due_date: "2026-11-12" };
    const MIXED = [BILLS_OF_MONTH[0], PARCELADO, PORTO, AGUA];

    const headers = () =>
      within(card())
        .queryAllByRole("heading", { level: 3 })
        .map((heading) => within(heading).getByRole("button"));
    const text = (element: Element) => element.textContent?.replace(/\s+/g, " ");
    const header = (name: string) => within(card()).getByRole("button", { name: new RegExp(`^${name}`) });
    const group = (name: string) => within(card()).getByRole("list", { name });

    it("opens Valor fixo, Valor variável and Faturas de cartão, in that order, each with its count and what is left", async () => {
      show(MIXED);
      await loaded();

      expect(headers().map(text)).toEqual([
        "Valor fixo0 de 2 pagas · falta R$ 2.543,66 · 1 vencida",
        "Valor variável0 de 1 paga · falta ≈ R$ 430,00",
        "Faturas de cartão0 de 1 paga · falta R$ 450,00",
      ]);
      for (const button of headers()) {
        expect(button).toHaveAttribute("aria-expanded", "true");
        expect(button).toHaveClass("min-h-11");
      }
      expect(card()).toHaveTextContent("0 de 4 pagas");
      expect(
        within(group("Valor fixo"))
          .getAllByRole("listitem")
          .map((row) => row.getAttribute("aria-label")),
      ).toEqual(["Luz (Enel)", "Aluguel Residencial"]);
      expect(within(group("Valor variável")).getByRole("listitem", { name: "Água" })).toBeInTheDocument();
      expect(within(group("Faturas de cartão")).getByRole("listitem", { name: "Fatura Porto" })).toBeInTheDocument();
    });

    it("hides a group's rows when its header closes and keeps its summary", async () => {
      show(MIXED);
      await loaded();

      await userEvent.click(header("Valor fixo"));

      expect(header("Valor fixo")).toHaveAttribute("aria-expanded", "false");
      expect(header("Valor fixo")).toHaveTextContent("0 de 2 pagas · falta R$ 2.543,66 · 1 vencida");
      expect(within(card()).queryByRole("listitem", { name: "Aluguel Residencial" })).not.toBeInTheDocument();
      expect(rowOf("Água")).toBeInTheDocument();
    });

    it("counts October's carried rent in Valor fixo and in the subtitle as overdue (D17)", async () => {
      show([CARRIED_ALUGUEL, ...BILLS_OF_MONTH, AGUA]);
      await loaded();

      expect(header("Valor fixo")).toHaveTextContent("0 de 3 pagas · falta R$ 4.803,22 · 2 vencidas");
      expect(
        within(group("Valor fixo")).getByRole("listitem", { name: "Aluguel Residencial de outubro" }),
      ).toBeInTheDocument();
      expect(card()).toHaveTextContent("2 vencidas Próxima: dia 10 · R$ 2.259,56");
      expect(card()).toHaveTextContent("0 de 4 pagas");
    });

    it("keeps a group open with a tick once its last bill is paid, and the round check undoes it", async () => {
      const { serverHas } = show(
        [PAID_RENT, { ...BILLS_OF_MONTH[1], bill_id: BILL_LUZ.id, name: "Luz (Enel)" }, AGUA],
        {
          [`POST /api/bills/${BILL_LUZ.id}/pay`]: { status: 201, body: PAYMENT },
          [`DELETE /api/bills/${BILL_LUZ.id}/pay`]: { status: 204 },
        },
      );
      await loaded();
      const paidLuz = {
        ...BILLS_OF_MONTH[1],
        bill_id: BILL_LUZ.id,
        name: "Luz (Enel)",
        paid: true,
        transaction_id: "t2",
      };
      serverHas([PAID_RENT, paidLuz, AGUA]);

      await userEvent.click(within(rowOf("Luz (Enel)")).getByRole("button", { name: /^Marcar/ }));

      await waitFor(() => expect(header("Valor fixo")).toHaveTextContent("Valor fixo2 de 2 pagas"));
      expect(header("Valor fixo")).not.toHaveTextContent("falta");
      expect(within(header("Valor fixo")).getByText("2 de 2 pagas").closest("span")).toHaveClass("text-income-text");
      expect(header("Valor fixo")).toHaveAttribute("aria-expanded", "true");
      expect(card()).toHaveTextContent("2 de 3 pagas");

      serverHas([PAID_RENT, { ...paidLuz, paid: false, transaction_id: null }, AGUA]);
      await waitFor(() =>
        expect(within(rowOf("Luz (Enel)")).getByRole("button", { name: /^Não paguei/ })).toBeEnabled(),
      );
      await userEvent.click(within(rowOf("Luz (Enel)")).getByRole("button", { name: /^Não paguei/ }));

      expect(await screen.findByText("Pagamento desfeito")).toBeInTheDocument();
      await waitFor(() => expect(header("Valor fixo")).toHaveTextContent("1 de 2 pagas · falta R$ 2.259,56"));
      expect(card()).toHaveTextContent("1 de 3 pagas");
    });

    it("lists one kind of bill flat, with no group header", async () => {
      show([AGUA, { ...AGUA, bill_id: "b-gas", name: "Gás" }]);
      await loaded();

      expect(headers()).toEqual([]);
      expect(rows()).toEqual(["Água", "Gás"]);
      expect(card()).toHaveTextContent("0 de 2 pagas");
    });

    it("opens every group with a match for a chosen day, hides the rest and restores them on a second tap", async () => {
      show(MIXED);
      await loaded();
      await userEvent.click(header("Valor variável"));
      expect(header("Valor variável")).toHaveAttribute("aria-expanded", "false");

      const day = within(chips()).getByRole("radio", { name: "dia 25, 1 conta a pagar" });
      await userEvent.click(day);

      expect(headers().map(text)).toEqual(["Valor variável0 de 1 paga · falta ≈ R$ 430,00"]);
      expect(header("Valor variável")).toHaveAttribute("aria-expanded", "true");
      expect(rows()).toEqual(["Água"]);
      expect(card()).toHaveTextContent("0 de 4 pagas");

      await userEvent.click(day);
      expect(headers()).toHaveLength(3);
      expect(rows()).toEqual(["Luz (Enel)", "Aluguel Residencial", "Água", "Fatura Porto"]);
    });

    it("keeps the month's numbers in a group's summary while a day is chosen", async () => {
      show(MIXED);
      await loaded();

      await userEvent.click(within(chips()).getByRole("radio", { name: /^dia 10,/ }));

      expect(rows()).toEqual(["Aluguel Residencial"]);
      expect(header("Valor fixo")).toHaveTextContent("0 de 2 pagas · falta R$ 2.543,66 · 1 vencida");
    });

    it("keeps a large amount left on its own unbroken fragment", async () => {
      show([{ ...BILLS_OF_MONTH[1], amount: "99999.99" }, AGUA]);
      await loaded();

      expect(within(header("Valor fixo")).getByText("· falta R$ 99.999,99")).toHaveClass("whitespace-nowrap");
    });
  });

  describe("edit and remove from the name (SOL-153)", () => {
    const EDITING = {
      "GET /api/bills": { status: 200, body: BILLS },
      "GET /api/categories": { status: 200, body: CATEGORIES },
    };
    const editOf = (name: string) => within(rowOf(name)).getByRole("button", { name: `Editar ${name}` });
    const sent = (requests: Request[], method: string) =>
      requests.filter((request) => request.method === method && request.url.includes("/api/bills/"));

    it("keeps the name disabled until the bills load, then opens Editar conta with the bill and saves it", async () => {
      const { requests } = show(BILLS_OF_MONTH, {
        ...EDITING,
        [`PATCH /api/bills/${BILL_ALUGUEL.id}`]: { status: 200, body: BILL_ALUGUEL },
      });
      await loaded();
      expect(editOf("Aluguel Residencial")).toHaveClass("min-h-11");
      await waitFor(() => expect(editOf("Aluguel Residencial")).toBeEnabled());

      await userEvent.click(editOf("Aluguel Residencial"));
      const sheet = await screen.findByRole("dialog", { name: "Editar conta" });
      expect(within(sheet).getByLabelText("Nome da conta fixa")).toHaveValue("Aluguel Residencial");
      expect(within(sheet).getByLabelText("Valor mensal fixo estimado")).toHaveValue("2.259,56");
      await userEvent.click(within(sheet).getByRole("button", { name: "Salvar Conta Fixa" }));

      expect(await screen.findByText("Conta salva")).toBeInTheDocument();
      expect(sent(requests, "PATCH")).toHaveLength(1);
    });

    it("reads the row's caption as the edit button's description", async () => {
      show([{ ...BILLS_OF_MONTH[0], variable: true }], EDITING);
      await loaded();

      expect(editOf("Luz (Enel)")).toHaveAccessibleDescription(/Venceu dia 02\/11/);
      expect(editOf("Luz (Enel)")).toHaveAccessibleDescription(/valor variável/);
    });

    it("hides the chevron while the name cannot open Editar conta", async () => {
      show(BILLS_OF_MONTH);
      await loaded();

      expect(editOf("Luz (Enel)")).toBeDisabled();
      expect(editOf("Luz (Enel)").querySelector(".lucide-chevron-right")).toBeNull();
    });

    it("names a carried row's edit after its month and leaves a card on its fatura", async () => {
      show([CARRIED_ALUGUEL, FATURA], EDITING);
      await loaded();

      expect(editOf("Aluguel Residencial de outubro")).toBeInTheDocument();
      expect(within(rowOf("Fatura Porto")).queryByRole("button", { name: /^Editar/ })).not.toBeInTheDocument();
    });

    describe("Excluir conta fixa", () => {
      beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date", "setTimeout", "clearTimeout"] });
        vi.setSystemTime(new Date(2026, 10, 5, 12));
      });

      const remove = async (name: string) => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        await waitFor(() => expect(editOf(name)).toBeEnabled());
        await user.click(editOf(name));
        const sheet = await screen.findByRole("dialog", { name: "Editar conta" });
        await user.click(within(sheet).getByRole("button", { name: "Excluir conta fixa" }));
        return user;
      };

      it("hides the row at once with the counts, and Desfazer brings it back with no request", async () => {
        const { requests } = show(BILLS_OF_MONTH, EDITING);
        await loaded();

        const user = await remove("Luz (Enel)");

        expect(await screen.findByText("Conta fixa excluída")).toBeInTheDocument();
        expect(screen.queryByRole("dialog", { name: "Editar conta" })).not.toBeInTheDocument();
        expect(rows()).toEqual(["Aluguel Residencial"]);
        expect(card()).toHaveTextContent("0 de 1 paga");
        expect(card()).not.toHaveTextContent("vencida");
        await user.click(screen.getByRole("button", { name: "Desfazer" }));

        expect(rows()).toEqual(["Luz (Enel)", "Aluguel Residencial"]);
        expect(card()).toHaveTextContent("0 de 2 pagas");
        act(() => vi.advanceTimersByTime(6000));
        expect(sent(requests, "DELETE")).toHaveLength(0);
      });

      it("deletes once the toast is gone", async () => {
        const { requests } = show(BILLS_OF_MONTH, {
          ...EDITING,
          [`DELETE /api/bills/${BILL_LUZ.id}`]: { status: 204 },
        });
        await loaded();

        await remove("Luz (Enel)");
        await screen.findByText("Conta fixa excluída");
        expect(sent(requests, "DELETE")).toHaveLength(0);
        act(() => vi.advanceTimersByTime(6000));

        await waitFor(() => expect(sent(requests, "DELETE")).toHaveLength(1));
        expect(new URL(sent(requests, "DELETE")[0].url).pathname).toBe(`/api/bills/${BILL_LUZ.id}`);
        expect(rows()).toEqual(["Aluguel Residencial"]);
      });

      it("brings the row back with its own words when deleting fails", async () => {
        show(BILLS_OF_MONTH, {
          ...EDITING,
          [`DELETE /api/bills/${BILL_LUZ.id}`]: { status: 409, body: problem(409, "Texto do servidor.") },
        });
        await loaded();

        await remove("Luz (Enel)");
        await screen.findByText("Conta fixa excluída");
        act(() => vi.advanceTimersByTime(6000));

        expect(await screen.findByText("Não foi possível excluir a conta fixa.")).toBeInTheDocument();
        expect(screen.queryByText("Texto do servidor.")).not.toBeInTheDocument();
        expect(rows()).toEqual(["Luz (Enel)", "Aluguel Residencial"]);
      });

      it("puts the focus on the card's title once the row is gone", async () => {
        show(BILLS_OF_MONTH, EDITING);
        await loaded();

        await remove("Luz (Enel)");
        await screen.findByText("Conta fixa excluída");

        await waitFor(() => expect(within(card()).getByRole("heading", { level: 2 }).firstElementChild).toHaveFocus());
      });

      it("lets go of a chosen day once its only bill is gone", async () => {
        show(BILLS_OF_MONTH, EDITING);
        await loaded();
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        await user.click(within(chips()).getByRole("radio", { name: /^dia 02,/ }));
        expect(rows()).toEqual(["Luz (Enel)"]);

        await remove("Luz (Enel)");
        await screen.findByText("Conta fixa excluída");

        expect(rows()).toEqual(["Aluguel Residencial"]);
      });

      it("drops the card with its last bill and Desfazer brings it back", async () => {
        show([BILLS_OF_MONTH[1]], EDITING);
        await loaded();

        const user = await remove("Aluguel Residencial");

        await screen.findByText("Conta fixa excluída");
        expect(screen.queryByRole("region", { name: "Contas a pagar" })).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Desfazer" }));
        expect(await loaded()).toBeInTheDocument();
        expect(rows()).toEqual(["Aluguel Residencial"]);
      });
    });
  });

  it("renders nothing without a bill (D25)", () => {
    signedIn();
    renderWithQuery(<BillsOfMonth view={{ ...MONTH, bills_of_month: [] }} />);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  describe("a variable conta fixa (SOL-152)", () => {
    const LUZ: Schemas["BillOfMonth"] = {
      ...BILLS_OF_MONTH[1],
      bill_id: "b-luz",
      name: "Luz",
      amount: "180.00",
      due_date: "2026-11-25",
      variable: true,
    };

    it("marks an unpaid variable bill with ≈ and valor variável; its round check and Pagar open the sheet with the estimate and send nothing", async () => {
      const { requests } = show([LUZ]);
      await loaded();

      const row = rowOf("Luz");
      expect(row).toHaveTextContent("Luz · valor variável");
      expect(within(row).getByText(captionOf(" · valor variável"))).toHaveClass("basis-full", "lg:basis-auto");
      expect(row).toHaveTextContent("≈ R$ 180,00");
      expect(
        within(row).getByRole("button", { name: /^valor estimado R\$\s180,00: ajustar pagamento de Luz$/ }),
      ).toBeInTheDocument();

      const [check, pill] = within(row).getAllByRole("button", { name: "Pagar Luz" });
      expect(pill).toBeDefined();
      await userEvent.click(check);
      const sheet = await screen.findByRole("dialog", { name: "Luz · novembro" });
      expect(within(sheet).getByLabelText("Valor de novembro")).toHaveValue("180,00");
      await userEvent.click(within(sheet).getByRole("button", { name: "Fechar" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      await userEvent.click(within(rowOf("Luz")).getAllByRole("button", { name: "Pagar Luz" })[1]);
      expect(await screen.findByRole("dialog", { name: "Luz · novembro" })).toBeInTheDocument();
      expect(requests.some((request) => request.method === "POST")).toBe(false);
    });

    it("shows a paid variable bill's amount with no mark", async () => {
      show([{ ...LUZ, paid: true, transaction_id: "t-paid" }]);
      await loaded();

      const row = rowOf("Luz");
      expect(row).toHaveTextContent("R$ 180,00");
      expect(row).not.toHaveTextContent("≈");
      expect(row).not.toHaveTextContent("valor variável");
    });

    it("says Próxima with ≈ when the next bill is variable", async () => {
      show([LUZ]);
      await loaded();

      expect(card()).toHaveTextContent("Próxima: dia 25 · ≈ R$ 180,00");
    });
  });

  describe("a card's fatura", () => {
    it("reads Fatura Porto with the fatura; Pagar opens the sheet pre-filled with the hint and posts the amount", async () => {
      const { requests } = show([FATURA], { "POST /api/bills/card-porto/pay": { status: 201, body: PAYMENT } });
      await loaded();

      expect(rowOf("Fatura Porto")).toHaveTextContent("Fatura Porto");
      expect(rowOf("Fatura Porto")).toHaveTextContent("R$ 450,00");
      await userEvent.click(within(rowOf("Fatura Porto")).getAllByRole("button", { name: "Pagar Fatura Porto" })[1]);
      const sheet = await screen.findByRole("dialog", { name: "Pagar Fatura Porto" });
      expect(requests.some((request) => request.method === "POST")).toBe(false);
      expect(within(sheet).getByLabelText("Valor")).toHaveValue("450,00");
      expect(within(sheet).getByText("Confira com a fatura do banco.")).toBeInTheDocument();
      await userEvent.click(within(sheet).getByRole("button", { name: "Pagar" }));

      await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
      const post = requests.find((request) => request.method === "POST");
      expect(await post?.json()).toEqual({ date: "2026-11-05", amount: "450.00" });
    });

    it("opens the sheet from the round check too, never paying a fatura without its amount", async () => {
      const { requests } = show([FATURA]);
      await loaded();

      const [check, pill] = within(rowOf("Fatura Porto")).getAllByRole("button", { name: "Pagar Fatura Porto" });
      expect(pill).toBeDefined();
      await userEvent.click(check);

      expect(await screen.findByRole("dialog", { name: "Pagar Fatura Porto" })).toBeInTheDocument();
      expect(requests.some((request) => request.method === "POST")).toBe(false);
    });

    it("opens Fatura Porto from the card's name area; a plain bill has none", async () => {
      show([FATURA, BILLS_OF_MONTH[0]], FATURA_REPLIES);
      await loaded();

      expect(within(rowOf("Luz (Enel)")).queryByRole("button", { name: /^Ver fatura/ })).not.toBeInTheDocument();
      const open = within(rowOf("Fatura Porto")).getByRole("button", { name: "Ver Fatura Porto" });
      expect(open).toHaveClass("min-h-11");
      await userEvent.click(open);

      const panel = await screen.findByRole("dialog", { name: "Fatura Porto" });
      expect(await within(panel).findByRole("region", { name: "Assinaturas" })).toBeInTheDocument();
    });

    it("opens a panel row's entry over the panel, with Parar recorrência", async () => {
      show([FATURA], FATURA_REPLIES);
      await loaded();

      await userEvent.click(within(rowOf("Fatura Porto")).getByRole("button", { name: "Ver Fatura Porto" }));
      const panel = await screen.findByRole("dialog", { name: "Fatura Porto" });
      await userEvent.click(await within(panel).findByRole("button", { name: /Spotify/ }));

      const entry = await screen.findByRole("dialog", { name: "Editar Lançamento Recorrente" });
      expect(within(entry).getByRole("button", { name: "Parar recorrência" })).toBeInTheDocument();
    });

    it("still pays and undoes the fatura after its panel was opened and closed", async () => {
      const { requests, serverHas } = show([FATURA], {
        ...FATURA_REPLIES,
        "POST /api/bills/card-porto/pay": { status: 201, body: PAYMENT },
        "DELETE /api/bills/card-porto/pay": { status: 204 },
      });
      await loaded();
      await userEvent.click(within(rowOf("Fatura Porto")).getByRole("button", { name: "Ver Fatura Porto" }));
      const panel = await screen.findByRole("dialog", { name: "Fatura Porto" });
      await within(panel).findByRole("region", { name: "Assinaturas" });
      await userEvent.click(within(panel).getByRole("button", { name: "Fechar" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      await userEvent.click(within(rowOf("Fatura Porto")).getAllByRole("button", { name: "Pagar Fatura Porto" })[1]);
      const sheet = await screen.findByRole("dialog", { name: "Pagar Fatura Porto" });
      serverHas([{ ...FATURA, paid: true, transaction_id: "t-paid" }]);
      await userEvent.click(within(sheet).getByRole("button", { name: "Pagar" }));
      await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));

      await userEvent.click(await within(card()).findByRole("button", { name: "Desmarcar Fatura Porto" }));
      await waitFor(() => expect(requests.some((request) => request.method === "DELETE")).toBe(true));
    });

    it("keeps Pagar on the check, the amount and the status, never the panel", async () => {
      show([FATURA], FATURA_REPLIES);
      await loaded();
      const row = () => rowOf("Fatura Porto");
      const pays = () => [
        ...within(row()).getAllByRole("button", { name: "Pagar Fatura Porto" }),
        within(row()).getByRole("button", { name: /: ajustar pagamento de Fatura Porto$/ }),
      ];
      expect(pays()).toHaveLength(3);

      for (const index of [0, 1, 2]) {
        await userEvent.click(pays()[index]);
        expect(await screen.findByRole("dialog", { name: "Pagar Fatura Porto" })).toBeInTheDocument();
        expect(screen.queryByRole("dialog", { name: "Fatura Porto" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      }
    });

    it("names each panel button after its own row when October's fatura is carried (D17)", async () => {
      show([{ ...FATURA, due_date: "2026-10-10", overdue: true }, FATURA], FATURA_REPLIES);
      await loaded();

      expect(
        within(rowOf("Fatura Porto de outubro")).getByRole("button", { name: "Ver Fatura Porto de outubro" }),
      ).toBeInTheDocument();
      expect(within(rowOf("Fatura Porto")).getByRole("button", { name: "Ver Fatura Porto" })).toBeInTheDocument();
    });

    it("shows an overdue fatura carried from October and a paid one", async () => {
      show([
        { ...FATURA, due_date: "2026-10-10", overdue: true },
        { ...FATURA, bill_id: "card-nubank", name: "Nubank", amount: "120.00", paid: true, transaction_id: "t" },
      ]);
      await loaded();

      const late = rowOf("Fatura Porto de outubro");
      expect(late).toHaveTextContent("Venceu dia 10/10");
      expect(within(late).getByRole("button", { name: "Pagar Fatura Porto de outubro, vencida" })).toBeInTheDocument();
      const paid = rowOf("Fatura Nubank");
      expect(paid).toHaveTextContent("R$ 120,00");
      expect(within(paid).getByRole("button", { name: "Desmarcar Fatura Nubank" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
  });

  describe("a month of its own (D56)", () => {
    const SKIPPED_RENT: Schemas["BillOfMonth"] = { ...BILLS_OF_MONTH[1], skipped: true, lands_on: null };
    const ADJUSTED_LUZ: Schemas["BillOfMonth"] = {
      ...BILLS_OF_MONTH[0],
      name: "Luz",
      amount: "180.00",
      adjusted: true,
      variable: true,
      overdue: false,
      due_date: "2026-11-25",
    };
    const rent = BILLS_OF_MONTH[1].name;

    it("leaves a skipped month out of the counts and the total, and an adjusted one drops the estimate", async () => {
      show([SKIPPED_RENT, ADJUSTED_LUZ]);
      await loaded();

      expect(card()).toHaveTextContent("Contas a pagar0 de 1 paga");
      expect(screen.getByRole("button", { name: /^Valor variável/ })).toHaveTextContent(
        "0 de 1 paga · falta R$ 180,00",
      );
      expect(card()).toHaveTextContent("Próxima: dia 25 · R$ 180,00");

      const luz = rowOf("Luz");
      expect(luz).toHaveTextContent("Luz · valor ajustado");
      expect(luz).not.toHaveTextContent("valor variável");
      expect(luz).not.toHaveTextContent("≈");
    });

    it("strikes a skipped month through, says so, and leaves no way to pay it", async () => {
      show([SKIPPED_RENT, ADJUSTED_LUZ]);
      await loaded();

      const row = rowOf(rent);
      expect(within(row).getAllByText("pulada em novembro")).toHaveLength(2);
      expect(within(row).getByText(rent)).toHaveClass("line-through", "text-muted-foreground");
      expect(within(row).getByText("R$ 2.259,56")).toHaveClass("line-through");
      expect(within(row).queryByRole("button", { name: `Marcar ${rent} como paga` })).not.toBeInTheDocument();
      expect(within(row).queryByRole("button", { name: `Pagar ${rent}` })).not.toBeInTheDocument();
      expect(within(row).getByRole("button", { name: `Abrir ${rent} de novembro` })).toBeInTheDocument();
    });

    it("counts the rest as all paid", async () => {
      show([SKIPPED_RENT, { ...ADJUSTED_LUZ, paid: true, adjusted: false, transaction_id: "t-paid" }]);
      await loaded();

      expect(card()).toHaveTextContent("Contas a pagar1 de 1 paga");
      expect(card()).toHaveTextContent("Todas as contas do mês pagas");
    });

    it("never says every bill is paid when every month is skipped", async () => {
      show([SKIPPED_RENT, { ...ADJUSTED_LUZ, skipped: true, lands_on: null }]);
      await loaded();

      expect(card()).not.toHaveTextContent("Todas as contas do mês pagas");
    });

    it("reads a skipped adjusted variable month only as skipped", async () => {
      show([
        { ...ADJUSTED_LUZ, skipped: true, lands_on: null },
        { ...ADJUSTED_LUZ, name: "Gás", skipped: true, adjusted: false, lands_on: null },
      ]);
      await loaded();

      for (const name of ["Luz", "Gás"]) {
        const row = rowOf(name);
        expect(row).toHaveTextContent("pulada em novembro");
        expect(row).not.toHaveTextContent("valor ajustado");
        expect(row).not.toHaveTextContent("valor variável");
        expect(row).not.toHaveTextContent("≈");
      }
    });

    it("says a skipped parcela is skipped", async () => {
      show([{ ...SKIPPED_RENT, installment: 3, installments: 10 }]);
      await loaded();

      expect(rowOf(rent)).toHaveTextContent("Parcela 3/10 · pulada");
    });
  });
});

describe("Contas a pagar collapses (SOL-158)", () => {
  beforeEach(() => {
    window.innerWidth = 375;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts open and collapses from the chevron to the title, the paid count and the next bill, remembering it", async () => {
    show();
    await loaded();
    const toggle = within(card()).getByRole("button", { name: "Contas a pagar" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveClass("size-11");
    expect(rowOf("Aluguel Residencial")).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(card()).toHaveTextContent("0 de 2 pagas");
    expect(card()).toHaveTextContent("1 vencida Próxima: dia 10 · R$ 2.259,56");
    expect(within(card()).queryByRole("listitem")).not.toBeInTheDocument();
    expect(within(card()).queryByRole("radiogroup", { name: "Filtrar por dia" })).not.toBeInTheDocument();
    expect(within(card()).queryByRole("link", { name: "Gerenciar contas fixas" })).not.toBeInTheDocument();
    expect(localStorage.getItem("soldi:open:bills")).toBe("closed");
  });

  it("opens collapsed when the choice was closed, and opens again from the chevron", async () => {
    localStorage.setItem("soldi:open:bills", "closed");
    show();
    await loaded();
    expect(within(card()).queryByRole("listitem")).not.toBeInTheDocument();

    await userEvent.click(within(card()).getByRole("button", { name: "Contas a pagar" }));
    expect(rowOf("Aluguel Residencial")).toBeInTheDocument();
    expect(localStorage.getItem("soldi:open:bills")).toBe("open");
  });

  it("starts open and still toggles when the storage is blocked", async () => {
    const blocked = () => {
      throw new Error("blocked");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    show();
    await loaded();
    const toggle = within(card()).getByRole("button", { name: "Contas a pagar" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
