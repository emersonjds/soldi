import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PalettePicker } from "./palette-picker";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.palette;
});

describe("PalettePicker", () => {
  it("offers the eight palettes with Mel e menta checked when nothing is stored", () => {
    render(<PalettePicker />);

    expect(screen.getByRole("radiogroup", { name: "Paleta" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(8);
    expect(screen.getAllByRole("radio")[1]).toHaveAccessibleName("Violeta original");
    expect(screen.getByRole("radio", { name: "Mel e menta" })).toBeChecked();
  });

  it("applies and stores the chosen palette at once, and Mel e menta clears both", async () => {
    const user = userEvent.setup();
    render(<PalettePicker />);

    await user.click(screen.getByRole("radio", { name: "Ameixa e mel" }));
    expect(screen.getByRole("radio", { name: "Ameixa e mel" })).toBeChecked();
    expect(document.documentElement.dataset.palette).toBe("ameixa");
    expect(localStorage.getItem("soldi-palette")).toBe("ameixa");

    await user.click(screen.getByRole("radio", { name: "Mel e menta" }));
    expect(document.documentElement.dataset.palette).toBeUndefined();
    expect(localStorage.getItem("soldi-palette")).toBeNull();
  });

  it("checks the stored palette and falls back to Mel e menta for an unknown one", () => {
    localStorage.setItem("soldi-palette", "berinjela");
    const { unmount } = render(<PalettePicker />);
    expect(screen.getByRole("radio", { name: "Berinjela e pêssego" })).toBeChecked();
    unmount();

    localStorage.setItem("soldi-palette", "roxo");
    render(<PalettePicker />);
    expect(screen.getByRole("radio", { name: "Mel e menta" })).toBeChecked();
  });

  it("still switches the palette for this visit when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const user = userEvent.setup();
    render(<PalettePicker />);
    expect(screen.getByRole("radio", { name: "Mel e menta" })).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "Índigo e menta" }));
    expect(document.documentElement.dataset.palette).toBe("indigo");
  });
});
