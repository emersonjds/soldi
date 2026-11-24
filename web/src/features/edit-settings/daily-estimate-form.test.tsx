import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSettings } from "@/entities/settings/settings-query";
import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import { problem, SETTINGS } from "@/test/stub-api";

import { DailyEstimateForm } from "./daily-estimate-form";

type Settings = Schemas["Settings"];

const ON: Settings = { ...SETTINGS, daily_estimate: "50.00", daily_estimate_on: true };
const OFF: Settings = { ...ON, daily_estimate_on: false };
const SUGGESTION = { amount: "36.30", from: "2026-08-20", to: "2026-10-31" };
const SUGGESTION_LINE = "Sugestão: R$ 36,30/dia, média do seu Diário fora do cartão de 20/08 a 31/10.";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" },
  });

/** The form over a server that applies each PATCH to the settings it holds. */
const open = (
  initial: Settings,
  {
    suggestion = async () => json(200, SUGGESTION),
    patch = async () => undefined,
  }: { suggestion?: () => Promise<Response>; patch?: (body: unknown) => Promise<Response | undefined> } = {},
) => {
  let current = initial;
  const patches: unknown[] = [];
  vi.stubGlobal("fetch", async (request: Request) => {
    const { pathname } = new URL(request.url);
    if (request.method === "PATCH") {
      const body = await request.json();
      patches.push(body);
      const refused = await patch(body);
      if (refused) return refused;
      current = { ...current, ...body };
      return json(200, current);
    }
    if (pathname === "/api/settings") return json(200, current);
    if (pathname === "/api/settings/daily-estimate-suggestion") return suggestion();
    return json(404, problem(404, pathname));
  });
  const Live = () => {
    const settings = useSettings().data;
    return settings ? <DailyEstimateForm settings={settings} /> : null;
  };
  renderWithQuery(
    <>
      <Live />
      <Toaster />
    </>,
  );
  return patches;
};

const field = () => screen.getByLabelText("Valor por dia");
const ligar = () => screen.getByRole("button", { name: "Ligar Diário previsto" });
const salvar = () => screen.getByRole("button", { name: "Salvar valor" });

const retype = async (digits: string) => {
  await userEvent.clear(field());
  if (digits) await userEvent.type(field(), digits);
};

afterEach(() => vi.unstubAllGlobals());

describe("DailyEstimateForm, never set", () => {
  it("pre-fills the suggestion, offers Usar only once the field differs, and Usar sends nothing", async () => {
    const patches = open(SETTINGS);

    expect(await screen.findByText(SUGGESTION_LINE)).toBeInTheDocument();
    expect(field()).toHaveValue("36,30");
    expect(screen.queryByRole("button", { name: "Usar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Conta em todos os dias a partir de amanhã, fins de semana também. Gastos no cartão ficam de fora: eles chegam na fatura.",
      ),
    ).toBeInTheDocument();

    await retype("4000");
    await userEvent.click(screen.getByRole("button", { name: "Usar" }));

    expect(field()).toHaveValue("36,30");
    expect(screen.queryByRole("button", { name: "Usar" })).not.toBeInTheDocument();
    expect(patches).toEqual([]);
  });

  it("says there is no history yet when nothing can be suggested", async () => {
    open(SETTINGS, { suggestion: async () => json(200, null) });

    expect(
      await screen.findByText("Ainda sem histórico para sugerir um valor. Digite quanto você costuma gastar por dia."),
    ).toBeInTheDocument();
    expect(field()).toHaveValue("");
  });

  it("hides the line when the suggestion fails, and the field still works", async () => {
    open(SETTINGS, { suggestion: async () => json(500, problem(500, "Falhou.")) });

    await screen.findByLabelText("Valor por dia");
    await waitFor(() => expect(document.querySelector("[data-slot=skeleton]")).toBeNull());
    expect(screen.queryByText(/Sugestão|Ainda sem histórico/)).not.toBeInTheDocument();
    await retype("5000");
    expect(field()).toHaveValue("50,00");
  });

  it("holds the line while the suggestion loads and never overwrites what was typed", async () => {
    let answer: (response: Response) => void = () => undefined;
    open(SETTINGS, { suggestion: () => new Promise((resolve) => (answer = resolve)) });

    await screen.findByLabelText("Valor por dia");
    expect(document.querySelector("[data-slot=skeleton]")).not.toBeNull();
    expect(ligar()).toBeEnabled();
    await retype("5000");
    answer(json(200, SUGGESTION));

    expect(await screen.findByText(SUGGESTION_LINE)).toBeInTheDocument();
    expect(field()).toHaveValue("50,00");
    expect(screen.getByRole("button", { name: "Usar" })).toBeInTheDocument();
  });

  it("turns it on with the value in one request, moves focus to the switch, and undo turns it off", async () => {
    const patches = open(SETTINGS);
    await screen.findByText(SUGGESTION_LINE);

    await retype("5000");
    await userEvent.click(ligar());

    expect(await screen.findByText("Diário previsto ligado")).toBeInTheDocument();
    expect(patches).toEqual([{ daily_estimate: "50.00", daily_estimate_on: true }]);
    const toggle = screen.getByRole("switch", { name: "Somar à projeção" });
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAccessibleDescription(/^Ligado: a projeção conta R\$\s50,00 por dia\.$/);
    await waitFor(() => expect(toggle).toHaveFocus());

    await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));

    expect(await screen.findByText("Desligado. Valor guardado: R$ 50,00/dia.")).toBeInTheDocument();
    expect(patches).toEqual([{ daily_estimate: "50.00", daily_estimate_on: true }, { daily_estimate_on: false }]);
  });

  it.each([
    ["", "Informe um valor por dia, como 50,00."],
    ["000", "Use um valor maior que zero."],
    ["1000001", "Use até R$ 10.000,00 por dia."],
  ])("refuses %j with its message, on the field, sending nothing", async (digits, message) => {
    const patches = open(SETTINGS, { suggestion: async () => json(200, null) });
    await screen.findByText(/Ainda sem histórico/);

    await retype(digits);
    await userEvent.click(ligar());

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(field()).toHaveFocus();
    expect(patches).toEqual([]);
  });

  it("saves the ceiling with Enter", async () => {
    const patches = open(SETTINGS, { suggestion: async () => json(200, null) });
    await screen.findByText(/Ainda sem histórico/);

    await retype("1000000");
    await userEvent.type(field(), "{Enter}");

    await waitFor(() => expect(patches).toEqual([{ daily_estimate: "10000.00", daily_estimate_on: true }]));
  });

  it("disables the button while saving and says so when it fails", async () => {
    let refuse: (response: Response) => void = () => undefined;
    open(SETTINGS, { patch: () => new Promise((resolve) => (refuse = resolve)) });
    await screen.findByText(SUGGESTION_LINE);

    await userEvent.click(ligar());
    expect(ligar()).toBeDisabled();
    refuse(json(500, problem(500, "Falhou.")));

    expect(await screen.findByText("Não foi possível salvar.")).toBeInTheDocument();
    expect(ligar()).toBeEnabled();
    expect(field()).toHaveValue("36,30");
  });
});

