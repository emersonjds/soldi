import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setSearch } from "@/test/next-navigation";

import { MonthLink } from "./month-link";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

describe("MonthLink", () => {
  beforeEach(() => setSearch(""));

  it("carries a valid ?m= and keeps the link's own query", () => {
    setSearch("m=2026-12");
    render(<MonthLink href="/tour?replay=1">Como funciona</MonthLink>);

    expect(screen.getByRole("link", { name: "Como funciona" })).toHaveAttribute("href", "/tour?replay=1&m=2026-12");
  });

  it.each(["", "m=garbage", "m=2026-13", "m=x%26lancar%3D1"])("drops ?m= when it is not a month (%s)", (query) => {
    setSearch(query);
    render(<MonthLink href="/mes">Mês</MonthLink>);

    expect(screen.getByRole("link", { name: "Mês" })).toHaveAttribute("href", "/mes");
  });
});
