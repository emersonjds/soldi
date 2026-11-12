import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/test/render";
import { MONTH, problem, SETTINGS, signedIn } from "@/test/stub-api";

import { ThermometerForm } from "./thermometer-form";

type Reply = { status: number; body?: unknown };

const open = (replies: Record<string, Reply> = {}, settings = SETTINGS) => {
  const requests = signedIn({ "GET /api/months/2026-11": { status: 200, body: MONTH }, ...replies });
  renderWithQuery(
    <>
      <ThermometerForm settings={settings} />
      <Toaster />
    </>,
  );
  return requests;
};

const field = (label: string) => screen.getByLabelText(label);

const retype = async (label: string, value: string) => {
  await userEvent.clear(field(label));
  await userEvent.type(field(label), value);
};

const activeTile = () => screen.getByRole("listitem", { current: true });

describe("ThermometerForm", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the four boxes and the live scale under the draft bounds", async () => {
    open();

    expect(field("Crítico / Atenção")).toHaveValue("-500,00");
    expect(field("Atenção / Apertado")).toHaveValue("0,00");
    expect(field("Apertado / Confortável")).toHaveValue("1.000,00");
    expect(field("Confortável / Folga")).toHaveValue("2.000,00");
    for (const caption of [
      "Abaixo disso fica Crítico",
      "Linha zero de equilíbrio",
      "Colchão de segurança mín.",
      "Meta de poupança livre",
    ])
      expect(screen.getByText(caption)).toBeInTheDocument();
    expect(screen.getByText("SIMULAÇÃO DE ESCALA TÉRMICA")).toBeInTheDocument();
    expect(await screen.findByText("R$ 957,79")).toBeInTheDocument();
    expect(screen.getByText(/Faixa Ativa Atual:/)).toHaveTextContent("Faixa Ativa Atual: Apertado");
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "Apertado");
    expect(screen.getAllByRole("listitem").map((tile) => tile.textContent)).toEqual([
      "Crítico< -R$ 500",
      "Atenção-R$ 500 a R$ 0",
      "ApertadoR$ 0 a R$ 1.000",
      "ConfortávelR$ 1.000 a R$ 2.000",
      "Folga> R$ 2.000",
    ]);
    expect(within(activeTile()).getByText("Apertado")).toBeInTheDocument();

    await retype("Apertado / Confortável", "90000");

    expect(screen.getByText(/Faixa Ativa Atual:/)).toHaveTextContent("Faixa Ativa Atual: Confortável");
    expect(within(activeTile()).getByText("Confortável")).toBeInTheDocument();
    expect(screen.getByText("R$ 0 a R$ 900")).toBeInTheDocument();
  });

  it("saves the four bounds", async () => {
    const requests = open({ "PATCH /api/settings": { status: 200, body: { ...SETTINGS, tier_yellow: "900.00" } } });

    await retype("Apertado / Confortável", "90000");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Novos Limites" }));

    expect(await screen.findByText("Termômetro salvo")).toBeInTheDocument();
    const patch = requests.find((request) => request.method === "PATCH");
    expect(await patch?.json()).toEqual({
      tier_red: "-500.00",
      tier_zero: "0.00",
      tier_yellow: "900.00",
      tier_green: "2000.00",
    });
  });

  it("restores the sheet defaults into the draft without saving", async () => {
    const requests = open({}, { ...SETTINGS, tier_red: "-100.00", tier_green: "5000.00" });

    expect(field("Crítico / Atenção")).toHaveValue("-100,00");
    await userEvent.click(screen.getByRole("button", { name: "Restaurar Padrões" }));

    expect(field("Crítico / Atenção")).toHaveValue("-500,00");
    expect(field("Atenção / Apertado")).toHaveValue("0,00");
    expect(field("Apertado / Confortável")).toHaveValue("1.000,00");
    expect(field("Confortável / Folga")).toHaveValue("2.000,00");
    expect(requests.some((request) => request.method === "PATCH")).toBe(false);
  });

  it("asks for rising bounds and real numbers before saving", async () => {
    const requests = open();

    await retype("Atenção / Apertado", "-60000");
    expect(screen.getByRole("alert")).toHaveTextContent("Cada faixa precisa ser maior que a anterior.");
    expect(screen.getByRole("button", { name: "Salvar Novos Limites" })).toBeDisabled();

    await retype("Atenção / Apertado", "abc");
    expect(screen.getByRole("alert")).toHaveTextContent("Informe valores como 1.250,00.");
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "Apertado");
    expect(requests.some((request) => request.method === "PATCH")).toBe(false);
  });

  it("says so when saving fails", async () => {
    open({ "PATCH /api/settings": { status: 422, body: problem(422, "tier_zero") } });

    await userEvent.click(screen.getByRole("button", { name: "Salvar Novos Limites" }));
    expect(await screen.findByText("Não foi possível salvar.")).toBeInTheDocument();
  });
});
