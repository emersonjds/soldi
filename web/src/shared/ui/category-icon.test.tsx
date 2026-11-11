import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CategoryIcon } from "./category-icon";

describe("CategoryIcon", () => {
  it("is a solid circle by default", () => {
    const { container } = render(<CategoryIcon icon="home" color="cat-6" />);
    expect(container.firstElementChild).toHaveClass("bg-cat-6", "text-white");
    expect(container.firstElementChild).not.toHaveClass("lg:bg-(--cat)/15");
  });

  it("tints at 15% with the glyph in the color from 1024 px when asked", () => {
    const { container } = render(<CategoryIcon icon="home" color="cat-6" tintedOnDesktop />);
    const circle = container.firstElementChild as HTMLElement;
    expect(circle).toHaveClass("bg-cat-6", "lg:bg-(--cat)/15", "lg:text-(--cat)");
    expect(circle.style.getPropertyValue("--cat")).toBe("var(--cat-6)");
  });
});
