import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithQuery } from "@/test/render";
import { stubApi } from "@/test/stub-api";

import PossoComprarPage from "./page";

describe("/posso-comprar", () => {
  it("renders the simulator", () => {
    stubApi({});
    renderWithQuery(<PossoComprarPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Posso comprar isso?" })).toBeInTheDocument();
  });
});
