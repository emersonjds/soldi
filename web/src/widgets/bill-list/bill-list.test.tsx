import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import {
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

/** Bills on a server a test can change, as a PATCH would; `month: null` never answers. */
const open = ({
  bills = BILLS,
  month = NOVEMBER,
  replies = {},
}: {
  bills?: Schemas["Bill"][];
  month?: Schemas["MonthView"] | null;
  replies?: Record<string, Reply>;
} = {}) => {
  let server = bills;
  const requests = signedIn({
    "GET /api/categories": { status: 200, body: CATEGORIES },
    ...(month && { "GET /api/months/2026-11": { status: 200, body: month } }),
    ...replies,
  });
  const stubbed = globalThis.fetch;
  vi.stubGlobal("fetch", async (request: Request) => {
    const path = new URL(request.url).pathname;
    if (request.method !== "GET") return stubbed(request);
    if (path === "/api/bills") {
      requests.push(request);
      return Response.json(server);
    }
    if (path === "/api/months/2026-11" && month === null) return new Promise<Response>(() => undefined);
    return stubbed(request);
  });
  renderWithQuery(
    <>
      <BillList />
      <Toaster />
    </>,
  );
  return {
    requests,
    serverHas: (next: Schemas["Bill"][]) => {
      server = next;
    },
  };
};

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

    it("says nothing is ahead when only an overdue bill is unpaid", async () => {
      withRows([luz, { ...aluguel, paid: true }]);

      expect(within(await nextDue()).getByText("Nada a vencer este mês")).toBeInTheDocument();
    });
  });

  describe("Ativa switch", () => {
    const PAUSED_RENT = { ...BILL_ALUGUEL, active: false };

    it("pauses a bill from its row, moves it to Pausadas out of the total, and Desfazer brings it back", async () => {
      const user = userEvent.setup();
      const { requests, serverHas } = open({
        replies: { [`PATCH /api/bills/${BILL_ALUGUEL.id}`]: { status: 200, body: PAUSED_RENT } },
      });

      const rent = await screen.findByRole("switch", { name: "Ativa: Aluguel Residencial" });
      expect(rent).toBeChecked();
      serverHas([PAUSED_RENT, BILL_LUZ, BILL_PAUSED]);
      await user.click(rent);

      expect(await screen.findByText("Conta pausada")).toBeInTheDocument();
      expect(await patches(requests)[0].json()).toEqual({ active: false });
      const moved = within(list("Pausadas")).getByRole("switch", { name: "Ativa: Aluguel Residencial" });
      expect(moved).not.toBeChecked();
      expect(within(await total()).getByText("1 conta ativa")).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      serverHas(BILLS);
      await user.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(await screen.findByText("Conta reativada")).toBeInTheDocument();
      expect(await patches(requests)[1].json()).toEqual({ active: true });
      expect(within(list("Contas ativas")).getByRole("switch", { name: "Ativa: Aluguel Residencial" })).toBeChecked();
    });

    it("reactivates a paused bill", async () => {
      const user = userEvent.setup();
      const { requests, serverHas } = open({
        replies: { [`PATCH /api/bills/${BILL_PAUSED.id}`]: { status: 200, body: { ...BILL_PAUSED, active: true } } },
      });

      const gym = await screen.findByRole("switch", { name: "Ativa: Academia" });
      serverHas([BILL_ALUGUEL, BILL_LUZ, { ...BILL_PAUSED, active: true }]);
      await user.click(gym);

      expect(await screen.findByText("Conta reativada")).toBeInTheDocument();
      expect(await patches(requests)[0].json()).toEqual({ active: true });
      expect(within(list("Contas ativas")).getByRole("switch", { name: "Ativa: Academia" })).toBeChecked();
      expect(screen.queryByRole("list", { name: "Pausadas" })).not.toBeInTheDocument();
    });

    it("turns the switch back and says so when saving fails, and the row itself still opens the sheet", async () => {
      const user = userEvent.setup();
      open({ replies: { [`PATCH /api/bills/${BILL_ALUGUEL.id}`]: { status: 500, body: problem(500, "Falhou.") } } });

      await user.click(await screen.findByRole("switch", { name: "Ativa: Aluguel Residencial" }));

      expect(await screen.findByText("Não foi possível salvar.")).toBeInTheDocument();
      expect(within(list("Contas ativas")).getByRole("switch", { name: "Ativa: Aluguel Residencial" })).toBeChecked();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /^Aluguel Residencial/ }));
      expect(await screen.findByRole("dialog", { name: "Editar conta" })).toBeInTheDocument();
    });
  });
});
