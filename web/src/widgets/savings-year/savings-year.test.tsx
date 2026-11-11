import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import { problem, SAVINGS_YEAR, SETTINGS, stubApi } from "@/test/stub-api";

import { SavingsYear } from "./savings-year";

type Reply = { status: number; body?: unknown };

const show = (replies: Record<string, Reply> = {}, opening = SETTINGS.opening_date) => {
  const requests = stubApi({
    "GET /api/settings": { status: 200, body: { ...SETTINGS, opening_date: opening } },
    "GET /api/reports/savings": { status: 200, body: SAVINGS_YEAR },
    ...replies,
  });
  renderWithQuery(<SavingsYear />);
  return requests;
};

const card = () => screen.getByRole("region", { name: "Economia do ano" });
const row = (name: string) => within(card()).findByRole("link", { name: new RegExp(`^${name}`) });
const asked = (requests: Request[]) =>
  requests
    .filter((request) => request.url.includes("/api/reports/savings"))
    .map((request) => new URL(request.url).searchParams.get("year"));

const BOUNDS: Schemas["SavingsYear"] = {
  ...SAVINGS_YEAR,
  months: ["4.9", "5.0", "15.0", "15.1"].map((rate_pct, index) => ({
    month: `2026-${String(11 - index).padStart(2, "0")}`,
    income: "100.00",
    saved: "1.00",
    rate_pct,
  })),
};

describe("SavingsYear", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sums the year and lists its months newest first, each opening that month on Mês", async () => {
    show();

    const links = await within(card()).findAllByRole("link");
    expect(links.map((link) => link.getAttribute("aria-label")?.replace(/\s/g, " "))).toEqual([
      "Novembro de 2026: guardou R$ 776,13, 11,9% das entradas",
      "Outubro de 2026: guardou -R$ 200,00, -5,0% das entradas",
      "Setembro de 2026: guardou R$ 0,00, sem entradas",
      "Agosto de 2026: guardou R$ 4.840,40, 15,1% das entradas",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/mes?m=2026-11",
      "/mes?m=2026-10",
      "/mes?m=2026-09",
      "/mes?m=2026-08",
    ]);
    expect(card()).toHaveTextContent("Guardado em 2026R$ 5.416,53");
    expect(within(card()).getByText("8,4% das entradas")).toBeInTheDocument();
    expect(card()).toHaveTextContent("< 5%5% a 15%> 15%");

    const november = await row("Novembro");
    expect(november).toHaveTextContent("NovembroAtualEntradas: R$ 6.500,00R$ 776,13faixa média11,9%");
    expect(await row("Agosto")).toHaveTextContent("Entradas: R$ 53.982,80");
    expect(within(await row("Agosto")).queryByText("Atual")).not.toBeInTheDocument();
  });

  it("shows a minus and a red dot on a month that took out more than it saved", async () => {
    show();

    const october = await row("Outubro");
    expect(within(october).getByText("-R$ 200,00")).toHaveClass("text-expense");
    expect(within(october).getByText("faixa baixa").previousElementSibling).toHaveClass("bg-tier-red");
  });

  it("prints a dash and no dot for a month without income", async () => {
    show();

    const september = await row("Setembro");
    expect(within(september).getByText("—")).toBeInTheDocument();
    expect(within(september).queryByText(/^faixa/)).not.toBeInTheDocument();
  });

  it("colors the dot red below 5%, amber from 5% to 15%, green above", async () => {
    show({ "GET /api/reports/savings": { status: 200, body: BOUNDS } });

    const dot = async (name: string, word: string) => within(await row(name)).getByText(word).previousElementSibling;
    expect(await dot("Novembro", "faixa baixa")).toHaveClass("bg-tier-red");
    expect(await dot("Outubro", "faixa média")).toHaveClass("bg-tier-yellow");
    expect(await dot("Setembro", "faixa média")).toHaveClass("bg-tier-yellow");
    expect(await dot("Agosto", "faixa alta")).toHaveClass("bg-tier-green");
  });

  it("stays between the opening year and this year", async () => {
    show();

    await row("Novembro");
    expect(within(card()).getByText("2026")).toBeInTheDocument();
    await waitFor(() => expect(within(card()).getByRole("button", { name: "Ano anterior" })).toBeDisabled());
    expect(within(card()).getByRole("button", { name: "Próximo ano" })).toBeDisabled();
  });

  it("goes back to an earlier year down to the opening one", async () => {
    const requests = show(
      {
        "GET /api/reports/savings?year=2025": {
          status: 200,
          body: { ...SAVINGS_YEAR, year: 2025, months: [{ ...SAVINGS_YEAR.months[0], month: "2025-11" }] },
        },
      },
      "2025-03-01",
    );

    await row("Novembro de 2026");
    const previous = within(card()).getByRole("button", { name: "Ano anterior" });
    await waitFor(() => expect(previous).toBeEnabled());
    await userEvent.click(previous);

    expect(await row("Novembro de 2025")).toHaveAttribute("href", "/mes?m=2025-11");
    expect(within(await row("Novembro de 2025")).queryByText("Atual")).not.toBeInTheDocument();
    expect(card()).toHaveTextContent("Guardado em 2025");
    expect(previous).toBeDisabled();
    expect(within(card()).getByRole("button", { name: "Próximo ano" })).toBeEnabled();
    expect(asked(requests)).toEqual(["2026", "2025"]);
  });

  it("hides the share pill when the year had no income", async () => {
    show({
      "GET /api/reports/savings": {
        status: 200,
        body: { ...SAVINGS_YEAR, income_total: "0.00", saved_total: "0.00", rate_pct: null },
      },
    });

    await row("Novembro");
    expect(card()).toHaveTextContent("Guardado em 2026R$ 0,00");
    expect(within(card()).queryByText(/das entradas$/)).not.toBeInTheDocument();
  });

  it("says so when the year has no months", async () => {
    show({ "GET /api/reports/savings": { status: 200, body: { ...SAVINGS_YEAR, months: [] } } });

    expect(await within(card()).findByText("Nada para mostrar em 2026.")).toBeInTheDocument();
    expect(within(card()).queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows six row skeletons while loading", () => {
    show();
    expect(within(card()).getAllByTestId("row-skeleton")).toHaveLength(6);
  });

  it("says so when it fails and tries again", async () => {
    const requests = show({ "GET /api/reports/savings": { status: 500, body: problem(500, "Erro") } });

    await userEvent.click(await within(card()).findByRole("button", { name: "Tentar de novo" }));
    expect(card()).toHaveTextContent("Não foi possível carregar o ano.");
    await waitFor(() => expect(asked(requests)).toHaveLength(2));
  });
});
