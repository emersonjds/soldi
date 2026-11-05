import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { meQuery } from "@/entities/user/session";
import { router, setSearch } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { ANA, problem, signedIn } from "@/test/stub-api";

import TourPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

const NO_TOUR = { ...ANA, tour_seen: false };

const stub = (status = 204) =>
  signedIn(
    { "POST /api/me/tour-seen": status === 204 ? { status } : { status, body: problem(status, "Falhou.") } },
    NO_TOUR,
  );

const seen = (requests: Request[]) =>
  requests.filter((request) => request.method === "POST" && request.url.endsWith("/api/me/tour-seen"));

const next = () => userEvent.click(screen.getByRole("button", { name: "Próximo" }));

describe("Tour de boas-vindas", () => {
  beforeEach(() => {
    router.replace.mockClear();
    setSearch("");
  });

  it("walks the four cards and starts the month on Lançar", async () => {
    const requests = stub();
    const { client } = renderWithQuery(<TourPage />);
    client.setQueryData(meQuery.queryKey, NO_TOUR);

    expect(screen.getByText("Passo 1 de 4")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Entradas" })).toBeInTheDocument();
    expect(screen.getByText("Tudo que entra: salário, extras, reembolsos.")).toBeInTheDocument();
    expect(screen.getByText("+ R$ 5.000,00")).toHaveClass("text-income");
    await next();

    expect(screen.getByText("Passo 2 de 4")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Saídas e Diário" })).toBeInTheDocument();
    expect(screen.getByText(/Contas fixas \(aluguel, luz\) e gastos do dia a dia/)).toBeInTheDocument();
    expect(screen.getByText("Aluguel")).toBeInTheDocument();
    expect(screen.getByText("Mercado")).toBeInTheDocument();
    await next();

    expect(screen.getByRole("heading", { level: 1, name: "Projeção do fim do mês" })).toBeInTheDocument();
    expect(screen.getByText(/Verde é folga, vermelho é alerta\./)).toBeInTheDocument();
    expect(screen.getByText("Projetado")).toBeInTheDocument();
    expect(screen.getAllByText("Atenção").length).toBeGreaterThan(1);
    await next();

    expect(screen.getByText("Passo 4 de 4")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Economia" })).toBeInTheDocument();
    expect(screen.getByText(/Guardar é uma saída em Economia › seu objetivo\./)).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Próximo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pular" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Começar" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mes?lancar=1"));
    expect(seen(requests)).toHaveLength(1);
    expect(client.getQueryData(meQuery.queryKey)).toEqual(ANA);
  });

  it("skips from the first card", async () => {
    const requests = stub();
    renderWithQuery(<TourPage />);

    await userEvent.click(screen.getByRole("button", { name: "Pular" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mes?lancar=1"));
    expect(seen(requests)).toHaveLength(1);
  });

  it("moves with the arrows and skips with Esc", async () => {
    const requests = stub();
    renderWithQuery(<TourPage />);

    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByText("Passo 1 de 4")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(screen.getByText("Passo 4 de 4")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByText("Passo 3 de 4")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mes?lancar=1"));
    expect(seen(requests)).toHaveLength(1);
  });

  it("replays from Ajustes and goes straight to the month", async () => {
    setSearch("replay=1");
    const requests = stub();
    renderWithQuery(<TourPage />);

    for (const _ of [1, 2, 3]) await next();
    await userEvent.click(screen.getByRole("button", { name: "Começar" }));

    expect(router.replace).toHaveBeenCalledWith("/mes");
    expect(seen(requests)).toHaveLength(0);
  });

  it("keeps the user on the tour when saving fails", async () => {
    stub(500);
    renderWithQuery(<TourPage />);

    await userEvent.click(screen.getByRole("button", { name: "Pular" }));

    expect(await screen.findByText("Não foi possível salvar. Tente de novo.")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
