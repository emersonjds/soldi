import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EstimateIcon } from "./estimate-icon";

describe("EstimateIcon", () => {
  it("is a dashed outline circle, never filled", () => {
    const { container } = render(<EstimateIcon />);
    const circle = container.firstElementChild;

    expect(circle).toHaveAttribute("aria-hidden", "true");
    expect(circle).toHaveClass("border-dashed", "rounded-full");
    expect(circle?.className).not.toMatch(/\bbg-/);
    expect(circle?.querySelector("svg")).not.toBeNull();
  });
});
