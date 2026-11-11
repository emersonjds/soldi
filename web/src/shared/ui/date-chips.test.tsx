import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Input } from "@/components/ui/input";
import { pickDate } from "@/test/pick-date";

import { DateChips } from "./date-chips";

const showPicker = vi.fn();

beforeEach(() => {
  HTMLInputElement.prototype.showPicker = showPicker;
});

afterEach(() => {
  showPicker.mockReset();
});

describe("DateChips", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 8, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps Hoje and Ontem and takes any other day from the calendar, focus back on Outra data", async () => {
    const onChange = vi.fn();
    render(<DateChips legend="Quando" value="2026-11-08" onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Ontem" })).toHaveAttribute("aria-pressed", "false");
    await pickDate("Outra data", "2026-10-28");

    expect(onChange).toHaveBeenCalledWith("2026-10-28");
    await waitFor(() => expect(screen.getByRole("button", { name: "Outra data, 08/11/2026" })).toHaveFocus());
  });

  it("hands back the chosen day again, never an empty value, when it is picked twice", async () => {
    const onChange = vi.fn();
    render(<DateChips legend="Quando" value="2026-11-08" onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Outra data, 08/11/2026" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Hoje, domingo, 8 de novembro de 2026, selecionado" }),
    );

    expect(onChange).toHaveBeenCalledExactlyOnceWith("2026-11-08");
  });

  it("leaves out a chip outside min and max and bounds the calendar to them", async () => {
    render(<DateChips legend="Quando" value="2026-10-10" min="2026-10-01" max="2026-10-31" onChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Hoje" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Outra data, 10/10/2026" }));

    expect(await screen.findByRole("button", { name: "Ir para o mês anterior" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: "Ir para o próximo mês" })).toHaveAttribute("aria-disabled", "true");
  });
});

describe("date Inputs open the calendar on click", () => {
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
