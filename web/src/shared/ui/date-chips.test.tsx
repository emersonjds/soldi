import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Input } from "@/components/ui/input";

import { DateChips } from "./date-chips";

const showPicker = vi.fn();

beforeEach(() => {
  HTMLInputElement.prototype.showPicker = showPicker;
});

afterEach(() => {
  showPicker.mockReset();
});

describe("date fields open the calendar on click", () => {
  it("opens it from anywhere on the Outra data chip", async () => {
    render(<DateChips legend="Quando" value="2026-11-08" onChange={vi.fn()} />);

    await userEvent.click(screen.getByText("Outra data"));

    expect(showPicker).toHaveBeenCalledOnce();
  });

  it("opens it from a date Input and still runs the caller's click", async () => {
    const onClick = vi.fn();
    render(<Input aria-label="Prazo" type="date" onClick={onClick} />);

    await userEvent.click(screen.getByLabelText("Prazo"));

    expect(showPicker).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("leaves other Inputs alone", async () => {
    render(<Input aria-label="Nome" />);

    await userEvent.click(screen.getByLabelText("Nome"));

    expect(showPicker).not.toHaveBeenCalled();
  });
});
