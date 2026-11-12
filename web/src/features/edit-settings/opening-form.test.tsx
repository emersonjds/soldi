import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { pickDate } from "@/test/pick-date";
import { renderWithQuery } from "@/test/render";
import { problem, SETTINGS, signedIn } from "@/test/stub-api";

import { OpeningForm } from "./opening-form";

type Reply = { status: number; body?: unknown };

const open = (replies: Record<string, Reply> = {}) => {
  const requests = signedIn(replies);
  renderWithQuery(
    <>
      <OpeningForm settings={SETTINGS} />
      <Toaster />
    </>,
  );
  return requests;
};

const patches = (requests: Request[]) =>
  Promise.all(requests.filter((request) => request.method === "PATCH").map((request) => request.clone().json()));

const amount = () => screen.getByLabelText("Saldo Inicial da Conta Corrente");

describe("OpeningForm", () => {
  it("saves the opening balance on blur and undoes it", async () => {
    const requests = open({ "PATCH /api/settings": { status: 200, body: SETTINGS } });

    expect(amount()).toHaveValue("1.842,10");
    expect(screen.getByText("Usado para recalcular o fluxo desde o primeiro mês cadastrado.")).toBeInTheDocument();
    await userEvent.clear(amount());
    await userEvent.type(amount(), "-1.250,50");
    await userEvent.tab();

    expect(await screen.findByText("Saldo inicial salvo")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));

    await waitFor(async () =>
      expect(await patches(requests)).toEqual([{ opening_balance: "-1250.50" }, { opening_balance: "1842.10" }]),
    );
    expect(amount()).toHaveValue("1.842,10");
  });

  it("saves a new opening date as soon as it is picked, and undo restores it", async () => {
    const requests = open({ "PATCH /api/settings": { status: 200, body: SETTINGS } });

    await pickDate("Data", "2026-10-01");

    expect(await screen.findByText("Saldo inicial salvo")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await waitFor(async () =>
      expect(await patches(requests)).toEqual([{ opening_date: "2026-10-01" }, { opening_date: "2026-11-01" }]),
    );
    expect(screen.getByRole("button", { name: "Data, 01/11/2026" })).toBeInTheDocument();
  });

  it("keeps the new balance when the undo fails", async () => {
    let saves = 0;
    signedIn({ "PATCH /api/settings": { status: 200, body: SETTINGS } });
    const replies = globalThis.fetch;
    vi.stubGlobal("fetch", async (request: Request) => {
      if (request.method !== "PATCH") return replies(request);
      saves += 1;
      return saves === 1
        ? new Response(JSON.stringify(SETTINGS), { status: 200, headers: { "content-type": "application/json" } })
        : new Response(JSON.stringify(problem(500, "Falhou.")), {
            status: 500,
            headers: { "content-type": "application/problem+json" },
          });
    });
    renderWithQuery(
      <>
        <OpeningForm settings={SETTINGS} />
        <Toaster />
      </>,
    );

    await userEvent.clear(amount());
    await userEvent.type(amount(), "50000");
    await userEvent.tab();
    await userEvent.click(await screen.findByRole("button", { name: "Desfazer" }));

    expect(await screen.findByText("Não foi possível salvar.")).toBeInTheDocument();
    expect(amount()).toHaveValue("500,00");
  });

  it("keeps one undo for the latest save", async () => {
    open({ "PATCH /api/settings": { status: 200, body: SETTINGS } });

    await userEvent.clear(amount());
    await userEvent.type(amount(), "50000");
    await userEvent.tab();
    await screen.findByText("Saldo inicial salvo");
    await pickDate("Data", "2026-10-01");

    await waitFor(() => expect(screen.getAllByText("Saldo inicial salvo")).toHaveLength(1));
    expect(screen.getAllByRole("button", { name: "Desfazer" })).toHaveLength(1);
  });

  it("does not save an unchanged or an empty balance", async () => {
    const requests = open();

    await userEvent.click(amount());
    await userEvent.tab();
    await userEvent.clear(amount());
    await userEvent.tab();

    expect(screen.getByText("Informe um valor, como 1.250,00.")).toBeInTheDocument();
    expect(requests.some((request) => request.method === "PATCH")).toBe(false);
  });

  it("takes no opening date after today", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
    try {
      open();
      await userEvent.click(screen.getByRole("button", { name: "Data, 01/11/2026" }));

      expect(await screen.findByRole("button", { name: "sexta-feira, 6 de novembro de 2026" })).toBeDisabled();
      expect(screen.getByRole("button", { name: /quinta-feira, 5 de novembro de 2026/ })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("says so when saving fails", async () => {
    open({ "PATCH /api/settings": { status: 422, body: problem(422, "before-opening-date") } });

    await userEvent.type(amount(), "0");
    await userEvent.tab();

    expect(await screen.findByText("Não foi possível salvar.")).toBeInTheDocument();
  });
});
