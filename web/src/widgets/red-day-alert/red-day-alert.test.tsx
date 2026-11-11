import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ForecastAlert } from "@/entities/month/forecast-alert";

import { RedDayAlert } from "./red-day-alert";

const OWNER: ForecastAlert = {
  firstRed: { date: "2026-11-23", balance: "-675.00", today: false },
  lowest: { date: "2026-11-28", balance: "-2916.00" },
};

const TODAY: ForecastAlert = {
  firstRed: { date: "2026-11-10", balance: "-675.00", today: true },
  lowest: { date: "2026-11-10", balance: "-675.00" },
};

const text = (element: HTMLElement) => element.textContent?.replace(/\s/g, " ");

const banner = () => screen.getByRole("region", { name: "Alerta do mês" });

describe("RedDayAlert", () => {
  it("names the first red day and its two largest outflows, with no worst-day line", () => {
    render(<RedDayAlert alert={OWNER} outflows={["Cartão", "Seguro"]} onJump={vi.fn()} />);

    expect(text(within(banner()).getByRole("paragraph"))).toBe(
      "Dia 23 fica no vermelho: -R$ 675,00. Contas de Cartão e Seguro previstas excedem o saldo em caixa projetado.",
    );
    const title = within(banner()).getByRole("paragraph").firstElementChild as HTMLElement;
    expect(text(title)).toBe("Dia 23 fica no vermelho: -R$ 675,00.");
    expect(title).toHaveClass("font-bold");
    expect(within(title).getByText("-R$ 675,00")).toHaveClass("whitespace-nowrap");
    expect(banner()).toHaveClass("bg-expense-soft");
    expect(within(banner()).getAllByRole("button").map(text)).toEqual(["Ver o dia 23"]);
    expect(banner()).not.toHaveTextContent("Pior dia");
  });

  it("says Hoje when today is red, in the singular with one outflow", () => {
    render(<RedDayAlert alert={TODAY} outflows={["Aluguel"]} onJump={vi.fn()} />);

    expect(text(within(banner()).getByRole("paragraph"))).toBe(
      "Hoje está no vermelho: -R$ 675,00. Conta de Aluguel prevista excede o saldo em caixa projetado.",
    );
    expect(within(banner()).getByRole("button", { name: "Ver hoje" })).toBeInTheDocument();
  });

  it("omits the cause when the day has no outflow", () => {
    render(<RedDayAlert alert={OWNER} outflows={[]} onJump={vi.fn()} />);

    expect(text(within(banner()).getByRole("paragraph"))).toBe("Dia 23 fica no vermelho: -R$ 675,00.");
  });

  it("jumps to the red day", async () => {
    const onJump = vi.fn();
    render(<RedDayAlert alert={OWNER} outflows={[]} onJump={onJump} />);

    await userEvent.click(screen.getByRole("button", { name: "Ver o dia 23" }));
    expect(onJump).toHaveBeenCalledWith("2026-11-23");
  });
});
