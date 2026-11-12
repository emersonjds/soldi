import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { setSearch } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import {
  COFRINHO_RESERVA,
  COFRINHO_SEM_OBJETIVO,
  COFRINHO_VIAGEM,
  COFRINHOS,
  ECONOMIA,
  MOVEMENTS,
  problem,
  RESERVA,
  SAVINGS_YEAR,
  signedIn,
  VIAGEM,
  WITH_COFRINHOS,
} from "@/test/stub-api";

import EconomiaPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

type Reply = { status: number; body?: unknown };

const CARRO: Schemas["Cofrinho"] = {
  ...COFRINHO_VIAGEM,
  category_id: "c1000000-0000-4000-8000-000000000031",
  name: "Carro",
  icon: "car",
  target: "500.00",
  balance: "500.00",
  progress_pct: "100.0",
  done: true,
};
const LOOSE = { ...COFRINHO_SEM_OBJETIVO, balance: "120.00" };
const EMPTY_VIAGEM = { ...COFRINHO_VIAGEM, balance: "0.00" };
const goal = (id: string, name: string, deadline: string, rest: Partial<Schemas["Cofrinho"]> = {}) => ({
  ...COFRINHO_RESERVA,
  category_id: `c1000000-0000-4000-8000-0000000000${id}`,
  name,
  deadline,
  ...rest,
});

const MOVES = `GET /api/cofrinhos/${RESERVA.id}/movements`;
const ALL_MOVES = `GET /api/cofrinhos/${ECONOMIA.id}/movements`;
const WITHDRAW = `POST /api/cofrinhos/${RESERVA.id}/withdraw`;

const open = (replies: Record<string, Reply> = {}, hanging?: string) => {
  const requests = signedIn({
    "GET /api/cofrinhos": {
      status: 200,
      body: { ...COFRINHOS, items: [COFRINHO_RESERVA, COFRINHO_VIAGEM, CARRO, LOOSE] },
    },
    "GET /api/categories": { status: 200, body: WITH_COFRINHOS },
    [MOVES]: { status: 200, body: MOVEMENTS },
    "GET /api/reports/savings": { status: 200, body: SAVINGS_YEAR },
    ...replies,
  });
  if (hanging) {
    const answer = globalThis.fetch;
    vi.stubGlobal("fetch", (request: Request) =>
      new URL(request.url).pathname === hanging ? new Promise<Response>(() => undefined) : answer(request),
    );
  }
  renderWithQuery(
    <>
      <EconomiaPage />
      <Toaster />
    </>,
  );
  return requests;
};

const items = (list: Schemas["Cofrinho"][], rest: Partial<Schemas["Cofrinhos"]> = {}) => ({
  "GET /api/cofrinhos": { status: 200, body: { ...COFRINHOS, items: list, ...rest } },
});
const region = (name: string) => screen.findByRole("region", { name });
const hero = () => region("Total guardado em cofrinhos");
const sent = (requests: Request[], method: string) => requests.filter((request) => request.method === method);
const menu = async (name: string) => {
  await userEvent.click(within(await region(name)).getByRole("button", { name: `Mais ações de ${name}` }));
  return screen.findByRole("menu");
};
const detail = async (name: string) => {
  await menu(name);
  await userEvent.click(screen.getByRole("menuitem", { name: "Movimentos" }));
  return screen.findByRole("dialog", { name });
};
const lancar = () => screen.findByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });

