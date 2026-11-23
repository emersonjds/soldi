import { useState } from "react";

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster, toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import { ALUGUEL, BILL_ALUGUEL, CATEGORIES, problem, stubApi } from "@/test/stub-api";

import { EditBillSheet, useArchiveLater } from "./edit-bill-sheet";

const PORTO = { name: "Porto", amount: "1200.00", category_id: ALUGUEL.id };

const create = (
  prefill: Schemas["CreateBill"],
  props: Partial<Pick<Parameters<typeof EditBillSheet>[0], "parcelado" | "hint">> = {},
) => {
  stubApi({ "GET /api/categories": { status: 200, body: CATEGORIES } });
  const onCreate = vi.fn();
  renderWithQuery(<EditBillSheet open onOpenChange={vi.fn()} prefill={prefill} onCreate={onCreate} {...props} />);
  return onCreate;
};

const sheet = () => screen.findByRole("dialog", { name: "Nova conta" });

describe("EditBillSheet with a series prefill (SOL-152)", () => {
  beforeEach(() => {
    window.innerWidth = 375;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("posts a plan ending this month as prefilled, though this month's due day has passed", async () => {
    const onCreate = create({ ...PORTO, due_day: 1, installments: 9, last_month: "2026-11-01" });

    const form = await sheet();
    expect(within(form).queryByText(/termina em/)).not.toBeInTheDocument();
    await userEvent.click(within(form).getByRole("button", { name: "Salvar Conta Fixa" }));

    expect(onCreate).toHaveBeenCalledWith({ ...PORTO, due_day: 1, installments: 9, last_month: "2026-11-01" });
  });

  it("posts the series' month span through its last month on a series with deleted members", async () => {
    const onCreate = create({ ...PORTO, due_day: 5, installments: 3, last_month: "2027-01-01" });

    const form = await sheet();
    expect(within(form).getByText("Parcela 1/3 em nov/26 · termina em jan/27")).toBeInTheDocument();
    await userEvent.click(within(form).getByRole("button", { name: "Salvar Conta Fixa" }));

    expect(onCreate).toHaveBeenCalledWith({ ...PORTO, due_day: 5, installments: 3, last_month: "2027-01-01" });
  });

  it("works the plan out again once Parcela atual changes", async () => {
    const onCreate = create({ ...PORTO, due_day: 1, installments: 9, last_month: "2026-11-01" });

    const form = await sheet();
    await userEvent.clear(within(form).getByLabelText("Parcela atual"));
    await userEvent.type(within(form).getByLabelText("Parcela atual"), "3");
    await userEvent.click(within(form).getByRole("button", { name: "Salvar Conta Fixa" }));

    expect(onCreate).toHaveBeenCalledWith({ ...PORTO, due_day: 1, installments: 9, last_month: "2027-06-01" });
  });

  it("opens with Parcelado off when told to, keeping the plan for the switch, and posts no plan", async () => {
    const onCreate = create({ ...PORTO, due_day: 5, installments: 3, last_month: "2027-01-01" }, { parcelado: false });

    const form = await sheet();
    expect(within(form).getByRole("switch", { name: "Parcelado" })).not.toBeChecked();
    expect(within(form).queryByLabelText("Quantas parcelas")).not.toBeInTheDocument();
    await userEvent.click(within(form).getByRole("button", { name: "Salvar Conta Fixa" }));

    expect(onCreate).toHaveBeenLastCalledWith({ ...PORTO, due_day: 5 });
    await userEvent.click(within(form).getByRole("switch", { name: "Parcelado" }));
    expect(within(form).getByLabelText("Quantas parcelas")).toHaveValue("3");
    expect(within(form).getByLabelText("Parcela atual")).toHaveValue("1");
    expect(within(form).getByText("Parcela 1/3 em nov/26 · termina em jan/27")).toBeInTheDocument();
    await userEvent.click(within(form).getByRole("button", { name: "Salvar Conta Fixa" }));

    expect(onCreate).toHaveBeenLastCalledWith({ ...PORTO, due_day: 5, installments: 3, last_month: "2027-01-01" });
  });

  it("swaps the hint with the Parcelado switch", async () => {
    create(
      { ...PORTO, due_day: 1, installments: 9, last_month: "2026-11-01" },
      { parcelado: true, hint: (parcelado) => (parcelado ? "Parcelada." : "Fixa.") },
    );

    const form = await sheet();
    expect(within(form).getByText("Parcelada.")).toBeInTheDocument();
    await userEvent.click(within(form).getByRole("switch", { name: "Parcelado" }));

    expect(within(form).getByText("Fixa.")).toBeInTheDocument();
    expect(within(form).queryByText("Parcelada.")).not.toBeInTheDocument();
  });
});

describe("EditBillSheet removal (SOL-153)", () => {
  const edit = (bill: Schemas["Bill"]) => {
    stubApi({ "GET /api/categories": { status: 200, body: CATEGORIES } });
    const onArchive = vi.fn();
    renderWithQuery(<EditBillSheet open onOpenChange={vi.fn()} bill={bill} onArchive={onArchive} />);
    return onArchive;
  };

  it("names the removal Excluir conta fixa and says the payments stay", async () => {
    const onArchive = edit(BILL_ALUGUEL);

    const form = await screen.findByRole("dialog", { name: "Editar conta" });
    const remove = within(form).getByRole("button", { name: "Excluir conta fixa" });
    expect(remove).toHaveClass("min-h-11");
    expect(
      within(form).getByText("Sai de todos os meses; os pagamentos já feitos continuam nos lançamentos."),
    ).toBeInTheDocument();
    await userEvent.click(remove);

    expect(onArchive).toHaveBeenCalledWith(BILL_ALUGUEL);
  });

  it("keeps a card's word: Excluir cartão", async () => {
    edit({ ...BILL_ALUGUEL, name: "Porto", amount: null, closing_day: 3 });

    const form = await screen.findByRole("dialog", { name: "Editar conta" });
    expect(within(form).getByRole("button", { name: "Excluir cartão" })).toBeInTheDocument();
    expect(within(form).queryByRole("button", { name: "Excluir conta fixa" })).not.toBeInTheDocument();
  });
});

describe("useArchiveLater (SOL-153)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date", "setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  type Props = { bill: Schemas["Bill"]; onRestore: (id: string) => void };

  const Archiver = ({ bill, onRestore }: Props) => {
    const archive = useArchiveLater(vi.fn(), onRestore);
    return (
      <button type="button" onClick={() => archive(bill)}>
        Excluir
      </button>
    );
  };

  const Screen = (props: Props) => {
    const [here, setHere] = useState(true);
    return (
      <>
        {here && <Archiver {...props} />}
        <button type="button" onClick={() => setHere(false)}>
          Sair
        </button>
        <Toaster />
      </>
    );
  };

  const archive = async (bill: Schemas["Bill"], reply: { status: number; body?: unknown }) => {
    const requests = stubApi({ [`DELETE /api/bills/${bill.id}`]: reply });
    const onRestore = vi.fn();
    renderWithQuery(<Screen bill={bill} onRestore={onRestore} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    const deletes = () => requests.filter((request) => request.method === "DELETE");
    return { onRestore, user, deletes };
  };

  it("says so and brings the bill back when the DELETE fails after the screen is gone", async () => {
    const { onRestore, user } = await archive(BILL_ALUGUEL, { status: 500, body: problem(500, "Erro.") });
    await screen.findByText("Conta fixa excluída");
    await user.click(screen.getByRole("button", { name: "Sair" }));
    act(() => vi.advanceTimersByTime(6000));

    expect(await screen.findByText("Não foi possível excluir a conta fixa.")).toBeInTheDocument();
    expect(onRestore).toHaveBeenCalledWith(BILL_ALUGUEL.id);
  });

  it("names a card in its failure", async () => {
    await archive({ ...BILL_ALUGUEL, amount: null, closing_day: 3 }, { status: 500, body: problem(500, "Erro.") });
    await screen.findByText("Cartão excluído");
    act(() => vi.advanceTimersByTime(6000));

    expect(await screen.findByText("Não foi possível excluir o cartão.")).toBeInTheDocument();
  });

  it("deletes once when the toast closes on its timer and is dismissed too", async () => {
    const { deletes } = await archive(BILL_ALUGUEL, { status: 204 });
    await screen.findByText("Conta fixa excluída");
    act(() => vi.advanceTimersByTime(5000));
    act(() => {
      toast.dismiss();
    });

    await waitFor(() => expect(deletes()).toHaveLength(1));
    act(() => vi.advanceTimersByTime(1000));
    expect(deletes()).toHaveLength(1);
  });
});
