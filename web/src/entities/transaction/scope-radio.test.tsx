import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ScopeRadio } from "./scope-radio";

const SERIES = { id: "s1", position: 3, total: 12, last_date: "2027-09-04" };

describe("ScopeRadio", () => {
  it("says under each option what it reaches, naming the row's month", async () => {
    const onChange = vi.fn();
    render(<ScopeRadio legend="Aplicar em" series={SERIES} date="2026-11-04" value="this" onChange={onChange} />);

    const only = screen.getByRole("radio", { name: "Só este" });
    expect(only).toBeChecked();
    expect(only).toHaveAccessibleDescription("Só o de nov 2026. Os outros continuam iguais.");
    const following = screen.getByRole("radio", { name: "Este e os próximos" });
    expect(following).toHaveAccessibleDescription("Este e os próximos até o fim da série.");
    await userEvent.click(screen.getByText("Este e os próximos até o fim da série."));
    expect(onChange).toHaveBeenCalledWith("following");
  });

  it("counts the whole series on its first member", () => {
    render(
      <ScopeRadio
        legend="Excluir quais?"
        series={{ ...SERIES, position: 1, total: 6 }}
        date="2026-11-04"
        value="following"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("radiogroup", { name: "Excluir quais?" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Toda a série" })).toHaveAccessibleDescription(
      "Todos os 6 lançamentos da série.",
    );
    expect(screen.queryByText(/edita/i)).not.toBeInTheDocument();
  });
});
