import { render, screen } from "@testing-library/react";
import { PiggyBank } from "lucide-react";
import { describe, expect, it } from "vitest";

import { DashCard } from "./dash-card";

describe("DashCard", () => {
  it("names itself with a heading, links its action with a thumb-sized target, and shows its body", () => {
    render(
      <DashCard title="Para onde vai" action={{ href: "/para-onde-vai", label: "Ver tudo" }}>
        <p>Mercado 26%</p>
      </DashCard>,
    );

    expect(screen.getByRole("region", { name: "Para onde vai" })).toContainElement(
      screen.getByRole("heading", { level: 2, name: "Para onde vai" }),
    );
    const link = screen.getByRole("link", { name: "Ver tudo" });
    expect(link).toHaveAttribute("href", "/para-onde-vai");
    expect(link).toHaveClass("min-h-11");
    expect(screen.getByText("Mercado 26%")).toBeVisible();
  });

  it("keeps one name when its title changes with the width", () => {
    render(
      <DashCard title={<span>Contas do Mês</span>} label="Contas a pagar">
        <p>Luz</p>
      </DashCard>,
    );

    expect(screen.getByRole("region", { name: "Contas a pagar" })).toHaveTextContent("Contas do Mês");
  });

  it("puts an icon before the title and an arrow after the link, neither in their names", () => {
    const { container } = render(
      <DashCard title="Cofrinhos" icon={<PiggyBank />} action={{ href: "/economia", label: "Ver todos", arrow: true }}>
        <p>Reserva</p>
      </DashCard>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Cofrinhos" }).querySelector("svg")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver todos" })).toHaveTextContent("Ver todos→");
    expect(screen.getByRole("region", { name: "Cofrinhos" })).toBe(container.firstChild);
  });

  it("has no link without an action", () => {
    render(
      <DashCard title="Termômetro">
        <p>Folga</p>
      </DashCard>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Termômetro" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
