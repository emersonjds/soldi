import { useLayoutEffect } from "react";

import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { TIER_STYLE } from "@/shared/lib/tier";
import { stubIntersection } from "@/test/intersection";
import { renderWithQuery } from "@/test/render";
import { PLANILHA_MONTH, problem, SETTINGS, stubApi } from "@/test/stub-api";

import { Planilha, PlanilhaView } from "./planilha";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

type Reply = { status: number; body?: unknown };

const show = (replies: Record<string, Reply> = {}, openingDate = "2026-03-10") => {
  const requests = stubApi({ "GET /api/months/2026-11": { status: 200, body: PLANILHA_MONTH }, ...replies });
  const intersection = stubIntersection();
  renderWithQuery(<Planilha today="2026-11-05" openingDate={openingDate} />);
  const months = () =>
    requests.flatMap(({ url }) => (new URL(url).pathname.startsWith("/api/months/") ? [new URL(url).pathname] : []));
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
    expect(within(screen.getByRole("table", { name: "Novembro 2026" })).queryByText(/R\$/)).not.toBeInTheDocument();
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

  it("looks ahead by the table's own width on each side", () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this instanceof HTMLTableElement ? 400 : 0;
    });

    const { intersection } = show();

    expect(intersection.observers[0].options.rootMargin).toBe("0px 400px");
  });

  it("names a day of another year with its year", async () => {
    show({
      "GET /api/months/2027-01": { status: 200, body: { ...PLANILHA_MONTH, month: "2027-01", days: [] } },
    }).reveal("Janeiro 2027");

    expect(await screen.findByRole("button", { name: "Sexta-feira, 1 de janeiro de 2027" })).toBeInTheDocument();
  });
});

