import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/test/render";
import { stubApi, TRANSACTIONS, WITH_COFRINHOS } from "@/test/stub-api";

import { useEntryActions } from "./entry-actions";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

const Harness = ({ onClosed }: { onClosed: () => void }) => {
  const { open, actions } = useEntryActions(onClosed);
  return (
    <>
      <button type="button" onClick={() => open(TRANSACTIONS[0], { label: "Mercado", caption: "Diário" })}>
        Abrir
      </button>
      {actions}
    </>
  );
};

describe("useEntryActions", () => {
  it("opens Lista's Editar / Excluir sheet and reports when it closes", async () => {
    stubApi({ "GET /api/categories": { status: 200, body: WITH_COFRINHOS } });
    const onClosed = vi.fn();
    renderWithQuery(<Harness onClosed={onClosed} />);

    await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Diário · Mercado");
    expect(screen.getByRole("button", { name: "Editar" })).toBeVisible();
    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(onClosed).toHaveBeenCalledOnce());
  });
});