describe("DailyEstimateForm, value saved", () => {
  it("turns off and on from the switch, keeping the value, with undo", async () => {
    const patches = open(ON);
    const toggle = await screen.findByRole("switch", { name: "Somar à projeção" });

    await userEvent.click(toggle);
    expect(await screen.findByText("Diário previsto desligado")).toBeInTheDocument();
    expect(screen.getByText("Desligado. Valor guardado: R$ 50,00/dia.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Valor por dia")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvar valor" })).not.toBeInTheDocument();

    toggle.focus();
    await userEvent.keyboard(" ");
    expect(await screen.findByText("Diário previsto ligado")).toBeInTheDocument();
    expect(toggle).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(patches).toEqual([{ daily_estimate_on: false }, { daily_estimate_on: true }, { daily_estimate_on: false }]);
  });

  it("puts the switch back and says so when the save fails", async () => {
    let refuse: (response: Response) => void = () => undefined;
    open(ON, { patch: () => new Promise((resolve) => (refuse = resolve)) });
    const toggle = await screen.findByRole("switch", { name: "Somar à projeção" });

    await userEvent.click(toggle);
    expect(toggle).toBeDisabled();
    refuse(json(500, problem(500, "Falhou.")));

    expect(await screen.findByText("Não foi possível salvar.")).toBeInTheDocument();
    expect(toggle).toBeChecked();
    expect(toggle).toBeEnabled();
  });

  it("saves a new value only once it differs, and undo restores the previous one", async () => {
    const patches = open(ON);
    await screen.findByText(SUGGESTION_LINE);

    expect(field()).toHaveValue("50,00");
    expect(salvar()).toBeDisabled();
    await retype("6000");
    await userEvent.click(salvar());

    expect(await screen.findByText("Diário previsto salvo")).toBeInTheDocument();
    expect(screen.getByText(/^Ligado: a projeção conta R\$\s60,00 por dia\.$/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));

    await waitFor(() => expect(field()).toHaveValue("50,00"));
    expect(patches).toEqual([{ daily_estimate: "60.00" }, { daily_estimate: "50.00" }]);
  });

  it("offers Usar when the saved value differs from the suggestion", async () => {
    open(ON);
    await userEvent.click(await screen.findByRole("button", { name: "Usar" }));

    expect(field()).toHaveValue("36,30");
    expect(salvar()).toBeEnabled();
  });

  it("shows only the switch and the kept value while off", async () => {
    open(OFF);

    expect(await screen.findByRole("switch", { name: "Somar à projeção" })).not.toBeChecked();
    expect(screen.getByText("Desligado. Valor guardado: R$ 50,00/dia.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Valor por dia")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
