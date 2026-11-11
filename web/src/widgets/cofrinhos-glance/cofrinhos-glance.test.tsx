import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderWithQuery } from "@/test/render";
import { COFRINHO_RESERVA, COFRINHO_SEM_OBJETIVO, COFRINHO_VIAGEM, COFRINHOS, problem, stubApi } from "@/test/stub-api";

import { CofrinhosGlance } from "./cofrinhos-glance";

const show = (reply: { status: number; body?: unknown }) => {
  const requests = stubApi({ "GET /api/cofrinhos": reply });
  renderWithQuery(<CofrinhosGlance />);
  return requests;
};

const card = () => screen.getByRole("region", { name: "Cofrinhos" });

describe("Cofrinhos glance", () => {
  it("shows the total saved and the two largest cofrinhos, the goal as a share of its target", async () => {
    show({
      status: 200,
      body: { ...COFRINHOS, items: [COFRINHO_SEM_OBJETIVO, COFRINHO_RESERVA, COFRINHO_VIAGEM] },
    });

    const rows = await within(card()).findAllByRole("listitem");
    expect(rows.map((row) => row.textContent?.replace(/\s/g, " "))).toEqual([
      "ViagemR$ 1.000,00",
      "Reserva3% de R$ 10.000,00",
    ]);
    expect(card()).toHaveTextContent("GuardadoR$ 1.300,00");
    expect(within(card()).getByRole("link", { name: "Ver todos" })).toHaveAttribute("href", "/economia");
  });

  it("puts the cofrinho's progress bar under a row with a target, none without", async () => {
    show({ status: 200, body: COFRINHOS });

    const [viagem, reserva] = await within(card()).findAllByRole("listitem");
    expect(within(viagem).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(within(reserva).getByRole("progressbar", { name: "Progresso de Reserva" })).toHaveAttribute(
      "aria-valuenow",
      "3",
    );
  });

  it("shows two row skeletons while loading", () => {
    show({ status: 200, body: COFRINHOS });
    expect(within(card()).getAllByTestId("row-skeleton")).toHaveLength(2);
  });

  it("invites the emergency reserve when there is no cofrinho yet", async () => {
    show({ status: 200, body: { total_saved: "0.00", saved_this_month: "0.00", items: [] } });
    expect(
      await within(card()).findByText("Nenhum cofrinho ainda. Comece pela reserva de emergência."),
    ).toBeInTheDocument();
    expect(within(card()).getByRole("link", { name: "Ver cofrinhos" })).toHaveAttribute("href", "/economia");
    expect(within(card()).queryByRole("link", { name: "Ver todos" })).not.toBeInTheDocument();
  });

  it("says so when it fails and tries again", async () => {
    const requests = show({ status: 500, body: problem(500, "Erro") });
    await userEvent.click(await within(card()).findByRole("button", { name: "Tentar de novo" }));
    expect(card()).toHaveTextContent("Não foi possível carregar os cofrinhos.");
    await waitFor(() => expect(requests.length).toBeGreaterThan(1));
  });
});
