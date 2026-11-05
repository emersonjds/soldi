import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import CategoriasPage from "./ajustes/categorias/page";

describe("screens still to come", () => {
  it.each([["Categorias", CategoriasPage]])("%s says it is on the way", (title, Page) => {
    render(<Page />);

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText(/em breve/)).toBeInTheDocument();
  });
});
