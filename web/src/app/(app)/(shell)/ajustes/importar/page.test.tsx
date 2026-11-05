import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { router } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { fieldProblem, PREVIEW, problem, signedIn } from "@/test/stub-api";

import ImportarPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

type Reply = { status: number; body?: unknown };

const RESULT = { transactions: 51, savings_months: 12, years: [2025, 2026], skipped: [] };

const workbook = () =>
  new File([new Uint8Array(3)], "Termômetro.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

const open = (replies: Record<string, Reply> = {}) => {
  const requests = signedIn({ "POST /api/imports/xlsx": { status: 200, body: PREVIEW }, ...replies });
  renderWithQuery(
    <>
      <ImportarPage />
      <Toaster />
    </>,
  );
  return requests;
};

const upload = () => userEvent.upload(screen.getByLabelText("Escolha ou arraste o arquivo .xlsx"), workbook());

beforeEach(() => router.replace.mockClear());

describe("Ajustes › Importar planilha", () => {
  it("previews each year and the unreadable cells, then imports skipping them", async () => {
    const requests = open({ "POST /api/imports/xlsx/confirm": { status: 200, body: RESULT } });

    expect(screen.getByRole("heading", { level: 1, name: "Importar planilha" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ajustes" })).toHaveAttribute("href", "/ajustes");
    expect(screen.getByLabelText("Escolha ou arraste o arquivo .xlsx")).toHaveAttribute(
      "accept",
      expect.stringContaining(".xlsx"),
    );
    await upload();

    const year2025 = await screen.findByRole("region", { name: "2025" });
    expect(year2025).toHaveTextContent("42 lançamentos");
    expect(year2025).toHaveTextContent("Entradas+ R$ 60.000,00");
    expect(year2025).toHaveTextContent("ContasR$ 27.114,72");
    expect(year2025).toHaveTextContent("DiárioR$ 18.240,55");
    expect(year2025).toHaveTextContent("12 meses de economia");
    expect(screen.getByRole("region", { name: "2026" })).toHaveTextContent("9 lançamentos");
    expect(screen.getByText("Células que não deram para ler")).toBeInTheDocument();
    expect(screen.getByText("2026!D14: fórmula que não é soma")).toBeInTheDocument();
    expect(screen.getByLabelText("Saldo inicial")).toHaveValue("0,00");
    expect(screen.getByLabelText("Data do saldo inicial")).toHaveValue("2025-01-01");

    const submit = screen.getByRole("button", { name: "Importar" });
    expect(submit).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: "Importar mesmo assim, pulando essas células" }));
    expect(submit).toBeEnabled();

    await userEvent.clear(screen.getByLabelText("Saldo inicial"));
    await userEvent.type(screen.getByLabelText("Saldo inicial"), "-1.250,50");
    fireEvent.change(screen.getByLabelText("Data do saldo inicial"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Data do saldo inicial"), { target: { value: "2024-12-31" } });
    await userEvent.click(submit);

    expect(await screen.findByText("Importado: 51 lançamentos")).toBeInTheDocument();
    const confirm = requests.find((request) => request.url.endsWith("/confirm"));
    expect(await confirm?.json()).toEqual({
      token: PREVIEW.token,
      opening_balance: "-1250.50",
      opening_date: "2024-12-31",
      skip_errors: true,
    });
    expect(router.replace).toHaveBeenCalledWith("/mes");
  });

  it("goes to December of the latest year when it is a past year, and needs no skip without errors", async () => {
    const clean = { ...PREVIEW, years: [PREVIEW.years[0]], errors: [] };
    const requests = open({
      "POST /api/imports/xlsx": { status: 200, body: clean },
      "POST /api/imports/xlsx/confirm": { status: 200, body: { ...RESULT, transactions: 1, years: [2025] } },
    });

    const zone = screen.getByLabelText("Escolha ou arraste o arquivo .xlsx");
    fireEvent.dragOver(zone);
    expect(zone.closest("label")).toHaveClass("border-primary");
    fireEvent.dragLeave(zone);
    expect(zone.closest("label")).not.toHaveClass("border-primary");
    fireEvent.drop(zone, { dataTransfer: { files: [workbook()] } });
    await screen.findByRole("region", { name: "2025" });
    expect(screen.queryByText("Células que não deram para ler")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Importar" }));

    expect(await screen.findByText("Importado: 1 lançamento")).toBeInTheDocument();
    expect(router.replace).toHaveBeenCalledWith("/mes?m=2025-12");
    expect(await requests.find((request) => request.url.endsWith("/confirm"))?.json()).toMatchObject({
      skip_errors: false,
    });
  });

  it("shows that the workbook is being read", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    open();
    const stubbed = globalThis.fetch;
    vi.stubGlobal("fetch", async (request: Request) => {
      await gate;
      return stubbed(request);
    });

    await upload();

    expect(await screen.findByText("Lendo a planilha…")).toBeInTheDocument();
    release();
    expect(await screen.findByRole("region", { name: "2025" })).toBeInTheDocument();
  });

  it.each([
    [413, problem(413, "too-large"), "Arquivo maior que 5 MB"],
    [422, fieldProblem(422, "file"), "Esse arquivo não é uma planilha .xlsx"],
    [500, problem(500, "internal"), "Não foi possível importar. Tente de novo."],
  ])("stays on the picker when the upload answers %i", async (status, body, message) => {
    open({ "POST /api/imports/xlsx": { status, body } });

    await upload();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("Escolha ou arraste o arquivo .xlsx")).toBeInTheDocument();
  });

  it("keeps the preview when it expired and lets another file be chosen", async () => {
    open({ "POST /api/imports/xlsx/confirm": { status: 410, body: problem(410, "import-expired") } });
    await upload();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Importar mesmo assim, pulando essas células" }));

    await userEvent.click(screen.getByRole("button", { name: "Importar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A prévia expirou, envie o arquivo de novo");
    expect(router.replace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Escolher outro arquivo" }));
    expect(screen.getByLabelText("Escolha ou arraste o arquivo .xlsx")).toBeInTheDocument();
  });

  it("asks for a valid opening balance before importing", async () => {
    const requests = open();
    await upload();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Importar mesmo assim, pulando essas células" }));

    await userEvent.clear(screen.getByLabelText("Saldo inicial"));
    await userEvent.click(screen.getByRole("button", { name: "Importar" }));

    expect(screen.getByText("Informe um valor, como 1.250,00.")).toBeInTheDocument();
    expect(requests.some((request) => request.url.endsWith("/confirm"))).toBe(false);
  });

  it("says so when the workbook has nothing to import", async () => {
    open({ "POST /api/imports/xlsx": { status: 200, body: { ...PREVIEW, years: [], errors: [] } } });

    await upload();

    expect(await screen.findByText("A planilha não tem lançamentos para importar.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Importar" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Escolher outro arquivo" })).toBeInTheDocument());
  });
});
