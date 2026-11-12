import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import { ALUGUEL, ECONOMIA, MERCADO, RESERVA, SALARIO, stubApi, VIAGEM, WITH_COFRINHOS } from "@/test/stub-api";

import { CategoryBreakdown } from "./category-breakdown";

const share = (
  { id, name, icon, color, kind, parent_id }: Schemas["Category"],
  amount: string,
  pct: string,
  delta_pct: string | null = null,
): Schemas["CategoryShare"] => ({
  category_id: id,
  name,
  icon,
  color,
  kind,
  parent_id,
  amount,
  pct,
  previous_amount: "0.00",
  delta_pct,
});

const group = (
  { id, name, icon, color, kind }: Schemas["Category"],
  amount: string,
  pct: string,
  delta_pct: string | null,
  children: string[] = [],
): Schemas["CategoryGroup"] => ({
  category_id: id,
  name,
  icon,
  color,
  kind,
  amount,
  pct,
  previous_amount: "0.00",
  delta_pct,
  children,
});

/** Economia holds 1.000,10 in Reserva, 250,20 in Viagem and 149,70 of its own: 1.400,00. */
const REPORT: Schemas["CategoryReport"] = {
  month: "2026-11",
  outflow_total: "13584.31",
  income_total: "500.00",
  outflow: [
    share(ALUGUEL, "12000.00", "88.3", "-6.0"),
    share(RESERVA, "1000.10", "7.4"),
    share(VIAGEM, "250.20", "1.8", "10.0"),
    share(MERCADO, "184.31", "1.4"),
    share(ECONOMIA, "149.70", "1.1"),
  ],
  income: [share(SALARIO, "500.00", "100.0")],
  groups: [
    group(ALUGUEL, "12000.00", "88.3", "-6.0"),
    group(ECONOMIA, "1400.00", "10.3", "5.0", [RESERVA.id, VIAGEM.id]),
    group(MERCADO, "184.31", "1.4", null),
    group(SALARIO, "500.00", "100.0", null),
  ],
};

const entry = (
  id: string,
  category: Schemas["Category"],
  amount: string,
  note: string | null,
  date = "2026-11-05",
  series: Schemas["Transaction"]["series"] = null,
): Schemas["Transaction"] => ({ id, date, amount, kind: category.kind, note, category, series });

const ENTRIES = [
  entry("t1", RESERVA, "1000.10", "Aporte reserva"),
  entry("t2", VIAGEM, "250.20", "Aporte viagem", "2026-11-20", {
    id: "s1",
    position: 3,
    total: 12,
    last_date: "2027-08-20",
  }),
  entry("t3", ECONOMIA, "149.70", null),
  entry("t4", ALUGUEL, "12000.00", "Aluguel de novembro"),
  entry("t5", MERCADO, "184.31", "Compras da semana"),
];

const LAST_MONTH = [
  entry("p1", RESERVA, "900.00", "Aporte antigo", "2026-10-28"),
  entry("p2", ECONOMIA, "100.00", "Sobra de outubro", "2026-10-20"),
  entry("p3", MERCADO, "90.00", "Feira de outubro", "2026-10-18"),
  entry("p4", VIAGEM, "80.00", "Passagem", "2026-10-10"),
  entry("p5", RESERVA, "70.00", "Quarto aporte", "2026-10-02"),
];

const show = ({ month = "2026-11", report = REPORT, categories = WITH_COFRINHOS, group = "" } = {}) => {
  const requests = stubApi({
    "GET /api/reports/categories": { status: 200, body: report },
    "GET /api/transactions": { status: 200, body: ENTRIES },
    "GET /api/transactions?month=2026-10": { status: 200, body: LAST_MONTH },
    "GET /api/categories": { status: 200, body: categories },
  });
  renderWithQuery(<CategoryBreakdown month={month} group={group || undefined} />);
  return requests;
};

const legend = () => screen.getByRole("list", { name: "Categorias" });
const pick = (name: string) => within(legend()).getByRole("button", { name: new RegExp(`^${name}`) });
const fold = (name: string) => within(legend()).getByRole("button", { name: new RegExp(`subcategorias de ${name}$`) });
const panel = (name: string) => screen.getByRole("region", { name: `Lançamentos: ${name}` });
const rows = (region: HTMLElement) =>
  within(region)
    .getAllByRole("listitem")
    .map((item) => item.textContent?.replace(/\s/g, " "));