describe("Cofrinhos", () => {
  beforeEach(() => {
    setSearch("");
    window.innerWidth = 375;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("the header and the hero", () => {
    it("shows the eyebrow, the title and the total with this month's share", async () => {
      const requests = open();

      expect(screen.getByText("POUPANÇA ATIVA & FUTURO")).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: "Cofrinhos & Metas de Poupança" })).toBeInTheDocument();
      const total = await hero();
      expect(total).toHaveTextContent("Protegido");
      expect(within(total).getByText("R$ 1.300,00").parentElement).toHaveClass("text-[40px]");
      expect(total).toHaveTextContent("+R$ 500,00 este mês. Saldo protegido de gastos correntes da conta principal.");
      expect(requests.some((request) => request.url.endsWith("/api/cofrinhos?month=2026-11"))).toBe(true);
    });

    it("asks for the switcher's month and signs a negative month", async () => {
      setSearch("m=2026-10");
      const requests = open(items([COFRINHO_RESERVA], { saved_this_month: "-50.00" }));

      expect(await hero()).toHaveTextContent("-R$ 50,00 este mês.");
      expect(requests.some((request) => request.url.endsWith("/api/cofrinhos?month=2026-10"))).toBe(true);
    });

    it("says nothing went in this month at zero", async () => {
      open(items([COFRINHO_RESERVA], { saved_this_month: "0.00" }));

      expect(await hero()).toHaveTextContent(
        "Nada guardado este mês. Saldo protegido de gastos correntes da conta principal.",
      );
    });

    it("sums the Meta Global only over cofrinhos with a target", async () => {
      open();

      const total = await hero();
      expect(total).toHaveTextContent("Meta Global Consolidada: R$ 800,00 de R$ 10.500,00");
      expect(total).toHaveTextContent("7,6% concluído");
      expect(within(total).getByRole("progressbar", { name: "Meta Global Consolidada" })).toHaveAttribute(
        "aria-valuenow",
        "7.6",
      );
    });

    it("drops the Meta Global when no cofrinho has a target", async () => {
      open(items([COFRINHO_VIAGEM]));

      expect(await hero()).not.toHaveTextContent("Meta Global");
    });

    it("Guardar Dinheiro picks a cofrinho, then opens Lançar in it", async () => {
      open();

      await userEvent.click(within(await hero()).getByRole("button", { name: "Guardar Dinheiro" }));
      const picker = await screen.findByRole("dialog", { name: "Guardar Dinheiro" });
      expect(within(picker).getByRole("button", { name: /^Reserva Livre/ })).toBeInTheDocument();
      await userEvent.click(within(picker).getByRole("button", { name: /^Reserva\s?R\$/ }));

      await lancar();
      expect(await screen.findByRole("radio", { name: "Economia › Reserva" })).toHaveAttribute("aria-checked", "true");
    });

    it("Resgatar picks among cofrinhos with money, then opens the resgate", async () => {
      open(items([COFRINHO_RESERVA, EMPTY_VIAGEM]));

      await userEvent.click(within(await hero()).getByRole("button", { name: "Resgatar" }));
      const picker = await screen.findByRole("dialog", { name: "Resgatar" });
      expect(within(picker).queryByRole("button", { name: /^Viagem/ })).not.toBeInTheDocument();
      await userEvent.click(within(picker).getByRole("button", { name: /^Reserva\s?R\$/ }));

      const sheet = await screen.findByRole("dialog", { name: "Reserva" });
      expect(within(sheet).getByRole("button", { name: "Confirmar resgate" })).toBeInTheDocument();
    });

    it("Movimentos lists every cofrinho's movements with its name", async () => {
      open({
        [ALL_MOVES]: {
          status: 200,
          body: [...MOVEMENTS, { ...MOVEMENTS[2], id: "t2000000-0000-4000-8000-000000000009", category: VIAGEM }],
        },
      });

      await userEvent.click(within(await hero()).getByRole("button", { name: "Movimentos" }));
      const sheet = await screen.findByRole("dialog", { name: "Movimentos" });
      const rows = within(await within(sheet).findByRole("list", { name: "Movimentos" })).getAllByRole("listitem");
      expect(rows).toHaveLength(4);
      expect(rows[0]).toHaveTextContent("Resgatado5 nov · Reserva");
      expect(rows[3]).toHaveTextContent("3 nov · Viagem · Décimo terceiro");
    });
  });

  describe("the grid", () => {
    it("counts the cofrinhos, leaving Reserva Livre out, in 1, 2 then 3 columns", async () => {
      open();

      const grid = await region("Seus Cofrinhos");
      expect(within(grid).getByRole("heading", { name: /^Seus Cofrinhos/ })).toHaveTextContent(
        "Seus Cofrinhos 3 ativos",
      );
      expect(within(grid).getByRole("list", { name: "Cofrinhos" })).toHaveClass("lg:grid-cols-2", "xl:grid-cols-3");
    });

    it("says 1 ativo for a single cofrinho", async () => {
      open(items([COFRINHO_RESERVA]));

      expect(await region("Seus Cofrinhos")).toHaveTextContent("Seus Cofrinhos 1 ativo");
    });

    it("turns into one column with the list toggle", async () => {
      open();

      const toggle = within(await region("Seus Cofrinhos")).getByRole("button", { name: "Ver em lista" });
      expect(toggle).toHaveAttribute("aria-pressed", "false");
      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("list", { name: "Cofrinhos" })).not.toHaveClass("lg:grid-cols-2");
    });

    it("filters by state, keeping the create tile", async () => {
      open();

      const pick = async (label: string) => {
        await userEvent.click(
          within(await region("Seus Cofrinhos")).getByRole("button", { name: "Filtrar cofrinhos" }),
        );
        await userEvent.click(await screen.findByRole("menuitemradio", { name: label }));
      };
      const shown = () =>
        within(screen.getByRole("list", { name: "Cofrinhos" }))
          .getAllByRole("heading")
          .map((heading) => heading.textContent);

      await pick("Meta batida");
      expect(shown()).toEqual(["Carro", "Criar novo objetivo ou sonho"]);
      await pick("Em andamento");
      expect(shown()).toEqual(["Reserva", "Criar novo objetivo ou sonho"]);
      await pick("Sem meta");
      expect(shown()).toEqual(["Viagem", "Reserva Livre", "Criar novo objetivo ou sonho"]);
      await pick("Todos");
      expect(shown()).toEqual(["Reserva", "Viagem", "Carro", "Reserva Livre", "Criar novo objetivo ou sonho"]);
    });

    it("badges each state, one Foco atual on the nearest deadline even on a tie", async () => {
      open(
        items([
          goal("41", "Casa", "2027-03-01", { progress_pct: "44.3" }),
          goal("42", "Barco", "2027-03-01"),
          COFRINHO_RESERVA,
          goal("43", "Sítio", "2028-01-10", { balance: "0.00", progress_pct: "0.0" }),
          COFRINHO_VIAGEM,
          CARRO,
        ]),
      );

      expect(await region("Casa")).toHaveTextContent("Foco atual · 44%");
      expect(screen.getAllByText(/Foco atual/)).toHaveLength(1);
      expect(screen.getByRole("region", { name: "Barco" })).toHaveTextContent("Em andamento · 3%");
      expect(screen.getByRole("region", { name: "Reserva" })).toHaveTextContent("Em andamento · 3%");
      expect(screen.getByRole("region", { name: "Sítio" })).toHaveTextContent("Longo prazo · 0%");
      expect(screen.getByRole("region", { name: "Sítio" })).toHaveTextContent("Prazo: 14 meses");
      expect(screen.getByRole("region", { name: "Viagem" })).toHaveTextContent("Sem meta");
      expect(screen.getByRole("region", { name: "Carro" })).toHaveTextContent("Meta batida");
    });

    it("shows the balance, the goal caption and the automatic deposit", async () => {
      open(items([{ ...COFRINHO_RESERVA, next_contribution: { amount: "500.00", day: 5 } }]));

      const reserva = await region("Reserva");
      expect(reserva).toHaveTextContent("R$ 300,00 de R$ 10.000,00");
      expect(reserva).toHaveTextContent("Faltam R$ 9.700,00 · R$ 1.212,50/mês até jun 2027");
      expect(within(reserva).getByText("R$ 9.700,00").tagName).toBe("STRONG");
      expect(within(reserva).getByText("R$ 1.212,50/mês")).toHaveClass("text-income-text");
      expect(within(reserva).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
      expect(reserva).toHaveTextContent("Aporte automático: R$ 500,00 todo dia 05");
      expect(reserva.querySelector('[class*="after:inset-0"]')).toBeNull();
    });

    it("says Sem prazo for a goal without a deadline", async () => {
      open(items([{ ...COFRINHO_RESERVA, deadline: null, monthly_suggestion: null }]));

      expect(await region("Reserva")).toHaveTextContent("Faltam R$ 9.700,00 · Sem prazo");
    });

    it("Guardar opens Lançar as a Saída in the cofrinho", async () => {
      open();

      await userEvent.click(within(await region("Reserva")).getByRole("button", { name: "Guardar em Reserva" }));

      await lancar();
      expect(await screen.findByRole("radio", { name: "Economia › Reserva" })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByRole("radio", { name: "Conta" })).toBeChecked();
    });

    it("Resgatar opens the sheet on the form, which refuses more than the balance, and closing resets it", async () => {
      open({
        [WITHDRAW]: { status: 422, body: { ...problem(422, "No."), type: "urn:soldi:error:insufficient-cofrinho" } },
      });

      await userEvent.click(within(await region("Reserva")).getByRole("button", { name: "Resgatar de Reserva" }));
      const sheet = await screen.findByRole("dialog", { name: "Reserva" });
      await userEvent.type(within(sheet).getByLabelText("Valor"), "99900");
      await userEvent.click(within(sheet).getByRole("button", { name: "Confirmar resgate" }));
      expect(await within(sheet).findByText("Você só tem R$ 300,00 guardado aqui")).toBeInTheDocument();

      await userEvent.click(within(sheet).getByRole("button", { name: "Fechar" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      const again = await detail("Reserva");
      expect(within(again).queryByRole("button", { name: "Confirmar resgate" })).not.toBeInTheDocument();
    });

    it("offers only Guardar primeiro valor and the menu on an empty cofrinho", async () => {
      open(items([COFRINHO_RESERVA, EMPTY_VIAGEM]));

      const viagem = await region("Viagem");
      expect(within(viagem).queryByRole("button", { name: /^Resgatar/ })).not.toBeInTheDocument();
      expect(within(viagem).queryByRole("button", { name: "Guardar em Viagem" })).not.toBeInTheDocument();
      expect(within(viagem).getByRole("button", { name: "Mais ações de Viagem" })).toBeInTheDocument();
      await userEvent.click(within(viagem).getByRole("button", { name: "Guardar primeiro valor em Viagem" }));

      await lancar();
      expect(await screen.findByRole("radio", { name: "Economia › Viagem" })).toHaveAttribute("aria-checked", "true");
    });

    it("keeps Guardar and Resgatar on a negative balance, with the bar at zero", async () => {
      open(items([{ ...COFRINHO_RESERVA, balance: "-10.00", progress_pct: "-0.1" }]));

      const reserva = await region("Reserva");
      expect(within(reserva).getByRole("button", { name: "Guardar em Reserva" })).toBeInTheDocument();
      expect(within(reserva).getByRole("button", { name: "Resgatar de Reserva" })).toBeInTheDocument();
      expect(within(reserva).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    });

    it("holds the actions while the categories load", async () => {
      open({}, "/api/categories");

      const reserva = await region("Reserva");
      expect(within(reserva).getByRole("button", { name: "Guardar em Reserva" })).toBeDisabled();
      expect(within(reserva).getByRole("button", { name: "Resgatar de Reserva" })).toBeDisabled();
      expect(within(await hero()).getByRole("button", { name: "Guardar Dinheiro" })).toBeDisabled();
      const sheet = await detail("Reserva");
      expect(within(sheet).getByRole("button", { name: "Guardar" })).toBeDisabled();
    });

    it("says the categories failed when Guardar cannot open Lançar, and loads them again", async () => {
      const requests = open({ "GET /api/categories": { status: 500, body: problem(500, "Falhou.") } });
      const fetched = () => requests.filter((request) => new URL(request.url).pathname === "/api/categories");

      const reserva = await region("Reserva");
      await waitFor(() => expect(within(reserva).getByRole("button", { name: "Guardar em Reserva" })).toBeEnabled());
      const before = fetched().length;
      await userEvent.click(within(reserva).getByRole("button", { name: "Guardar em Reserva" }));

      expect(await screen.findByText("Não foi possível carregar as categorias.")).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ })).not.toBeInTheDocument();
      await waitFor(() => expect(fetched().length).toBeGreaterThan(before));
    });
  });

  describe("Reserva Livre and the create tile", () => {
    it("shows the loose money with Adicionar saldo livre and Resgatar", async () => {
      open();

      const livre = await region("Reserva Livre");
      expect(livre).toHaveTextContent("R$ 120,00 sem teto fixado");
      expect(livre).toHaveTextContent("Dinheiro guardado sem meta vinculada, para oportunidades ou despesas pontuais.");
      expect(within(livre).getByRole("button", { name: "Resgatar de Reserva Livre" })).toBeInTheDocument();
      await userEvent.click(within(livre).getByRole("button", { name: "Adicionar saldo livre" }));

      await lancar();
      expect(await screen.findByRole("radio", { name: "Economia" })).toHaveAttribute("aria-checked", "true");
    });

    it("puts the create tile last, opening Novo cofrinho", async () => {
      open();

      const tiles = within(await screen.findByRole("list", { name: "Cofrinhos" })).getAllByRole("listitem");
      const tile = tiles[tiles.length - 1];
      expect(tile).toHaveTextContent("Criar novo objetivo ou sonhoDefina meta, prazo e acompanhe a evolução.");
      await userEvent.click(within(tile).getByRole("button", { name: "Começar objetivo" }));
      expect(await screen.findByRole("dialog", { name: "Novo cofrinho" })).toBeInTheDocument();
    });

    it("starts at R$ 0,00 with Reserva Livre and the create tile, and no Resgatar", async () => {
      open(items([], { total_saved: "0.00", saved_this_month: "0.00" }));

      const total = await hero();
      expect(total).toHaveTextContent("R$ 0,00");
      expect(total).toHaveTextContent("Nada guardado ainda.");
      expect(total).not.toHaveTextContent("Meta Global");
      expect(within(total).getByRole("button", { name: "Resgatar" })).toBeDisabled();
      const livre = await region("Reserva Livre");
      expect(livre).toHaveTextContent("R$ 0,00 sem teto fixado");
      expect(within(livre).queryByRole("button", { name: /^Resgatar/ })).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /^Seus Cofrinhos/ })).toHaveTextContent(/^Seus Cofrinhos$/);
      expect(screen.getByText("Criar novo objetivo ou sonho")).toBeInTheDocument();
    });
  });

  it("puts the year's savings under the cofrinhos", async () => {
    open();

    const grid = await region("Seus Cofrinhos");
    const year = screen.getByRole("region", { name: "Economia do ano" });
    expect(grid.compareDocumentPosition(year) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await within(year).findByRole("link", { name: /^Novembro de 2026/ })).toHaveAttribute(
      "href",
      "/mes?m=2026-11",
    );
  });

  it("creates from the header button", async () => {
    const requests = open({ "POST /api/categories": { status: 201, body: VIAGEM } });

    await userEvent.click(screen.getByRole("button", { name: "Novo Cofrinho" }));
    const sheet = await screen.findByRole("dialog", { name: "Novo cofrinho" });
    await userEvent.click(await within(sheet).findByRole("button", { name: "Casa" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Criar" }));

    await waitFor(() => expect(sent(requests, "POST")).toHaveLength(1));
    expect(await sent(requests, "POST")[0].json()).toMatchObject({ name: "Casa", parent_id: ECONOMIA.id });
  });

  it("shows a skeleton while loading, then an error with a retry", async () => {
    const requests = open({ "GET /api/cofrinhos": { status: 500, body: problem(500, "Falhou.") } });

    expect(screen.getByRole("status", { name: "Carregando" })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));

    await waitFor(() =>
      expect(requests.filter((request) => new URL(request.url).pathname === "/api/cofrinhos")).toHaveLength(2),
    );
  });

  describe("a cofrinho's menu", () => {
    it("Movimentos opens its deposits and resgates", async () => {
      open();

      const sheet = await detail("Reserva");
      const rows = within(await within(sheet).findByRole("list", { name: "Movimentos" })).getAllByRole("listitem");
      expect(rows).toHaveLength(3);
      expect(rows[0]).toHaveTextContent("Resgatado");
      expect(rows[0]).toHaveTextContent("+ R$ 50,00");
      expect(rows[2]).toHaveTextContent("Guardado");
      expect(rows[2]).toHaveTextContent("3 nov · Décimo terceiro");
      expect(rows[2]).toHaveTextContent("R$ 200,00");
    });

    it("says when nothing went in yet", async () => {
      open({ [MOVES]: { status: 200, body: [] } });
      expect(await within(await detail("Reserva")).findByText("Nada guardado aqui ainda")).toBeInTheDocument();
    });

    it("retries the movements", async () => {
      const requests = open({ [MOVES]: { status: 500, body: problem(500, "Falhou.") } });
      const sheet = await detail("Reserva");
      expect(await within(sheet).findByText("Não foi possível carregar os movimentos.")).toBeInTheDocument();
      await userEvent.click(within(sheet).getByRole("button", { name: "Tentar de novo" }));

      await waitFor(() => expect(requests.filter((request) => request.url.includes("/movements"))).toHaveLength(2));
    });

    it("closes the cofrinho's sheet and Lançar with Fechar", async () => {
      open();

      await userEvent.click(within(await detail("Reserva")).getByRole("button", { name: "Fechar" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      await userEvent.click(within(await detail("Reserva")).getByRole("button", { name: "Guardar" }));
      await userEvent.click(within(await lancar()).getByRole("button", { name: "Fechar" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("Resgatar takes an amount, a day and a note", async () => {
      const requests = open({ [WITHDRAW]: { status: 201, body: MOVEMENTS[0] } });

      const sheet = await detail("Reserva");
      await userEvent.click(within(sheet).getByRole("button", { name: "Resgatar" }));
      await userEvent.click(within(sheet).getByRole("button", { name: "Confirmar resgate" }));
      expect(within(sheet).getByText("Informe um valor")).toBeInTheDocument();
      await userEvent.type(within(sheet).getByLabelText("Valor"), "5000");
      await userEvent.click(within(sheet).getByRole("button", { name: "Ontem" }));
      await userEvent.type(within(sheet).getByLabelText("Observação"), " Conserto ");
      await userEvent.click(within(sheet).getByRole("button", { name: "Confirmar resgate" }));

      await waitFor(() => expect(sent(requests, "POST")).toHaveLength(1));
      expect(await sent(requests, "POST")[0].json()).toEqual({ date: "2026-11-04", amount: "50.00", note: "Conserto" });
      expect(await screen.findByText("Resgate feito")).toBeInTheDocument();
      expect(within(sheet).queryByRole("button", { name: "Confirmar resgate" })).not.toBeInTheDocument();
    });

    it("Cancelar leaves the resgate", async () => {
      open();

      const sheet = await detail("Reserva");
      await userEvent.click(within(sheet).getByRole("button", { name: "Resgatar" }));
      await userEvent.click(within(sheet).getByRole("button", { name: "Cancelar" }));
      expect(within(sheet).getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    });

    it("says when a resgate fails otherwise", async () => {
      open({ [WITHDRAW]: { status: 500, body: problem(500, "Falhou.") } });

      const sheet = await detail("Reserva");
      await userEvent.click(within(sheet).getByRole("button", { name: "Resgatar" }));
      await userEvent.type(within(sheet).getByLabelText("Valor"), "100");
      fireEvent.submit(within(sheet).getByRole("button", { name: "Confirmar resgate" }));

      expect(await within(sheet).findByText("Não foi possível resgatar.")).toBeInTheDocument();
    });

    it("Editar opens the cofrinho's sheet, whose Excluir follows the same rule", async () => {
      const requests = open();

      await menu("Reserva");
      await userEvent.click(screen.getByRole("menuitem", { name: "Editar" }));
      const sheet = await screen.findByRole("dialog", { name: "Editar cofrinho" });
      expect(within(sheet).getByLabelText("Nome")).toHaveValue("Reserva");
      await userEvent.click(within(sheet).getByRole("button", { name: "Excluir" }));

      expect(await screen.findByText("Resgate tudo antes de excluir")).toBeInTheDocument();
      expect(sent(requests, "DELETE")).toHaveLength(0);
    });

    it("Editar in the sheet opens the cofrinho's sheet too", async () => {
      open();

      await userEvent.click(within(await detail("Reserva")).getByRole("button", { name: "Editar" }));
      expect(await screen.findByRole("dialog", { name: "Editar cofrinho" })).toBeInTheDocument();
    });

    it("will not archive a cofrinho that still holds money", async () => {
      const requests = open();

      await menu("Reserva");
      await userEvent.click(screen.getByRole("menuitem", { name: "Excluir" }));

      expect(await screen.findByText("Resgate tudo antes de excluir")).toBeInTheDocument();
      expect(sent(requests, "DELETE")).toHaveLength(0);
    });

    it("offers neither Editar nor Excluir on Reserva Livre", async () => {
      open({ [ALL_MOVES]: { status: 200, body: [] } });

      const livre = await region("Reserva Livre");
      expect(within(livre).queryByRole("button", { name: /^Mais ações/ })).not.toBeInTheDocument();
      await userEvent.click(within(livre).getByRole("button", { name: "Resgatar de Reserva Livre" }));
      const sheet = await screen.findByRole("dialog", { name: "Reserva Livre" });
      await userEvent.click(within(sheet).getByRole("button", { name: "Cancelar" }));
      expect(within(sheet).queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    });
  });

  describe("archiving an empty one", () => {
    const replies = (deleted: Reply) => ({
      ...items([COFRINHO_RESERVA, EMPTY_VIAGEM]),
      [`DELETE /api/categories/${VIAGEM.id}`]: deleted,
    });

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    const archive = async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(within(await region("Viagem")).getByRole("button", { name: "Mais ações de Viagem" }));
      await user.click(await screen.findByRole("menuitem", { name: "Excluir" }));
      return user;
    };

    it("hides it at once and archives once Desfazer is gone", async () => {
      const requests = open(replies({ status: 204 }));

      await archive();

      expect(await screen.findByText("Cofrinho excluído")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Viagem" })).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(6000));
      await waitFor(() => expect(sent(requests, "DELETE")).toHaveLength(1));
    });

    it("brings it back when undone", async () => {
      const requests = open(replies({ status: 204 }));

      const user = await archive();
      await user.click(await screen.findByRole("button", { name: "Desfazer" }));

      expect(await region("Viagem")).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(6000));
      expect(sent(requests, "DELETE")).toHaveLength(0);
    });

    it("brings it back with the reason when the server refuses", async () => {
      open(replies({ status: 422, body: { ...problem(422, "No."), type: "urn:soldi:error:cofrinho-not-empty" } }));

      await archive();
      await screen.findByText("Cofrinho excluído");
      act(() => vi.advanceTimersByTime(6000));

      expect(await screen.findByText("Resgate tudo antes de excluir")).toBeInTheDocument();
      expect(await region("Viagem")).toBeInTheDocument();
    });

    it("says when archiving fails otherwise", async () => {
      open(replies({ status: 500, body: problem(500, "Falhou.") }));

      await archive();
      await screen.findByText("Cofrinho excluído");
      act(() => vi.advanceTimersByTime(6000));

      expect(await screen.findByText("Não foi possível excluir o cofrinho.")).toBeInTheDocument();
    });
  });
});