describe("Planilha keyboard", () => {
  const empty = (month: string): Reply => ({ status: 200, body: { ...PLANILHA_MONTH, month, days: [] } });
  const stops = () =>
    screen
      .getAllByRole("button")
      .filter((button) => button.tabIndex === 0)
      .map((button) => button.getAttribute("aria-label"));
  const day = (name: string) => screen.getByRole("button", { name });
  const focus = (name: string) => act(() => day(name).focus());

  it("gives each loaded month one tab stop, today in today's month and day 1 elsewhere, and Tab leaves the table", async () => {
    const { reveal } = show({ "GET /api/months/2026-12": empty("2026-12") });
    reveal("Novembro 2026");
    reveal("Dezembro 2026");
    await screen.findByRole("button", { name: "Terça-feira, 1 de dezembro" });
    await screen.findByRole("button", { name: "Quinta-feira, 5 de novembro, hoje" });

    expect(stops()).toEqual(["Quinta-feira, 5 de novembro, hoje", "Terça-feira, 1 de dezembro"]);

    focus("Quinta-feira, 5 de novembro, hoje");
    await userEvent.tab();
    expect(day("Terça-feira, 1 de dezembro")).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(day("Quinta-feira, 5 de novembro, hoje")).toHaveFocus();
  });

  it("moves with ↑ ↓ Home End inside the month, and the tab stop follows the focus", async () => {
    show().reveal("Novembro 2026");
    await screen.findByRole("button", { name: "Quinta-feira, 5 de novembro, hoje" });
    focus("Quinta-feira, 5 de novembro, hoje");

    await userEvent.keyboard("{ArrowDown}");
    expect(day("Sexta-feira, 6 de novembro")).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(day("Quarta-feira, 4 de novembro")).toHaveFocus();
    await userEvent.keyboard("{Home}{ArrowUp}");
    expect(day("Domingo, 1 de novembro")).toHaveFocus();
    await userEvent.keyboard("{End}{ArrowDown}");
    expect(day("Segunda-feira, 30 de novembro")).toHaveFocus();
    expect(stops()).toEqual(["Segunda-feira, 30 de novembro"]);
  });

  it("goes to the same day of the next month with →, clamped to its last day and scrolled into view, and back with ←", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    const { reveal } = show({
      "GET /api/months/2027-01": empty("2027-01"),
      "GET /api/months/2027-02": empty("2027-02"),
    });
    reveal("Janeiro 2027");
    reveal("Fevereiro 2027");
    await screen.findByRole("button", { name: "Domingo, 28 de fevereiro de 2027" });
    focus("Domingo, 31 de janeiro de 2027");

    await userEvent.keyboard("{ArrowRight}");

    expect(day("Domingo, 28 de fevereiro de 2027")).toHaveFocus();
    expect(scroll).toHaveBeenLastCalledWith({ block: "nearest", inline: "start" });
    expect(scroll.mock.contexts.at(-1)).toBe(day("Domingo, 28 de fevereiro de 2027"));
    await userEvent.keyboard("{ArrowLeft}");
    expect(day("Quinta-feira, 28 de janeiro de 2027")).toHaveFocus();
  });

  it("keeps the focus where it is when the next month has not loaded yet", async () => {
    show().reveal("Novembro 2026");
    await screen.findByRole("button", { name: "Quinta-feira, 5 de novembro, hoje" });
    focus("Quinta-feira, 5 de novembro, hoje");

    await userEvent.keyboard("{ArrowRight}{ArrowLeft}");

    expect(day("Quinta-feira, 5 de novembro, hoje")).toHaveFocus();
  });

  it("opens the day's detail with Space", async () => {
    show().reveal("Novembro 2026");
    await screen.findByRole("button", { name: "Quinta-feira, 5 de novembro, hoje" });
    focus("Quinta-feira, 5 de novembro, hoje");

    await userEvent.keyboard(" ");

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

describe("Planilha position and Ir pra hoje", () => {
  const ROW = 44;
  const HEIGHT = 220;
  const TABLE = 400;
  /** Each table `TABLE` wide in a row, each row `ROW` tall, the scroller `HEIGHT` tall. */
  const layout = () => {
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
      return this instanceof HTMLTableElement ? [...document.querySelectorAll("table")].indexOf(this) * TABLE : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
      return this instanceof HTMLTableRowElement ? this.sectionRowIndex * ROW : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(ROW);
    vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(HEIGHT);
    return vi.spyOn(Element.prototype, "scrollTo");
  };
  const place = (month: string, extra: Record<string, unknown> = {}) => {
    const scrollTo = layout();
    stubApi({ "GET /api/months/2026-11": { status: 200, body: PLANILHA_MONTH } });
    const intersection = stubIntersection();
    const ui = (shown: string) => <Planilha today="2026-11-05" openingDate="2026-03-10" month={shown} {...extra} />;
    const { client, rerender } = renderWithQuery(ui(month));
    const scroller = () => screen.getAllByRole("table")[0].parentElement as HTMLElement;
    const last = () => ({ to: scrollTo.mock.lastCall?.[0], on: scrollTo.mock.contexts.at(-1) });
    return {
      scrollTo,
      scroller,
      last,
      intersection,
      change: (next: string) => rerender(<QueryClientProvider client={client}>{ui(next)}</QueryClientProvider>),
    };
  };
  /** Today's row centered: 4 rows down, minus half the scroller less a row. */
  const TODAY_TOP = 4 * ROW - (HEIGHT - ROW) / 2;
  const goToday = () => screen.getByText("Ir pra hoje").closest("button") as HTMLElement;
  const rect = (top: number) => ({ top, bottom: top + ROW, left: 0, right: 100 }) as DOMRect;

  afterEach(() => window.history.replaceState(null, "", "/"));

  it("opens at m, today's month at the start and today's row centered (A12)", () => {
    const { last, scroller } = place("2026-11");

    expect(last().to).toEqual({ left: 8 * TABLE, top: TODAY_TOP, behavior: "auto" });
    expect(last().on).toBe(scroller());
    expect(screen.getByText("Valores em R$ · Toque num dia para ver o detalhe.")).toBeInTheDocument();
  });

  it("opens another month at its first day, and m outside the range at the nearest end", () => {
    expect(place("2027-02").last().to).toEqual({ left: 11 * TABLE, top: 0, behavior: "auto" });
    cleanup();
    expect(place("2025-01").last().to).toEqual({ left: 0, top: 0, behavior: "auto" });
    cleanup();
    expect(place("2028-05").last().to).toEqual({ left: 19 * TABLE, top: 0, behavior: "auto" });
  });

  it("follows a change of m, and scrolling the planilha leaves m alone (A12)", () => {
    const { last, change, scroller, scrollTo } = place("2026-11");
    const address = window.location.href;

    change("2027-02");
    expect(last().to).toEqual({ left: 11 * TABLE, top: 0, behavior: "auto" });
    const calls = scrollTo.mock.calls.length;
    change("2027-02");
    expect(scrollTo.mock.calls).toHaveLength(calls);

    fireEvent.scroll(scroller());
    expect(window.location.href).toBe(address);
  });

  it("hides Ir pra hoje, keeping its space, while today's row is in view in today's month (A11)", async () => {
    const { scroller, intersection } = place("2026-11");
    intersection.show(screen.getByRole("table", { name: "Novembro 2026" }));
    const today = await screen.findByRole("button", { name: "Quinta-feira, 5 de novembro, hoje" });
    const cell = today.closest("td");
    let todayTop = 100;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this === scroller()) return { top: 0, bottom: HEIGHT, left: 0, right: TABLE } as DOMRect;
      return this === cell ? rect(todayTop) : rect(0);
    });

    expect(goToday()).toHaveClass("invisible");
    expect(goToday()).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button", { name: "Ir pra hoje" })).not.toBeInTheDocument();

    todayTop = HEIGHT - ROW / 2;
    fireEvent.scroll(scroller());
    expect(screen.getByRole("button", { name: "Ir pra hoje" })).not.toHaveClass("invisible");

    todayTop = 100;
    fireEvent.scroll(scroller());
    expect(goToday()).toHaveClass("invisible");
  });

  it("shows Ir pra hoje when m is another month; it sets m to today's, scrolls today's row to the center and focuses it (A11)", async () => {
    const { last, scroller, intersection } = place("2027-02");
    intersection.show(screen.getByRole("table", { name: "Novembro 2026" }));
    const today = await screen.findByRole("button", { name: "Quinta-feira, 5 de novembro, hoje" });

    await userEvent.click(screen.getByRole("button", { name: "Ir pra hoje" }));

    expect(window.location.search).toBe("?m=2026-11");
    expect(last().to).toEqual({ left: 8 * TABLE, top: TODAY_TOP, behavior: "smooth" });
    expect(last().on).toBe(scroller());
    expect(today).toHaveFocus();
    expect(screen.getByRole("button", { name: "Ir pra hoje" })).toHaveClass("min-h-11");
  });

  it("jumps to today without the smooth scroll when the person asks for reduced motion", async () => {
    const { last } = place("2027-02");
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) => ({ matches: query === "(prefers-reduced-motion: reduce)" }) as MediaQueryList,
    );

    await userEvent.click(screen.getByRole("button", { name: "Ir pra hoje" }));

    expect(last().to).toEqual({ left: 8 * TABLE, top: TODAY_TOP, behavior: "auto" });
  });

  it("focuses today once its month loads when Ir pra hoje beat it", async () => {
    const { intersection } = place("2027-02");

    await userEvent.click(screen.getByRole("button", { name: "Ir pra hoje" }));
    intersection.show(screen.getByRole("table", { name: "Novembro 2026" }));

    expect(await screen.findByRole("button", { name: "Quinta-feira, 5 de novembro, hoje" })).toHaveFocus();
  });

  it("places the planilha before the observers first look, so the months at the start are not fetched", () => {
    const scrollTo = layout();
    stubApi({});
    stubIntersection();
    let placed = -1;
    const Probe = () => {
      useLayoutEffect(() => {
        placed = scrollTo.mock.calls.length;
      });
      return null;
    };

    renderWithQuery(
      <>
        <Planilha today="2026-11-05" openingDate="2026-03-10" month="2026-11" />
        <Probe />
      </>,
    );

    expect(placed).toBe(1);
  });

  it("watches each month once, across renders", () => {
    const { change, intersection } = place("2026-11");
    expect(intersection.observers).toHaveLength(20);

    change("2027-02");

    expect(intersection.observers).toHaveLength(20);
  });
});

