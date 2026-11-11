import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderWithQuery } from "@/test/render";
import { COFRINHO_RESERVA, COFRINHO_SEM_OBJETIVO, COFRINHO_VIAGEM, COFRINHOS, problem, stubApi } from "@/test/stub-api";

import { CofrinhosGlance } from "./cofrinhos-glance";

const show = (reply: { status: number; body?: unknown }) => {
  const requests = stubApi({ "GET /api/cofrinhos": reply });
  const { client } = renderWithQuery(<CofrinhosGlance />);
  return { requests, client };
};

const nothing = async (body: unknown) => {
  const { client } = show({ status: 200, body });
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
};

const card = () => screen.getByRole("region", { name: "Cofrinhos" });

describe("Cofrinhos glance", () => {
  it("shows the total saved and the two largest cofrinhos with a goal, each with its share, bar and whole goal", async () => {
    const casa = {
      ...COFRINHO_RESERVA,
      category_id: "c1000000-0000-4000-8000-000000000098",
      name: "Casa",
      balance: "50.00",
    };
    const carro = {
      ...COFRINHO_RESERVA,
      category_id: "c1000000-0000-4000-8000-000000000097",
      name: "Carro",
      balance: "1250.99",
      target: "2000.00",
    };
    show({
      status: 200,
      body: { ...COFRINHOS, items: [COFRINHO_SEM_OBJETIVO, casa, COFRINHO_RESERVA, COFRINHO_VIAGEM, carro] },
    });

    const rows = await within(await screen.findByRole("region")).findAllByRole("listitem");
    expect(rows.map((row) => row.textContent?.replace(/\s/g, " "))).toEqual([
      "Carro63%R$ 1.250Meta: R$ 2.000",
      "Reserva3%R$ 300Meta: R$ 10.000",
    ]);
    expect(within(rows[1]).getByRole("progressbar", { name: "Progresso de Reserva" })).toHaveAttribute(
      "aria-valuenow",
      "3",
    );
    expect(card()).toHaveTextContent("Total guardadoR$ 1.300,00");
    expect(within(card()).getByRole("heading", { name: "Cofrinhos" }).querySelector("svg")).toBeInTheDocument();
    expect(within(card()).getByRole("link", { name: "Ver todos" })).toHaveAttribute("href", "/economia");
  });

  it("rounds the share half to even in whole percent: 125,00 of 1.000,00 is 12%", async () => {
    show({
      status: 200,
      body: {
        ...COFRINHOS,
        items: [{ ...COFRINHO_RESERVA, balance: "125.00", target: "1000.00", progress_pct: "12.5" }],
      },
    });

    expect(await within(await screen.findByRole("region")).findByRole("listitem")).toHaveTextContent(/^Reserva12%/);
  });

  it("renders nothing while loading, so it never flashes (D25)", async () => {
    show({ status: 200, body: COFRINHOS });
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Cofrinhos" })).toBeInTheDocument();
  });

  it("renders nothing without a cofrinho, or with only an empty Reserva Livre (D25)", async () => {
    await nothing({ total_saved: "0.00", saved_this_month: "0.00", items: [] });
    cleanup();
    await nothing({ total_saved: "0.00", saved_this_month: "0.00", items: [COFRINHO_SEM_OBJETIVO] });
  });

  it("shows a Reserva Livre that holds money", async () => {
    show({
      status: 200,
      body: {
        total_saved: "150.00",
        saved_this_month: "0.00",
        items: [{ ...COFRINHO_SEM_OBJETIVO, balance: "150.00" }],
      },
    });
    expect(await screen.findByRole("region", { name: "Cofrinhos" })).toHaveTextContent("R$ 150,00");
  });

  it("says so when it fails and tries again", async () => {
    const { requests } = show({ status: 500, body: problem(500, "Erro") });
    await userEvent.click(
      await within(await screen.findByRole("region")).findByRole("button", { name: "Tentar de novo" }),
    );
    expect(card()).toHaveTextContent("Não foi possível carregar os cofrinhos.");
    await waitFor(() => expect(requests.length).toBeGreaterThan(1));
  });
});
