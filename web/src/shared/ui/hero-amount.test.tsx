import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HeroAmount } from "./hero-amount";

const field = (value: string) => {
  render(<HeroAmount id="amount" value={value} onChange={() => undefined} invalid={false} />);
  return screen.getByLabelText("Valor").parentElement;
};

describe("HeroAmount", () => {
  it("shows up to 999.999,99 at the full size", () => {
    expect(field("999999.99")).toHaveClass("overflow-hidden", "text-[34px]");
  });

  it("steps the largest amount down a size and clips, so mirror and caret never spill", () => {
    expect(field("9999999999.99")).toHaveClass("overflow-hidden", "text-xl");
  });
});
