import { QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import {
  ALUGUEL,
  BILL_ALUGUEL,
  BILL_LUZ,
  BILL_PAUSED,
  BILLS,
  BILLS_OF_MONTH,
  CATEGORIES,
  MONTH,
  problem,
  signedIn,
} from "@/test/stub-api";

import { BillList } from "./bill-list";

type Reply = { status: number; body?: unknown };

const NOVEMBER: Schemas["MonthView"] = {
  ...MONTH,
  totals: { ...MONTH.totals, income: "6361.60" },
  bills_of_month: BILLS_OF_MONTH,
};

/** Bills on a server a test can change, as a PATCH would; `month: null` never answers; `hold` keeps every PATCH pending until `answer`. */
const open = ({
  bills = BILLS,
  month = NOVEMBER,
  replies = {},
  hold = false,
}: {
  bills?: Schemas["Bill"][];
  month?: Schemas["MonthView"] | null;
  replies?: Record<string, Reply>;
  hold?: boolean;
} = {}) => {
  let server = bills;
  const pending: ((response: Response) => void)[] = [];
  const requests = signedIn({
    "GET /api/categories": { status: 200, body: CATEGORIES },
    ...(month && { "GET /api/months/2026-11": { status: 200, body: month } }),
    ...replies,
  });
  const stubbed = globalThis.fetch;
  vi.stubGlobal("fetch", async (request: Request) => {
    const path = new URL(request.url).pathname;
    if (hold && request.method === "PATCH") {
      requests.push(request);
      return new Promise<Response>((resolve) => pending.push(resolve));
    }
    if (request.method !== "GET") return stubbed(request);
    if (path === "/api/bills") {
      requests.push(request);
      return Response.json(server);
    }
    if (path === "/api/months/2026-11" && month === null) return new Promise<Response>(() => undefined);
    return stubbed(request);
  });
  const { client, rerender } = renderWithQuery(
    <>
      <BillList />
      <Toaster />
    </>,
  );
  return {
    requests,
    answer: (status: number, body: unknown) => pending.shift()?.(Response.json(body, { status })),
    leave: () =>
      rerender(
        <QueryClientProvider client={client}>
          {null}
          <Toaster />
        </QueryClientProvider>,
      ),
    serverHas: (next: Schemas["Bill"][]) => {
      server = next;
    },
  };
};

const PORTO: Schemas["Bill"] = {
  ...BILL_LUZ,
  id: "b1000000-0000-4000-8000-000000000009",
  name: "Porto",
  amount: null,
  closing_day: 3,
  due_day: 10,
};

const sent = (requests: Request[], method: string) => requests.filter((request) => request.method === method);

const total = () => screen.findByRole("region", { name: "Total das contas fixas" });
const nextDue = () => screen.findByRole("region", { name: "Próximo vencimento" });
const list = (name: string) => screen.getByRole("list", { name });
const patches = (requests: Request[]) => requests.filter((request) => request.method === "PATCH");

describe("Contas fixas", () => {
  beforeEach(() => {
    window.innerWidth = 375;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("summary", () => {
    it("totals the active bills only and the share of this month's income they take", async () => {
      open();

      const card = await total();
      expect(within(card).getByText("R$ 2.543,66")).toBeInTheDocument();
      expect(within(card).getByText("2 contas ativas")).toBeInTheDocument();
      expect(await within(card).findByText("Comprometem 40% das entradas de novembro")).toBeInTheDocument();
    });

    it("says one active bill in the singular", async () => {
      open({ bills: [BILL_ALUGUEL, BILL_PAUSED] });

      const card = await total();
      expect(within(card).getByText("R$ 2.259,56")).toBeInTheDocument();
      expect(within(card).getByText("1 conta ativa")).toBeInTheDocument();
      expect(await within(card).findByText("Comprometem 36% das entradas de novembro")).toBeInTheDocument();
    });

    it("leaves a card out of the total", async () => {
      open({ bills: [BILL_ALUGUEL, PORTO] });

      const card = await total();
      expect(within(card).getByText("R$ 2.259,56")).toBeInTheDocument();
      expect(within(card).getByText("1 conta ativa")).toBeInTheDocument();
    });

    it("says there is no income yet instead of a share", async () => {
      open({ month: { ...NOVEMBER, totals: { ...NOVEMBER.totals, income: "0.00" } } });

      const card = await total();
      expect(await within(card).findByText("Sem entradas em novembro ainda.")).toBeInTheDocument();
      expect(within(card).queryByText(/Comprometem/)).not.toBeInTheDocument();
    });

    it("shows the total while the month loads, without the month lines", async () => {
      open({ month: null });

      const card = await total();
      expect(within(card).getByText("R$ 2.543,66")).toBeInTheDocument();
      expect(within(card).queryByText(/Comprometem|Sem entradas/)).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Próximo vencimento" })).not.toBeInTheDocument();
    });

    it("hides the month lines when the month fails", async () => {
      const { requests } = open({
        replies: { "GET /api/months/2026-11": { status: 500, body: problem(500, "Falhou.") } },
      });

      const card = await total();
      await waitFor(() => expect(requests.some((request) => request.url.includes("/api/months/"))).toBe(true));
      expect(within(card).queryByText(/Comprometem|Sem entradas/)).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Próximo vencimento" })).not.toBeInTheDocument();
    });

    it("shows R$ 0,00 and no share when every bill is paused", async () => {
      open({ bills: [BILL_PAUSED], month: { ...NOVEMBER, bills_of_month: [] } });

      const card = await total();
      expect(within(card).getByText("R$ 0,00")).toBeInTheDocument();
      expect(within(card).getByText("0 contas ativas")).toBeInTheDocument();
      expect(await within(await nextDue()).findByText("Nada a vencer este mês")).toBeInTheDocument();
      expect(within(card).queryByText(/Comprometem|Sem entradas/)).not.toBeInTheDocument();
    });

    it("has no summary without bills", async () => {
      open({ bills: [] });

      expect(await screen.findByText("Nenhuma conta fixa ainda")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Total das contas fixas" })).not.toBeInTheDocument();
    });
  });

  describe("next due", () => {
    const [luz, aluguel] = BILLS_OF_MONTH;
    const withRows = (rows: Schemas["BillOfMonth"][]) => open({ month: { ...NOVEMBER, bills_of_month: rows } });

    it("names the next unpaid bill, its amount and the days left, skipping the overdue one", async () => {
      withRows(BILLS_OF_MONTH);

      const card = await nextDue();
      expect(within(card).getByText("Aluguel Residencial")).toBeInTheDocument();
      expect(within(card).getByText("R$ 2.259,56")).toBeInTheDocument();
      expect(within(card).getByText("Vence em 5 dias")).toBeInTheDocument();
    });

    it.each([
      ["2026-11-05", "Vence hoje"],
      ["2026-11-06", "Vence amanhã"],
    ])("says when a bill due %s is due", async (date, label) => {
      withRows([luz, { ...aluguel, due_date: date }]);

      expect(within(await nextDue()).getByText(label)).toBeInTheDocument();
    });

    it("says every bill of the month is paid", async () => {
      withRows(BILLS_OF_MONTH.map((row) => ({ ...row, paid: true, overdue: false })));

      expect(within(await nextDue()).getByText("Todas as contas do mês pagas")).toBeInTheDocument();
    });

    it("leaves a card's fatura out of the next due", async () => {
      withRows([{ ...aluguel, name: "Porto", is_card: true, due_date: "2026-11-06" }, aluguel]);

      const card = await nextDue();
      expect(within(card).getByText("Aluguel Residencial")).toBeInTheDocument();
      expect(within(card).queryByText("Porto")).not.toBeInTheDocument();
    });

    it("says nothing is ahead when only an overdue bill is unpaid", async () => {
      withRows([luz, { ...aluguel, paid: true }]);

      expect(within(await nextDue()).getByText("Nada a vencer este mês")).toBeInTheDocument();
    });
  });

  describe("Ativa switch", () => {
    const PAUSED_RENT = { ...BILL_ALUGUEL, active: false };
    const PAUSED_LUZ = { ...BILL_LUZ, active: false };
    const RENT = "Ativa: Aluguel Residencial";

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date(2026, 10, 5, 12));
    });

    const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const expire = () => act(() => vi.advanceTimersByTime(6000));

    it("pauses a bill from its row into Pausadas and out of the total, and Desfazer sends nothing", async () => {
      const { requests } = open();
      const clicks = user();

      const rent = await screen.findByRole("switch", { name: RENT });
      expect(rent).toBeChecked();
      await clicks.click(rent);

      expect(await screen.findByText("Conta pausada")).toBeInTheDocument();
      expect(within(list("Pausadas")).getByRole("switch", { name: RENT })).not.toBeChecked();
      expect(within(await total()).getByText("1 conta ativa")).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(patches(requests)).toHaveLength(0);

      await clicks.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(within(list("Contas ativas")).getByRole("switch", { name: RENT })).toBeChecked();
      expire();
      expect(patches(requests)).toHaveLength(0);
      expect(within(await total()).getByText("2 contas ativas")).toBeInTheDocument();
    });

    it("sends the pause once the toast is gone", async () => {
      const { requests, serverHas } = open({
        replies: { [`PATCH /api/bills/${BILL_ALUGUEL.id}`]: { status: 200, body: PAUSED_RENT } },
      });

      await user().click(await screen.findByRole("switch", { name: RENT }));
      await screen.findByText("Conta pausada");
      serverHas([PAUSED_RENT, BILL_LUZ, BILL_PAUSED]);
      expire();

      await waitFor(() => expect(patches(requests)).toHaveLength(1));
      expect(await patches(requests)[0].json()).toEqual({ active: false });
      await waitFor(() => expect(within(list("Pausadas")).getByRole("switch", { name: RENT })).toBeEnabled());
      expect(patches(requests)).toHaveLength(1);
    });

    it("still sends the pause when the page is left with the toast up", async () => {
      const { requests, leave } = open({
        replies: { [`PATCH /api/bills/${BILL_ALUGUEL.id}`]: { status: 200, body: PAUSED_RENT } },
      });

      await user().click(await screen.findByRole("switch", { name: RENT }));
      await screen.findByText("Conta pausada");
      leave();
      expire();

      await waitFor(() => expect(patches(requests)).toHaveLength(1));
      expect(await patches(requests)[0].json()).toEqual({ active: false });
    });

    it("reactivates a paused bill at once, and its Desfazer pauses it again without a request", async () => {
      const { requests, serverHas } = open({
        replies: { [`PATCH /api/bills/${BILL_PAUSED.id}`]: { status: 200, body: { ...BILL_PAUSED, active: true } } },
      });
      const clicks = user();

      const gym = await screen.findByRole("switch", { name: "Ativa: Academia" });
      serverHas([BILL_ALUGUEL, BILL_LUZ, { ...BILL_PAUSED, active: true }]);
      await clicks.click(gym);

      expect(await screen.findByText("Conta reativada")).toBeInTheDocument();
      expect(await patches(requests)[0].json()).toEqual({ active: true });
      expect(within(list("Contas ativas")).getByRole("switch", { name: "Ativa: Academia" })).toBeChecked();
      expect(screen.queryByRole("list", { name: "Pausadas" })).not.toBeInTheDocument();

      await clicks.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(await screen.findByText("Conta pausada")).toBeInTheDocument();
      expect(within(list("Pausadas")).getByRole("switch", { name: "Ativa: Academia" })).not.toBeChecked();
      expect(patches(requests)).toHaveLength(1);
    });

    it("holds the switch while its request is out, so a second click sends nothing", async () => {
      const { requests, answer } = open({ hold: true });
      const clicks = user();

      const gym = await screen.findByRole("switch", { name: "Ativa: Academia" });
      await clicks.click(gym);
      const pending = await screen.findByRole("switch", { name: "Ativa: Academia" });
      expect(pending).toBeChecked();
      expect(pending).toBeDisabled();
      await clicks.click(pending);
      expect(patches(requests)).toHaveLength(1);

      answer(200, { ...BILL_PAUSED, active: true });
      expect(await screen.findByText("Conta reativada")).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: "Ativa: Academia" })).toBeEnabled();
    });

    it("shows the pause while it is saving, turns the switch back when it fails, and the row still opens the sheet", async () => {
      const { requests, answer } = open({ hold: true });
      const clicks = user();

      await clicks.click(await screen.findByRole("switch", { name: RENT }));
      await screen.findByText("Conta pausada");
      expire();
      await waitFor(() => expect(patches(requests)).toHaveLength(1));
      expect(within(list("Pausadas")).getByRole("switch", { name: RENT })).not.toBeChecked();

      answer(500, problem(500, "Falhou."));
      expect(await screen.findByText("Não foi possível salvar.")).toBeInTheDocument();
      expect(within(list("Contas ativas")).getByRole("switch", { name: RENT })).toBeChecked();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await clicks.click(screen.getByRole("button", { name: /^Aluguel Residencial/ }));
      expect(await screen.findByRole("dialog", { name: "Editar conta" })).toBeInTheDocument();
    });

    it("keeps a bill paused when it is edited right after the pause, which opening the sheet commits", async () => {
      const { requests } = open({
        replies: { [`PATCH /api/bills/${BILL_ALUGUEL.id}`]: { status: 200, body: PAUSED_RENT } },
      });
      const clicks = user();

      await clicks.click(await screen.findByRole("switch", { name: RENT }));
      await screen.findByText("Conta pausada");
      await clicks.click(screen.getByRole("button", { name: /^Aluguel Residencial/ }));
      const sheet = await screen.findByRole("dialog", { name: "Editar conta" });
      await waitFor(() => expect(patches(requests)).toHaveLength(1));
      expect(await patches(requests)[0].json()).toEqual({ active: false });
      expect(within(sheet).getByRole("switch", { name: "Ativa" })).not.toBeChecked();
      await clicks.clear(within(sheet).getByLabelText("Valor"));
      await clicks.type(within(sheet).getByLabelText("Valor"), "2300,00");
      await clicks.click(within(sheet).getByRole("button", { name: "Salvar" }));

      await waitFor(() => expect(patches(requests)).toHaveLength(2));
      expect(await patches(requests)[1].json()).toEqual({
        name: "Aluguel Residencial",
        amount: "2300.00",
        due_day: 10,
        category_id: BILL_ALUGUEL.category_id,
      });
    });

    it("pauses two rows back to back, each with its own toast and request", async () => {
      const { requests, serverHas } = open({
        replies: {
          [`PATCH /api/bills/${BILL_ALUGUEL.id}`]: { status: 200, body: PAUSED_RENT },
          [`PATCH /api/bills/${BILL_LUZ.id}`]: { status: 200, body: PAUSED_LUZ },
        },
      });
      const clicks = user();

      await clicks.click(await screen.findByRole("switch", { name: RENT }));
      await clicks.click(screen.getByRole("switch", { name: "Ativa: Luz (Enel)" }));

      expect(await screen.findAllByText("Conta pausada")).toHaveLength(2);
      expect(screen.queryByRole("list", { name: "Contas ativas" })).not.toBeInTheDocument();
      expect(within(await total()).getByText("0 contas ativas")).toBeInTheDocument();
      serverHas([PAUSED_RENT, PAUSED_LUZ, BILL_PAUSED]);
      expire();

      await waitFor(() => expect(patches(requests)).toHaveLength(2));
      const sent = await Promise.all(
        patches(requests).map(async (request) => [new URL(request.url).pathname, await request.json()]),
      );
      expect(sent).toEqual(
        expect.arrayContaining([
          [`/api/bills/${BILL_ALUGUEL.id}`, { active: false }],
          [`/api/bills/${BILL_LUZ.id}`, { active: false }],
        ]),
      );
      await waitFor(() => expect(within(list("Pausadas")).getByRole("switch", { name: RENT })).toBeEnabled());
      const paused = within(list("Pausadas"));
      expect(paused.getByRole("switch", { name: "Ativa: Luz (Enel)" })).not.toBeChecked();
      expect(paused.getByRole("switch", { name: "Ativa: Academia" })).not.toBeChecked();
      expect(screen.queryByRole("list", { name: "Contas ativas" })).not.toBeInTheDocument();
    });
  });

  describe("credit card", () => {
    it("creates a card with the switch: no Valor, a Fecha dia from 1 to 31 and no category until one is picked", async () => {
      const { requests } = open({ replies: { "POST /api/bills": { status: 201, body: PORTO } } });

      await userEvent.click(await screen.findByRole("button", { name: "Nova conta" }));
      const sheet = await screen.findByRole("dialog", { name: "Nova conta" });
      await userEvent.click(within(sheet).getByRole("switch", { name: "Cartão de crédito" }));

      expect(within(sheet).queryByLabelText("Valor")).not.toBeInTheDocument();
      expect(within(sheet).getByText("Ex.: Cartão › Porto")).toBeInTheDocument();
      expect(within(sheet).getByRole("radio", { name: "Aluguel" })).toHaveAttribute("aria-checked", "false");
      await userEvent.type(within(sheet).getByLabelText("Nome"), "Porto");
      await userEvent.type(within(sheet).getByLabelText("Fecha dia"), "0");
      await userEvent.type(within(sheet).getByLabelText("Vence dia"), "10");
      await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));
      expect(within(sheet).getByLabelText("Fecha dia")).toHaveAttribute("aria-invalid", "true");
      expect(within(sheet).getByLabelText("Vence dia")).toHaveAttribute("aria-invalid", "false");
      expect(within(sheet).getByText("Escolha uma categoria.")).toBeInTheDocument();

      await userEvent.clear(within(sheet).getByLabelText("Fecha dia"));
      await userEvent.type(within(sheet).getByLabelText("Fecha dia"), "32");
      await userEvent.click(within(sheet).getByRole("radio", { name: "Aluguel" }));
      await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));
      expect(within(sheet).getByText("Escolha um dia de 1 a 31.")).toBeInTheDocument();
      expect(sent(requests, "POST")).toHaveLength(0);

      await userEvent.clear(within(sheet).getByLabelText("Fecha dia"));
      await userEvent.type(within(sheet).getByLabelText("Fecha dia"), "3");
      await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));

      await waitFor(() => expect(sent(requests, "POST")).toHaveLength(1));
      expect(await sent(requests, "POST")[0].json()).toEqual({
        name: "Porto",
        due_day: 10,
        closing_day: 3,
        category_id: ALUGUEL.id,
      });
    });

    it("lists a card by its days and edits its Fecha dia, with no card or Ativa switch", async () => {
      const { requests } = open({
        bills: [BILL_ALUGUEL, PORTO],
        replies: { [`PATCH /api/bills/${PORTO.id}`]: { status: 200, body: PORTO } },
      });

      const row = await screen.findByRole("button", { name: /^Porto/ });
      expect(row).toHaveTextContent("Fecha dia 3 · vence dia 10");
      expect(row).not.toHaveTextContent("R$");
      expect(within(list("Contas ativas")).queryByRole("switch", { name: "Ativa: Porto" })).not.toBeInTheDocument();

      await userEvent.click(row);
      const sheet = await screen.findByRole("dialog", { name: "Editar conta" });
      expect(within(sheet).queryByRole("switch")).not.toBeInTheDocument();
      expect(within(sheet).queryByLabelText("Valor")).not.toBeInTheDocument();
      expect(within(sheet).getByLabelText("Fecha dia")).toHaveValue("3");
      await userEvent.clear(within(sheet).getByLabelText("Fecha dia"));
      await userEvent.type(within(sheet).getByLabelText("Fecha dia"), "5");
      await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));

      await waitFor(() => expect(patches(requests)).toHaveLength(1));
      expect(await patches(requests)[0].json()).toEqual({
        name: "Porto",
        due_day: 10,
        closing_day: 5,
        category_id: PORTO.category_id,
      });
    });
  });
});
