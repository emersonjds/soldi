import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MonthSwitcher, Switcher } from "./month-switcher";

describe("Switcher", () => {
  it("never goes past the end, by click or by key", () => {
    const onShift = vi.fn();
    render(
      <Switcher
        legend="Ano"
        label="2026"
        previousLabel="Ano anterior"
        nextLabel="Próximo ano"
        atStart={false}
        atEnd
        onShift={onShift}
      />,
    );

    expect(screen.getByRole("button", { name: "Próximo ano" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("group", { name: "Ano" }), { key: "ArrowRight" });
    expect(onShift).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("group", { name: "Ano" }), { key: "ArrowLeft" });
    expect(onShift).toHaveBeenLastCalledWith(-1);
  });
});

describe("MonthSwitcher", () => {
  it("names the month and steps across years", async () => {
    const onMonthChange = vi.fn();
    const { rerender } = render(<MonthSwitcher month="2026-01" onMonthChange={onMonthChange} />);

    expect(screen.getByText("Janeiro 2026")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(onMonthChange).toHaveBeenLastCalledWith("2025-12");

    rerender(<MonthSwitcher month="2026-12" onMonthChange={onMonthChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(onMonthChange).toHaveBeenLastCalledWith("2027-01");
  });

  it("moves with the arrow keys and never before the first month", () => {
    const onMonthChange = vi.fn();
    render(<MonthSwitcher month="2026-11" minMonth="2026-11" onMonthChange={onMonthChange} />);
    const switcher = screen.getByRole("group", { name: "Mês" });

    fireEvent.keyDown(switcher, { key: "ArrowLeft" });
    expect(onMonthChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Mês anterior" })).toBeDisabled();
    fireEvent.keyDown(switcher, { key: "ArrowRight" });
    expect(onMonthChange).toHaveBeenLastCalledWith("2026-12");
  });

  it("sits on the indigo hero by default and on a light surface on request, with 44 px arrows", () => {
    const { rerender } = render(<MonthSwitcher month="2026-11" onMonthChange={vi.fn()} />);

    expect(screen.getByRole("group", { name: "Mês" })).toHaveClass("bg-white/10");

    rerender(<MonthSwitcher month="2026-11" tone="surface" onMonthChange={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Mês" })).toHaveClass("bg-muted");
    expect(screen.getByRole("button", { name: "Próximo mês" })).toHaveClass("size-11", "focus-visible:outline-ring");
  });
});
