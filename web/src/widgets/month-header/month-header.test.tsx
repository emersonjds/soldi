import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MonthHeader } from "./month-header";

describe("MonthHeader", () => {
  it("shows the screen's title, left to the top bar on desktop, and no switcher", () => {
    render(<MonthHeader title="Para onde vai" />);

    expect(screen.getByRole("heading", { level: 1, name: "Para onde vai" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Para onde vai" })).toHaveClass("lg:sr-only");
    expect(screen.queryByRole("group", { name: "Mês" })).not.toBeInTheDocument();
  });
});
