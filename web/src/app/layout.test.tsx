import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import RootLayout from "./layout";
import { readFileSync } from "node:fs";

vi.mock("next/font/google", () => ({ Inter: () => ({ variable: "font-inter" }) }));

const stylesheet = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("light theme only", () => {
  it("renders <html> on the Soldi light preset with no theme mode or color-scheme detection", () => {
    const markup = renderToStaticMarkup(<RootLayout>conteúdo</RootLayout>);

    expect(markup).toContain('data-theme-preset="soldi"');
    expect(markup).not.toContain("data-theme-mode");
    expect(markup).not.toContain("prefers-color-scheme");
  });

  it("ships no dark token block in the stylesheets", () => {
    for (const path of ["./globals.css", "../styles/presets/soldi.css"]) {
      expect(stylesheet(path)).not.toMatch(/^\s*\.dark\b/m);
    }
  });
});
