import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { MONTH } from "@/test/stub-api";

import { ThermometerCard } from "./month-overview";

type MonthView = Schemas["MonthView"];

const STITCH: MonthView = {
  ...MONTH,
  balance_today_tier: "light_green",
  projected_tier: "light_green",
  totals: {
    income: "6361.60",
    withdrawn: "0.00",
    bills: "2708.00",
    daily: "1548.50",
    outflow: "4256.50",
    performance: "2105.10",
    saved: "0.00",
  },
};

const card = () => screen.getByRole("region", { name: "Termômetro do Mês" });

/** The span that reads `text` as a whole. */
const sentence = (text: string) =>
  within(card()).getByText(
    (_, element) => element?.tagName === "SPAN" && element.textContent?.replace(/\s/g, " ") === text,
  );

describe("Termômetro do Mês", () => {
  it("heads with the spent share, as Gasto from 1024 and Comprometido below", () => {
    render(<ThermometerCard view={STITCH} />);

    expect(within(card()).getByText("67% Gasto")).toHaveClass("hidden", "lg:inline");
    expect(within(card()).getByText("67% Comprometido")).toHaveClass("lg:hidden", "bg-tier-light-green-soft");
  });

  it("boxes Entradas, Saídas and a signed Resultado from 1024, wrapping a row rather than clipping five digits", () => {
    render(<ThermometerCard view={STITCH} />);

    const box = within(card()).getByText("Resultado").parentElement?.parentElement as HTMLElement;
    expect(box).toHaveClass("hidden", "lg:flex", "flex-wrap");
    expect(box.textContent?.replace(/\s/g, " ")).toBe("EntradasR$ 6.361,60SaídasR$ 4.256,50Resultado+ R$ 2.105,10");
    expect(within(box).getByText("R$ 6.361,60")).toHaveClass("text-income-text");
    expect(within(box).getByText("+ R$ 2.105,10")).toHaveClass("text-income-text");
  });

  it("marks Você está aqui on the strip from 1024 and writes the insight for each width", () => {
    render(<ThermometerCard view={STITCH} />);

    expect(within(card()).getByText("Você está aqui: Confortável")).toHaveClass("hidden", "lg:block");
    expect(sentence("Você comprometeu 67% da renda líquida.")).toHaveClass("lg:hidden");
    expect(sentence("Você comprometeu 67% das receitas líquidas.")).toHaveClass("hidden", "lg:inline");
    expect(sentence("Com as contas em aberto, o caixa fecha o mês no verde.")).toBeInTheDocument();
    expect(within(card()).getByText("verde")).toHaveClass("font-bold", "text-tier-light-green-foreground");
    expect(card()).not.toHaveTextContent(/ritmo|Guardou/i);
  });

  it("writes a negative Resultado in red with a minus, and a projected red or yellow month by its word", () => {
    const { rerender } = render(
      <ThermometerCard
        view={{
          ...MONTH,
          projected_tier: "red",
          totals: { ...MONTH.totals, saved: "250.00" },
        }}
      />,
    );

    expect(within(card()).getByText("- R$ 884,31")).toHaveClass("text-expense");
    expect(within(card()).getByText("vermelho")).toHaveClass("text-tier-red-foreground");
    expect(card()).not.toHaveTextContent("Guardou");

    rerender(<ThermometerCard view={{ ...MONTH, projected_tier: "light_red" }} />);
    expect(within(card()).getByText("vermelho")).toHaveClass("text-tier-light-red-foreground");
    rerender(<ThermometerCard view={{ ...MONTH, projected_tier: "yellow" }} />);
    expect(within(card()).getByText("amarelo")).toHaveClass("text-tier-yellow-foreground");
    rerender(<ThermometerCard view={{ ...MONTH, projected_tier: "green" }} />);
    expect(within(card()).getByText("verde")).toHaveClass("text-tier-green-foreground");
  });

  it("says no entrada yet and shows no share when the month has only outflow", () => {
    render(<ThermometerCard view={{ ...MONTH, totals: { ...MONTH.totals, income: "0.00" } }} />);

    expect(sentence("Nenhuma entrada ainda este mês.")).toBeInTheDocument();
    expect(card()).not.toHaveTextContent(/Gasto|Comprometido|comprometeu/);
  });

  it("renders nothing on a month with no entrada and no saída (D25)", () => {
    const { container } = render(
      <ThermometerCard view={{ ...MONTH, totals: { ...MONTH.totals, income: "0.00", outflow: "0.00" } }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
