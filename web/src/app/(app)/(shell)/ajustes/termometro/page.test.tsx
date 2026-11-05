import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/test/render";
import { MONTH, problem, SETTINGS, signedIn } from "@/test/stub-api";

import TermometroPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

type Reply = { status: number; body?: unknown };

const open = (replies: Record<string, Reply> = {}) => {
  const requests = signedIn({ "GET /api/months/2026-11": { status: 200, body: MONTH }, ...replies });
  renderWithQuery(
    <>
      <TermometroPage />
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

describe("Ajustes › Termômetro", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the four bounds and previews today's balance as they change", async () => {
    open();

    expect(await screen.findByLabelText("Atenção a partir de")).toHaveValue("-500,00");
    expect(field("Apertado a partir de")).toHaveValue("0,00");
    expect(field("Confortável a partir de")).toHaveValue("1.000,00");
    expect(field("Folga a partir de")).toHaveValue("2.000,00");
    expect(await screen.findByText(/Com o saldo de hoje/)).toHaveTextContent("R$ 957,79");
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "Apertado");

    await retype("Confortável a partir de", "90000");

    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "Confortável");
    expect(screen.getByRole("link", { name: "Ajustes" })).toHaveAttribute("href", "/ajustes");
  });

  it("saves the four bounds", async () => {
    const requests = open({ "PATCH /api/settings": { status: 200, body: { ...SETTINGS, tier_yellow: "900.00" } } });

    await screen.findByLabelText("Confortável a partir de");
    await retype("Confortável a partir de", "90000");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Termômetro salvo")).toBeInTheDocument();
    const patch = requests.find((request) => request.method === "PATCH");
    expect(await patch?.json()).toEqual({
      tier_red: "-500.00",
      tier_zero: "0.00",
      tier_yellow: "900.00",
      tier_green: "2000.00",
    });
  });

  it("asks for rising bounds and real numbers before saving", async () => {
    const requests = open();

    await screen.findByLabelText("Apertado a partir de");
    await retype("Apertado a partir de", "-60000");
    expect(screen.getByRole("alert")).toHaveTextContent("Cada faixa precisa ser maior que a anterior.");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();

    await retype("Apertado a partir de", "abc");
    expect(screen.getByRole("alert")).toHaveTextContent("Informe valores como 1.250,00.");
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "Apertado");
    expect(requests.some((request) => request.method === "PATCH")).toBe(false);
  });

  it("says so when saving fails", async () => {
    open({ "PATCH /api/settings": { status: 422, body: problem(422, "tier_zero") } });

    await screen.findByLabelText("Folga a partir de");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Não foi possível salvar.")).toBeInTheDocument();
  });

  it("offers a retry when the settings do not load", async () => {
    const requests = signedIn({ "GET /api/settings": { status: 500, body: problem(500, "Falhou.") } });
    renderWithQuery(<TermometroPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));

    await waitFor(() => expect(requests.filter((request) => request.url.endsWith("/api/settings"))).toHaveLength(2));
  });
});
