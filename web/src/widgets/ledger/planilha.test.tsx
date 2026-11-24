import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { TIER_STYLE } from "@/shared/lib/tier";
import { stubIntersection } from "@/test/intersection";
import { renderWithQuery } from "@/test/render";
import { PLANILHA_MONTH, problem, stubApi } from "@/test/stub-api";

import { Planilha } from "./planilha";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

type Reply = { status: number; body?: unknown };

const show = (replies: Record<string, Reply> = {}, openingDate = "2026-03-10") => {
  const requests = stubApi({ "GET /api/months/2026-11": { status: 200, body: PLANILHA_MONTH }, ...replies });
  const intersection = stubIntersection();
  renderWithQuery(<Planilha today="2026-11-05" openingDate={openingDate} />);
  const months = () => requests.map((request) => new URL(request.url).pathname);
  return { months, reveal: (name: string) => intersection.show(screen.getByRole("table", { name })), intersection };
};

/** The row of `day`'s button and its cells: Data, Entrada, Saída, Diário, Saldo. */
const row = async (name: string) => {
  const tr = (await screen.findByRole("button", { name })).closest("tr");
  if (!tr) throw new Error(`no row for ${name}`);
  return { tr, cells: within(tr).getAllByRole("cell") };
};

describe("Planilha", () => {
  it("lays out Março 2026 to Outubro 2027 and never asks for a month before the opening", async () => {
    const { months, reveal } = show();

    const names = screen.getAllByRole("table").map((table) => table.getAttribute("aria-label"));
    expect(names).toHaveLength(20);
    expect(names[0]).toBe("Março 2026");
    expect(names[8]).toBe("Novembro 2026");
    expect(names.at(-1)).toBe("Outubro 2027");
    expect(months()).toEqual([]);

    for (const name of names) reveal(name ?? "");
    await waitFor(() => expect(months()).toHaveLength(20));
    expect(months().every((path) => path >= "/api/months/2026-03")).toBe(true);
  });

  it("fetches a month only once it comes near the scroller's view, with a same-size skeleton until then", async () => {
    const { months, reveal, intersection } = show();
    const november = screen.getByRole("table", { name: "Novembro 2026" });

    expect(within(november).getByRole("columnheader", { name: "Novembro 2026" })).toBeInTheDocument();
    expect(within(november).getAllByRole("row")).toHaveLength(32);
    expect(intersection.observers[0].options.root).toBe(november.parentElement);

    reveal("Novembro 2026");
    await screen.findByRole("button", { name: "Quinta-feira, 5 de novembro, hoje" });
    expect(months()).toEqual(["/api/months/2026-11"]);
    expect(within(november).getAllByRole("row")).toHaveLength(32);
  });

  it("fills each cell from the month view, blanks zeros and prints money without the symbol", async () => {
    show().reveal("Novembro 2026");

    const monday = await row("Segunda-feira, 2 de novembro");
    expect(monday.cells.map((cell) => cell.textContent)).toEqual(["2", "350,00", "", "", "1.350,00 Confortável"]);
    const tuesday = await row("Terça-feira, 10 de novembro");
    expect(tuesday.cells[2]).toHaveTextContent("1.850,00 inclui conta a pagar");
    expect(tuesday.cells[4]).toHaveTextContent("-1.150,00 Crítico");
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });

  it("colors Saldo by tier, marks the red tiers with a glyph and names every tier for screen readers", async () => {
    show().reveal("Novembro 2026");

    const red = (await row("Terça-feira, 10 de novembro")).cells[4];
    expect(red).toHaveClass(...TIER_STYLE.red.pill.split(" "));
    expect(red.querySelector("svg")).toBeInTheDocument();
    const yellow = (await row("Quinta-feira, 5 de novembro, hoje")).cells[4];
    expect(yellow).toHaveClass(...TIER_STYLE.yellow.pill.split(" "));
    expect(yellow.querySelector("svg")).not.toBeInTheDocument();
    expect(within(yellow).getByText("Apertado")).toHaveClass("sr-only");
  });

  it("marks today, weekends and what is still previsto", async () => {
    show().reveal("Novembro 2026");

    const today = await row("Quinta-feira, 5 de novembro, hoje");
    expect(today.tr).toHaveAttribute("aria-current", "date");
    expect(within(today.cells[0]).getByText("5")).toHaveClass("bg-primary");
    expect(today.cells[2]).toHaveClass("italic");
    expect(today.cells[2]).not.toHaveClass("text-muted-foreground");
    expect(today.cells[4]).toHaveClass("italic");

    const past = await row("Terça-feira, 3 de novembro");
    expect(past.tr).not.toHaveAttribute("aria-current");
    expect(past.cells[2]).not.toHaveClass("italic");
    expect(past.cells[4]).not.toHaveClass("italic");
    expect(past.tr).not.toHaveClass("bg-muted/50");

    expect((await row("Sábado, 7 de novembro")).tr).toHaveClass("bg-muted/50");
    expect((await row("Domingo, 8 de novembro")).tr).toHaveClass("bg-muted/50");

    const future = await row("Terça-feira, 10 de novembro");
    for (const cell of future.cells.slice(1, 4)) expect(cell).toHaveClass("italic", "text-muted-foreground");
    expect(future.cells[4]).toHaveClass("italic");
  });

  it("leaves the days before the opening date blank, Saldo included", async () => {
    const { months, reveal } = show({}, "2026-11-03");
    expect(screen.getAllByRole("table")[0]).toHaveAccessibleName("Novembro 2026");
    reveal("Novembro 2026");

    for (const name of ["Domingo, 1 de novembro", "Segunda-feira, 2 de novembro"]) {
      const { tr, cells } = await row(name);
      expect(cells.slice(1).map((cell) => cell.textContent)).toEqual(["", "", "", ""]);
      expect(tr).toHaveClass("text-muted-foreground");
    }
    expect((await row("Terça-feira, 3 de novembro")).cells[2]).toHaveTextContent("200,00");
    expect(months()).toEqual(["/api/months/2026-11"]);
  });

  it("widens a column for a large value instead of cutting it", async () => {
    const big: Schemas["MonthView"] = {
      ...PLANILHA_MONTH,
      days: PLANILHA_MONTH.days.map((day) => ({ ...day, projected_balance: "1234567.89" })),
    };
    show({ "GET /api/months/2026-11": { status: 200, body: big } }).reveal("Novembro 2026");

    const saldo = (await row("Domingo, 1 de novembro")).cells[4];
    expect(saldo).toHaveTextContent("1.234.567,89");
    expect(saldo).toHaveClass("whitespace-nowrap");
    expect(saldo).not.toHaveClass("truncate");
  });

  it("shows a month's failure inside its block only, and retries that month", async () => {
    const { reveal } = show({ "GET /api/months/2026-12": { status: 500, body: problem(500, "boom") } });
    reveal("Novembro 2026");
    reveal("Dezembro 2026");

    const december = screen.getByRole("table", { name: "Dezembro 2026" });
    expect(await within(december).findByText("Não foi possível carregar Dezembro 2026.")).toBeInTheDocument();
    expect(await row("Quinta-feira, 5 de novembro, hoje")).toBeTruthy();

    stubApi({ "GET /api/months/2026-12": { status: 200, body: { ...PLANILHA_MONTH, month: "2026-12", days: [] } } });
    await userEvent.click(within(december).getByRole("button", { name: "Tentar de novo" }));
    expect(await within(december).findByRole("button", { name: "Quinta-feira, 31 de dezembro" })).toBeInTheDocument();
  });

  it("says a month before the opening has no data, without a retry", async () => {
    const beforeOpening = { ...problem(422, "month before opening"), type: "urn:soldi:error:month-before-opening" };
    show({ "GET /api/months/2026-10": { status: 422, body: beforeOpening } }).reveal("Outubro 2026");

    const october = screen.getByRole("table", { name: "Outubro 2026" });
    expect(await within(october).findByText("Este mês é anterior ao seu saldo inicial.")).toBeInTheDocument();
    expect(within(october).queryByRole("button", { name: "Tentar de novo" })).not.toBeInTheDocument();
  });

  it("keeps the columns and the legend in the sheet's words", () => {
    show();

    const march = screen.getByRole("table", { name: "Março 2026" });
    expect(
      within(march)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Março 2026", "Data", "Entrada", "Saída", "Diário", "Saldo"]);
    expect(screen.getByText("Itálico: previsto")).toBeInTheDocument();
    for (const tier of ["Crítico", "Atenção", "Apertado", "Confortável", "Folga"])
      expect(screen.getByText(tier)).toBeInTheDocument();
  });
});
