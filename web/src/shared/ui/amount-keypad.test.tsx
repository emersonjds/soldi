import { useState } from "react";

import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AmountKeypad, KEYPAD_QUERY, useKeypad } from "./amount-keypad";

const Harness = ({ initial = "", outside }: { initial?: string; outside?: string }) => {
  const [value, setValue] = useState(initial);
  return (
    <>
      <output aria-label="Valor">{value}</output>
      <AmountKeypad value={value} onValueChange={setValue} />
      {outside !== undefined && (
        <button type="button" onClick={() => setValue(outside)}>
          Fora
        </button>
      )}
    </>
  );
};

const tap = async (...keys: string[]) => {
  for (const key of keys) await userEvent.click(screen.getByRole("button", { name: key }));
};
const value = () => screen.getByRole("status", { name: "Valor" }).textContent;

describe("AmountKeypad", () => {
  it("offers 1–9, the comma, 0 and Apagar in a 4×3 grid of 56 px keys", () => {
    render(<Harness />);

    const keys = screen.getAllByRole("button");
    expect(keys.map((key) => key.getAttribute("aria-label") ?? key.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      ",",
      "0",
      "Apagar",
    ]);
    expect(keys[0].parentElement).toHaveClass("grid-cols-3");
    for (const key of keys) expect(key).toHaveClass("h-14");
  });

  it("enters like a calculator: reais until the comma, then up to two cents padded with zero", async () => {
    render(<Harness />);

    await tap("1", "2", ",", "5");
    expect(value()).toBe("12.50");
    await tap("Apagar", "Apagar", "Apagar", "Apagar");
    expect(value()).toBe("");
    await tap("3", "5");
    expect(value()).toBe("35.00");
  });

  it("ignores a second comma, a third cent and an eleventh real digit", async () => {
    render(<Harness />);

    await tap("1", "2", "3", "4", "5", ",", "6", ",", "7", "8");
    expect(value()).toBe("12345.67");
    await tap("Apagar", "Apagar", "Apagar", "Apagar", "Apagar", "Apagar", "Apagar", "Apagar");
    await tap(..."12345678901".split(""));
    expect(value()).toBe("1234567890.00");
  });

  it("removes the last typed key with Apagar: 12,5 → 12, → 12 → 1 → empty", async () => {
    render(<Harness />);

    await tap("1", "2", ",", "5");
    const seen: (string | null)[] = [];
    for (let step = 0; step < 4; step += 1) {
      await tap("Apagar");
      seen.push(value());
    }
    expect(seen).toEqual(["12.00", "12.00", "1.00", ""]);
    await tap("Apagar", "7");
    expect(value()).toBe("7.00");
  });

  it("starts from a value set outside the keypad: its reais, then its cents without trailing zeros", async () => {
    render(<Harness initial="12.50" outside="" />);

    await tap("Apagar", "3");
    expect(value()).toBe("12.30");
    await userEvent.click(screen.getByRole("button", { name: "Fora" }));
    await tap("5");
    expect(value()).toBe("5.00");
  });

  it("continues a whole value from outside in reais", async () => {
    render(<Harness initial="35.00" />);

    await tap("1");
    expect(value()).toBe("351.00");
  });
});

describe("useKeypad", () => {
  it("shows under 1024 px on a coarse pointer only", () => {
    const base = window.matchMedia("");
    expect(renderHook(() => useKeypad()).result.current).toBe(false);

    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      ...base,
      media: query,
      matches: query === KEYPAD_QUERY,
    }));
    expect(renderHook(() => useKeypad()).result.current).toBe(true);
  });
});
