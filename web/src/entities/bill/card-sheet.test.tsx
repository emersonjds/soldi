import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import { BILL_LUZ, problem, stubApi } from "@/test/stub-api";

import { CardSheet } from "./card-sheet";

const PORTO: Schemas["Bill"] = {
  ...BILL_LUZ,
  id: "b1000000-0000-4000-8000-000000000009",
  name: "Porto",
  amount: null,
  closing_day: 3,
  due_day: 10,
};

const setup = (reply: { status: number; body?: unknown } = { status: 201, body: PORTO }) => {
  const requests = stubApi({ "POST /api/bills": reply });
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  renderWithQuery(<CardSheet open onOpenChange={onOpenChange} onSaved={onSaved} />);
  const sheet = screen.getByRole("dialog", { name: "Novo cartão" });
  const fill = async () => {
    await userEvent.type(within(sheet).getByLabelText("Nome do cartão"), " Porto ");
    await userEvent.type(within(sheet).getByLabelText("Fecha dia"), "3");
    await userEvent.click(within(sheet).getByRole("button", { name: "Dia 10" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Criar cartão" }));
  };
  return { requests, onSaved, onOpenChange, sheet, fill };
};

describe("CardSheet", () => {
  beforeEach(() => {
    window.innerWidth = 375;
  });

  it("asks the card's name and days, never a category, in 16 px fields", () => {
    const { sheet } = setup();

    expect(within(sheet).getByLabelText("Nome do cartão")).toHaveClass("text-base");
    expect(within(sheet).getByLabelText("Fecha dia")).toHaveClass("text-base");
    expect(within(sheet).getByLabelText("Dia do vencimento")).toHaveClass("text-base");
    expect(within(sheet).getByRole("button", { name: "Criar cartão" })).toHaveClass("min-h-12");
    expect(within(sheet).queryByLabelText("Categoria")).not.toBeInTheDocument();
  });

  it("asks a name and days from 1 to 31 before sending", async () => {
    const { sheet, requests } = setup();

    await userEvent.click(within(sheet).getByRole("button", { name: "Criar cartão" }));
    expect(within(sheet).getByText("Informe o nome.")).toBeInTheDocument();
    expect(within(sheet).getAllByText("Escolha um dia de 1 a 31.")).toHaveLength(2);

    await userEvent.type(within(sheet).getByLabelText("Nome do cartão"), "Porto");
    await userEvent.type(within(sheet).getByLabelText("Fecha dia"), "32");
    await userEvent.type(within(sheet).getByLabelText("Dia do vencimento"), "0");
    await userEvent.click(within(sheet).getByRole("button", { name: "Criar cartão" }));
    expect(within(sheet).getByLabelText("Fecha dia")).toHaveAttribute("aria-invalid", "true");
    expect(within(sheet).getByLabelText("Dia do vencimento")).toHaveAttribute("aria-invalid", "true");
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);
  });

  it("creates the card with no category, hands it over and closes", async () => {
    const { requests, onSaved, onOpenChange, fill } = setup();

    await fill();

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(PORTO));
    expect(await requests[0].json()).toEqual({ name: "Porto", due_day: 10, closing_day: 3 });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("says the card was not created and stays open, never with the server's text", async () => {
    const { sheet, onSaved, onOpenChange, fill } = setup({ status: 500, body: problem(500, "boom") });

    await fill();

    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Não foi possível criar o cartão.");
    expect(within(sheet).queryByText("boom")).not.toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("shows a refused rule's own copy", async () => {
    const { sheet, fill } = setup({
      status: 429,
      body: { ...problem(429, "slow down"), type: "urn:soldi:error:rate-limited" },
    });

    await fill();

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Muitas alterações seguidas. Espere um pouco e tente de novo.",
    );
  });
});
