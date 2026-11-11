import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SplitBar } from "./split-bar";

const segments = [
  { label: "Contas", amount: "1800.00", tone: "bills" },
  { label: "Guardado", amount: "480.00", tone: "saved" },
  { label: "Diário", amount: "2580.00", tone: "daily" },
  { label: "Livre", amount: "1140.00", tone: "free" },
] as const;

// Intl puts a no-break space after the symbol.
const named = (text: string) => (name: string) => name.replace(/\s/g, " ") === text;

const grows = () =>
  Array.from(screen.getByRole("img").children, (segment) => Number((segment as HTMLElement).style.flexGrow));

describe("SplitBar", () => {
  it("sums the segments up to the base in one image label", () => {
    render(<SplitBar label="Entradas" segments={[...segments]} />);

    expect(
      screen.getByRole("img", { name: named("Entradas R$ 6.000,00: contas 30%, guardado 8%, diário 43%, livre 19%") }),
    ).toBeInTheDocument();
    expect(grows()).toEqual([180000, 48000, 258000, 114000]);
  });

  it("lists each segment with its value and share, in text ink, never color alone", () => {
    render(<SplitBar label="Entradas" segments={[...segments]} />);

    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent?.replace(/\s/g, " "))).toEqual([
      "ContasR$ 1.800,00 · 30%",
      "GuardadoR$ 480,00 · 8%",
      "DiárioR$ 2.580,00 · 43%",
      "LivreR$ 1.140,00 · 19%",
    ]);
    expect(rows[0].querySelector("span")).toHaveClass("bg-primary");
    expect(rows[1].querySelector("span")).toHaveClass("bg-cat-11");
    expect(rows[2].querySelector("span")).toHaveClass("bg-split-daily");
    expect(rows[3].querySelector("span")).toHaveClass("bg-muted", "border-border");
  });

  it("hides zero segments from the bar, the legend and the label", () => {
    render(
      <SplitBar
        label="Entradas"
        segments={[
          { label: "Contas", amount: "3600.00", tone: "bills" },
          { label: "Guardado", amount: "0.00", tone: "saved" },
          { label: "Diário", amount: "2400.00", tone: "daily" },
          { label: "Livre", amount: "0.00", tone: "free" },
        ]}
      />,
    );

    expect(
      screen.getByRole("img", { name: named("Entradas R$ 6.000,00: contas 60%, diário 40%") }),
    ).toBeInTheDocument();
    expect(grows()).toEqual([360000, 240000]);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText("Guardado")).not.toBeInTheDocument();
  });

  it("rounds each share half to even", () => {
    render(
      <SplitBar
        label="Entradas"
        segments={[
          { label: "Contas", amount: "0.01", tone: "bills" },
          { label: "Diário", amount: "0.07", tone: "daily" },
        ]}
      />,
    );

    expect(screen.getByRole("img", { name: named("Entradas R$ 0,08: contas 12%, diário 88%") })).toBeInTheDocument();
  });
});
