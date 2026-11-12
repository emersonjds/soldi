import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import { problem, SETTINGS, stubApi, YEAR_REPORT } from "@/test/stub-api";

import { defaultYear, period, YearReview } from "./year-review";

type Reply = { status: number; body?: unknown };

const show = (replies: Record<string, Reply> = {}, opening = "2025-01-01") => {
  const requests = stubApi({
    "GET /api/settings": { status: 200, body: { ...SETTINGS, opening_date: opening } },
    "GET /api/reports/year": { status: 200, body: YEAR_REPORT },
    ...replies,
  });
  renderWithQuery(<YearReview />);
  return requests;
};

const year = (rest: Partial<Schemas["YearReport"]>): Reply => ({ status: 200, body: { ...YEAR_REPORT, ...rest } });
const totals = (rest: Partial<Schemas["Totals"]>) => ({ ...YEAR_REPORT.totals, ...rest });
const region = (name: string) => screen.findByRole("region", { name });
const absent = (name: string) => expect(screen.queryByRole("region", { name })).not.toBeInTheDocument();
const asked = (requests: Request[]) =>
  requests
    .filter((request) => request.url.includes("/api/reports/year"))
    .map((request) => new URL(request.url).searchParams.get("year"));

describe("YearReview", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 0, 10, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows only the hero while the year loads", async () => {
    show();
    const answer = globalThis.fetch;
    vi.stubGlobal("fetch", (request: Request) =>
      new URL(request.url).pathname === "/api/reports/year" ? new Promise<Response>(() => undefined) : answer(request),
    );

    expect(screen.getByRole("heading", { level: 1, name: "Meu ano" })).toBeInTheDocument();
    expect(screen.getByText("RETROSPECTIVA")).toBeInTheDocument();
    expect(screen.getByText("O que entrou, o que saiu e para onde foi.")).toBeInTheDocument();
    await screen.findByText("2025");
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByText(/Nada para mostrar/)).not.toBeInTheDocument();
  });

  it("says the year failed and asks again", async () => {
    const requests = show({ "GET /api/reports/year": { status: 500, body: problem(500, "Falhou.") } });

    expect(await screen.findByText("Não foi possível carregar o ano.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

    await waitFor(() => expect(asked(requests)).toHaveLength(2));
  });

  it.each([
    ["no month counted", year({ first_month: null, last_month: null })],
    ["only zeros", year({ totals: totals({ income: "0.00", outflow: "0.00", withdrawn: "0.00" }) })],
  ])("says there is nothing to show with %s", async (_, reply) => {
    show({ "GET /api/reports/year": reply });

    expect(await screen.findByText("Nada para mostrar em 2025.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  it("leaves Meses com mais gastos out of a single month", async () => {
    show({
      "GET /api/reports/year": year({
        first_month: "2025-11",
        last_month: "2025-11",
        top_months: [{ month: "2025-11", spent: "3600.00" }],
      }),
    });

    expect(await region("Resumo do ano")).toHaveTextContent("Novembro de 2025");
    absent("Meses com mais gastos");
  });

  it("splits Saídas over the outflow when it passed the entrada", async () => {
    show({
      "GET /api/reports/year": year({
        totals: totals({ income: "1000.00", outflow: "90000.00", performance: "-89000.00", withdrawn: "0.00" }),
      }),
    });

    const summary = await region("Resumo do ano");
    expect(within(summary).getByRole("img", { name: /^Saídas/ })).toBeInTheDocument();
    expect(summary).toHaveTextContent(/Total: R\$\s90\.000,00/);
    expect(summary).not.toHaveTextContent("Livre restante");
  });

  it("keeps the figures but drops the split and Maiores entradas without income", async () => {
    show({ "GET /api/reports/year": year({ totals: totals({ income: "0.00" }), income: [] }) });

    const summary = await region("Resumo do ano");
    expect(summary).toHaveTextContent(/Entradas\+ R\$\s0,00/);
    expect(summary).toHaveTextContent(/Gastos- R\$\s78\.000,00/);
    expect(within(summary).queryByRole("img")).not.toBeInTheDocument();
    absent("Maiores entradas");
  });

  it("drops No cartão de crédito without card spends", async () => {
    show({ "GET /api/reports/year": year({ card_spent: "0.00", card_pct: "0.0", cards: [] }) });

    await region("Resumo do ano");
    absent("No cartão de crédito");
  });

  it("lists no card when one card holds the figure", async () => {
    show({ "GET /api/reports/year": year({ cards: [YEAR_REPORT.cards[0]] }) });

    const card = await region("No cartão de crédito");
    expect(card).toHaveTextContent("32,5% dos seus gastos no ano");
    expect(card).toHaveTextContent("Pela data da compra, não da fatura.");
    expect(within(card).queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows every card of a full year", async () => {
    show();

    const summary = await region("Resumo do ano");
    expect(summary).toHaveTextContent("Janeiro a dezembro de 2025");
    expect(summary).toHaveTextContent(/Entradas\+ R\$\s1\.234\.567,89/);
    expect(summary).toHaveTextContent(/Gastos- R\$\s78\.000,00/);
    expect(summary).toHaveTextContent(/Para onde foi a entrada do anoTotal: R\$\s1\.234\.567,89/);
    expect(within(summary).getByRole("img", { name: /^Entradas/ })).toBeInTheDocument();

    const months = within(await region("Meses com mais gastos")).getAllByRole("link");
    expect(months).toHaveLength(3);
    expect(months[0]).toHaveAccessibleName(/^1º Março - R\$\s7\.200,00$/);
    expect(months[0]).toHaveAttribute("href", "/para-onde-vai?m=2025-03");
    expect(months[2]).toHaveAccessibleName(/^3º Dezembro - R\$\s3\.600,00$/);
    expect(months[2].querySelector("[style]")).toHaveStyle({ width: "50%" });

    const spending = await region("Onde você mais gastou");
    expect(spending).toHaveTextContent("Por grupo, no ano");
    expect(within(spending).getAllByRole("listitem")).toHaveLength(5);
    expect(within(spending).getAllByRole("listitem")[0]).toHaveTextContent(/Aluguel \(46,2%\)- R\$\s36\.000,00/);
    expect(spending).not.toHaveTextContent("Economia");

    const income = await region("Maiores entradas");
    expect(income).toHaveTextContent("Por categoria, no ano");
    expect(within(income).getAllByRole("listitem")[0]).toHaveTextContent(/Salário \(97,2%\)\+ R\$\s1\.200\.000,00/);

    const card = await region("No cartão de crédito");
    expect(card).toHaveTextContent(/- R\$\s25\.350,00/);
    expect(within(within(card).getByRole("list")).getAllByRole("listitem")[1]).toHaveTextContent(
      /Itaú- R\$\s10\.000,00/,
    );
  });

  it("asks for the year the switcher picks", async () => {
    const requests = show();
    await region("Resumo do ano");

    expect(screen.getByRole("button", { name: "Ano anterior" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Próximo ano" }));

    await waitFor(() => expect(asked(requests)).toEqual(["2025", "2026"]));
  });
});

describe("defaultYear", () => {
  it("looks back at last year in January", () => {
    expect(defaultYear("2026-01-10", 2025)).toBe(2025);
  });

  it("stays on this year in January when the account opened this year", () => {
    expect(defaultYear("2026-01-10", 2026)).toBe(2026);
  });

  it("stays on this year from February", () => {
    expect(defaultYear("2026-02-01", 2020)).toBe(2026);
  });
});

describe("period", () => {
  it("names a single month", () => {
    expect(period("2026-11", "2026-11")).toBe("Novembro de 2026");
  });

  it("names a range", () => {
    expect(period("2026-01", "2026-11")).toBe("Janeiro a novembro de 2026");
  });
});
