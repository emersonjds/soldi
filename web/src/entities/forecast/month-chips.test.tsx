import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MonthChips } from "./month-chips";
import type { MonthAhead } from "./months-ahead";

const R = "R$\u00a0";

const MONTHS: MonthAhead[] = [
  { month: "2026-11", lowest: "red", low: "-12345.67", redDays: 7 },
  { month: "2026-12", lowest: "green", low: "2500.99", redDays: 0 },
  { month: "2027-01", lowest: null, low: null, redDays: 0 },
];

describe("MonthChips", () => {
  it("draws a 4-column grid, the short month named with its year, its low and its tier word, never color alone", async () => {
    const onOpen = vi.fn();
    render(<MonthChips months={MONTHS} current="2026-12" onOpen={onOpen} />);

    expect(screen.getByRole("list")).toHaveClass("grid-cols-4");
    const november = screen.getByRole("button", { name: `novembro de 2026: menor saldo -${R}12.345,67, Crítico` });
    expect(november).toHaveTextContent(/^Nov-12.346Crítico$/);
    expect(november).toHaveClass("bg-expense-soft", "text-expense");
    expect(screen.getByText("Crítico")).toHaveClass("text-[11px]");
    const december = screen.getByRole("button", { name: `dezembro de 2026: menor saldo ${R}2.500,99, Folga` });
    expect(december).toHaveAttribute("aria-current", "date");
    expect(december).toHaveClass("ring-2");
    expect(december).not.toHaveClass("bg-expense-soft");
    expect(december).toHaveTextContent(/^Dez2.500Folga$/);
    await userEvent.click(november);
    expect(onOpen).toHaveBeenCalledWith("2026-11");
  });

  it("disables a month before the opening date, without an amount", async () => {
    const onOpen = vi.fn();
    render(<MonthChips months={MONTHS} onOpen={onOpen} />);

    const january = screen.getByRole("button", { name: "janeiro de 2027: antes do início" });
    expect(january).toHaveAttribute("aria-disabled", "true");
    expect(january).toHaveTextContent(/^JanAntes do início$/);
    await userEvent.click(january);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("goes neutral when nothing lands ahead, hiding amounts, and static without onOpen", () => {
    render(<MonthChips months={MONTHS} neutral />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    const november = screen.getByRole("listitem", { name: "novembro de 2026" });
    expect(november).not.toHaveTextContent("Crítico");
    expect(november).not.toHaveTextContent("12.346");
  });

  it("steps a low of 5 digits or more down a size and lets it break, so the chip never spills", () => {
    render(
      <MonthChips
        months={[
          { month: "2026-11", lowest: "red", low: "-12345.00", redDays: 30 },
          { month: "2026-12", lowest: "red", low: "-1234.00", redDays: 31 },
        ]}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText("-12.345")).toHaveClass("text-xs", "break-all");
    expect(screen.getByText("-1.234")).toHaveClass("text-sm", "break-all");
  });

  it("shows the low before the draft only where it moved, matched by month", () => {
    const before: MonthAhead[] = [
      { month: "2026-10", lowest: "green", low: "9000.00", redDays: 0 },
      { month: "2026-11", lowest: "light_green", low: "1210.00", redDays: 0 },
      { month: "2026-12", lowest: "green", low: "2500.99", redDays: 0 },
    ];
    render(<MonthChips months={MONTHS} before={before} />);

    const november = screen.getByRole("listitem", {
      name: `novembro de 2026: menor saldo -${R}12.345,67, Crítico, antes ${R}1.210,00`,
    });
    expect(november).toHaveTextContent("antes 1.210");
    const december = screen.getByRole("listitem", { name: `dezembro de 2026: menor saldo ${R}2.500,99, Folga` });
    expect(december).not.toHaveTextContent("antes");
  });
});
