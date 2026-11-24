import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CurrencyContext } from "@/shared/lib/currency";
import { setSearch } from "@/test/next-navigation";

import { EstimateNote } from "./estimate-note";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

afterEach(() => setSearch(""));

describe("EstimateNote", () => {
  it("links to the setting with the rate, keeping the viewed month, at 44 px", () => {
    setSearch("m=2026-12");
    render(<EstimateNote estimate="50.00" />);

    const link = screen.getByRole("link", { name: /^Inclui Diário previsto de R\$\s50,00\/dia$/ });
    expect(link).toHaveAttribute("href", "/ajustes?m=2026-12#diario-previsto");
    expect(link).toHaveClass("min-h-11", "focus-visible:outline-ring");
  });

  it("shows the rate in the chosen currency", () => {
    render(
      <CurrencyContext value="EUR">
        <EstimateNote estimate="10000.00" />
      </CurrencyContext>,
    );

    expect(screen.getByRole("link")).toHaveTextContent(/^Inclui Diário previsto de € 10\.000,00\/dia$/);
  });
});
