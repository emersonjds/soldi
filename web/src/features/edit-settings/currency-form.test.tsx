import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { describe, expect, it } from "vitest";

import { renderWithQuery } from "@/test/render";
import { problem, SETTINGS, signedIn } from "@/test/stub-api";

import { CurrencyForm } from "./currency-form";

type Reply = { status: number; body?: unknown };

const open = (replies: Record<string, Reply> = {}) => {
  const requests = signedIn(replies);
  renderWithQuery(
    <>
      <CurrencyForm settings={SETTINGS} />
      <Toaster />
    </>,
  );
  return requests;
};

describe("CurrencyForm", () => {
  it("marks the saved currency and saves another one as soon as it is picked", async () => {
    const requests = open({ "PATCH /api/settings": { status: 200, body: { ...SETTINGS, currency: "EUR" } } });

    expect(screen.getByRole("group", { name: "Moeda Base do App" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Real (BRL - R$)" })).toBeChecked();
    for (const caption of ["Padrão Brasil", "United States", "Zona do Euro", "Reino Unido"])
      expect(screen.getByText(caption)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Euro (EUR - €)" }));

    expect(await screen.findByText("Moeda salva")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Euro (EUR - €)" })).toBeChecked();
    const patch = requests.find((request) => request.method === "PATCH");
    expect(await patch?.json()).toEqual({ currency: "EUR" });
  });

  it("says so and goes back to the saved currency when saving fails", async () => {
    open({ "PATCH /api/settings": { status: 422, body: problem(422, "currency") } });

    await userEvent.click(screen.getByRole("radio", { name: "Libra (GBP - £)" }));

    expect(await screen.findByText("Não foi possível salvar.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Real (BRL - R$)" })).toBeChecked();
  });
});
