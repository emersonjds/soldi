import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Money } from "./money";

describe("Money", () => {
  it("writes income in the AA text green, not the fill green", () => {
    render(<Money amount="1234.50" income />);

    const amount = screen.getByText(/1\.234,50/);
    expect(amount).toHaveClass("text-income-text");
    expect(amount).not.toHaveClass("text-income");
  });

  it("writes a negative amount in the expense red", () => {
    render(<Money amount="-10.00" />);

    expect(screen.getByText(/10,00/)).toHaveClass("text-expense");
  });

  it("keeps the row size as one plain span", () => {
    render(<Money amount="1234.50" size="row" />);

    const amount = screen.getByText("R$ 1.234,50");
    expect(amount).toHaveClass("tabular-nums");
    expect(amount).not.toHaveClass("text-[28px]");
    expect(amount.children).toHaveLength(0);
  });

  it("draws a figure at 28 px with the symbol and cents at 55%, still read as one string", () => {
    render(<Money amount="1234.50" size="figure" />);

    const figure = screen.getByText("R$ 1.234,50").parentElement;
    expect(figure).toHaveClass("text-[28px]", "font-bold", "tabular-nums", "tracking-[-0.02em]");
    expect(screen.getByText("R$")).toHaveClass("text-[0.55em]");
    expect(screen.getByText("50")).toHaveClass("text-[0.55em]");
    expect(screen.getByText("234")).not.toHaveClass("text-[0.55em]");
  });

  it("draws a hero at 40 px, 48 px from lg", () => {
    render(<Money amount="1234.50" size="hero" />);

    expect(screen.getByText("R$ 1.234,50").parentElement).toHaveClass("text-[40px]", "lg:text-5xl");
  });

  it("keeps the sign and the red on a negative figure", () => {
    render(<Money amount="-10.00" size="figure" />);

    expect(screen.getByText("-R$ 10,00").parentElement).toHaveClass("text-expense");
    expect(screen.getByText("-")).not.toHaveClass("text-[0.55em]");
  });

  it("keeps the plus and the green on an income hero", () => {
    render(<Money amount="6000.00" income size="hero" />);

    expect(screen.getByText("+ R$ 6.000,00").parentElement).toHaveClass("text-income-text");
  });
});
