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

  it("writes an outflow with a minus and no color of its own", () => {
    render(<Money amount="184.31" outflow />);

    const amount = screen.getByText("- R$ 184,31");
    expect(amount).not.toHaveClass("text-expense");
    expect(amount).not.toHaveClass("text-income-text");
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

  it("draws a display plain on mobile and from lg raises the cents at 55%, the symbol kept whole", () => {
    render(<Money amount="1842.10" size="display" />);

    expect(screen.getByText("R$ 1.842,10").parentElement).toHaveClass("text-[34px]", "lg:text-[40px]");
    expect(screen.getByText("10")).toHaveClass("lg:align-super", "lg:text-[0.55em]");
    expect(screen.getByText(",")).toHaveClass("lg:align-super");
    expect(screen.getByText("R$")).not.toHaveClass("text-[0.55em]", "lg:text-[0.55em]");
    expect(screen.getByText("842")).not.toHaveClass("lg:align-super");
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
