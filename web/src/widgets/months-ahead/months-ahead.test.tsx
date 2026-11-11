import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/test/render";
import { FORECAST, FORECAST_FLAT, FORECAST_LATE_OPENING, forecastFixture, problem, stubApi } from "@/test/stub-api";

import { MonthsAhead } from "./months-ahead";

const show = (reply: { status: number; body?: unknown }) => {
  const requests = stubApi({ "GET /api/forecast": reply });
  const onOpen = vi.fn();
  const onSimulate = vi.fn();
  const { client } = renderWithQuery(<MonthsAhead viewing="2026-11" onOpen={onOpen} onSimulate={onSimulate} />);
  return { requests, onOpen, onSimulate, client };
};

const card = () => screen.getByRole("region", { name: "Próximos meses" });
const chips = () => within(card()).getAllByRole("button", { name: /\d{4}/ });
const forecastCalls = (requests: Request[]) => requests.filter((request) => request.url.endsWith("/api/forecast"));

describe("Próximos meses", () => {
  it("shows twelve months, always, from one request, and opens one", async () => {
    const { requests, onOpen } = show({ status: 200, body: FORECAST });

    const november = await within(await screen.findByRole("region")).findByRole("button", {
      name: "novembro de 2026: menor saldo -R$\u00a02.916,00, Crítico",
    });
    expect(november).toHaveAttribute("aria-current", "date");
    expect(november).toHaveTextContent("-2.916");
    expect(within(card()).queryByRole("radio")).not.toBeInTheDocument();
    expect(chips()).toHaveLength(12);
    expect(chips()[11]).toHaveAccessibleName(/^outubro de 2027/);
    expect(forecastCalls(requests)).toHaveLength(1);

    await userEvent.click(within(card()).getByRole("button", { name: /^dezembro de 2026/ }));
    expect(onOpen).toHaveBeenCalledWith("2026-12");
  });

  it("asks Posso comprar? from the title row", async () => {
    const { onSimulate } = show({ status: 200, body: FORECAST });
    await userEvent.click(
      await within(await screen.findByRole("region")).findByRole("button", { name: "Posso comprar?" }),
    );
    expect(onSimulate).toHaveBeenCalledOnce();
  });

  it("renders nothing while loading, so it never flashes (D25)", async () => {
    show({ status: 200, body: FORECAST });
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Próximos meses" })).toBeInTheDocument();
  });

  it("renders nothing when nothing lands ahead (D25)", async () => {
    const { client } = show({ status: 200, body: FORECAST_FLAT });
    await waitFor(() => expect(client.getQueryState(["month", "forecast"])?.status).toBe("success"));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("paints a flat red balance red, without the lesson", async () => {
    show({ status: 200, body: forecastFixture("2026-11-10", "2026-11-10", "2027-10-31", [["2026-11-10", "-800.00"]]) });
    expect(
      await within(await screen.findByRole("region")).findByRole("button", {
        name: "novembro de 2026: menor saldo -R$\u00a0800,00, Crítico",
      }),
    ).toBeInTheDocument();
    expect(card()).not.toHaveTextContent("Lance seus próximos meses");
  });

  it("marks every month before the opening, without the lesson, when the opening is past the horizon", async () => {
    show({ status: 200, body: { today: "2026-11-10", days: [] } });
    expect(
      await within(await screen.findByRole("region")).findByRole("button", {
        name: "novembro de 2026: antes do início",
      }),
    ).toBeInTheDocument();
    expect(chips().every((chip) => chip.getAttribute("aria-label")?.endsWith(": antes do início"))).toBe(true);
    expect(card()).not.toHaveTextContent("Lance seus próximos meses");
  });

  it("keeps the chips when a refetch fails", async () => {
    const { client } = show({ status: 200, body: FORECAST });
    await within(await screen.findByRole("region")).findByRole("button", {
      name: /^novembro de 2026: menor saldo .*Crítico$/,
    });
    stubApi({ "GET /api/forecast": { status: 500, body: problem(500, "Erro") } });
    await client.refetchQueries({ queryKey: ["month", "forecast"] });
    await waitFor(() => expect(client.getQueryState(["month", "forecast"])?.status).toBe("error"));
    expect(chips()).toHaveLength(12);
    expect(card()).not.toHaveTextContent("Não foi possível carregar.");
  });

  it("disables the months before the opening date", async () => {
    show({ status: 200, body: FORECAST_LATE_OPENING });
    expect(
      await within(await screen.findByRole("region")).findByRole("button", {
        name: "novembro de 2026: antes do início",
      }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      within(card()).getByRole("button", { name: /^janeiro de 2027: menor saldo .*Confortável$/ }),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("says so when it fails and tries again", async () => {
    const { requests } = show({ status: 500, body: problem(500, "Erro") });
    await userEvent.click(
      await within(await screen.findByRole("region")).findByRole("button", { name: "Tentar de novo" }),
    );
    expect(card()).toHaveTextContent("Não foi possível carregar.");
    expect(forecastCalls(requests).length).toBeGreaterThan(1);
  });
});
