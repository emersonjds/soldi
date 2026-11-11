import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SplitBar } from "./split-bar";

const segments = [
  { label: "Contas fixas", amount: "2708.00", tone: "bills" },
  { label: "Guardado", amount: "776.13", tone: "saved" },
  { label: "Gastos diários", amount: "1548.50", tone: "daily" },
  { label: "Livre restante", amount: "1328.97", tone: "free" },
] as const;

// Intl puts a no-break space after the symbol.
const named = (text: string) => (name: string) => name.replace(/\s/g, " ") === text;

const grows = () =>
  Array.from(screen.getByRole("img").children, (segment) => Number((segment as HTMLElement).style.flexGrow));

describe("SplitBar", () => {
  it("sums the segments up to the base in one image label, each share with one decimal", () => {
    render(<SplitBar label="Entradas" segments={[...segments]} />);

    expect(
      screen.getByRole("img", {
        name: named(
          "Entradas R$ 6.361,60: contas fixas 42,6%, guardado 12,2%, gastos diários 24,3%, livre restante 20,9%",
        ),
      }),
    ).toBeInTheDocument();
    expect(grows()).toEqual([270800, 77613, 154850, 132897]);
  });

  it("lists each segment with a dot, its label, its value and its share, never color alone", () => {
    render(<SplitBar label="Entradas" segments={[...segments]} />);

    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent?.replace(/\s/g, " "))).toEqual([
      "Contas fixasR$ 2.708,0042,6%",
      "GuardadoR$ 776,1312,2%",
      "Gastos diáriosR$ 1.548,5024,3%",
      "Livre restanteR$ 1.328,9720,9%",
    ]);
    expect(rows[0].querySelector("span")).toHaveClass("bg-primary", "rounded-full");
    expect(rows[1].querySelector("span")).toHaveClass("bg-cat-11");
    expect(rows[2].querySelector("span")).toHaveClass("bg-split-daily");
    expect(rows[3].querySelector("span")).toHaveClass("bg-muted", "border-border");
  });

  it("hides zero segments from the bar, the legend and the label", () => {
    render(
      <SplitBar
        label="Entradas"
        segments={[
          { label: "Contas fixas", amount: "3600.00", tone: "bills" },
          { label: "Guardado", amount: "0.00", tone: "saved" },
          { label: "Gastos diários", amount: "2400.00", tone: "daily" },
          { label: "Livre restante", amount: "0.00", tone: "free" },
        ]}
      />,
    );

    expect(
      screen.getByRole("img", { name: named("Entradas R$ 6.000,00: contas fixas 60,0%, gastos diários 40,0%") }),
    ).toBeInTheDocument();
    expect(grows()).toEqual([360000, 240000]);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText("Guardado")).not.toBeInTheDocument();
  });

  it("rounds each share half to even at one decimal", () => {
    render(
      <SplitBar
        label="Entradas"
        segments={[
          { label: "Contas fixas", amount: "0.50", tone: "bills" },
          { label: "Gastos diários", amount: "1.50", tone: "daily" },
          { label: "Livre restante", amount: "998.00", tone: "free" },
        ]}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: named("Entradas R$ 1.000,00: contas fixas 0,0%, gastos diários 0,2%, livre restante 99,8%"),
      }),
    ).toBeInTheDocument();
  });
});
