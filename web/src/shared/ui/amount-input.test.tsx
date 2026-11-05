import { useState } from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AmountInput } from "./amount-input";

const Harness = ({ initial = "", negative = false, onValue = vi.fn() }) => {
  const [value, setValue] = useState(initial);
  return (
    <AmountInput
      aria-label="Valor"
      value={value}
      negative={negative}
      onValueChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
};

const field = () => screen.getByRole("textbox", { name: "Valor" });

describe("AmountInput", () => {
  it.each([
    ["1", "0,01"],
    ["100", "1,00"],
    ["10000", "100,00"],
    ["123456", "1.234,56"],
  ])("typing %s shows %s, cents filling from the right", async (typed, shown) => {
    render(<Harness />);
    await userEvent.type(field(), typed);
    expect(field()).toHaveValue(shown);
  });

  it("hands the form the API decimal and Backspace drops the last digit", async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    await userEvent.type(field(), "123456");
    expect(onValue).toHaveBeenLastCalledWith("1234.56");
    await userEvent.type(field(), "{Backspace}");
    expect(field()).toHaveValue("123,45");
    expect(onValue).toHaveBeenLastCalledWith("123.45");
  });

  it("starts from the given decimal and keeps the caret at the end", async () => {
    render(<Harness initial="1842.1" />);

    expect(field()).toHaveValue("1.842,10");
    expect(field()).toHaveAttribute("inputmode", "numeric");
    const input = field() as HTMLInputElement;
    input.focus();
    input.setSelectionRange(1, 1);
    fireEvent.select(input);
    expect(input.selectionStart).toBe(input.value.length);
  });

  it.each([
    ["1.234,56", "1.234,56"],
    ["1234.56", "1.234,56"],
    ["R$ 35", "35,00"],
  ])("takes a pasted %j as %s", async (pasted, shown) => {
    render(<Harness initial="9.99" />);
    await userEvent.click(field());
    await userEvent.paste(pasted);
    expect(field()).toHaveValue(shown);
  });

  it("ignores a paste that is no amount", async () => {
    render(<Harness initial="9.99" />);
    await userEvent.click(field());
    await userEvent.paste("abc");
    expect(field()).toHaveValue("9,99");
  });

  it("takes a minus only when negative is allowed", async () => {
    const { unmount } = render(<Harness />);
    await userEvent.type(field(), "-5");
    expect(field()).toHaveValue("0,05");
    unmount();

    render(<Harness negative />);
    await userEvent.type(field(), "-5");
    expect(field()).toHaveValue("-0,05");
  });
});
