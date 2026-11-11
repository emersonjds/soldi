import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DateField } from "./date-field";
import { ResponsiveSheet } from "./responsive-sheet";

const NativeFormat = Intl.DateTimeFormat;

/** The runner's default locale turned en-US, where a bare `Intl` date reads `11/5/2026`. */
class EnglishByDefault extends NativeFormat {
  constructor(locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
    super(locales ?? "en-US", options);
  }
}

describe("DateField", () => {
  // A fixed today keeps the day buttons free of the `Hoje, ` prefix.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 15, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows 05/11/2026 for 2026-11-05 on a 44px, 16px button even when the runner speaks en-US", () => {
    Object.defineProperty(Intl, "DateTimeFormat", { value: EnglishByDefault, configurable: true });
    try {
      expect(new Intl.DateTimeFormat().format(new Date(2026, 10, 5))).toBe("11/5/2026");
      render(<DateField label="Data" value="2026-11-05" onChange={vi.fn()} />);
    } finally {
      Object.defineProperty(Intl, "DateTimeFormat", { value: NativeFormat, configurable: true });
    }

    const trigger = screen.getByRole("button", { name: "Data, 05/11/2026" });
    expect(trigger).toHaveTextContent("05/11/2026");
    expect(trigger).toHaveClass("min-h-11", "text-base");
  });

  it("names an empty field by its label and asks for a date", () => {
    render(<DateField label="Prazo" value="" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Prazo" })).toHaveTextContent("Escolher data");
  });

  it("opens a pt-BR calendar on the chosen month and hands back the picked day as YYYY-MM-DD", async () => {
    const onChange = vi.fn();
    render(<DateField label="Data" value="2026-11-05" onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Data, 05/11/2026" }));
    expect(await screen.findByRole("grid", { name: "novembro 2026" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "sexta-feira, 20 de novembro de 2026" }));

    expect(onChange).toHaveBeenCalledWith("2026-11-20");
    await waitFor(() => expect(screen.queryByRole("grid")).not.toBeInTheDocument());
  });

  it("picks a day with the keyboard alone", async () => {
    const onChange = vi.fn();
    render(<DateField label="Data" value="2026-11-05" onChange={onChange} />);

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "quinta-feira, 5 de novembro de 2026, selecionado" })).toHaveFocus(),
    );
    await userEvent.keyboard("{ArrowRight}{Enter}");

    expect(onChange).toHaveBeenCalledWith("2026-11-06");
    await waitFor(() => expect(screen.getByRole("button", { name: "Data, 05/11/2026" })).toHaveFocus());
  });

  it("disables the days outside min and max", async () => {
    render(<DateField label="Data" value="2026-11-05" min="2026-11-03" max="2026-11-10" onChange={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Data, 05/11/2026" }));

    expect(await screen.findByRole("button", { name: "segunda-feira, 2 de novembro de 2026" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "quarta-feira, 11 de novembro de 2026" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "terça-feira, 3 de novembro de 2026" })).toBeEnabled();
  });

  it("names its calendar by the label and scrolls it inside the room left on a short screen", async () => {
    render(<DateField label="Data" value="2026-11-05" onChange={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Data, 05/11/2026" }));

    expect(await screen.findByRole("dialog", { name: "Data" })).toHaveClass(
      "max-h-(--radix-popover-content-available-height)",
      "overflow-y-auto",
    );
  });

  it("inside a sheet, holds focus in the calendar and hands it back to the trigger after Esc and after a pick", async () => {
    const onChange = vi.fn();
    render(
      <ResponsiveSheet open onOpenChange={vi.fn()} title="Lançar" description="Entrada, conta ou gasto do dia.">
        <DateField label="Outra data" value="2026-11-05" onChange={onChange} />
      </ResponsiveSheet>,
    );
    const trigger = screen.getByRole("button", { name: "Outra data, 05/11/2026" });

    await userEvent.click(trigger);
    await screen.findByRole("dialog", { name: "Outra data" });
    expect(screen.queryByRole("dialog", { name: "Lançar" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getByRole("dialog", { name: "Lançar" })).toBeInTheDocument();

    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("button", { name: "sexta-feira, 20 de novembro de 2026" }));
    expect(onChange).toHaveBeenCalledWith("2026-11-20");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("stops at January 2000 by default, Soldi's first month", async () => {
    render(<DateField label="Data" value="2000-01-15" onChange={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Data, 15/01/2000" }));

    expect(await screen.findByRole("button", { name: "Ir para o mês anterior" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
