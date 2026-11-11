import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { pickDate } from "@/test/pick-date";
import { renderWithQuery } from "@/test/render";
import { problem, SETTINGS, signedIn } from "@/test/stub-api";

import SaldoInicialPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

type Reply = { status: number; body?: unknown };

const open = (replies: Record<string, Reply> = {}) => {
  const requests = signedIn(replies);
  renderWithQuery(
    <>
      <SaldoInicialPage />
      <Toaster />
    </>,
  );
  return requests;
};

describe("Ajustes › Saldo inicial", () => {
  it("edits the opening balance and its date", async () => {
    const requests = open({ "PATCH /api/settings": { status: 200, body: SETTINGS } });

    const amount = await screen.findByLabelText("Saldo inicial");
    expect(amount).toHaveValue("1.842,10");
    expect(screen.getByRole("button", { name: "Data, 01/11/2026" })).toHaveTextContent("01/11/2026");
    expect(screen.getByRole("link", { name: "Ajustes" })).toHaveAttribute("href", "/ajustes");

    await userEvent.clear(amount);
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("Informe um valor, como 1.250,00.")).toBeInTheDocument();

    await userEvent.type(amount, "-1.250,50");
    await pickDate("Data", "2026-10-01");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Saldo inicial salvo")).toBeInTheDocument();
    const patch = requests.find((request) => request.method === "PATCH");
    expect(await patch?.json()).toEqual({ opening_balance: "-1250.50", opening_date: "2026-10-01" });
  });

  it("takes no opening date after today", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
    try {
      open();
      await userEvent.click(await screen.findByRole("button", { name: "Data, 01/11/2026" }));

      expect(await screen.findByRole("button", { name: "sexta-feira, 6 de novembro de 2026" })).toBeDisabled();
      expect(screen.getByRole("button", { name: /quinta-feira, 5 de novembro de 2026/ })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("says so when saving fails", async () => {
    open({ "PATCH /api/settings": { status: 422, body: problem(422, "before-opening-date") } });

    await screen.findByLabelText("Saldo inicial");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Não foi possível salvar.")).toBeInTheDocument();
  });
});
