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

  it("lists the bills under the breadcrumb back to Configurações", async () => {
    const requests = open();

    const list = await screen.findByRole("list", { name: "Contas fixas" });
    await waitFor(() => expect(within(list).getAllByText("Aluguel")).not.toHaveLength(0));
    const [power, rent, gym] = within(list).getAllByRole("listitem");
    expect(power).toHaveTextContent("Luz (Enel)");
    expect(rent).toHaveTextContent("Aluguel Residencial");
    expect(gym).toHaveTextContent("AcademiaPausada");
    const crumbs = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(within(crumbs).getByRole("link", { name: "Configurações" })).toHaveAttribute("href", "/ajustes");
    expect(within(crumbs).getByText("Contas Fixas")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { level: 1, name: "Contas Fixas Recorrentes" })).toBeInTheDocument();
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

    await userEvent.click(await screen.findByRole("button", { name: "Nova Conta Fixa" }));
    const sheet = await screen.findByRole("dialog", { name: "Nova conta" });
    expect(within(sheet).queryByRole("switch", { name: "Ativa" })).not.toBeInTheDocument();
    expect(
      within(sheet).getByRole("button", { name: "Salvar Conta Fixa" }).closest('[data-slot="responsive-sheet-footer"]'),
    ).not.toBeNull();
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar Conta Fixa" }));
    expect(within(sheet).getByText("Informe o nome.")).toBeInTheDocument();
    expect(within(sheet).getByText("Informe um valor maior que zero.")).toBeInTheDocument();
    expect(within(sheet).getByText("Escolha um dia de 1 a 31.")).toBeInTheDocument();

    await userEvent.type(within(sheet).getByLabelText("Nome da conta fixa"), " Luz (Enel) ");
    await userEvent.type(within(sheet).getByLabelText("Valor mensal fixo estimado"), "284,10");
    await userEvent.type(within(sheet).getByLabelText("Dia do vencimento recorrente"), "32");
    expect(within(sheet).getByLabelText("Categoria")).toHaveValue(ALUGUEL.id);
    await userEvent.selectOptions(within(sheet).getByLabelText("Categoria"), "Luz");
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar Conta Fixa" }));
    expect(within(sheet).getByText("Escolha um dia de 1 a 31.")).toBeInTheDocument();

    await userEvent.clear(within(sheet).getByLabelText("Dia do vencimento recorrente"));
    await userEvent.type(within(sheet).getByLabelText("Dia do vencimento recorrente"), "2");
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar Conta Fixa" }));

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
    expect(within(sheet).getByLabelText("Valor mensal fixo estimado")).toHaveValue("2.259,56");
    expect(within(sheet).getByLabelText("Categoria")).toHaveValue(ALUGUEL.id);
    const pinned = within(sheet)
      .getByRole("button", { name: "Salvar Conta Fixa" })
      .closest('[data-slot="responsive-sheet-footer"]');
    expect(
      within(sheet).getByRole("button", { name: "Arquivar" }).closest('[data-slot="responsive-sheet-footer"]'),
    ).toBeNull();
    expect(pinned).not.toBeNull();
    await userEvent.click(within(sheet).getByRole("switch", { name: "Ativa" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar Conta Fixa" }));

    await waitFor(() => expect(sent(requests, "PATCH")).toHaveLength(1));
    expect(await sent(requests, "PATCH")[0].json()).toEqual({
      name: "Aluguel Residencial",
      amount: "2259.56",
      due_day: 10,
      category_id: ALUGUEL.id,
      active: false,
    });
  });

  it("keeps a bill's archived category when it is saved without picking another", async () => {
    const requests = open({
      "GET /api/categories": { status: 200, body: CATEGORIES.filter((each) => each.id !== LUZ.id) },
      [`PATCH /api/bills/${BILL_LUZ.id}`]: { status: 200, body: BILL_LUZ },
    });

    await userEvent.click(await screen.findByRole("button", { name: /^Luz \(Enel\)/ }));
    const sheet = await screen.findByRole("dialog", { name: "Editar conta" });
    expect(await within(sheet).findByRole("option", { name: "Categoria arquivada" })).toHaveProperty("selected", true);
    expect(
      within(sheet).getByText("Categoria arquivada. Fica a mesma se você não escolher outra."),
    ).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar Conta Fixa" }));

    await waitFor(() => expect(sent(requests, "PATCH")).toHaveLength(1));
    expect(await sent(requests, "PATCH")[0].json()).toMatchObject({ category_id: LUZ.id });
  });

  it("says so when saving fails", async () => {
    open({ [`PATCH /api/bills/${BILL_PAUSED.id}`]: { status: 422, body: problem(422, "amount") } });

    await userEvent.click(await screen.findByRole("button", { name: /^Academia/ }));
    const sheet = await screen.findByRole("dialog", { name: "Editar conta" });
    expect(within(sheet).getByRole("switch", { name: "Ativa" })).not.toBeChecked();
    await userEvent.click(within(sheet).getByRole("button", { name: "Salvar Conta Fixa" }));

    expect(await screen.findByText("Não foi possível salvar a conta.")).toBeInTheDocument();
  });

  describe("archiving", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const archive = async (name: string) => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(await screen.findByRole("button", { name: `Mais ações de ${name}` }));
      await user.click(await screen.findByRole("menuitem", { name: "Arquivar" }));
      return user;
    };

    it("hides the bill, holds the archive while Desfazer shows and sends nothing when undone", async () => {
      const requests = open({ [`DELETE /api/bills/${BILL_LUZ.id}`]: { status: 204 } });

      const user = await archive("Luz (Enel)");

      expect(await screen.findByText("Conta arquivada")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Luz \(Enel\)/ })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(await screen.findByRole("button", { name: /^Luz \(Enel\)/ })).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(6000));
      expect(sent(requests, "DELETE")).toHaveLength(0);
    });

    it("archives once the toast is gone", async () => {
      const requests = open({ [`DELETE /api/bills/${BILL_LUZ.id}`]: { status: 204 } });

      await archive("Luz (Enel)");
      await screen.findByText("Conta arquivada");
      expect(sent(requests, "DELETE")).toHaveLength(0);
      act(() => vi.advanceTimersByTime(6000));

      await waitFor(() => expect(sent(requests, "DELETE")).toHaveLength(1));
    });

    it("brings the bill back and says so when archiving fails", async () => {
      open({ [`DELETE /api/bills/${BILL_LUZ.id}`]: { status: 500, body: problem(500, "Falhou.") } });

      await archive("Luz (Enel)");
      await screen.findByText("Conta arquivada");
      act(() => vi.advanceTimersByTime(6000));

      expect(await screen.findByText("Não foi possível arquivar a conta.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Luz \(Enel\)/ })).toBeInTheDocument();
    });
  });
});