const open = async (name: string) => {
  await screen.findByText("Total gasto");
  await userEvent.click(pick(name));
};
const choose = async (select: string, option: string) => {
  await userEvent.click(screen.getByRole("combobox", { name: select }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
};

describe("CategoryBreakdown", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  });

  afterEach(() => vi.restoreAllMocks());

  it("lists the outflow groups with share, subcategory count, change against last month and amount", async () => {
    show();
    await screen.findByText("Total gasto");

    expect(pick("Aluguel")).toHaveTextContent("88,3% das despesas");
    expect(pick("Aluguel")).toHaveTextContent("−6% vs out em relação ao mês anterior");
    expect(pick("Aluguel")).toHaveTextContent("R$ 12.000,00");
    expect(within(pick("Aluguel")).getByText("−6%", { exact: false })).toHaveClass("text-tier-green-foreground");
    expect(pick("Economia")).toHaveTextContent("2 subcategorias");
    expect(within(pick("Economia")).getByText("+5%", { exact: false })).toHaveClass("text-tier-red-foreground");
    expect(pick("Mercado")).not.toHaveTextContent("vs");
    expect(within(legend()).queryByRole("button", { name: /^Salário/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Entradas" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Para Onde Vai" })).toBeInTheDocument();
    expect(screen.getByText("Total Saídas:")).toHaveTextContent("Total Saídas: R$ 13.584,31");
  });

  it("names December from January, and a flat change as estável", async () => {
    show({
      month: "2027-01",
      report: {
        ...REPORT,
        groups: [group(ALUGUEL, "12000.00", "88.3", "0.2"), group(MERCADO, "184.31", "1.4", "12.0")],
      },
    });
    await screen.findByText("Total gasto");

    expect(pick("Aluguel")).toHaveTextContent("0% estável");
    expect(pick("Mercado")).toHaveTextContent("+12% vs dez");
  });

  it("draws the composition with its total, group count and a legend that picks", async () => {
    show();
    const composition = await screen.findByRole("region", { name: "Composição de Gastos" });

    expect(composition).toHaveTextContent("Total de saídas");
    expect(composition).toHaveTextContent("R$ 13.584,31");
    expect(composition).toHaveTextContent("3 categorias");
    expect(composition).toHaveTextContent("3 Categorias");
    const key = within(composition).getByRole("list", { name: "Legenda" });
    expect(rows(key)).toEqual(["Aluguel88,3%", "Economia10,3%", "Mercado1,4%"]);

    await userEvent.click(within(key).getByRole("button", { name: /^Economia/ }));

    expect(within(key).getByRole("button", { name: /^Economia/ })).toHaveAttribute("aria-pressed", "true");
    expect(pick("Economia")).toHaveAttribute("aria-pressed", "true");
    expect(panel("Economia")).toBeInTheDocument();
  });

  it("ranks the Top 5 by group with the sum of their shares", async () => {
    show();
    const top = await screen.findByRole("region", { name: /^Top/ });

    expect(top).toHaveTextContent("Representa 100,0% das despesas");
    expect(rows(top)).toEqual([
      "#1AluguelR$ 12.000,00 (88,3%)",
      "#2EconomiaR$ 1.400,00 (10,3%)",
      "#3MercadoR$ 184,31 (1,4%)",
    ]);
  });

  it("folds a group's subcategories with a sibling button, its own entries from cents, and all at once", async () => {
    show();
    await screen.findByText("Total gasto");
    const chevron = fold("Economia");

    expect(chevron).toHaveAccessibleName("Mostrar subcategorias de Economia");
    expect(pick("Economia")).not.toContainElement(chevron);
    expect(within(legend()).queryByRole("button", { name: /subcategorias de Aluguel/ })).not.toBeInTheDocument();

    await userEvent.click(chevron);

    expect(chevron).toHaveAttribute("aria-expanded", "true");
    const children = document.getElementById(chevron.getAttribute("aria-controls") ?? "") as HTMLElement;
    expect(rows(children)).toEqual(["ReservaR$ 1.000,10", "ViagemR$ 250,20", "Economia (sem subcategoria)R$ 149,70"]);

    await userEvent.click(screen.getByRole("button", { name: "Recolher tudo" }));
    expect(chevron).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(screen.getByRole("button", { name: "Expandir tudo" }));
    expect(chevron).toHaveAttribute("aria-expanded", "true");
  });

  it("lists a picked group's month entries with titles, captions and statuses, then last month's for reference", async () => {
    show();
    await open("Economia");

    expect(pick("Economia")).toHaveAttribute("aria-pressed", "true");
    expect(pick("Economia")).toHaveTextContent("Ativo");
    expect(pick("Economia")).toHaveTextContent("10,3% do total gasto");
    expect(screen.getByRole("combobox", { name: "Categoria" })).toHaveTextContent("Economia");
    const entries = panel("Economia");
    await within(entries).findByText("Aporte reserva (Reserva)");
    expect(entries).toHaveTextContent("3 itens");
    expect(entries).toHaveTextContent("Total no recorte selecionado: R$ 1.400,00");
    await within(entries).findByText("Aporte antigo (Reserva)");
    expect(rows(within(entries).getAllByRole("list")[0])).toEqual([
      "Aporte reserva (Reserva)05/11- R$ 1.000,10Saída liquidada",
      "Aporte viagem (Viagem)20/11 · Parcela 3/12- R$ 250,20Agendada",
      "Economia05/11- R$ 149,70Saída liquidada",
      "Aporte antigo (Reserva)28/10 · Mês anterior (para comparativo)- R$ 900,00Referência out",
      "Sobra de outubro20/10 · Mês anterior (para comparativo)- R$ 100,00Referência out",
      "Passagem (Viagem)10/10 · Mês anterior (para comparativo)- R$ 80,00Referência out",
    ]);
  });

  it("keeps last month's entries of a subcategory with nothing this month", async () => {
    const groups = REPORT.groups.map((each) =>
      each.category_id === ECONOMIA.id ? { ...each, children: [RESERVA.id] } : each,
    );
    show({ report: { ...REPORT, groups } });
    await open("Economia");

    expect(await within(panel("Economia")).findByText("Passagem (Viagem)")).toBeInTheDocument();
  });

  it("narrows the panel to a subcategory and back, keeping the parent's own entries under all", async () => {
    show();
    await open("Economia");
    const entries = panel("Economia");
    await within(entries).findByText("Aporte reserva (Reserva)");

    await choose("Subcategoria", "Reserva");

    expect(entries).toHaveTextContent("1 item");
    expect(entries).toHaveTextContent("Total no recorte selecionado: R$ 1.000,10");
    expect(within(entries).queryByText("Economia")).not.toBeInTheDocument();

    await choose("Subcategoria", "Todas as subcategorias");

    expect(entries).toHaveTextContent("3 itens");
    expect(within(entries).getByText("Economia")).toBeInTheDocument();
  });

  it("shares one pick between the header select and the rows, and Todas as Categorias clears it", async () => {
    show();
    await screen.findByText("Total gasto");

    await choose("Categoria", "Mercado");

    expect(pick("Mercado")).toHaveAttribute("aria-pressed", "true");
    expect(panel("Mercado")).toBeInTheDocument();

    await choose("Categoria", "Todas as Categorias");

    expect(pick("Mercado")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("region", { name: /^Lançamentos:/ })).not.toBeInTheDocument();

    await userEvent.click(pick("Aluguel"));
    await userEvent.click(pick("Aluguel"));
    expect(screen.queryByRole("region", { name: /^Lançamentos:/ })).not.toBeInTheDocument();
  });

  it("shows three rows on mobile until Ver todas opens the rest in place", async () => {
    show();
    await open("Economia");
    const entries = panel("Economia");
    await within(entries).findByText("Aporte antigo (Reserva)");
    const items = () => within(within(entries).getAllByRole("list")[0]).getAllByRole("listitem");

    expect(items().map((item) => item.classList.contains("max-lg:hidden"))).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
    ]);

    await userEvent.click(within(entries).getByRole("button", { name: "Ver todas as transações de Economia" }));

    expect(items().some((item) => item.classList.contains("max-lg:hidden"))).toBe(false);
    expect(within(entries).queryByRole("button", { name: /^Ver todas/ })).not.toBeInTheDocument();
  });

  it("exports the report as a pt-BR CSV with a BOM", async () => {
    const created = vi.fn((_blob: Blob | MediaSource) => "blob:soldi");
    URL.createObjectURL = created;
    URL.revokeObjectURL = vi.fn();
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    show();

    await userEvent.click(await screen.findByRole("button", { name: "Exportar CSV" }));

    expect(downloads).toEqual(["soldi-para-onde-vai-2026-11.csv"]);
    const blob = created.mock.calls[0][0];
    if (!(blob instanceof Blob)) throw new Error("no blob");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe(
      [
        "Grupo;Subcategoria;Valor;Percentual",
        '"Aluguel";"";12000,00;88,3',
        '"Economia";"Reserva";1000,10;7,4',
        '"Economia";"Viagem";250,20;1,8',
        '"Mercado";"";184,31;1,4',
        '"Economia";"";149,70;1,1',
        "",
      ].join("\r\n"),
    );
  });

  it("escapes quotes, separators and formulas in the CSV", async () => {
    const created = vi.fn((_blob: Blob | MediaSource) => "blob:soldi");
    URL.createObjectURL = created;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const odd = { ...ALUGUEL, name: 'Casa; "Reforma"' };
    const formula = { ...MERCADO, name: "=SOMA(A1)" };
    show({
      report: {
        ...REPORT,
        outflow: [share(odd, "12000.00", "88.3", "-6.0"), share(formula, "184.31", "1.4")],
        groups: [group(odd, "12000.00", "88.3", "-6.0"), group(formula, "184.31", "1.4", null)],
      },
    });

    await userEvent.click(await screen.findByRole("button", { name: "Exportar CSV" }));

    const blob = created.mock.calls[0][0];
    if (!(blob instanceof Blob)) throw new Error("no blob");
    const lines = (await blob.text()).split("\r\n");
    expect(lines.slice(1, 3)).toEqual(['"Casa; ""Reforma""";"";12000,00;88,3', '"\'=SOMA(A1)";"";184,31;1,4']);
  });

  it("says when nothing was spent, keeping the header", async () => {
    show({ report: { ...REPORT, outflow: [], outflow_total: "0.00", groups: REPORT.groups.slice(3) } });

    expect(await screen.findByText("Nenhum gasto neste mês ainda.")).toBeInTheDocument();
    expect(screen.getByText("Total Saídas:")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Composição de Gastos" })).not.toBeInTheDocument();
  });

  it("opens Lançar as Diário for a daily group", async () => {
    show();
    await open("Mercado");

    await userEvent.click(
      await within(panel("Mercado")).findByRole("button", { name: "Adicionar lançamento em Mercado" }),
    );

    const sheet = await screen.findByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
    expect(await within(sheet).findByRole("radio", { name: "Mercado" })).toHaveAttribute("aria-checked", "true");
    expect(within(sheet).getByRole("radio", { name: "Diário" })).toBeChecked();
    expect(within(sheet).getByRole("button", { name: /^Hoje/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens Lançar on Saída with Economia itself for the savings group, a deposit without a goal", async () => {
    show();
    await open("Economia");

    await userEvent.click(
      await within(panel("Economia")).findByRole("button", { name: "Adicionar lançamento em Economia" }),
    );

    const sheet = await screen.findByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
    expect(within(sheet).getByRole("radio", { name: "Conta" })).toBeChecked();
    expect(await within(sheet).findByRole("radio", { name: "Economia" })).toHaveAttribute("aria-checked", "true");
  });

  it("dates the entry on the first day of a month other than the current one", async () => {
    show({ month: "2026-10" });
    await open("Mercado");

    await userEvent.click(
      await within(panel("Mercado")).findByRole("button", { name: "Adicionar lançamento em Mercado" }),
    );

    const sheet = await screen.findByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
    expect(within(sheet).getByRole("button", { name: "Outra data, 01/10/2026" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: /^Hoje/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("offers no Adicionar for a category that was archived", async () => {
    show({ categories: WITH_COFRINHOS.filter((category) => category.id !== MERCADO.id) });
    await screen.findByText("Total gasto");

    await userEvent.click(pick("Mercado"));

    expect(await within(panel("Mercado")).findByText("Compras da semana")).toBeInTheDocument();
    expect(within(panel("Mercado")).queryByRole("button", { name: /^Adicionar lançamento/ })).not.toBeInTheDocument();
  });

  it("hands Transformar em conta fixa to the bill sheet", async () => {
    show();
    await open("Aluguel");
    await userEvent.click(
      await within(panel("Aluguel")).findByRole("button", { name: "Adicionar lançamento em Aluguel" }),
    );
    await userEvent.type(await screen.findByLabelText(/^Valor d/), "12");

    await userEvent.click(await screen.findByRole("button", { name: "Criar como Conta Fixa" }));

    expect(await screen.findByRole("dialog", { name: "Nova conta" })).toBeInTheDocument();
  });

  it("starts with the savings group picked for economia, even renamed, and lets it go", async () => {
    const renamed = REPORT.groups.map((each) =>
      each.category_id === ECONOMIA.id ? { ...each, name: "Poupança" } : each,
    );
    show({ group: "economia", report: { ...REPORT, groups: renamed } });

    expect(await screen.findByRole("region", { name: "Lançamentos: Poupança" })).toBeInTheDocument();
    await userEvent.click(pick("Poupança"));
    expect(pick("Poupança")).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(pick("Mercado"));
    expect(panel("Mercado")).toBeInTheDocument();
  });

  it("ignores a group the month does not have", async () => {
    show({ group: "viagem" });
    await screen.findByText("Total gasto");
    expect(screen.queryByRole("region", { name: /^Lançamentos/ })).not.toBeInTheDocument();
  });

  it("picks a group from its donut slice", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 224, 224));
    show();
    await screen.findByText("Total gasto");

    const slices = await waitFor(() => {
      const found = document.querySelectorAll<HTMLElement>(".recharts-pie-sector");
      expect(found).toHaveLength(3);
      return found;
    });
    await userEvent.click(slices[1]);

    expect(pick("Economia")).toHaveAttribute("aria-pressed", "true");
    expect(panel("Economia")).toBeInTheDocument();
  });
});
