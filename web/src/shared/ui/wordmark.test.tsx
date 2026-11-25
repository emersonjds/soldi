import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Wordmark } from "./wordmark";

describe("Wordmark", () => {
  it("writes soldi in lowercase Nunito slate, named Soldi, with no brand dot", () => {
    const { container } = render(<Wordmark />);

    const mark = screen.getByRole("img", { name: "Soldi" });
    expect(mark).toHaveTextContent(/^soldi$/);
    expect(mark).toHaveClass("font-wordmark", "font-bold", "text-wordmark");
    expect(container.querySelector(".bg-brand")).toBeNull();
  });
});
