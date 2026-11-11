import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
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
  signedIn,
  VIAGEM,
  WITH_COFRINHOS,
} from "@/test/stub-api";

import EconomiaPage from "./page";

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

const MOVES = `GET /api/cofrinhos/${RESERVA.id}/movements`;
const WITHDRAW = `POST /api/cofrinhos/${RESERVA.id}/withdraw`;

const open = (replies: Record<string, Reply> = {}, hanging?: string) => {
  const requests = signedIn({
    "GET /api/cofrinhos": {
      status: 200,
      body: { ...COFRINHOS, items: [COFRINHO_RESERVA, COFRINHO_VIAGEM, CARRO, LOOSE] },
    },
    "GET /api/categories": { status: 200, body: WITH_COFRINHOS },
    [MOVES]: { status: 200, body: MOVEMENTS },
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

const card = (name: string) => screen.findByRole("button", { name: new RegExp(`^${name}`) });
const sent = (requests: Request[], method: string) => requests.filter((request) => request.method === method);
const detail = async (name: string) => {
  await userEvent.click(await card(name));
  return screen.findByRole("dialog", { name });
};

describe("Cofrinhos", () => {
  beforeEach(() => {
    window.innerWidth = 375;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows what is saved, this month's share and a card per cofrinho", async () => {
    open();

    expect(screen.getByRole("heading", { level: 1, name: "Cofrinhos" })).toBeInTheDocument();
    const total = await screen.findByRole("region", { name: "Guardado" });
    expect(within(total).getByText("R$ 1.300,00").parentElement).toHaveClass("text-[40px]");
    expect(total).toHaveTextContent("Este mês +R$ 500,00");

    const reserva = await card("Reserva");
    const reservaCard = screen.getByRole("region", { name: "Reserva" });
    expect(reservaCard).toHaveAttribute("data-slot", "card");
    expect(reservaCard).toContainElement(reserva);
    expect(screen.getByRole("list", { name: "Cofrinhos" })).not.toHaveClass("xl:grid-cols-3");
    expect(reserva).toHaveTextContent("R$ 300,00 de R$ 10.000,00");
    expect(reserva).toHaveTextContent("Faltam R$ 9.700,00 · R$ 1.212,50/mês até jun 2027");
    expect(within(reserva).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");

    const viagem = await card("Viagem");
    expect(viagem).toHaveTextContent("R$ 1.000,00");
    expect(viagem).not.toHaveTextContent(" de ");
    expect(within(viagem).queryByRole("progressbar")).not.toBeInTheDocument();

    const carro = await card("Carro");
    expect(carro).toHaveTextContent("Meta batida");
    expect(carro).not.toHaveTextContent("Faltam");
    expect(await card("Sem objetivo")).toHaveTextContent("R$ 120,00");
  });

  describe("a card's actions", () => {
    const region = async (name: string) => {
      await card(name);
      return screen.getByRole("region", { name });
    };

    it("counts the cofrinhos over the grid, leaving Sem objetivo out", async () => {
      open();

      const grid = await screen.findByRole("region", { name: "Seus cofrinhos" });
      expect(grid).toHaveTextContent("Seus cofrinhos 3 ativos");
      expect(within(grid).getByRole("list", { name: "Cofrinhos" })).toBeInTheDocument();
    });

    it("says 1 ativo for a single cofrinho", async () => {
      open({
        "GET /api/cofrinhos": { status: 200, body: { ...COFRINHOS, items: [COFRINHO_RESERVA, LOOSE] } },
      });

      expect(await screen.findByRole("region", { name: "Seus cofrinhos" })).toHaveTextContent("Seus cofrinhos 1 ativo");
    });

    it("drops the count and keeps Criar cofrinho under a lone Sem objetivo", async () => {
      open({ "GET /api/cofrinhos": { status: 200, body: { ...COFRINHOS, items: [LOOSE] } } });

      const grid = await screen.findByRole("region", { name: "Seus cofrinhos" });
      expect(within(grid).getByRole("heading", { name: /^Seus cofrinhos/ })).toHaveTextContent(/^Seus cofrinhos$/);
      expect(within(grid).getByRole("region", { name: "Sem objetivo" })).toBeInTheDocument();
      expect(screen.getByText("Nenhum cofrinho ainda. Comece pela reserva de emergência.")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Criar cofrinho" }));
      expect(await screen.findByRole("dialog", { name: "Novo cofrinho" })).toBeInTheDocument();
    });

    it("keeps Guardar and Resgatar beside the card's open button, never inside it", async () => {
      open();

      const reserva = await region("Reserva");
      const opener = within(reserva).getByRole("button", { name: /^Reserva/ });
      const guardar = within(reserva).getByRole("button", { name: "Guardar em Reserva" });
      const resgatar = within(reserva).getByRole("button", { name: "Resgatar de Reserva" });
      expect(opener).not.toContainElement(guardar);
      expect(opener).not.toContainElement(resgatar);
      expect(guardar.parentElement).toHaveClass("relative", "z-10", "pointer-events-none");
      expect(guardar).toHaveClass("pointer-events-auto");
      expect(resgatar).toHaveClass("pointer-events-auto");

      await userEvent.click(opener);
      const sheet = await screen.findByRole("dialog", { name: "Reserva" });
      expect(within(sheet).queryByRole("button", { name: "Confirmar resgate" })).not.toBeInTheDocument();
    });

    it("shows both actions on a met goal and on Sem objetivo", async () => {
      open();

      for (const name of ["Carro", "Sem objetivo"]) {
        const each = await region(name);
        expect(within(each).getByRole("button", { name: `Guardar em ${name}` })).toBeInTheDocument();
        expect(within(each).getByRole("button", { name: `Resgatar de ${name}` })).toBeInTheDocument();
      }
    });

    it("Guardar opens Lançar as a Saída in the cofrinho", async () => {
      open();

      await userEvent.click(within(await region("Reserva")).getByRole("button", { name: "Guardar em Reserva" }));

      await screen.findByRole("dialog", { name: "Lançar" });
      expect(await screen.findByRole("radio", { name: "Economia › Reserva" })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByRole("radio", { name: "Saída" })).toBeChecked();
    });

    it("Resgatar opens the sheet on the form, which refuses more than the balance, and closing resets it", async () => {
      open({
        [WITHDRAW]: {
          status: 422,
          body: { ...problem(422, "No."), type: "urn:soldi:error:insufficient-cofrinho" },
        },
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
      expect(within(again).getByRole("button", { name: "Resgatar" })).toBeInTheDocument();
    });

    it("offers only Guardar primeiro valor on an empty cofrinho", async () => {
      open({
        "GET /api/cofrinhos": { status: 200, body: { ...COFRINHOS, items: [COFRINHO_RESERVA, EMPTY_VIAGEM] } },
      });

      const viagem = await region("Viagem");
      expect(within(viagem).queryByRole("button", { name: /^Resgatar/ })).not.toBeInTheDocument();
      expect(within(viagem).queryByRole("button", { name: "Guardar em Viagem" })).not.toBeInTheDocument();
      await userEvent.click(within(viagem).getByRole("button", { name: "Guardar primeiro valor em Viagem" }));

      await screen.findByRole("dialog", { name: "Lançar" });
      expect(await screen.findByRole("radio", { name: "Economia › Viagem" })).toHaveAttribute("aria-checked", "true");
    });

    it("keeps Guardar and Resgatar on a negative balance, with the bar at zero", async () => {
      open({
        "GET /api/cofrinhos": {
          status: 200,
          body: { ...COFRINHOS, items: [{ ...COFRINHO_RESERVA, balance: "-10.00", progress_pct: "-0.1" }] },
        },
      });

      const reserva = await region("Reserva");
      expect(within(reserva).getByRole("button", { name: "Guardar em Reserva" })).toBeInTheDocument();
      expect(within(reserva).getByRole("button", { name: "Resgatar de Reserva" })).toBeInTheDocument();
      expect(within(reserva).queryByRole("button", { name: /primeiro valor/ })).not.toBeInTheDocument();
      expect(within(reserva).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    });

    it("holds the actions while the categories load", async () => {
      open({}, "/api/categories");

      const reserva = await region("Reserva");
      expect(within(reserva).getByRole("button", { name: "Guardar em Reserva" })).toBeDisabled();
      expect(within(reserva).getByRole("button", { name: "Resgatar de Reserva" })).toBeDisabled();
      await userEvent.click(within(reserva).getByRole("button", { name: /^Reserva/ }));
      const sheet = await screen.findByRole("dialog", { name: "Reserva" });
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
      expect(screen.queryByRole("dialog", { name: "Lançar" })).not.toBeInTheDocument();
      await waitFor(() => expect(fetched().length).toBeGreaterThan(before));
    });
  });

  it("says Sem prazo for a goal without a deadline and a minus this month", async () => {
    open({
      "GET /api/cofrinhos": {
        status: 200,
        body: {
          ...COFRINHOS,
          saved_this_month: "-50.00",
          items: [{ ...COFRINHO_RESERVA, deadline: null, monthly_suggestion: null }],
        },
      },
    });

    expect(await card("Reserva")).toHaveTextContent("Faltam R$ 9.700,00 · Sem prazo");
    expect(screen.getByRole("region", { name: "Guardado" })).toHaveTextContent("Este mês -R$ 50,00");
  });

  it("starts empty with the reserva suggestion and opens Novo cofrinho under Economia", async () => {
    open({ "GET /api/cofrinhos": { status: 200, body: { total_saved: "0.00", saved_this_month: "0.00", items: [] } } });

    expect(await screen.findByText("Nenhum cofrinho ainda. Comece pela reserva de emergência.")).toBeInTheDocument();
    expect(screen.getByText("Reserva").closest("[aria-hidden]")).toHaveClass(
      "pointer-events-none",
      "select-none",
      "opacity-50",
      "saturate-50",
    );
    await userEvent.click(screen.getByRole("button", { name: "Criar cofrinho" }));

    const sheet = await screen.findByRole("dialog", { name: "Novo cofrinho" });
    expect(await within(sheet).findByLabelText("Meta")).toBeInTheDocument();
  });

  it("creates from the header button", async () => {
    const requests = open({ "POST /api/categories": { status: 201, body: VIAGEM } });

    await userEvent.click(screen.getByRole("button", { name: "Novo cofrinho" }));
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

    await waitFor(() => expect(requests.filter((request) => request.url.endsWith("/api/cofrinhos"))).toHaveLength(2));
  });

  it("opens a cofrinho with its deposits and resgates", async () => {
    open();

    const sheet = await detail("Reserva");
    const moves = await within(sheet).findByRole("list", { name: "Movimentos" });
    const rows = within(moves).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Resgatado");
    expect(rows[0]).toHaveTextContent("+ R$ 50,00");
    expect(rows[2]).toHaveTextContent("Guardado");
    expect(rows[2]).toHaveTextContent("3 nov · Décimo terceiro");
    expect(rows[2]).toHaveTextContent("R$ 200,00");
  });

  it("says when nothing went in yet, and when the movements fail", async () => {
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
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Lançar" })).getByRole("button", { name: "Fechar" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("Guardar opens Lançar as a Saída in the cofrinho", async () => {
    open();

    await userEvent.click(within(await detail("Reserva")).getByRole("button", { name: "Guardar" }));

    await screen.findByRole("dialog", { name: "Lançar" });
    expect(await screen.findByRole("radio", { name: "Economia › Reserva" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Saída" })).toBeChecked();
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

  it("refuses a resgate above the balance, says what is there, and Cancelar goes back", async () => {
    open({
      [WITHDRAW]: {
        status: 422,
        body: { ...problem(422, "No."), type: "urn:soldi:error:insufficient-cofrinho" },
      },
    });

    const sheet = await detail("Reserva");
    await userEvent.click(within(sheet).getByRole("button", { name: "Resgatar" }));
    await userEvent.type(within(sheet).getByLabelText("Valor"), "99900");
    await userEvent.click(within(sheet).getByRole("button", { name: "Confirmar resgate" }));

    expect(await within(sheet).findByText("Você só tem R$ 300,00 guardado aqui")).toBeInTheDocument();
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

  it("Editar opens the cofrinho's sheet", async () => {
    open();

    await userEvent.click(within(await detail("Reserva")).getByRole("button", { name: "Editar" }));

    const sheet = await screen.findByRole("dialog", { name: "Editar cofrinho" });
    expect(within(sheet).getByLabelText("Nome")).toHaveValue("Reserva");
  });

  it("Excluir inside Editar follows the same rule", async () => {
    const requests = open();

    await userEvent.click(within(await detail("Reserva")).getByRole("button", { name: "Editar" }));
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Editar cofrinho" })).getByRole("button", { name: "Excluir" }),
    );

    expect(await screen.findByText("Resgate tudo antes de excluir")).toBeInTheDocument();
    expect(sent(requests, "DELETE")).toHaveLength(0);
  });

  it("offers neither Editar nor Excluir on Sem objetivo", async () => {
    open({ [`GET /api/cofrinhos/${ECONOMIA.id}/movements`]: { status: 200, body: [] } });

    const sheet = await detail("Sem objetivo");
    expect(within(sheet).getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
  });

  it("will not archive a cofrinho that still holds money", async () => {
    const requests = open();

    await userEvent.click(within(await detail("Reserva")).getByRole("button", { name: "Excluir" }));

    expect(await screen.findByText("Resgate tudo antes de excluir")).toBeInTheDocument();
    expect(sent(requests, "DELETE")).toHaveLength(0);
  });

  describe("archiving an empty one", () => {
    const VIAGEM_MOVES = `GET /api/cofrinhos/${VIAGEM.id}/movements`;
    const replies = (deleted: Reply) => ({
      "GET /api/cofrinhos": { status: 200, body: { ...COFRINHOS, items: [COFRINHO_RESERVA, EMPTY_VIAGEM] } },
      [VIAGEM_MOVES]: { status: 200, body: [] },
      [`DELETE /api/categories/${VIAGEM.id}`]: deleted,
    });

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    const archive = async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(await card("Viagem"));
      await user.click(
        within(await screen.findByRole("dialog", { name: "Viagem" })).getByRole("button", { name: "Excluir" }),
      );
      return user;
    };

    it("hides it at once and archives once Desfazer is gone", async () => {
      const requests = open(replies({ status: 204 }));

      await archive();

      expect(await screen.findByText("Cofrinho excluído")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Viagem/ })).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(6000));
      await waitFor(() => expect(sent(requests, "DELETE")).toHaveLength(1));
    });

    it("brings it back when undone", async () => {
      const requests = open(replies({ status: 204 }));

      const user = await archive();
      await user.click(await screen.findByRole("button", { name: "Desfazer" }));

      expect(await card("Viagem")).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(6000));
      expect(sent(requests, "DELETE")).toHaveLength(0);
    });

    it("brings it back with the reason when the server refuses", async () => {
      open(replies({ status: 422, body: { ...problem(422, "No."), type: "urn:soldi:error:cofrinho-not-empty" } }));

      await archive();
      await screen.findByText("Cofrinho excluído");
      act(() => vi.advanceTimersByTime(6000));

      expect(await screen.findByText("Resgate tudo antes de excluir")).toBeInTheDocument();
      expect(await card("Viagem")).toBeInTheDocument();
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
