import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { DraftRow } from "@/entities/forecast/months-ahead";
import { renderWithQuery } from "@/test/render";
import { FORECAST, FORECAST_FLAT, problem, SETTINGS, stubApi } from "@/test/stub-api";

import { Simulation } from "./simulation";

const show = (
  rows: DraftRow[] | null,
  forecast: { status: number; body?: unknown } = { status: 200, body: FORECAST_FLAT },
) => {
  const requests = stubApi({ "GET /api/forecast": forecast, "GET /api/settings": { status: 200, body: SETTINGS } });
  const view = renderWithQuery(<Simulation rows={rows} />);
  return { requests, ...view };
};

const region = () => screen.getByRole("region", { name: "Simulação" });

const verdict = (text: string) => waitFor(() => expect(within(region()).getByRole("status")).toHaveTextContent(text));

describe("Simulation", () => {
  it("asks for an amount before anything else", () => {
    show(null);
    expect(region()).toHaveTextContent("Digite um valor para simular.");
  });

  it("holds seven pills while the forecast loads", () => {
    show([{ date: "2026-11-10", cents: -100 }]);
    expect(region().querySelectorAll('[data-slot="skeleton"]')).toHaveLength(7);
    expect(within(region()).getByRole("status")).toBeEmptyDOMElement();
  });

  it("names a later day of this month, and of another month with its month", async () => {
    show([{ date: "2026-11-23", cents: -240_000 }]);
    await verdict("Com essa compra, dia 23 fica no vermelho: -R$ 557,90.");
    const week = within(region()).getAllByRole("listitem");
    expect(week[0]).toHaveTextContent("23/11Crítico");
    expect(screen.queryByRole("heading", { name: "Meses com essa compra" })).not.toBeInTheDocument();
  });

  it("names a day of another month as DD/MM and shows the months a series reaches", async () => {
    show([
      { date: "2026-12-23", cents: -240_000 },
      { date: "2027-01-23", cents: -240_000 },
    ]);
    await verdict("Com essa compra, dia 23/12 fica no vermelho: -R$ 557,90.");
    expect(screen.getByRole("heading", { name: "Meses com essa compra" })).toBeInTheDocument();
    const january = screen.getByRole("listitem", {
      name: "jan 2027: Crítico, menor saldo -R$\u00a02.957,90, 31 dias no vermelho, antes R$\u00a01.842,10",
    });
    expect(january).toHaveTextContent("-2.958antes 1.842Crítico");
    const november = screen.getByRole("listitem", { name: "nov 2026: Confortável, menor saldo R$\u00a01.842,10" });
    expect(november).not.toHaveTextContent("antes");
  });

  it("names the balance of the day that turns red, not the month's lowest", async () => {
    show([{ date: "2026-11-10", cents: -670_000 }], { status: 200, body: FORECAST });
    await verdict("Com essa compra, hoje fica no vermelho: -R$ 550,00.");
    expect(within(region()).getByText("-R$ 550,00")).toHaveClass("whitespace-nowrap");
  });

  it("hides the week for a date after the horizon", async () => {
    show([{ date: "2028-01-10", cents: -100_000 }]);
    await verdict("Nenhum dia vermelho com essa compra.");
    expect(screen.queryByRole("list", { name: "Próximos 7 dias" })).not.toBeInTheDocument();
  });

  it("is clear for a draft past the horizon even with red days ahead", async () => {
    show([{ date: "2028-01-10", cents: -100_000 }], { status: 200, body: FORECAST });
    await verdict("Nenhum dia vermelho com essa compra.");
  });

  it("calls an Entrada a lançamento, not a compra", async () => {
    show([{ date: "2026-11-10", cents: 100_000 }]);
    await verdict("Nenhum dia vermelho com esse lançamento.");
  });

  it("says an Entrada adds no red day when red days are already there", async () => {
    show([{ date: "2026-11-10", cents: 100_000 }], { status: 200, body: FORECAST });
    await verdict("Esse lançamento não cria dia vermelho novo.");
  });

  it("says so when the forecast fails and tries again", async () => {
    const { requests } = show([{ date: "2026-11-10", cents: -100 }], { status: 500, body: problem(500, "Erro") });
    await userEvent.click(await within(region()).findByRole("button", { name: "Tentar de novo" }));
    expect(region()).toHaveTextContent("Não foi possível carregar.");
    expect(requests.filter((request) => request.url.endsWith("/api/forecast")).length).toBeGreaterThan(1);
  });
});
