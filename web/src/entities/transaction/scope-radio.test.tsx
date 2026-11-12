import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ScopeRadio } from "./scope-radio";

const SERIES = { id: "s1", position: 3, total: 12, last_date: "2027-09-04", every: "month" as const };

const renderAt = (position: number, mode: "edit" | "delete" = "edit", onChange = vi.fn()) =>
  render(
    <ScopeRadio
      legend={mode === "edit" ? "Escopo da Alteração" : "Excluir quais?"}
      mode={mode}
      series={{ ...SERIES, position }}
      date="2026-11-04"
      value="this"
      onChange={onChange}
    />,
  );

describe("ScopeRadio", () => {
  it("edits member 3 of 12: names the month, counts the 9 after it, recommends Este e os próximos", async () => {
    const onChange = vi.fn();
    renderAt(3, "edit", onChange);

    const only = screen.getByRole("radio", { name: "Só este lançamento" });
    expect(only).toBeChecked();
    expect(only).toHaveAccessibleDescription(
      "Apenas a parcela de Novembro/2026 será alterada. As outras 9 parcelas futuras continuam iguais.",
    );
    const following = screen.getByRole("radio", { name: "Este e os próximos" });
    expect(following).toHaveAccessibleDescription(
      "Altera a parcela 3 e todas as subsequentes até o fim da série programada.",
    );
    expect(screen.getByText("Recomendado")).toBeInTheDocument();
    await userEvent.click(screen.getByText(/Altera a parcela 3/));
    expect(onChange).toHaveBeenCalledWith("following");
  });

  it("says the one future member left on 11 of 12, and the last on 12 of 12", () => {
    const { unmount } = renderAt(11);
    expect(screen.getByRole("radio", { name: "Só este lançamento" })).toHaveAccessibleDescription(
      "Apenas a parcela de Novembro/2026 será alterada. A outra parcela futura continua igual.",
    );
    unmount();

    renderAt(12);
    expect(screen.getByRole("radio", { name: "Só este lançamento" })).toHaveAccessibleDescription(
      "Apenas a parcela de Novembro/2026 será alterada. É a última parcela da série.",
    );
  });

  it("offers the whole series on its first member, without the recommendation", () => {
    renderAt(1);

    expect(screen.getByRole("radio", { name: "Só este lançamento" })).toHaveAccessibleDescription(
      "Apenas a parcela de Novembro/2026 será alterada. As outras 11 parcelas futuras continuam iguais.",
    );
    expect(screen.getByRole("radio", { name: "Toda a série (12 lançamentos)" })).toHaveAccessibleDescription(
      "Todos os 12 lançamentos da série.",
    );
    expect(screen.queryByRole("radio", { name: "Este e os próximos" })).not.toBeInTheDocument();
    expect(screen.queryByText("Recomendado")).not.toBeInTheDocument();
  });

  it("uses the delete lines, which never say alterada", () => {
    const { unmount } = renderAt(3, "delete");
    expect(screen.getByRole("radiogroup", { name: "Excluir quais?" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Só este lançamento" })).toHaveAccessibleDescription(
      "Apenas a parcela de Novembro/2026 será excluída.",
    );
    expect(screen.getByRole("radio", { name: "Este e os próximos" })).toHaveAccessibleDescription(
      "Exclui a parcela 3 e todas as subsequentes.",
    );
    expect(screen.queryByText(/alterada/)).not.toBeInTheDocument();
    unmount();

    renderAt(1, "delete");
    expect(screen.getByRole("radio", { name: "Toda a série (12 lançamentos)" })).toHaveAccessibleDescription(
      "Todos os 12 lançamentos da série.",
    );
    expect(screen.queryByText(/alterada/)).not.toBeInTheDocument();
  });
});
