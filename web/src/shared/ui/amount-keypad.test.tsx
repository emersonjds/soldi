import { useState } from "react";

import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AmountKeypad, KEYPAD_QUERY, useKeypad } from "./amount-keypad";

const Harness = ({ initial = "" }) => {
  const [value, setValue] = useState(initial);
  return (
    <>
      <output aria-label="Valor">{value}</output>
      <AmountKeypad value={value} onValueChange={setValue} />
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

  it("fills the cents from the right, bank-style, as the amount field does", async () => {
    render(<Harness />);

    await tap("1", "2", "3", "4", "5");
    expect(value()).toBe("123.45");
  });

  it("sends the comma through the mask, so it never moves the cents", async () => {
    render(<Harness initial="1.25" />);

    await tap(",");
    expect(value()).toBe("1.25");
    await tap("0");
    expect(value()).toBe("12.50");
  });

  it("drops the last digit with Apagar and empties the field once only zeros are left", async () => {
    render(<Harness initial="1234.56" />);

    await tap("Apagar");
    expect(value()).toBe("123.45");
    await tap("Apagar", "Apagar", "Apagar", "Apagar");
    expect(value()).toBe("0.01");
    await tap("Apagar");
    expect(value()).toBe("");
    await tap("Apagar");
    expect(value()).toBe("");
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
