import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TierPill } from "./tier-pill";

describe("TierPill", () => {
  it("says Previsto before the tier label of a forecast", () => {
    const { container } = render(<TierPill tier="red" amount="-675.00" forecast />);

    expect(container).toHaveTextContent("-R$ 675,00Previsto · Crítico");
  });

  it("keeps the plain label for a closed day", () => {
    render(<TierPill tier="yellow" />);

    expect(screen.getByText("Apertado")).toBeInTheDocument();
  });
});
