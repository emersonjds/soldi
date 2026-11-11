import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const FREELA: Schemas["Category"] = {
  ...SALARIO,
  id: "c1000000-0000-4000-8000-000000000098",
  name: "Freela",
  parent_id: SALARIO.id,
};

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
  income: [share(FREELA, "500.00", "100.0")],
  groups: [
    group(ALUGUEL, "12000.00", "88.3", "-6.0"),
    group(ECONOMIA, "1400.00", "10.3", "5.0", [RESERVA.id, VIAGEM.id]),
    group(MERCADO, "184.31", "1.4", null),
    group(SALARIO, "500.00", "100.0", null, [FREELA.id]),
  ],
};

const entry = (id: string, category: Schemas["Category"], amount: string, note: string): Schemas["Transaction"] => ({
  id,
  date: "2026-11-05",
  amount,
  kind: category.kind,
  note,
  category,
});

const ENTRIES = [
  entry("t1", RESERVA, "1000.10", "Aporte reserva"),
  entry("t2", VIAGEM, "250.20", "Aporte viagem"),
  entry("t3", ECONOMIA, "149.70", "Guardado solto"),
  entry("t4", ALUGUEL, "12000.00", "Aluguel de novembro"),
  entry("t5", MERCADO, "184.31", "Compras da semana"),
];

const show = ({ month = "2026-11", report = REPORT, categories = WITH_COFRINHOS } = {}) => {
  const requests = stubApi({
    "GET /api/reports/categories": { status: 200, body: report },
    "GET /api/transactions": { status: 200, body: ENTRIES },
    "GET /api/categories": { status: 200, body: categories },
  });
  renderWithQuery(<CategoryBreakdown month={month} />);
  return requests;
};

const legend = () => screen.getByRole("list", { name: "Categorias" });
const pick = (name: string) => within(legend()).getByRole("button", { name: new RegExp(`^${name}`) });
const fold = (name: string) => within(legend()).getByRole("button", { name: new RegExp(`subcategorias de ${name}$`) });
const groupRows = () =>
  within(legend())
    .getAllByRole("listitem")
    .filter((item) => item.parentElement === legend())
    .map((item) => within(item).getAllByRole("button")[0].textContent?.replace(/\s/g, " "));
const panel = (name: string) => screen.getByRole("region", { name: `Lançamentos de ${name}` });

