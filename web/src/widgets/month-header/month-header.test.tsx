import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MonthHeader, YearHeader } from "./month-header";

describe("MonthHeader", () => {
  it("shows the screen's title, left to the top bar on desktop, and no switcher", () => {
    render(<MonthHeader title="Para onde vai" />);

    expect(screen.getByRole("heading", { level: 1, name: "Para onde vai" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Para onde vai" })).toHaveClass("lg:sr-only");
    expect(screen.queryByRole("group", { name: "Mês" })).not.toBeInTheDocument();
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
