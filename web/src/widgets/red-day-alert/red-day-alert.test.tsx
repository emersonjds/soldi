import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ForecastAlert } from "@/entities/month/forecast-alert";

import { RedDayAlert } from "./red-day-alert";

const OWNER: ForecastAlert = {
  firstRed: { date: "2026-11-23", balance: "-675.00", today: false },
  lowest: { date: "2026-11-28", balance: "-2916.00" },
  recoversOn: "2026-11-30",
};

const text = (element: HTMLElement) => element.textContent?.replace(/\s/g, " ");

describe("RedDayAlert", () => {
  it("names the first red day and the worst day with its recovery", () => {
    render(<RedDayAlert alert={OWNER} onJump={vi.fn()} />);

    expect(screen.getAllByRole("button").map(text)).toEqual([
      "Dia 23 fica no vermelho: -R$ 675,00",
      "Pior dia: 28/11, -R$ 2.916,00 · recupera em 30/11",
    ]);
  });

  it("says Hoje when today is red, in one line when today is also the worst", () => {
    const today = { date: "2026-11-10", balance: "-675.00" };
    render(
      <RedDayAlert alert={{ firstRed: { ...today, today: true }, lowest: today, recoversOn: null }} onJump={vi.fn()} />,
    );

    expect(screen.getAllByRole("button").map(text)).toEqual(["Hoje está no vermelho: -R$ 675,00"]);
  });

  it("drops the recovery when the month ends red", () => {
    render(<RedDayAlert alert={{ ...OWNER, recoversOn: null }} onJump={vi.fn()} />);

    expect(text(screen.getByRole("button", { name: /Pior dia/ }))).toBe("Pior dia: 28/11, -R$ 2.916,00");
  });

  it("jumps to the day of the tapped line", async () => {
    const onJump = vi.fn();
    render(<RedDayAlert alert={OWNER} onJump={onJump} />);

    await userEvent.click(screen.getByRole("button", { name: /Pior dia/ }));
    expect(onJump).toHaveBeenLastCalledWith("2026-11-28");
    await userEvent.click(screen.getByRole("button", { name: /Dia 23/ }));
    expect(onJump).toHaveBeenLastCalledWith("2026-11-23");
  });
});
