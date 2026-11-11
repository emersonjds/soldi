import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import { ALUGUEL, COMIDA, LUZ, MERCADO, problem, REPORT, SALARIO, stubApi } from "@/test/stub-api";

import { SpendingGlance } from "./spending-glance";

const group = (
  { id, name, icon, color, kind }: Schemas["Category"],
  amount: string,
  pct: string,
): Schemas["CategoryGroup"] => ({
  category_id: id,
  name,
  icon,
  color,
  kind,
  amount,
  pct,
  previous_amount: "0.00",
  delta_pct: null,
  children: [],
});

const TRANSPORTE = { ...MERCADO, id: "c1000000-0000-4000-8000-000000000099", name: "Transporte" };

const GROUPS = [
  group(ALUGUEL, "1200.00", "48.0"),
  group(MERCADO, "650.00", "26.0"),
  group(LUZ, "300.00", "12.0"),
  group(COMIDA, "200.00", "8.0"),
  group(TRANSPORTE, "150.00", "6.0"),
  group(SALARIO, "6000.00", "100.0"),
];

const show = (reply: { status: number; body?: unknown }) => {
  const requests = stubApi({ "GET /api/reports/categories?month=2026-11": reply });
  renderWithQuery(<SpendingGlance month="2026-11" />);
  return requests;
};

const card = () => screen.getByRole("region", { name: "Para onde vai" });

describe("Para onde vai glance", () => {
  it("shows the four largest outflow groups with amount and share, and links the month's full screen", async () => {
    show({ status: 200, body: { ...REPORT, groups: GROUPS } });

    const rows = await within(card()).findAllByRole("listitem");
    expect(rows.map((row) => row.textContent?.replace(/\s/g, " "))).toEqual([
      "AluguelR$ 1.200,0048%",
      "MercadoR$ 650,0026%",
      "LuzR$ 300,0012%",
      "Comida foraR$ 200,008%",
    ]);
    expect(within(card()).getByRole("link", { name: "Ver tudo" })).toHaveAttribute("href", "/para-onde-vai?m=2026-11");
  });

  it("shows four bar skeletons while loading", () => {
    show({ status: 200, body: REPORT });
    expect(within(card()).getAllByTestId("bar-skeleton")).toHaveLength(4);
  });

  it("says nothing was spent when the month has only income", async () => {
    show({ status: 200, body: { ...REPORT, groups: [group(SALARIO, "500.00", "100.0")] } });
    expect(await within(card()).findByText("Nenhum gasto neste mês ainda.")).toBeInTheDocument();
    expect(within(card()).queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("says so when it fails and tries again", async () => {
    const requests = show({ status: 500, body: problem(500, "Erro") });
    await userEvent.click(await within(card()).findByRole("button", { name: "Tentar de novo" }));
    expect(card()).toHaveTextContent("Não foi possível carregar os gastos.");
    await waitFor(() => expect(requests.length).toBeGreaterThan(1));
  });
});
