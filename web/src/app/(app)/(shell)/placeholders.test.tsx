import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import EconomiaPage from "./economia/page";
import ParaOndeVaiPage from "./para-onde-vai/page";

describe("screens still to come", () => {
  it.each([
    ["Para onde vai", ParaOndeVaiPage],
    ["Economia", EconomiaPage],
  ])("%s says it is on the way", (title, Page) => {
    render(<Page />);

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText(/em breve/)).toBeInTheDocument();
  });
});
