import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Wordmark } from "./wordmark";

describe("Wordmark", () => {
  it("puts the day-trail mark left of soldi in lowercase Nunito slate, named Soldi", () => {
    render(<Wordmark />);

    const lockup = screen.getByRole("img", { name: "Soldi" });
    expect(lockup).toHaveTextContent(/^soldi$/);
    expect(lockup).toHaveClass("inline-flex", "items-center", "font-wordmark", "font-bold", "text-wordmark");
    expect(lockup).not.toHaveClass("flex-col");
    expect(lockup.firstElementChild?.tagName).toBe("svg");
    expect(lockup.querySelectorAll("circle")).toHaveLength(5);
  });

  it("stacks the mark above the name when stacked", () => {
    render(<Wordmark stacked className="text-hero-foreground text-4xl" />);

    const lockup = screen.getByRole("img", { name: "Soldi" });
    expect(lockup).toHaveClass("flex-col", "text-hero-foreground", "text-4xl");
    expect(lockup).not.toHaveClass("text-wordmark", "text-2xl");
    expect(lockup.firstElementChild?.tagName).toBe("svg");
  });
});
