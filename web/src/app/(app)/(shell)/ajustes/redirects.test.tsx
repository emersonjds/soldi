import type { ComponentType } from "react";

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { router, setSearch } from "@/test/next-navigation";

import ApagarPage from "./apagar/page";
import ContaPage from "./conta/page";
import MoedaPage from "./moeda/page";
import SaldoInicialPage from "./saldo-inicial/page";
import TermometroPage from "./termometro/page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

const OLD_ROUTES: [string, ComponentType, string][] = [
  ["termometro", TermometroPage, "/ajustes#termometro"],
  ["moeda", MoedaPage, "/ajustes#moeda"],
  ["saldo-inicial", SaldoInicialPage, "/ajustes#moeda"],
  ["apagar", ApagarPage, "/ajustes#dados"],
  ["conta", ContaPage, "/ajustes#conta"],
];

describe("Old Ajustes subpages", () => {
  beforeEach(() => router.replace.mockClear());

  it.each(OLD_ROUTES)("/ajustes/%s lands on its section", (_, Page, target) => {
    render(<Page />);

    expect(router.replace).toHaveBeenCalledWith(target);
  });

  it("keeps the viewed month", () => {
    setSearch("m=2026-12");
    render(<TermometroPage />);

    expect(router.replace).toHaveBeenCalledWith("/ajustes?m=2026-12#termometro");
    setSearch("");
  });
});
