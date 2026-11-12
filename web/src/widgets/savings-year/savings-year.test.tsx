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

const section = () => screen.getByRole("region", { name: "Economia do ano" });
const list = async () =>
  within(await screen.findByRole("region", { name: "Economia do ano" })).getByRole("list", { name: "Meses" });
const row = async (name: string) => within(await list()).getByRole("link", { name: new RegExp(`^${name}`) });
const table = async () => within(await screen.findByRole("region", { name: "Economia do ano" })).getByRole("table");
const tableRow = async (name: string) => {
  const found = within(await table())
    .getAllByRole("row")
    .find((each) => each.textContent?.startsWith(name));
  if (!found) throw new Error(`no row ${name}`);
  return found;
};
const text = (element: Element | null) => element?.textContent?.replace(/\s/g, " ");
const asked = (requests: Request[]) =>
  requests
    .filter((request) => request.url.includes("/api/reports/savings"))
    .map((request) => new URL(request.url).searchParams.get("year"));

const month = (key: string, saved: string, rest: Partial<Schemas["SavingsMonth"]> = {}): Schemas["SavingsMonth"] => ({
  month: key,
  income: "100.00",
  deposited: saved.startsWith("-") ? "0.00" : saved,
  withdrawn: saved.startsWith("-") ? saved.slice(1) : "0.00",
  saved,
  rate_pct: "1.0",
  forecast: false,
  ...rest,
});

const year = (months: Schemas["SavingsMonth"][], rest: Partial<Schemas["SavingsYear"]> = {}): Reply => ({
  status: 200,
  body: { ...SAVINGS_YEAR, months, ...rest },
});

const BOUNDS = year(
  ["4.9", "5.0", "15.0", "15.1"].map((rate_pct, index) =>
    month(`2026-${String(11 - index).padStart(2, "0")}`, "1.00", { rate_pct }),
  ),
);

