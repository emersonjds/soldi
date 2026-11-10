import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/test/render";
import { FORECAST, FORECAST_FLAT, FORECAST_LATE_OPENING, problem, stubApi } from "@/test/stub-api";

import { MonthsAhead } from "./months-ahead";

const show = (reply: { status: number; body?: unknown }) => {
  const requests = stubApi({ "GET /api/forecast": reply });
  const onOpen = vi.fn();
  renderWithQuery(<MonthsAhead viewing="2026-11" onOpen={onOpen} />);
  return { requests, onOpen };
};

const card = () => screen.getByRole("region", { name: "Próximos meses" });
const chips = () => within(card()).getAllByRole("button", { name: /\d{4}/ });
const forecastCalls = (requests: Request[]) => requests.filter((request) => request.url.endsWith("/api/forecast"));

describe("Próximos meses", () => {
  it("shows six months, twelve on the toggle without asking again, and opens one", async () => {
    const { requests, onOpen } = show({ status: 200, body: FORECAST });

    expect(
      await within(card()).findByRole("button", { name: "nov 2026: Crítico, 7 dias no vermelho" }),
    ).toHaveAttribute("aria-current", "date");
    expect(chips()).toHaveLength(6);
    await userEvent.click(within(card()).getByRole("radio", { name: "12 meses" }));
    expect(chips()).toHaveLength(12);
    expect(chips()[11]).toHaveAccessibleName(/^out 2027/);
    expect(forecastCalls(requests)).toHaveLength(1);

    await userEvent.click(within(card()).getByRole("button", { name: /^dez 2026/ }));
    expect(onOpen).toHaveBeenCalledWith("2026-12");
  });

  it("shows skeleton chips while loading", () => {
    show({ status: 200, body: FORECAST });
    expect(within(card()).getAllByTestId("chip-skeleton")).toHaveLength(6);
  });

  it("teaches when nothing is typed ahead", async () => {
    show({ status: 200, body: FORECAST_FLAT });
    expect(await within(card()).findByText("Lance seus próximos meses para ver a cor deles aqui.")).toBeInTheDocument();
    expect(card()).not.toHaveTextContent("Confortável");
  });

  it("disables the months before the opening date", async () => {
    show({ status: 200, body: FORECAST_LATE_OPENING });
    expect(await within(card()).findByRole("button", { name: "nov 2026: antes do início" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(within(card()).getByRole("button", { name: /^jan 2027: Confortável/ })).not.toHaveAttribute("aria-disabled");
  });

  it("says so when it fails and tries again", async () => {
    const { requests } = show({ status: 500, body: problem(500, "Erro") });
    await userEvent.click(await within(card()).findByRole("button", { name: "Tentar de novo" }));
    expect(card()).toHaveTextContent("Não foi possível carregar.");
    expect(forecastCalls(requests).length).toBeGreaterThan(1);
  });
});
