import { act, render, screen, waitFor } from "@testing-library/react";
import { Toaster, toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { ResponsiveSheet } from "./responsive-sheet";

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
});