describe("SavingsYear", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("bands the year's title per width with the year switcher", async () => {
    show();

    const hero = await within(await screen.findByRole("region", { name: "Economia do ano" })).findByRole("region", {
      name: "Evolução e Poupança Anual",
    });
    expect(within(hero).getByRole("heading", { level: 2 })).toHaveTextContent("Evolução e Poupança Anual");
    expect(within(hero).getByText("Anual")).toHaveClass("max-lg:hidden");
    expect(hero).toHaveTextContent("PLANEJAMENTO & METAS • Exercício Fiscal");
    expect(within(hero).getByText("• Exercício Fiscal")).toHaveClass("max-lg:hidden");
    expect(
      within(hero).getByText("Acompanhe aportes regulares e a consistência da sua reserva financeira."),
    ).toHaveClass("max-lg:hidden");
    expect(within(hero).getByRole("group", { name: "Ano" })).toHaveTextContent("2026");
  });

  it("sums the year up to today's month with its income and months in the blue", async () => {
    show();
    await list();

    const summary = within(section()).getByRole("region", { name: "Total do ano" });
    expect(within(summary).getByText("TOTAL CONSOLIDADO")).toHaveClass("max-lg:hidden");
    expect(within(summary).getByText("Total Guardado no Ano")).toHaveClass("lg:hidden");
    expect(summary).toHaveTextContent("R$ 5.416,53");
    expect(summary).toHaveTextContent("8,4% das entradas");
    expect(text(within(summary).getByText("Entradas no ano").parentElement)).toBe("Entradas no anoR$ 64.482,80");
    expect(text(within(summary).getByText("Meses no Azul").parentElement)).toBe("Meses no Azul2 / 4");
    expect(text(within(summary).getByText(/^Guardado/))).toBe("Guardado R$ 5.716,53 · Resgatado R$ 300,00");
  });

  it("leaves the Guardado and Resgatado line out of a year without resgates", async () => {
    show({
      "GET /api/reports/savings": year([month("2026-11", "10.00")], {
        deposited_total: "10.00",
        withdrawn_total: "0.00",
        saved_total: "10.00",
      }),
    });
    await list();

    expect(within(section()).getByRole("region", { name: "Total do ano" })).not.toHaveTextContent("Resgatado");
  });

  it("counts the run of saving months up to today's and names the largest aporte", async () => {
    show();
    await list();

    expect(text(within(section()).getByText("Consistência 2026").parentElement)).toBe(
      "Consistência 20261 Mês ConsecutivoConsecutivo ativo",
    );
    expect(text(within(section()).getByText("Maior Aporte Único").parentElement)).toBe(
      "Maior Aporte ÚnicoR$ 4.840,40 (Agosto)",
    );
  });

  it("ends the run at last month while today's has not saved yet", async () => {
    show({
      "GET /api/reports/savings": year([
        month("2026-11", "0.00"),
        month("2026-10", "10.00"),
        month("2026-09", "30.00"),
        month("2026-08", "20.00"),
        month("2026-07", "-5.00"),
        month("2026-06", "40.00"),
      ]),
    });
    await list();

    expect(text(within(section()).getByText("Consistência 2026").parentElement)).toBe(
      "Consistência 20263 Meses ConsecutivosConsecutivos ativos",
    );
    expect(text(within(section()).getByText("Maior Aporte Único").parentElement)).toBe(
      "Maior Aporte ÚnicoR$ 40,00 (Junho)",
    );
  });

  it("drops the tiles and the share pill when nothing was saved", async () => {
    show({
      "GET /api/reports/savings": year([month("2026-11", "0.00"), month("2026-10", "-5.00")], {
        saved_total: "-5.00",
        rate_pct: null,
      }),
    });
    await list();

    expect(within(section()).queryByText(/^Consistência/)).not.toBeInTheDocument();
    expect(within(section()).queryByText("Maior Aporte Único")).not.toBeInTheDocument();
    expect(within(section()).queryByText(/das entradas$/)).not.toBeInTheDocument();
  });

  it("points the share pill down when the year lost savings", async () => {
    show({
      "GET /api/reports/savings": year([month("2026-11", "-5.00", { rate_pct: "-2.5" })], {
        saved_total: "-5.00",
        rate_pct: "-2.5",
      }),
    });
    await list();

    expect(
      within(section())
        .getByText(/das entradas$/)
        .querySelector("svg"),
    ).toHaveClass("lucide-trending-down");
  });

  it("points the share pill up when the year saved", async () => {
    show();
    await list();

    expect(
      within(section())
        .getByText(/das entradas$/)
        .querySelector("svg"),
    ).toHaveClass("lucide-trending-up");
  });

  it("hides the tiles row below 1024 when only the largest aporte is left", async () => {
    show({
      "GET /api/reports/savings": year([
        month("2026-11", "0.00"),
        month("2026-10", "-5.00"),
        month("2026-09", "30.00"),
      ]),
    });
    await list();

    expect(within(section()).queryByText(/^Consistência/)).not.toBeInTheDocument();
    expect(within(section()).getByText("Maior Aporte Único").closest(".grid")).toHaveClass("max-lg:hidden");
  });

  it("keeps the tiles row on mobile while a run is on", async () => {
    show();
    await list();

    expect(within(section()).getByText("Consistência 2026").closest(".grid")).not.toHaveClass("max-lg:hidden");
  });

  it("draws a year holding only forecast months with no run", async () => {
    show({
      "GET /api/reports/savings": year([month("2026-12", "0.00", { income: "3000.00", forecast: true })]),
    });

    expect(within(await list()).queryAllByRole("link")).toHaveLength(0);
    expect(within(section()).getByText("0 meses")).toBeInTheDocument();
    expect(within(section()).queryByText(/^Consistência/)).not.toBeInTheDocument();
  });

  it("shows a year whose resgates matched its deposits, with no income", async () => {
    show({
      "GET /api/reports/savings": year([
        month("2026-11", "0.00", { income: "0.00", rate_pct: null, deposited: "500.00", withdrawn: "500.00" }),
      ]),
    });

    expect(await row("Novembro de 2026")).toHaveTextContent("Resgatado R$ 500,00");
  });

  it("keeps the band for an older account with nothing yet this year and reaches past years", async () => {
    const requests = show(
      {
        "GET /api/reports/savings": year([month("2026-11", "0.00", { income: "0.00", rate_pct: null })]),
        "GET /api/reports/savings?year=2025": year([month("2025-11", "50.00")], { year: 2025 }),
      },
      "2025-03-01",
    );

    expect(await screen.findByText("Nada para mostrar em 2026.")).toBeInTheDocument();
    const previous = within(section()).getByRole("button", { name: "Ano anterior" });
    await waitFor(() => expect(previous).toBeEnabled());
    await userEvent.click(previous);

    expect(await row("Novembro de 2025")).toBeInTheDocument();
    expect(asked(requests)).toEqual(["2026", "2025"]);
  });

  it("keeps the shown year's labels while the next year loads", async () => {
    show({}, "2025-03-01");
    const answer = globalThis.fetch;
    vi.stubGlobal("fetch", (request: Request) =>
      new URL(request.url).searchParams.get("year") === "2025"
        ? new Promise<Response>(() => undefined)
        : answer(request),
    );

    await row("Novembro de 2026");
    const previous = within(section()).getByRole("button", { name: "Ano anterior" });
    await waitFor(() => expect(previous).toBeEnabled());
    await userEvent.click(previous);

    expect(within(section()).getByRole("group", { name: "Ano" })).toHaveTextContent("2025");
    expect(within(section()).getByText("Consistência 2026")).toBeInTheDocument();
  });

  it("tables the months ascending with today's marked, its pencil and the forecast after it", async () => {
    show();

    const rows = within(await table()).getAllByRole("row");
    expect(rows.map((each) => each.firstElementChild?.textContent?.replace("MÊS ATUAL", ""))).toEqual([
      "MÊS",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ]);
    const november = await tableRow("Novembro");
    expect(november).toHaveTextContent("MÊS ATUAL");
    expect(november).toHaveTextContent("Em andamento (fechamento em 25 dias)");
    expect(
      within(november).getByRole("link", { name: /^Ajustar o guardado de Novembro: R\$\s776,13$/ }),
    ).toHaveAttribute("href", "/para-onde-vai?m=2026-11&g=economia");
    const december = await tableRow("Dezembro");
    expect(text(december)).toContain("R$ 3.000,00(Previsto)");
    expect(december).toHaveTextContent("Previsto");
    expect(within(december).getByText("previsto").previousElementSibling).toHaveClass("bg-muted-foreground/40");
    expect(within(december).queryByRole("link")).not.toBeInTheDocument();
    expect(
      within(await table())
        .getAllByRole("columnheader")
        .map((each) => each.textContent),
    ).toEqual(["MÊS", "ENTRADAS", "GUARDADO", "RESGATADO", "% GUARDADO", "STATUS / OBSERVAÇÃO", "AÇÃO"]);
    expect(text(await tableRow("Agosto"))).toContain("R$ 53.982,80R$ 4.840,40—faixa alta15,1%");
    const october = await tableRow("Outubro");
    expect(text(october)).toContain("R$ 4.000,00R$ 100,00- R$ 300,00faixa baixa-5,0%");
    expect(within(october).getByText("- R$ 300,00")).toHaveClass("text-expense-text");
    expect(within(october).getByText("faixa baixa").previousElementSibling).toHaveClass("bg-tier-red");
    expect(within(await tableRow("Setembro")).getAllByText("—")).toHaveLength(2);
  });

  it("says Fecha hoje on the month's last day", async () => {
    vi.setSystemTime(new Date(2026, 10, 30, 12));
    show();

    expect(await tableRow("Novembro")).toHaveTextContent("Fecha hoje");
  });

  it("opens a month on Mês from its row menu", async () => {
    show();

    await userEvent.click(within(await tableRow("Outubro")).getByRole("button", { name: "Ações de Outubro" }));
    expect(await screen.findByRole("menuitem", { name: "Abrir no Mês" })).toHaveAttribute("href", "/mes?m=2026-10");
  });

  it("exports the table as a pt-BR CSV", async () => {
    const created = vi.fn((_blob: Blob | MediaSource) => "blob:soldi");
    URL.createObjectURL = created;
    URL.revokeObjectURL = vi.fn();
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    show();

    await list();
    await userEvent.click(within(section()).getByRole("button", { name: "Exportar" }));

    expect(downloads).toEqual(["soldi-economia-2026.csv"]);
    const blob = created.mock.calls[0][0];
    if (!(blob instanceof Blob)) throw new Error("no blob");
    expect(new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()))).toBe(
      [
        "Mês;Entradas;Guardado;Resgatado;% Guardado;Situação",
        "2026-08;53982,80;4840,40;0,00;15,1;",
        "2026-09;0,00;0,00;0,00;;",
        "2026-10;4000,00;100,00;300,00;-5,0;",
        "2026-11;6500,00;776,13;0,00;11,9;Atual",
        "2026-12;3000,00;0,00;0,00;0,0;Previsto",
        "",
      ].join("\r\n"),
    );
  });

  it("lists the months newest first on mobile, today's tinted with its pencil, each other opening on Mês", async () => {
    show();

    const links = within(await list()).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("aria-label")?.replace(/\s/g, " "))).toEqual([
      "Novembro de 2026: guardou R$ 776,13, 11,9% das entradas, faixa média, ajustar",
      "Outubro de 2026: guardou R$ 100,00, resgatou R$ 300,00, -5,0% das entradas, faixa baixa",
      "Setembro de 2026: guardou R$ 0,00, sem entradas",
      "Agosto de 2026: guardou R$ 4.840,40, 15,1% das entradas, faixa alta",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/para-onde-vai?m=2026-11&g=economia",
      "/mes?m=2026-10",
      "/mes?m=2026-09",
      "/mes?m=2026-08",
    ]);
    const november = await row("Novembro");
    expect(november).toHaveAttribute("aria-current", "date");
    expect(november).toHaveClass("bg-primary/5");
    expect(november).toHaveTextContent("NovembroAtualEntradas: R$ 6.500,00R$ 776,13faixa média11,9%");
    expect(await row("Agosto")).not.toHaveAttribute("aria-current");
    expect(text(await row("Outubro"))).toContain("R$ 100,00Resgatado R$ 300,00faixa baixa-5,0%");
    expect(await row("Agosto")).not.toHaveTextContent("Resgatado");
    expect(within(section()).getByText("4 meses")).toHaveClass("lg:hidden");
    expect(within(section()).getByText("5 registros")).toHaveClass("max-lg:hidden");
    expect(section()).toHaveTextContent("< 5%5% – 15%> 15%");
  });

  it("colors the dot red below 5%, amber from 5% to 15%, green above", async () => {
    show({ "GET /api/reports/savings": BOUNDS });

    const dot = async (name: string, word: string) => within(await row(name)).getByText(word).previousElementSibling;
    expect(await dot("Novembro", "faixa baixa")).toHaveClass("bg-tier-red");
    expect(await dot("Outubro", "faixa média")).toHaveClass("bg-tier-yellow");
    expect(await dot("Setembro", "faixa média")).toHaveClass("bg-tier-yellow");
    expect(await dot("Agosto", "faixa alta")).toHaveClass("bg-tier-green");
  });

  it("goes back to an earlier year down to the opening one, and says when it holds nothing", async () => {
    const requests = show(
      {
        "GET /api/reports/savings?year=2025": year([month("2025-11", "0.00", { income: "0.00" })], { year: 2025 }),
      },
      "2025-03-01",
    );

    await row("Novembro de 2026");
    const previous = within(section()).getByRole("button", { name: "Ano anterior" });
    await waitFor(() => expect(previous).toBeEnabled());
    expect(within(section()).getByRole("button", { name: "Próximo ano" })).toBeDisabled();
    await userEvent.click(previous);

    expect(await within(section()).findByText("Nada para mostrar em 2025.")).toBeInTheDocument();
    expect(previous).toBeDisabled();
    expect(within(section()).getByRole("button", { name: "Próximo ano" })).toBeEnabled();
    expect(asked(requests)).toEqual(["2026", "2025"]);
  });

  it("marks no month as current in an earlier year", async () => {
    show(
      {
        "GET /api/reports/savings?year=2025": year([month("2025-12", "0.00"), month("2025-11", "50.00")], {
          year: 2025,
        }),
      },
      "2025-03-01",
    );

    await row("Novembro de 2026");
    const previous = within(section()).getByRole("button", { name: "Ano anterior" });
    await waitFor(() => expect(previous).toBeEnabled());
    await userEvent.click(previous);

    expect(await row("Novembro de 2025")).toHaveAttribute("href", "/mes?m=2025-11");
    expect(within(section()).queryByText("MÊS ATUAL")).not.toBeInTheDocument();
    expect(within(section()).getByText("Consistência 2025").parentElement).toHaveTextContent("1 Mês");
  });

  it("shows no section for a fresh account", async () => {
    const requests = show({
      "GET /api/reports/savings": year([month("2026-11", "0.00", { income: "0.00", rate_pct: null })]),
    });

    await waitFor(() => expect(asked(requests)).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("region", { name: "Economia do ano" })).not.toBeInTheDocument();
  });

  it("renders nothing while loading", () => {
    show();
    expect(screen.queryByRole("region", { name: "Economia do ano" })).not.toBeInTheDocument();
  });

  it("says so when it fails and tries again", async () => {
    const requests = show({ "GET /api/reports/savings": { status: 500, body: problem(500, "Erro") } });

    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));
    expect(section()).toHaveTextContent("Não foi possível carregar o ano.");
    await waitFor(() => expect(asked(requests)).toHaveLength(2));
  });
});
