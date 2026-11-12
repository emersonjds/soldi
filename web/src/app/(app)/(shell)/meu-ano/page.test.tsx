import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithQuery } from "@/test/render";
import { stubApi } from "@/test/stub-api";

import MeuAnoPage from "./page";

describe("/meu-ano", () => {
  it("renders the year review", () => {
    stubApi({});
    renderWithQuery(<MeuAnoPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Meu ano" })).toBeInTheDocument();
  });
});
