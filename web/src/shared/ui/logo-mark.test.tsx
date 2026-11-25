import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LogoMark } from "./logo-mark";

describe("LogoMark", () => {
  it("draws the day trail as five dots, each filled by its logo token, hidden from assistive tech", () => {
    const { container } = render(<LogoMark className="size-4" />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("viewBox", "0 0 100 100");
    expect(svg).toHaveClass("size-4");
    const dots = [...container.querySelectorAll("circle")].map((dot) => [
      dot.getAttribute("cx"),
      dot.getAttribute("cy"),
      dot.getAttribute("r"),
      dot.getAttribute("fill"),
    ]);
    expect(dots).toEqual([
      ["70", "16", "6", "var(--logo-1)"],
      ["52", "30", "8", "var(--logo-2)"],
      ["59", "50", "10", "var(--logo-3)"],
      ["74", "69", "11.5", "var(--logo-4)"],
      ["38", "80", "14", "var(--logo-5)"],
    ]);
  });
});
