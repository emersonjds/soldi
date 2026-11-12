import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SeriesAllDialog } from "./series-all-dialog";

const renderAt = (mode: "edit" | "delete", position: number, onConfirm = vi.fn()) =>
  render(
    <SeriesAllDialog mode={mode} position={position} total={12} open onOpenChange={vi.fn()} onConfirm={onConfirm} />,
  );

describe("SeriesAllDialog", () => {
  it("counts the earlier entries an edit changes", () => {
    const { unmount } = renderAt("edit", 3);
    expect(screen.getByRole("alertdialog", { name: "Alterar toda a série?" })).toHaveTextContent(
      "2 lançamentos anteriores a este também mudam, inclusive em meses já fechados.",
    );
    unmount();

    renderAt("edit", 2);
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "O lançamento anterior a este também muda, inclusive se o mês já fechou.",
    );
  });

  it("names the total a delete removes", async () => {
    const onConfirm = vi.fn();
    const { unmount } = renderAt("delete", 4, onConfirm);
    expect(screen.getByRole("alertdialog", { name: "Excluir toda a série?" })).toHaveTextContent(
      "Os 12 lançamentos serão excluídos, inclusive os 3 anteriores a este.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Excluir toda a série" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    unmount();

    renderAt("delete", 2);
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "Os 12 lançamentos serão excluídos, inclusive o anterior a este.",
    );
  });

  it("saves nothing on Cancelar", async () => {
    const onConfirm = vi.fn();
    renderAt("edit", 3, onConfirm);

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
