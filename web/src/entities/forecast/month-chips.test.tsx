import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MonthChips } from "./month-chips";
import type { MonthAhead } from "./months-ahead";

const R = "R$ ";

const MONTHS: MonthAhead[] = [
  { month: "2026-11", lowest: "red", low: "-12345.67", redDays: 7 },
  { month: "2026-12", lowest: "green", low: "2500.99", redDays: 0 },
  { month: "2027-01", lowest: null, low: null, redDays: 0 },
];

describe("MonthChips", () => {
  it("names each month with its tier, its lowest balance and red days, never color alone", async () => {
    const onOpen = vi.fn();
    render(<MonthChips months={MONTHS} current="2026-12" onOpen={onOpen} />);

    const november = screen.getByRole("button", {
      name: `nov 2026: Crítico, menor saldo -${R}12.345,67, 7 dias no vermelho`,
    });
    expect(november).toHaveTextContent("nov 2026-12.346Crítico7");
    const december = screen.getByRole("button", { name: `dez 2026: Folga, menor saldo ${R}2.500,99` });
    expect(december).toHaveAttribute("aria-current", "date");
    expect(december).toHaveTextContent("dez 20262.500Folga");
    await userEvent.click(november);
    expect(onOpen).toHaveBeenCalledWith("2026-11");
  });

  it("disables a month before the opening date, without an amount", async () => {
    const onOpen = vi.fn();
    render(<MonthChips months={MONTHS} onOpen={onOpen} />);

    const january = screen.getByRole("button", { name: "jan 2027: antes do início" });
    expect(january).toHaveAttribute("aria-disabled", "true");
    expect(january).toHaveTextContent(/^jan 2027Antes do início$/);
    await userEvent.click(january);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("goes neutral when nothing lands ahead, hiding amounts, and static without onOpen", () => {
    render(<MonthChips months={MONTHS} neutral />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    const november = screen.getByRole("listitem", { name: "nov 2026" });
    expect(november).not.toHaveTextContent("Crítico");
    expect(november).not.toHaveTextContent("12.346");
  });

  it("says one red day in the singular", () => {
    render(<MonthChips months={[{ month: "2026-11", lowest: "red", low: "-600.00", redDays: 1 }]} onOpen={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: `nov 2026: Crítico, menor saldo -${R}600,00, 1 dia no vermelho` }),
    ).toBeInTheDocument();
  });

  it("shows the low before the draft only where it moved, matched by month", () => {
    const before: MonthAhead[] = [
      { month: "2026-10", lowest: "green", low: "9000.00", redDays: 0 },
      { month: "2026-11", lowest: "light_green", low: "1210.00", redDays: 0 },
      { month: "2026-12", lowest: "green", low: "2500.99", redDays: 0 },
    ];
    render(<MonthChips months={MONTHS} before={before} />);

    const november = screen.getByRole("listitem", {
      name: `nov 2026: Crítico, menor saldo -${R}12.345,67, 7 dias no vermelho, antes ${R}1.210,00`,
    });
    expect(november).toHaveTextContent("antes 1.210");
    const december = screen.getByRole("listitem", { name: `dez 2026: Folga, menor saldo ${R}2.500,99` });
    expect(december).not.toHaveTextContent("antes");
  });
});