describe("Planilha jump to a day (A14)", () => {
  const render = (highlight: string | null) => {
    stubApi({ "GET /api/months/2026-11": { status: 200, body: PLANILHA_MONTH } });
    const intersection = stubIntersection();
    const ui = (day: string | null) => <Planilha today="2026-11-05" openingDate="2026-03-10" highlight={day} />;
    const { client, rerender } = renderWithQuery(ui(highlight));
    return {
      reveal: () => intersection.show(screen.getByRole("table", { name: "Novembro 2026" })),
      ring: (day: string | null) => rerender(<QueryClientProvider client={client}>{ui(day)}</QueryClientProvider>),
    };
  };
  const tbody = () => screen.getByRole("table", { name: "Novembro 2026" }).querySelectorAll("tbody")[0];

  it("scrolls to the day on both axes, focuses it and rings it", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    const { reveal, ring } = render(null);
    reveal();
    const day = await screen.findByRole("button", { name: "Segunda-feira, 23 de novembro" });

    ring("2026-11-23");

    expect(scroll).toHaveBeenLastCalledWith({ block: "center", inline: "start" });
    expect(scroll.mock.contexts.at(-1)).toBe(day.closest("tr"));
    expect(day).toHaveFocus();
    expect(day).toHaveClass("ring-expense", "ring-2");
    ring(null);
    expect(day).not.toHaveClass("ring-2");
  });

  it("scrolls to the day's skeleton row while its month loads, and focuses the day once it shows", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    const { reveal } = render("2026-11-23");
    expect(scroll.mock.contexts.at(-1)).toBe(tbody().rows[22]);
    expect(tbody()).toHaveAttribute("aria-busy", "true");

    reveal();

    const day = await screen.findByRole("button", { name: "Segunda-feira, 23 de novembro" });
    expect(day).toHaveFocus();
    expect(day).toHaveClass("ring-expense");
  });

  it("leaves the focus where the person moved it while the day's month loaded", async () => {
    stubApi({ "GET /api/months/2026-11": { status: 200, body: PLANILHA_MONTH } });
    const intersection = stubIntersection();
    renderWithQuery(
      <>
        <button type="button">Fora</button>
        <Planilha today="2026-11-05" openingDate="2026-03-10" highlight="2026-11-23" />
      </>,
    );
    act(() => screen.getByRole("button", { name: "Fora" }).focus());

    intersection.show(screen.getByRole("table", { name: "Novembro 2026" }));

    const day = await screen.findByRole("button", { name: "Segunda-feira, 23 de novembro" });
    expect(day).toHaveClass("ring-expense");
    expect(screen.getByRole("button", { name: "Fora" })).toHaveFocus();
  });
});

describe("PlanilhaView", () => {
  it("shows the toolbar and a skeleton while the settings load", () => {
    stubApi({});
    vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
    renderWithQuery(<PlanilhaView month="2026-11" />);

    expect(screen.getByText("Valores em R$ · Toque num dia para ver o detalhe.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Carregando");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says the planilha could not load when the settings fail, and retries", async () => {
    const requests = stubApi({ "GET /api/settings": { status: 500, body: problem(500, "Erro") } });
    renderWithQuery(<PlanilhaView month="2026-11" />);

    expect(await screen.findByText("Não foi possível carregar a planilha.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(requests.filter(({ url }) => url.endsWith("/api/settings"))).toHaveLength(2));
  });

  it("lays out the months from the opening date in the settings", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
    stubApi({ "GET /api/settings": { status: 200, body: SETTINGS } });
    renderWithQuery(<PlanilhaView month="2026-11" />);

    expect(await screen.findAllByRole("table")).toHaveLength(12);
    expect(screen.getAllByRole("table")[0]).toHaveAccessibleName("Novembro 2026");
    vi.useRealTimers();
  });
});
