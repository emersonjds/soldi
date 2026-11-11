import type { FormEvent } from "react";

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster, toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { ResponsiveSheet, ResponsiveSheetFooter } from "./responsive-sheet";

const sheet = (open: boolean) => (
  <>
    <Toaster />
    <ResponsiveSheet open={open} onOpenChange={vi.fn()} title="Nova categoria" description="Nome e cor.">
      <p>conteúdo</p>
    </ResponsiveSheet>
  </>
);

describe("ResponsiveSheet", () => {
  it("clears any toast when it opens, so the toast never covers the sheet", async () => {
    const { rerender } = render(sheet(false));
    act(() => {
      toast.success("Categoria criada");
    });
    expect(await screen.findByText("Categoria criada")).toBeInTheDocument();

    rerender(sheet(true));

    expect(await screen.findByRole("dialog", { name: "Nova categoria" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Categoria criada")).not.toBeInTheDocument());
  });

  it("pins the footer to the bottom while the rows above it scroll, and Enter still submits the form", async () => {
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <ResponsiveSheet open onOpenChange={vi.fn()} title="Lançar" description="Entrada, conta ou gasto do dia.">
        <form onSubmit={onSubmit}>
          <input aria-label="Valor" />
          <input aria-label="Observação" />
          <ResponsiveSheetFooter>
            <button type="submit">Salvar</button>
          </ResponsiveSheetFooter>
        </form>
      </ResponsiveSheet>,
    );

    const footer = screen.getByRole("button", { name: "Salvar" }).closest('[data-slot="responsive-sheet-footer"]');
    expect(footer).toHaveClass("sticky", "bottom-0");
    // WCAG 2.4.11: a field scrolled into view by focus clears the tallest footer, Lançar de verdade over Descartar.
    expect(screen.getByRole("dialog", { name: "Lançar" })).toHaveClass(
      "has-data-[slot=responsive-sheet-footer]:scroll-pb-[calc(var(--sheet-pb)+7.5rem)]",
    );
    await userEvent.type(screen.getByLabelText("Observação"), "Feira{Enter}");

    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
