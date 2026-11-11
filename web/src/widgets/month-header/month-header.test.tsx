import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MonthHeader, YearHeader } from "./month-header";

describe("MonthHeader", () => {
  it("shows today's balance and its tier label, and leaves the month to the shell", () => {
    render(<MonthHeader balance="1842.10" tier="light_green" />);

    expect(screen.queryByRole("group", { name: "Mês" })).not.toBeInTheDocument();
    expect(screen.getByText("Saldo hoje")).toBeInTheDocument();
    expect(screen.getByText("R$ 1.842,10")).toBeInTheDocument();
    expect(screen.getByText("Confortável")).toBeInTheDocument();
  });

  it("shows what the page puts under the balance", () => {
    render(
      <MonthHeader balance="0" tier="yellow">
        <p>Dia 23 fica no vermelho</p>
      </MonthHeader>,
    );

    expect(
      within(screen.getByRole("region", { name: "Saldo hoje" })).getByText("Dia 23 fica no vermelho"),
    ).toBeVisible();
  });

  it("has a compact variant: the screen's title, no balance and no switcher", () => {
    render(<MonthHeader title="Para onde vai" />);

    expect(screen.getByRole("heading", { level: 1, name: "Para onde vai" })).toBeInTheDocument();
    expect(screen.queryByText("Saldo hoje")).not.toBeInTheDocument();
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
