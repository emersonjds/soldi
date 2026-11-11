import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import RootLayout from "./layout";
import { readFileSync } from "node:fs";

vi.mock("next/font/google", () => ({ Inter: () => ({ variable: "font-inter" }) }));
vi.mock("@/components/ui/sonner", () => ({
  Toaster: (props: object) => <output data-props={JSON.stringify(props)} />,
}));

const stylesheet = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("tab bar space", () => {
  it("lifts toasts above the mobile tab bar by the preset's --tabbar-space, safe area included", () => {
    const markup = renderToStaticMarkup(<RootLayout>conteúdo</RootLayout>);

    expect(markup).toContain("var(--tabbar-space)");
    expect(stylesheet("../styles/presets/soldi.css")).toMatch(
      /--tabbar-space: calc\([^;]*env\(safe-area-inset-bottom\)\);/,
    );
  });
});

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