describe("CategoryBreakdown by group", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  });

  it("lists one row per top-level group of each tab, with its whole share, change and amount", async () => {
    show();
    await screen.findByText("Saídas do mês");

    expect(groupRows()).toEqual([
      "Aluguel88% das saídas−6% em relação ao mês anteriorR$ 12.000,00",
      "Economia10% das saídas+5% em relação ao mês anteriorR$ 1.400,00",
      "Mercado1% das saídasR$ 184,31",
    ]);
    expect(within(legend()).queryByText("Reserva")).not.toBeInTheDocument();
    expect(within(legend()).queryByRole("button", { name: /subcategorias de Aluguel/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Entradas" }));
    expect(groupRows()).toEqual(["Salário100% das entradasR$ 500,00"]);
  });

  it("rounds a group's share half to even: 125,00 of 1.000,00 is 12%", async () => {
    show({ report: { ...REPORT, outflow_total: "1000.00", groups: [group(ALUGUEL, "125.00", "12.5", null)] } });
    await screen.findByText("Saídas do mês");

    expect(pick("Aluguel")).toHaveTextContent("12% das saídas");
  });

  it("folds a group's subcategories with a sibling button, and adds the parent's own entries from cents", async () => {
    show();
    await screen.findByText("Saídas do mês");
    const chevron = fold("Economia");

    expect(chevron).toHaveAccessibleName("Mostrar subcategorias de Economia");
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    expect(pick("Economia")).not.toContainElement(chevron);

    await userEvent.click(chevron);

    expect(chevron).toHaveAccessibleName("Ocultar subcategorias de Economia");
    expect(chevron).toHaveAttribute("aria-expanded", "true");
    const children = document.getElementById(chevron.getAttribute("aria-controls") ?? "");
    expect(
      within(children as HTMLElement)
        .getAllByRole("listitem")
        .map((item) => item.textContent?.replace(/\s/g, " ")),
    ).toEqual([
      "ReservaR$ 1.000,10",
      "Viagem+10% em relação ao mês anteriorR$ 250,20",
      "Economia (sem subcategoria)R$ 149,70",
    ]);

    await userEvent.click(chevron);
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    expect(within(legend()).queryByText("Economia (sem subcategoria)")).not.toBeInTheDocument();
  });

  it("shows no sem subcategoria row when a group's children add up to it", async () => {
    show();
    await userEvent.click(await screen.findByRole("radio", { name: "Entradas" }));

    await userEvent.click(fold("Salário"));

    expect(pick("Freela")).toHaveTextContent("FreelaR$ 500,00");
    expect(screen.queryByText(/sem subcategoria/)).not.toBeInTheDocument();
  });

  it("lists a group's entries from the month's list, subcategories included, with the API total", async () => {
    const requests = show();

    await userEvent.click(await screen.findByRole("button", { name: /^Economia/ }));

    expect(pick("Economia")).toHaveAttribute("aria-pressed", "true");
    const entries = panel("Economia");
    expect(await within(entries).findByText("Aporte reserva")).toBeInTheDocument();
    expect(within(entries).getByText("Aporte viagem")).toBeInTheDocument();
    expect(within(entries).getByText("Guardado solto")).toBeInTheDocument();
    expect(within(entries).queryByText("Compras da semana")).not.toBeInTheDocument();
    expect(entries).toHaveTextContent("3 lançamentos");
    expect(entries).toHaveTextContent("Total: R$ 1.400,00");
    const listed = requests.filter((request) => request.url.includes("/api/transactions"));
    expect(listed.map((request) => new URL(request.url).searchParams.get("category_id"))).toEqual([null]);
  });

  it("lists only a child's own entries, and a second tap clears it", async () => {
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Mostrar subcategorias de Economia" }));

    await userEvent.click(pick("Reserva"));

    expect(pick("Reserva")).toHaveAttribute("aria-pressed", "true");
    expect(pick("Economia")).toHaveAttribute("aria-pressed", "false");
    const entries = panel("Economia › Reserva");
    expect(await within(entries).findByText("Aporte reserva")).toBeInTheDocument();
    expect(within(entries).queryByText("Guardado solto")).not.toBeInTheDocument();
    expect(entries).toHaveTextContent("1 lançamento");
    expect(entries).toHaveTextContent("Total: R$ 1.000,10");

    await userEvent.click(pick("Reserva"));
    expect(screen.queryByRole("region", { name: /^Lançamentos de/ })).not.toBeInTheDocument();
  });

  it("opens Lançar on the chosen category with its kind", async () => {
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Mostrar subcategorias de Economia" }));
    await userEvent.click(pick("Reserva"));

    await userEvent.click(
      await within(panel("Economia › Reserva")).findByRole("button", {
        name: "Adicionar lançamento em Economia › Reserva",
      }),
    );

    const sheet = await screen.findByRole("dialog", { name: "Lançar" });
    expect(await within(sheet).findByRole("radio", { name: "Economia › Reserva" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(sheet).getByRole("radio", { name: "Saída" })).toBeChecked();
  });

  it("opens Lançar as Diário for a daily group", async () => {
    show();
    await userEvent.click(await screen.findByRole("button", { name: /^Mercado/ }));

    await userEvent.click(
      await within(panel("Mercado")).findByRole("button", { name: "Adicionar lançamento em Mercado" }),
    );

    const sheet = await screen.findByRole("dialog", { name: "Lançar" });
    expect(await within(sheet).findByRole("radio", { name: "Mercado" })).toHaveAttribute("aria-checked", "true");
    expect(within(sheet).getByRole("radio", { name: "Diário" })).toBeChecked();
    expect(within(sheet).getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens Lançar as Entrada on Salário from the Entradas tab", async () => {
    show();
    await userEvent.click(await screen.findByRole("radio", { name: "Entradas" }));
    await userEvent.click(pick("Salário"));

    await userEvent.click(
      await within(panel("Salário")).findByRole("button", { name: "Adicionar lançamento em Salário" }),
    );

    const sheet = await screen.findByRole("dialog", { name: "Lançar" });
    expect(await within(sheet).findByRole("radio", { name: "Salário" })).toHaveAttribute("aria-checked", "true");
    expect(within(sheet).getByRole("radio", { name: "Entrada" })).toBeChecked();
  });

  it("opens Lançar on Saída with no category for the savings group, so the cofrinho is picked", async () => {
    show();
    await userEvent.click(await screen.findByRole("button", { name: /^Economia/ }));

    await userEvent.click(
      await within(panel("Economia")).findByRole("button", { name: "Adicionar lançamento em Economia" }),
    );

    const sheet = await screen.findByRole("dialog", { name: "Lançar" });
    expect(within(sheet).getByRole("radio", { name: "Saída" })).toBeChecked();
    expect(await within(sheet).findByRole("radio", { name: "Aluguel" })).toHaveAttribute("aria-checked", "true");
    expect(within(sheet).getByRole("radio", { name: "Economia" })).toHaveAttribute("aria-checked", "false");
  });

  it("dates the entry on the first day of a month other than the current one", async () => {
    show({ month: "2026-10" });
    await userEvent.click(await screen.findByRole("button", { name: /^Mercado/ }));

    await userEvent.click(
      await within(panel("Mercado")).findByRole("button", { name: "Adicionar lançamento em Mercado" }),
    );

    const sheet = await screen.findByRole("dialog", { name: "Lançar" });
    expect(within(sheet).getByRole("button", { name: "Outra data, 01/10/2026" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "false");
  });

  it("offers no Adicionar for a category that was archived", async () => {
    show({ categories: WITH_COFRINHOS.filter((category) => category.id !== MERCADO.id) });
    await within(await screen.findByRole("region", { name: "Top 5" })).findByText("Economia › Reserva");

    await userEvent.click(pick("Mercado"));

    expect(await within(panel("Mercado")).findByText("Compras da semana")).toBeInTheDocument();
    expect(within(panel("Mercado")).queryByRole("button", { name: /^Adicionar lançamento/ })).not.toBeInTheDocument();
  });

  it("hands Transformar em conta fixa to the bill sheet", async () => {
    show();
    await userEvent.click(await screen.findByRole("button", { name: /^Aluguel/ }));
    await userEvent.click(
      await within(panel("Aluguel")).findByRole("button", { name: "Adicionar lançamento em Aluguel" }),
    );
    await userEvent.type(await screen.findByLabelText("Valor"), "12");

    await userEvent.click(await screen.findByRole("button", { name: "Transformar em conta fixa" }));

    expect(await screen.findByRole("dialog", { name: "Nova conta" })).toBeInTheDocument();
  });

  it("clears the selection when the tab changes", async () => {
    show();
    await userEvent.click(await screen.findByRole("button", { name: /^Economia/ }));
    expect(panel("Economia")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Entradas" }));
    await userEvent.click(screen.getByRole("radio", { name: "Saídas" }));

    expect(screen.queryByRole("region", { name: /^Lançamentos de/ })).not.toBeInTheDocument();
    expect(pick("Economia")).toHaveAttribute("aria-pressed", "false");
  });

  it("clears the selection when its group folds away the selected subcategory", async () => {
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Mostrar subcategorias de Economia" }));
    await userEvent.click(pick("Reserva"));
    expect(panel("Economia › Reserva")).toBeInTheDocument();

    await userEvent.click(fold("Economia"));

    expect(screen.queryByRole("region", { name: /^Lançamentos de/ })).not.toBeInTheDocument();
  });

  it("keeps a group selected when it folds", async () => {
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Mostrar subcategorias de Economia" }));
    await userEvent.click(pick("Economia"));

    await userEvent.click(fold("Economia"));

    expect(panel("Economia")).toBeInTheDocument();
  });

  it("selects a group from its donut slice", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 224, 224));
    show();
    await screen.findByText("Saídas do mês");

    const slices = await waitFor(() => {
      const found = document.querySelectorAll<HTMLElement>(".recharts-pie-sector");
      expect(found).toHaveLength(3);
      return found;
    });
    await userEvent.click(slices[1]);

    expect(pick("Economia")).toHaveAttribute("aria-pressed", "true");
    expect(panel("Economia")).toBeInTheDocument();
  });

  it("shows each Top 5 line with its amount and flat share", async () => {
    show();

    const top = await screen.findByRole("region", { name: "Top 5" });
    await within(top).findByText("Economia › Reserva");
    expect(
      within(top)
        .getAllByRole("listitem")
        .map((item) => item.textContent?.replace(/\s/g, " ")),
    ).toEqual([
      "AluguelR$ 12.000,00 (88,3%)",
      "Economia › ReservaR$ 1.000,10 (7,4%)",
      "Economia › ViagemR$ 250,20 (1,8%)",
      "MercadoR$ 184,31 (1,4%)",
      "Economia (sem subcategoria)R$ 149,70 (1,1%)",
    ]);
  });
});
