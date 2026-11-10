import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MonthChips } from "./month-chips";
import type { MonthAhead } from "./months-ahead";

const MONTHS: MonthAhead[] = [
  { month: "2026-11", lowest: "red", redDays: 7 },
  { month: "2026-12", lowest: "green", redDays: 0 },
  { month: "2027-01", lowest: null, redDays: 0 },
];

describe("MonthChips", () => {
  it("names each month with its tier and red days, never color alone", async () => {
    const onOpen = vi.fn();
    render(<MonthChips months={MONTHS} current="2026-12" onOpen={onOpen} />);

    const november = screen.getByRole("button", { name: "nov 2026: Crítico, 7 dias no vermelho" });
    expect(november).toHaveTextContent("nov 2026Crítico7");
    expect(screen.getByRole("button", { name: "dez 2026: Folga" })).toHaveAttribute("aria-current", "date");
    await userEvent.click(november);
    expect(onOpen).toHaveBeenCalledWith("2026-11");
  });

  it("disables a month before the opening date", async () => {
    const onOpen = vi.fn();
    render(<MonthChips months={MONTHS} onOpen={onOpen} />);

    const january = screen.getByRole("button", { name: "jan 2027: antes do início" });
    expect(january).toHaveAttribute("aria-disabled", "true");
    expect(january).toHaveTextContent("Antes do início");
    await userEvent.click(january);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("goes neutral when nothing lands ahead and static without onOpen", () => {
    render(<MonthChips months={MONTHS} neutral />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "nov 2026" })).not.toHaveTextContent("Crítico");
  });

  it("says one red day in the singular", () => {
    render(<MonthChips months={[{ month: "2026-11", lowest: "red", redDays: 1 }]} onOpen={vi.fn()} />);
    expect(screen.getByRole("button", { name: "nov 2026: Crítico, 1 dia no vermelho" })).toBeInTheDocument();
  });
});
