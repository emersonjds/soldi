import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TierPill } from "./tier-pill";

describe("TierPill", () => {
  it("says Previsto before the tier label of a forecast", () => {
    const { container } = render(<TierPill tier="red" amount="-675.00" forecast />);

    expect(container).toHaveTextContent("-R$ 675,00Previsto · Crítico");
  });

  it.each([
    ["red", "Crítico", "text-tier-red-foreground"],
    ["light_red", "Atenção", "text-tier-light-red-foreground"],
    ["yellow", "Apertado", "text-tier-yellow-foreground"],
    ["light_green", "Confortável", "text-tier-light-green-foreground"],
    ["green", "Folga", "text-tier-green-foreground"],
  ] as const)("writes %s in its AA text color, not the dot color", (tier, label, textClass) => {
    render(<TierPill tier={tier} />);

    expect(screen.getByText(label)).toHaveClass(textClass);
  });

  it("keeps the plain label for a closed day", () => {
    render(<TierPill tier="yellow" />);

    expect(screen.getByText("Apertado")).toBeInTheDocument();
  });
});
