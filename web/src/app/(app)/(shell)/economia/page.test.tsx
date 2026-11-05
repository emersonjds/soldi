import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import EconomiaPage from "./page";

describe("Cofrinhos", () => {
  it("is titled Cofrinhos", () => {
    render(<EconomiaPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Cofrinhos" })).toBeInTheDocument();
  });
});
