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
  LUZ,
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
  viewing = "2026-11",
  replies = {},
  hold = false,
}: {
  bills?: Schemas["Bill"][];
  month?: Schemas["MonthView"] | null;
  viewing?: string;
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
      <BillList month={viewing} />
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

const total = () => screen.findByRole("region", { name: "Total de Despesas Fixas" });
const nextDue = () => screen.findByRole("region", { name: "Próximo Vencimento" });
const list = () => screen.getByRole("list", { name: "Contas fixas" });
const names = () =>
  within(list())
    .getAllByRole("listitem")
    .map((row) => row.querySelector("[title]")?.textContent);
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

  describe("header", () => {
    it("names the screen", async () => {
      open();

      expect(await screen.findByRole("heading", { level: 1, name: "Contas Fixas Recorrentes" })).toBeInTheDocument();
      expect(screen.getByText("Despesas mensais que compõem sua base fixa de orçamento.")).toBeInTheDocument();
    });
  });

  describe("summary", () => {
    it("totals the active bills only and the share of the viewed month's income they take", async () => {
      open();

      const card = await total();
      expect(within(card).getByText("R$ 2.543,66")).toBeInTheDocument();
      expect(within(card).getByText("2 contas")).toBeInTheDocument();
      await waitFor(() => expect(card).toHaveTextContent("Compromete 40% da renda líquida"));
    });

    it("says one bill in the singular", async () => {
      open({ bills: [BILL_ALUGUEL, BILL_PAUSED] });

      const card = await total();
      expect(within(card).getByText("R$ 2.259,56")).toBeInTheDocument();
      expect(within(card).getByText("1 conta")).toBeInTheDocument();
      await waitFor(() => expect(card).toHaveTextContent("Compromete 36% da renda líquida"));
    });

    it("takes the share from the switcher's month, not this one", async () => {
      open({
        viewing: "2026-12",
        replies: {
          "GET /api/months/2026-12": {
            status: 200,
            body: { ...NOVEMBER, month: "2026-12", totals: { ...NOVEMBER.totals, income: "10000.00" } },
          },
        },
      });

      const card = await total();
      await waitFor(() => expect(card).toHaveTextContent("Compromete 25% da renda líquida"));
    });

    it("leaves a card out of the total", async () => {
      open({ bills: [BILL_ALUGUEL, PORTO] });

      const card = await total();
      expect(within(card).getByText("R$ 2.259,56")).toBeInTheDocument();
      expect(within(card).getByText("1 conta")).toBeInTheDocument();
    });

    it("says there is no income instead of a share", async () => {
      open({ month: { ...NOVEMBER, totals: { ...NOVEMBER.totals, income: "0.00" } } });

      const card = await total();
      expect(await within(card).findByText("Sem entradas em novembro")).toBeInTheDocument();
      expect(card).not.toHaveTextContent("Compromete");
    });

    it("shows the total while the month loads, without the month lines", async () => {
      open({ month: null });

      const card = await total();
      expect(within(card).getByText("R$ 2.543,66")).toBeInTheDocument();
      expect(card).not.toHaveTextContent(/Compromete|Sem entradas/);
      expect(screen.queryByRole("region", { name: "Próximo Vencimento" })).not.toBeInTheDocument();
    });

    it("hides the month lines when the month fails", async () => {
      const { requests } = open({
        replies: { "GET /api/months/2026-11": { status: 500, body: problem(500, "Falhou.") } },
      });

      const card = await total();
      await waitFor(() => expect(requests.some((request) => request.url.includes("/api/months/"))).toBe(true));
      expect(card).not.toHaveTextContent(/Compromete|Sem entradas/);
      expect(screen.queryByRole("region", { name: "Próximo Vencimento" })).not.toBeInTheDocument();
    });

    it("shows R$ 0,00 and no share when every bill is paused", async () => {
      open({ bills: [BILL_PAUSED], month: { ...NOVEMBER, bills_of_month: [] } });

      const card = await total();
      expect(within(card).getByText("R$ 0,00")).toBeInTheDocument();
      expect(within(card).getByText("0 contas")).toBeInTheDocument();
      expect(await within(await nextDue()).findByText("Nada a vencer este mês")).toBeInTheDocument();
      expect(card).not.toHaveTextContent(/Compromete|Sem entradas/);
    });

    it("has no summary, tabs or Status without bills, only the invitation", async () => {
      open({ bills: [] });

      expect(await screen.findByText("Nenhuma conta fixa ainda")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Nova Conta Fixa" })).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Total de Despesas Fixas" })).not.toBeInTheDocument();
      expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
      expect(screen.queryByRole("combobox", { name: "Status" })).not.toBeInTheDocument();
    });
  });

  describe("next due", () => {
    const [luz, aluguel] = BILLS_OF_MONTH;
    const withRows = (rows: Schemas["BillOfMonth"][]) => open({ month: { ...NOVEMBER, bills_of_month: rows } });

    it("puts an overdue bill first, as Vencida", async () => {
      withRows(BILLS_OF_MONTH);

      const card = await nextDue();
      expect(within(card).getByText("Luz (Enel)")).toBeInTheDocument();
      expect(within(card).getByText("Vencida")).toBeInTheDocument();
      expect(within(card).getByText("R$ 284,10")).toBeInTheDocument();
      expect(within(card).getByText("Vence no dia 02")).toBeInTheDocument();
    });

    it("skips a bill registered after its day this month, which owes nothing yet (D17)", async () => {
      withRows([
        { ...luz, overdue: false },
        { ...aluguel, due_date: "2026-11-07" },
      ]);

      const card = await nextDue();
      expect(within(card).getByText("Aluguel Residencial")).toBeInTheDocument();
      expect(within(card).queryByText("Vencida")).not.toBeInTheDocument();
    });

    it.each([
      ["2026-11-05", "Hoje"],
      ["2026-11-06", "Amanhã"],
      ["2026-11-07", "Em 2 dias"],
    ])("says when a bill due %s is due", async (date, label) => {
      withRows([
        { ...luz, paid: true },
        { ...aluguel, due_date: date },
      ]);

      const card = await nextDue();
      expect(within(card).getByText(label)).toBeInTheDocument();
      expect(within(card).getByText("Aluguel Residencial")).toBeInTheDocument();
      expect(within(card).getByText(`Vence no dia ${date.slice(8)}`)).toBeInTheDocument();
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
  });

  describe("list", () => {
    it("lists active bills by due day, then the paused ones, with counts and the footer", async () => {
      open();

      await screen.findByRole("list", { name: "Contas fixas" });
      expect(names()).toEqual(["Luz (Enel)", "Aluguel Residencial", "Academia"]);
      expect(screen.getByRole("tab", { name: "Todas (3)" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: "Despesas (2)" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Pausadas (1)" })).toBeInTheDocument();
      expect(screen.getByText("Mostrando 3 de 3 contas fixas configuradas")).toBeInTheDocument();
      expect(screen.getByText("Sincronizado com projeção de caixa")).toBeInTheDocument();
      const [, rent, gym] = within(list()).getAllByRole("listitem");
      expect(within(rent).getByText("Dia 10")).toBeInTheDocument();
      expect(within(rent).getByText("R$ 2.259,56")).not.toHaveClass("line-through");
      expect(within(gym).getByText("Pausada")).toBeInTheDocument();
      expect(within(gym).getByText("R$ 99,90").parentElement).toHaveClass("line-through");
    });

    it("keeps the tabs and Status on one filter, and the footer counts what shows", async () => {
      open();

      await userEvent.click(await screen.findByRole("tab", { name: "Pausadas (1)" }));
      expect(names()).toEqual(["Academia"]);
      expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("paused");
      expect(screen.getByText("Mostrando 1 de 3 contas fixas configuradas")).toBeInTheDocument();

      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "Ativas");
      expect(screen.getByRole("tab", { name: "Despesas (2)" })).toHaveAttribute("aria-selected", "true");
      expect(names()).toEqual(["Luz (Enel)", "Aluguel Residencial"]);
    });

    it("sorts by Valor and Nome, the paused ones still last", async () => {
      open();

      const order = await screen.findByRole("combobox", { name: "Ordenação" });
      await userEvent.selectOptions(order, "Valor");
      expect(names()).toEqual(["Aluguel Residencial", "Luz (Enel)", "Academia"]);
      await userEvent.selectOptions(order, "Nome");
      expect(names()).toEqual(["Aluguel Residencial", "Luz (Enel)", "Academia"]);
      await userEvent.selectOptions(order, "Vencimento");
      expect(names()).toEqual(["Luz (Enel)", "Aluguel Residencial", "Academia"]);
    });

    it("says a tab is empty instead of hiding the list", async () => {
      open({ bills: [BILL_ALUGUEL] });

      await userEvent.click(await screen.findByRole("tab", { name: "Pausadas (0)" }));
      expect(screen.getByText("Nenhuma conta pausada.")).toBeInTheDocument();
      expect(screen.getByText("Mostrando 0 de 1 contas fixas configuradas")).toBeInTheDocument();
    });

    it("opens the sheet from ⋮ Editar below 1280", async () => {
      open();

      await userEvent.click(await screen.findByRole("button", { name: "Mais ações de Aluguel Residencial" }));
      await userEvent.click(await screen.findByRole("menuitem", { name: "Editar" }));
      const sheet = await screen.findByRole("dialog", { name: "Editar conta" });
      expect(within(sheet).getByLabelText("Nome da conta fixa")).toHaveValue("Aluguel Residencial");
    });
  });

  describe("side form at 1280 and up", () => {
    beforeEach(() => {
      window.innerWidth = 1440;
    });

    const panel = () => screen.findByRole("region", { name: /Adicionar Nova Conta|Editar Conta/ });

    it("adds a bill from the panel with a day chip and the category select, then clears", async () => {
      const { requests } = open({ replies: { "POST /api/bills": { status: 201, body: BILL_LUZ } } });

      const form = await panel();
      expect(within(form).getByText("Formulário rápido")).toBeInTheDocument();
      expect(within(form).getByText("Despesa Fixa")).toBeInTheDocument();
      expect(within(form).getByText("Mensal (todo mês)")).toBeInTheDocument();
      expect(within(form).queryByText(/Receita/)).not.toBeInTheDocument();
      await userEvent.type(within(form).getByLabelText("Nome da conta fixa"), "Luz (Enel)");
      await userEvent.type(within(form).getByLabelText("Valor mensal fixo estimado"), "284,10");
      await userEvent.click(within(form).getByRole("button", { name: "Dia 05" }));
      expect(within(form).getByLabelText("Dia do vencimento recorrente")).toHaveValue("5");
      expect(within(form).getByRole("button", { name: "Dia 05" })).toHaveAttribute("aria-pressed", "true");
      await userEvent.selectOptions(within(form).getByLabelText("Categoria"), "Luz");
      await userEvent.click(within(form).getByRole("button", { name: "Salvar Conta Fixa" }));

      await waitFor(() => expect(sent(requests, "POST")).toHaveLength(1));
      expect(await sent(requests, "POST")[0].json()).toEqual({
        name: "Luz (Enel)",
        amount: "284.10",
        due_day: 5,
        category_id: LUZ.id,
      });
      expect(within(await panel()).getByLabelText("Nome da conta fixa")).toHaveValue("");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("edits from ⋮ in the panel; Descartar alterações reloads the bill", async () => {
      const { requests } = open({
        replies: { [`PATCH /api/bills/${BILL_ALUGUEL.id}`]: { status: 200, body: BILL_ALUGUEL } },
      });

      await userEvent.click(await screen.findByRole("button", { name: "Mais ações de Aluguel Residencial" }));
      await userEvent.click(await screen.findByRole("menuitem", { name: "Editar" }));
      const form = await screen.findByRole("region", { name: "Editar Conta" });
      const name = within(form).getByLabelText("Nome da conta fixa");
      expect(name).toHaveValue("Aluguel Residencial");
      expect(name).toHaveFocus();
      expect(within(form).getByLabelText("Categoria")).toHaveValue(ALUGUEL.id);
      await userEvent.clear(name);
      await userEvent.type(name, "Outro");
      await userEvent.click(within(form).getByRole("button", { name: "Descartar alterações" }));
      expect(name).toHaveValue("Aluguel Residencial");
      await userEvent.click(within(form).getByRole("switch", { name: "Ativa" }));
      await userEvent.click(within(form).getByRole("button", { name: "Salvar Conta Fixa" }));

      await waitFor(() => expect(patches(requests)).toHaveLength(1));
      expect(await patches(requests)[0].json()).toEqual({
        name: "Aluguel Residencial",
        amount: "2259.56",
        due_day: 10,
        category_id: ALUGUEL.id,
        active: false,
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("focuses the panel from Nova Conta Fixa, and Descartar clears a new bill", async () => {
      open();

      await userEvent.click(await screen.findByRole("button", { name: "Nova Conta Fixa" }));
      const form = await panel();
      const name = within(form).getByLabelText("Nome da conta fixa");
      expect(name).toHaveFocus();
      await userEvent.type(name, "Plano");
      await userEvent.click(within(form).getByRole("button", { name: "Descartar alterações" }));
      expect(name).toHaveValue("");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("shows the panel at first use", async () => {
      open({ bills: [] });

      expect(await screen.findByText("Nenhuma conta fixa ainda")).toBeInTheDocument();
      expect(await panel()).toBeInTheDocument();
    });

    it("archives from the panel with an undo", async () => {
      open();

      await userEvent.click(await screen.findByRole("button", { name: /^Aluguel Residencial/ }));
      await userEvent.click(within(await panel()).getByRole("button", { name: "Arquivar" }));
      expect(await screen.findByText("Conta arquivada")).toBeInTheDocument();
      expect(names()).toEqual(["Luz (Enel)", "Academia"]);
      expect(within(await panel()).getByLabelText("Nome da conta fixa")).toHaveValue("");
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

    it("pauses a bill from its row to the end of the list and out of the total, and Desfazer sends nothing", async () => {
      const { requests } = open();
      const clicks = user();

      const rent = await screen.findByRole("switch", { name: RENT });
      expect(rent).toBeChecked();
      await clicks.click(rent);

      expect(await screen.findByText("Conta pausada")).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: RENT })).not.toBeChecked();
      expect(names()).toEqual(["Luz (Enel)", "Aluguel Residencial", "Academia"]);
      expect(screen.getByRole("tab", { name: "Pausadas (2)" })).toBeInTheDocument();
      expect(within(await total()).getByText("1 conta")).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(patches(requests)).toHaveLength(0);

      await clicks.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(screen.getByRole("switch", { name: RENT })).toBeChecked();
      expire();
      expect(patches(requests)).toHaveLength(0);
      expect(within(await total()).getByText("2 contas")).toBeInTheDocument();
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
      await waitFor(() => expect(screen.getByRole("switch", { name: RENT })).toBeEnabled());
      expect(screen.getByRole("switch", { name: RENT })).not.toBeChecked();
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
      expect(screen.getByRole("switch", { name: "Ativa: Academia" })).toBeChecked();
      expect(screen.getByRole("tab", { name: "Pausadas (0)" })).toBeInTheDocument();

      await clicks.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(await screen.findByText("Conta pausada")).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: "Ativa: Academia" })).not.toBeChecked();
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
      expect(screen.getByRole("switch", { name: RENT })).not.toBeChecked();

      answer(500, problem(500, "Falhou."));
      expect(await screen.findByText("Não foi possível salvar.")).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: RENT })).toBeChecked();
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
      const amount = within(sheet).getByLabelText("Valor mensal fixo estimado");
      await clicks.clear(amount);
      await clicks.type(amount, "2300,00");
      await clicks.click(within(sheet).getByRole("button", { name: "Salvar Conta Fixa" }));

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
      expect(screen.getByRole("tab", { name: "Despesas (0)" })).toBeInTheDocument();
      expect(within(await total()).getByText("0 contas")).toBeInTheDocument();
      serverHas([PAUSED_RENT, PAUSED_LUZ, BILL_PAUSED]);
      expire();

      await waitFor(() => expect(patches(requests)).toHaveLength(2));
      const bodies = await Promise.all(
        patches(requests).map(async (request) => [new URL(request.url).pathname, await request.json()]),
      );
      expect(bodies).toEqual(
        expect.arrayContaining([
          [`/api/bills/${BILL_ALUGUEL.id}`, { active: false }],
          [`/api/bills/${BILL_LUZ.id}`, { active: false }],
        ]),
      );
      await waitFor(() => expect(screen.getByRole("switch", { name: RENT })).toBeEnabled());
      expect(screen.getByRole("switch", { name: "Ativa: Luz (Enel)" })).not.toBeChecked();
      expect(screen.getByRole("switch", { name: "Ativa: Academia" })).not.toBeChecked();
    });
  });

  describe("credit card", () => {
    it("creates a card with the switch: no Valor, a Fecha dia from 1 to 31 and no category until one is picked", async () => {
      const { requests } = open({ replies: { "POST /api/bills": { status: 201, body: PORTO } } });

      await userEvent.click(await screen.findByRole("button", { name: "Nova Conta Fixa" }));
      const sheet = await screen.findByRole("dialog", { name: "Nova conta" });
      await userEvent.click(within(sheet).getByRole("switch", { name: "Cartão de crédito" }));

      expect(within(sheet).queryByLabelText("Valor mensal fixo estimado")).not.toBeInTheDocument();
      expect(within(sheet).getByText("Ex.: Cartão › Porto")).toBeInTheDocument();
      expect(within(sheet).getByLabelText("Categoria")).toHaveValue("");
      await userEvent.type(within(sheet).getByLabelText("Nome da conta fixa"), "Porto");
      await userEvent.type(within(sheet).getByLabelText("Fecha dia"), "0");
      await userEvent.type(within(sheet).getByLabelText("Dia do vencimento recorrente"), "10");
      await userEvent.click(within(sheet).getByRole("button", { name: "Salvar Conta Fixa" }));
      expect(within(sheet).getByLabelText("Fecha dia")).toHaveAttribute("aria-invalid", "true");
      expect(within(sheet).getByLabelText("Dia do vencimento recorrente")).toHaveAttribute("aria-invalid", "false");
      expect(within(sheet).getByText("Escolha uma categoria.")).toBeInTheDocument();

      await userEvent.clear(within(sheet).getByLabelText("Fecha dia"));
      await userEvent.type(within(sheet).getByLabelText("Fecha dia"), "32");
      await userEvent.selectOptions(within(sheet).getByLabelText("Categoria"), "Aluguel");
      await userEvent.click(within(sheet).getByRole("button", { name: "Salvar Conta Fixa" }));
      expect(within(sheet).getByText("Escolha um dia de 1 a 31.")).toBeInTheDocument();
      expect(sent(requests, "POST")).toHaveLength(0);

      await userEvent.clear(within(sheet).getByLabelText("Fecha dia"));
      await userEvent.type(within(sheet).getByLabelText("Fecha dia"), "3");
      await userEvent.click(within(sheet).getByRole("button", { name: "Salvar Conta Fixa" }));

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

      const row = (await screen.findByRole("button", { name: /^Porto/ })).closest("li");
      expect(row).toHaveTextContent("Fecha dia 3 · vence dia 10");
      expect(row).not.toHaveTextContent("R$");
      expect(screen.queryByRole("switch", { name: "Ativa: Porto" })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /^Porto/ }));
      const sheet = await screen.findByRole("dialog", { name: "Editar conta" });
      expect(within(sheet).queryByRole("switch")).not.toBeInTheDocument();
      expect(within(sheet).queryByLabelText("Valor mensal fixo estimado")).not.toBeInTheDocument();
      expect(within(sheet).getByLabelText("Fecha dia")).toHaveValue("3");
      await userEvent.clear(within(sheet).getByLabelText("Fecha dia"));
      await userEvent.type(within(sheet).getByLabelText("Fecha dia"), "5");
      await userEvent.click(within(sheet).getByRole("button", { name: "Salvar Conta Fixa" }));

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
