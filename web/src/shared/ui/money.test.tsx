import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Money } from "./money";

describe("Money", () => {
  it("writes income in the AA text green, not the fill green", () => {
    render(<Money amount="1234.50" income />);

    const amount = screen.getByText(/1\.234,50/);
    expect(amount).toHaveClass("text-income-text");
    expect(amount).not.toHaveClass("text-income");
  });

  it("writes a negative amount in the expense red", () => {
    render(<Money amount="-10.00" />);

    expect(screen.getByText(/10,00/)).toHaveClass("text-expense");
  });
});
