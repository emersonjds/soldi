import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MonthHeader, YearHeader } from "./month-header";

describe("MonthHeader", () => {
  it("shows the month, today's balance and its tier label", () => {
    render(<MonthHeader month="2026-11" balance="1842.10" tier="light_green" onMonthChange={vi.fn()} />);

    expect(screen.getByText("Novembro 2026")).toBeInTheDocument();
    expect(screen.getByText("Saldo hoje")).toBeInTheDocument();
    expect(screen.getByText("R$ 1.842,10")).toBeInTheDocument();
    expect(screen.getByText("Confortável")).toBeInTheDocument();
  });

  it("switches to the previous and the next month across years", async () => {
    const onMonthChange = vi.fn();
    const { rerender } = render(
      <MonthHeader month="2026-01" balance="0" tier="yellow" onMonthChange={onMonthChange} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(onMonthChange).toHaveBeenLastCalledWith("2025-12");

    rerender(<MonthHeader month="2026-12" balance="0" tier="yellow" onMonthChange={onMonthChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(onMonthChange).toHaveBeenLastCalledWith("2027-01");
  });

  it("moves with the keyboard arrows and never before the first month", () => {
    const onMonthChange = vi.fn();
    render(<MonthHeader month="2026-11" minMonth="2026-11" balance="0" tier="yellow" onMonthChange={onMonthChange} />);
    const switcher = screen.getByRole("group", { name: "Mês" });

    fireEvent.keyDown(switcher, { key: "ArrowLeft" });
    expect(onMonthChange).not.toHaveBeenCalled();
    fireEvent.keyDown(switcher, { key: "ArrowRight" });
    expect(onMonthChange).toHaveBeenLastCalledWith("2026-12");
    fireEvent.keyDown(switcher, { key: "Enter" });
    expect(onMonthChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Mês anterior" })).toBeDisabled();
  });

  it("has a compact variant: the screen's title over the switcher, no balance", async () => {
    const onMonthChange = vi.fn();
    render(<MonthHeader month="2026-11" title="Para onde vai" onMonthChange={onMonthChange} />);

    expect(screen.getByRole("heading", { level: 1, name: "Para onde vai" })).toBeInTheDocument();
    expect(screen.getByText("Novembro 2026")).toBeInTheDocument();
    expect(screen.queryByText("Saldo hoje")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(onMonthChange).toHaveBeenLastCalledWith("2026-12");
  });
});

describe("YearHeader", () => {
  it("switches years and never before the first one", async () => {
    const onYearChange = vi.fn();
    render(<YearHeader year={2026} minYear={2026} title="Economia" onYearChange={onYearChange} />);

    expect(screen.getByRole("heading", { level: 1, name: "Economia" })).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ano anterior" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Próximo ano" }));
    expect(onYearChange).toHaveBeenLastCalledWith(2027);
    fireEvent.keyDown(screen.getByRole("group", { name: "Ano" }), { key: "ArrowLeft" });
    expect(onYearChange).toHaveBeenCalledTimes(1);
  });

  it("goes back a year when there is no floor", async () => {
    const onYearChange = vi.fn();
    render(<YearHeader year={2026} title="Economia" onYearChange={onYearChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Ano anterior" }));
    expect(onYearChange).toHaveBeenLastCalledWith(2025);
  });
});
