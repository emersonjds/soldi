import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { describe, expect, it } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import { problem, SAVINGS_YEAR, SETTINGS, stubApi } from "@/test/stub-api";

import { SavingsTarget } from "./savings-target";

type Reply = { status: number; body?: unknown };

const TARGET: Schemas["SavingsTarget"] = {
  pct: "20.00",
  amount: "12896.56",
  remaining: "7480.03",
  progress_pct: "42.0",
  done: false,
};

const show = (target: Schemas["SavingsTarget"] | null, reply: Reply = { status: 200, body: SETTINGS }) => {
  const requests = stubApi({ "PATCH /api/settings": reply });
  renderWithQuery(
    <>
      <SavingsTarget year={{ ...SAVINGS_YEAR, target }} />
      <Toaster />
    </>,
  );
  return requests;
};

const card = () => screen.getByRole("region", { name: /^Meta Anual/ });
const patched = async (requests: Request[]) => {
  await waitFor(() => expect(requests.some((request) => request.method === "PATCH")).toBe(true));
  return requests.find((request) => request.method === "PATCH")?.json();
};
const dialog = () => screen.findByRole("dialog", { name: "Meta anual de economia" });
const typePct = async (value: string) => {
  const field = within(await dialog()).getByLabelText("Percentual das entradas");
  await userEvent.clear(field);
  await userEvent.type(field, value);
  await userEvent.click(within(await dialog()).getByRole("button", { name: "Salvar meta" }));
};

describe("SavingsTarget", () => {
  it("offers Definir meta anual when unset and saves the percent typed with a comma", async () => {
    const requests = show(null);

    expect(screen.queryByRole("region", { name: /^Meta Anual/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Definir meta anual" }));
    const form = await dialog();
    expect(within(form).getByText("Quanto das entradas do ano você quer guardar.")).toBeInTheDocument();
    expect(within(form).getByLabelText("Percentual das entradas")).toHaveAttribute("inputMode", "decimal");
    expect(within(form).queryByRole("button", { name: "Remover meta" })).not.toBeInTheDocument();
    await typePct("20,5");

    expect(await patched(requests)).toEqual({ savings_target_pct: "20.5" });
    expect(await screen.findByText("Meta salva")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("refuses 0, above 100 and more than two places", async () => {
    const requests = show(null);

    await userEvent.click(screen.getByRole("button", { name: "Definir meta anual" }));
    for (const value of ["0", "101", "12,345"]) {
      await typePct(value);
      expect(within(await dialog()).getByText("Use um valor acima de 0 e até 100.")).toBeInTheDocument();
    }
    expect(requests.some((request) => request.method === "PATCH")).toBe(false);
  });

  it("shows what is left, the base and the progress of a set target", () => {
    show(TARGET);

    const target = card();
    expect(target).toHaveTextContent("Meta Anual (20%)");
    expect(target).toHaveTextContent("42,0% concluído");
    expect(target).toHaveTextContent("R$ 5.416,53 de R$ 12.896,56");
    expect(target).toHaveTextContent("Faltam R$ 7.480,03");
    expect(target).toHaveTextContent("Alvo estratégico de 20% sobre as entradas do ano até agora (R$ 12.896,56).");
    expect(target).toHaveTextContent("Progresso atual (42,0%)");
    expect(target).toHaveTextContent("R$ 5.416,53 / R$ 12.896,56");
    expect(within(target).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
    expect(screen.queryByRole("button", { name: "Definir meta anual" })).not.toBeInTheDocument();
  });

  it("says Meta batida once reached, with the bar capped at 100", () => {
    show({ ...TARGET, remaining: "0.00", progress_pct: "104.3", done: true });

    expect(card()).toHaveTextContent("Meta batida");
    expect(card()).not.toHaveTextContent("Faltam");
    expect(within(card()).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("waits for the year's first entrada when the target is still zero", () => {
    show({ ...TARGET, amount: "0.00", remaining: "0.00", progress_pct: null });

    expect(card()).toHaveTextContent("Meta Anual (20%)");
    expect(card()).toHaveTextContent("A meta conta a partir da primeira entrada do ano.");
    expect(within(card()).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(card()).not.toHaveTextContent("Faltam");
  });

  it("edits the percent from the pencil and removes the target with null", async () => {
    const requests = show(TARGET);

    await userEvent.click(within(card()).getAllByRole("button", { name: "Editar meta" })[0]);
    const form = await dialog();
    expect(within(form).getByLabelText("Percentual das entradas")).toHaveValue("20");
    await userEvent.click(within(form).getByRole("button", { name: "Remover meta" }));

    expect(await patched(requests)).toEqual({ savings_target_pct: null });
    expect(await screen.findByText("Meta removida")).toBeInTheDocument();
  });

  it("toasts when the target could not be saved", async () => {
    show(null, { status: 500, body: problem(500, "boom") });

    await userEvent.click(screen.getByRole("button", { name: "Definir meta anual" }));
    await typePct("20");

    expect(await screen.findByText("Não foi possível salvar a meta.")).toBeInTheDocument();
  });
});
