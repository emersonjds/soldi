import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/test/render";
import { stubApi } from "@/test/stub-api";

import ApagarPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

describe("Ajustes › Apagar lançamentos", () => {
  it("titles the screen and links back to Ajustes", () => {
    stubApi({ "GET /api/transactions/count": { status: 200, body: { count: 0 } } });
    renderWithQuery(<ApagarPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Apagar lançamentos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ajustes" })).toHaveAttribute("href", "/ajustes");
    expect(screen.getByRole("radio", { name: "Mês" })).toBeInTheDocument();
  });
});
