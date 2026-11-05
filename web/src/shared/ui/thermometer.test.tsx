import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CategoryIcon } from "./category-icon";
import { Money } from "./money";
import { ThermometerStrip } from "./thermometer-strip";
import { TierPill } from "./tier-pill";

describe("TierPill", () => {
  it("always carries the label with the color", () => {
    render(<TierPill tier="light_red" />);

    expect(screen.getByText("Atenção")).toHaveClass("bg-tier-light-red-soft");
  });

  it("has a compact size for day headers", () => {
    render(<TierPill tier="green" size="sm" />);

    expect(screen.getByText("Folga")).toHaveClass("text-xs");
  });
});

describe("ThermometerStrip", () => {
  it("is a meter that names the current tier and labels all five", () => {
    render(<ThermometerStrip tier="light_green" />);

    const meter = screen.getByRole("meter", { name: "Termômetro" });
    expect(meter).toHaveAttribute("value", "4");
    expect(meter).toHaveAttribute("max", "5");
    expect(meter).toHaveAttribute("aria-valuetext", "Confortável");
    for (const label of ["Crítico", "Atenção", "Apertado", "Folga"]) {
      expect(screen.getByText(label)).not.toHaveClass("font-bold");
    }
    expect(screen.getByText("Confortável")).toHaveClass("font-bold");
  });
});

describe("Money", () => {
  it("formats in BRL with tabular figures", () => {
    render(<Money amount="1842.10" />);

    expect(screen.getByText("R$ 1.842,10")).toHaveClass("tabular-nums");
  });

  it("signs income and paints it green", () => {
    render(<Money amount="500.00" income />);

    expect(screen.getByText("+ R$ 500,00")).toHaveClass("text-income");
  });

  it("paints a negative amount as expense", () => {
    render(<Money amount="-312.40" />);

    expect(screen.getByText("-R$ 312,40")).toHaveClass("text-expense");
  });
});

describe("CategoryIcon", () => {
  it("draws the category's lucide icon on its color", () => {
    const { container } = render(<CategoryIcon icon="shopping-cart" color="cat-1" />);

    expect(container.firstChild).toHaveClass("bg-cat-1", "size-10", "rounded-full");
    expect(container.querySelector("svg")).toHaveClass("lucide-shopping-cart");
  });

  it("falls back to a dashed circle for an unknown icon or color", () => {
    const { container } = render(<CategoryIcon icon="no-such-icon" color="cat-99" />);

    expect(container.firstChild).toHaveClass("bg-muted-foreground");
    expect(container.querySelector("svg")).toHaveClass("lucide-circle-dashed");
  });
});
