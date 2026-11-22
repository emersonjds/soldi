import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import { ALUGUEL, CATEGORIES, stubApi } from "@/test/stub-api";

import { EditBillSheet } from "./edit-bill-sheet";

const PORTO = { name: "Porto", amount: "1200.00", category_id: ALUGUEL.id };

const create = (prefill: Schemas["CreateBill"]) => {
  stubApi({ "GET /api/categories": { status: 200, body: CATEGORIES } });
  const onCreate = vi.fn();
  renderWithQuery(<EditBillSheet open onOpenChange={vi.fn()} prefill={prefill} onCreate={onCreate} />);
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
});
