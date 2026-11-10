import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { DraftRow } from "@/entities/forecast/months-ahead";
import { renderWithQuery } from "@/test/render";
import { FORECAST_FLAT, problem, SETTINGS, stubApi } from "@/test/stub-api";

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

describe("Simulation", () => {
  it("asks for an amount before anything else", () => {
    show(null);
    expect(region()).toHaveTextContent("Digite um valor para simular.");
  });

  it("holds seven pills while the forecast loads", () => {
    show([{ date: "2026-11-10", cents: -100 }]);
    expect(region().querySelectorAll('[data-slot="skeleton"]')).toHaveLength(7);
  });

  it("names a later day of this month, and of another month with its month", async () => {
    show([{ date: "2026-11-23", cents: -240_000 }]);
    expect(await within(region()).findByRole("status")).toHaveTextContent("Com essa compra, dia 23 vira Crítico");
    const week = within(region()).getAllByRole("listitem");
    expect(week[0]).toHaveTextContent("23/11Crítico");
    expect(screen.queryByRole("heading", { name: "Meses com essa compra" })).not.toBeInTheDocument();
  });

  it("names a day of another month as DD/MM and shows the months a series reaches", async () => {
    show([
      { date: "2026-12-23", cents: -240_000 },
      { date: "2027-01-23", cents: -240_000 },
    ]);
    expect(await within(region()).findByRole("status")).toHaveTextContent("Com essa compra, dia 23/12 vira Crítico");
    expect(screen.getByRole("heading", { name: "Meses com essa compra" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "jan 2027: Crítico, 31 dias no vermelho" })).toBeInTheDocument();
  });

  it("hides the week for a date after the horizon", async () => {
    show([{ date: "2028-01-10", cents: -100_000 }]);
    expect(await within(region()).findByRole("status")).toHaveTextContent("Nenhum dia vermelho com essa compra.");
    expect(screen.queryByRole("list", { name: "Próximos 7 dias" })).not.toBeInTheDocument();
  });

  it("says so when the forecast fails and tries again", async () => {
    const { requests } = show([{ date: "2026-11-10", cents: -100 }], { status: 500, body: problem(500, "Erro") });
    await userEvent.click(await within(region()).findByRole("button", { name: "Tentar de novo" }));
    expect(region()).toHaveTextContent("Não foi possível carregar.");
    expect(requests.filter((request) => request.url.endsWith("/api/forecast")).length).toBeGreaterThan(1);
  });
});
