import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/test/render";
import {
  ALUGUEL,
  BILL_ALUGUEL,
  BILL_LUZ,
  BILL_PAUSED,
  BILLS,
  CATEGORIES,
  LUZ,
  problem,
  signedIn,
} from "@/test/stub-api";

import ContasPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

type Reply = { status: number; body?: unknown };

const open = (replies: Record<string, Reply> = {}) => {
  const requests = signedIn({
    "GET /api/bills": { status: 200, body: BILLS },
    "GET /api/categories": { status: 200, body: CATEGORIES },
    ...replies,
  });
  renderWithQuery(
    <>
      <ContasPage />
      <Toaster />
    </>,
  );
  return requests;
};

const sent = (requests: Request[], method: string) => requests.filter((request) => request.method === method);

describe("Ajustes › Contas fixas", () => {
  beforeEach(() => {
    window.innerWidth = 375;
  });

  it("lists the active bills, then the paused ones, with a way back to Ajustes", async () => {
    const requests = open();

    const active = await screen.findByRole("list", { name: "Contas ativas" });
    await waitFor(() => expect(within(active).getByText(/Dia 10 · Aluguel/)).toBeInTheDocument());
    const [rent, power, ...rest] = within(active).getAllByRole("button");
    expect(rent).toHaveTextContent("Aluguel ResidencialDia 10 · AluguelR$ 2.259,56");
    expect(power).toHaveTextContent("Luz (Enel)Dia 2 · LuzR$ 284,10");
    expect(rest).toEqual([]);
    const paused = screen.getByRole("list", { name: "Pausadas" });
    expect(within(paused).getByRole("button")).toHaveTextContent("Academia");
    expect(screen.getByRole("link", { name: "Ajustes" })).toHaveAttribute("href", "/ajustes");
    expect(new URL(requests.find((request) => request.url.includes("/api/bills"))?.url ?? "").search).toBe(
      "?include_inactive=true",
    );
  });

  it("invites the first bill when there is none, and retries after an error", async () => {
    const requests = open({ "GET /api/bills": { status: 500, body: problem(500, "Falhou.") } });

    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(requests.filter((request) => request.url.includes("/api/bills"))).toHaveLength(2));

    signedIn({ "GET /api/bills": { status: 200, body: [] }, "GET /api/categories": { status: 200, body: CATEGORIES } });
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Nenhuma conta fixa ainda")).toBeInTheDocument();
  });

  it("adds a bill from the sheet, checking every field first", async () => {
    const requests = open({ "POST /api/bills": { status: 201, body: BILL_LUZ } });

    await userEvent.click(await screen.findByRole("button", { name: "Nova conta" }));
    const sheet = await screen.findByRole("dialog", { name: "Nova conta" });
    expect(within(sheet).queryByRole("switch")).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));
    expect(within(sheet).getByText("Informe o nome.")).toBeInTheDocument();
    expect(within(sheet).getByText("Informe um valor maior que zero.")).toBeInTheDocument();
    expect(within(sheet).getByText("Escolha um dia de 1 a 31.")).toBeInTheDocument();

    await userEvent.type(within(sheet).getByLabelText("Nome"), " Luz (Enel) ");
    await userEvent.type(within(sheet).getByLabelText("Valor"), "284,10");
    await userEvent.type(within(sheet).getByLabelText("Dia do vencimento"), "32");
    expect(within(sheet).getByRole("radio", { name: "Aluguel" })).toBeChecked();
    await userEvent.click(within(sheet).getByRole("radio", { name: "Luz" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));
    expect(within(sheet).getByText("Escolha um dia de 1 a 31.")).toBeInTheDocument();

    await userEvent.clear(within(sheet).getByLabelText("Dia do vencimento"));
    await userEvent.type(within(sheet).getByLabelText("Dia do vencimento"), "2");
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Conta salva")).toBeInTheDocument();
    expect(await sent(requests, "POST")[0].json()).toEqual({
      name: "Luz (Enel)",
      amount: "284.10",
      due_day: 2,
      category_id: LUZ.id,
    });
  });

  it("edits a bill and pauses it with Ativa", async () => {
    const requests = open({ [`PATCH /api/bills/${BILL_ALUGUEL.id}`]: { status: 200, body: BILL_ALUGUEL } });

    await userEvent.click(await screen.findByRole("button", { name: /^Aluguel Residencial/ }));
    const sheet = await screen.findByRole("dialog", { name: "Editar conta" });
    expect(within(sheet).getByLabelText("Valor")).toHaveValue("2259,56");
    expect(within(sheet).getByRole("radio", { name: "Aluguel" })).toBeChecked();
    await userEvent.click(within(sheet).getByRole("switch", { name: "Ativa" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(sent(requests, "PATCH")).toHaveLength(1));
    expect(await sent(requests, "PATCH")[0].json()).toEqual({
      name: "Aluguel Residencial",
      amount: "2259.56",
      due_day: 10,
      category_id: ALUGUEL.id,
      active: false,
    });
  });

  it("says so when saving fails", async () => {
    open({ [`PATCH /api/bills/${BILL_PAUSED.id}`]: { status: 422, body: problem(422, "amount") } });

    await userEvent.click(await screen.findByRole("button", { name: /^Academia/ }));
    const sheet = await screen.findByRole("dialog", { name: "Editar conta" });
    expect(within(sheet).getByRole("switch", { name: "Ativa" })).not.toBeChecked();
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Não foi possível salvar a conta.")).toBeInTheDocument();
  });

  describe("archiving", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const archive = async (name: RegExp) => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(await screen.findByRole("button", { name }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Arquivar" }));
      return user;
    };

    it("hides the bill, holds the archive while Desfazer shows and sends nothing when undone", async () => {
      const requests = open({ [`DELETE /api/bills/${BILL_LUZ.id}`]: { status: 204 } });

      const user = await archive(/^Luz \(Enel\)/);

      expect(await screen.findByText("Conta arquivada")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Luz \(Enel\)/ })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(await screen.findByRole("button", { name: /^Luz \(Enel\)/ })).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(6000));
      expect(sent(requests, "DELETE")).toHaveLength(0);
    });

    it("archives once the toast is gone", async () => {
      const requests = open({ [`DELETE /api/bills/${BILL_LUZ.id}`]: { status: 204 } });

      await archive(/^Luz \(Enel\)/);
      await screen.findByText("Conta arquivada");
      expect(sent(requests, "DELETE")).toHaveLength(0);
      act(() => vi.advanceTimersByTime(6000));

      await waitFor(() => expect(sent(requests, "DELETE")).toHaveLength(1));
    });

    it("brings the bill back and says so when archiving fails", async () => {
      open({ [`DELETE /api/bills/${BILL_LUZ.id}`]: { status: 500, body: problem(500, "Falhou.") } });

      await archive(/^Luz \(Enel\)/);
      await screen.findByText("Conta arquivada");
      act(() => vi.advanceTimersByTime(6000));

      expect(await screen.findByText("Não foi possível arquivar a conta.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Luz \(Enel\)/ })).toBeInTheDocument();
    });
  });
});
