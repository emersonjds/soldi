import { useState } from "react";

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import { BILL_ALUGUEL, BILLS, BILLS_OF_MONTH, problem, signedIn } from "@/test/stub-api";

import { PayBillSheet } from "./pay-bill-sheet";

type Row = Schemas["BillOfMonth"];
type Reply = { status: number; body?: unknown };

const ALUGUEL = BILLS_OF_MONTH[1];
const LUZ = BILLS_OF_MONTH[0];
const MONTHS = `/api/bills/${BILL_ALUGUEL.id}/months/2026-11`;
const Harness = ({ bill, onEditBill }: { bill: Row; onEditBill?: () => void }) => {
  const [open, setOpen] = useState(true);
  return (
    <>
      <PayBillSheet
        month={bill.due_date.slice(0, 7)}
        bill={bill}
        open={open}
        onOpenChange={setOpen}
        onEditBill={onEditBill}
      />
      <Toaster />
    </>
  );
};

const show = (bill: Partial<Row> = {}, replies: Record<string, Reply> = {}, onEditBill?: () => void) => {
  const row = { ...ALUGUEL, ...bill };
  const requests = signedIn({
    "GET /api/bills": { status: 200, body: BILLS },
    [`PUT ${MONTHS}`]: { status: 204 },
    [`DELETE ${MONTHS}`]: { status: 204 },
    ...replies,
  });
  renderWithQuery(<Harness bill={row} onEditBill={onEditBill} />);
  return requests;
};

const sheet = (name = "Aluguel Residencial · novembro") => screen.findByRole("dialog", { name });
const visible = (dialog: HTMLElement, text: string) => within(dialog).getByText(text, { ignore: ".sr-only" });
const sent = (requests: Request[], method: string) =>
  requests.filter((request) => request.method === method && request.url.includes("/months/"));
const closed = () => waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

const typeAmount = async (dialog: HTMLElement, typed: string) => {
  const input = within(dialog).getByLabelText("Valor de novembro");
  await userEvent.clear(input);
  await userEvent.type(input, typed);
};

describe("PayBillSheet", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("titles the occurrence and offers Pagar, Pular and Editar conta, Salvar only once the amount changes", async () => {
    show({}, {}, () => undefined);
    const dialog = await sheet();
    expect(dialog).toHaveAccessibleDescription("Conta fixa · vence dia 10/11");
    expect(visible(dialog, "Conta fixa · vence dia 10/11")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Valor de novembro")).toHaveValue("2.259,56");
    for (const name of ["Pagar", "Pular novembro", "Editar conta"])
      expect(within(dialog).getByRole("button", { name })).toBeEnabled();
    expect(within(dialog).queryByRole("button", { name: "Salvar valor de novembro" })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Os outros meses seguem/)).not.toBeInTheDocument();
  });

  it("saves only this month's amount and Desfazer goes back to the normal one", async () => {
    const requests = show();
    const dialog = await sheet();
    await typeAmount(dialog, "2.300,00");
    expect(
      await within(dialog).findByText("Só novembro muda. Os outros meses seguem R$ 2.259,56."),
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar valor de novembro" }));
    await closed();
    expect(await screen.findByText("Valor de novembro ajustado")).toBeInTheDocument();
    const [put] = sent(requests, "PUT");
    expect(await put.json()).toEqual({ amount: "2300.00", skipped: false });

    await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await waitFor(() => expect(sent(requests, "DELETE")).toHaveLength(1));
  });

  it("reads an adjusted month and Voltar ao valor normal drops the override, Desfazer puts it back", async () => {
    const requests = show({ adjusted: true, amount: "2300.00" });
    const dialog = await sheet();
    expect(await within(dialog).findByText("Valor ajustado · o normal é R$ 2.259,56")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Valor de novembro")).toHaveValue("2.300,00");

    await userEvent.click(within(dialog).getByRole("button", { name: "Voltar ao valor normal" }));
    await closed();
    expect(await screen.findByText("Valor normal de volta")).toBeInTheDocument();
    expect(sent(requests, "DELETE")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await waitFor(() => expect(sent(requests, "PUT")).toHaveLength(1));
    expect(await sent(requests, "PUT")[0].json()).toEqual({ amount: "2300.00", skipped: false });
  });

  it("skips the month keeping an adjusted amount, and Desfazer restores the previous state", async () => {
    const requests = show({ adjusted: true, amount: "2300.00" });
    await userEvent.click(within(await sheet()).getByRole("button", { name: "Pular novembro" }));
    await closed();
    expect(await screen.findByText("Novembro pulado")).toBeInTheDocument();
    expect(await sent(requests, "PUT")[0].json()).toEqual({ amount: "2300.00", skipped: true });

    await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await waitFor(() => expect(sent(requests, "PUT")).toHaveLength(2));
    expect(await sent(requests, "PUT")[1].json()).toEqual({ amount: "2300.00", skipped: false });
  });

  it("skips a plain month with no amount", async () => {
    const requests = show();
    await userEvent.click(within(await sheet()).getByRole("button", { name: "Pular novembro" }));
    await waitFor(() => expect(sent(requests, "PUT")).toHaveLength(1));
    expect(await sent(requests, "PUT")[0].json()).toEqual({ amount: null, skipped: true });
  });

  it("offers Voltar a cobrar on a skipped month, with no amount", async () => {
    const requests = show({ skipped: true, lands_on: null }, {}, () => undefined);
    const dialog = await sheet();
    expect(visible(dialog, "Novembro pulado: esta conta não cobra neste mês.")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Valor de novembro")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Pagar" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Editar conta" })).toBeEnabled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Voltar a cobrar" }));
    await closed();
    expect(await screen.findByText("Aluguel Residencial volta a cobrar em novembro")).toBeInTheDocument();
    expect(sent(requests, "DELETE")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await waitFor(() => expect(sent(requests, "PUT")).toHaveLength(1));
    expect(await sent(requests, "PUT")[0].json()).toEqual({ amount: null, skipped: true });
  });

  it("brings back a skipped adjusted month with its amount", async () => {
    const requests = show({ skipped: true, adjusted: true, amount: "2300.00" });
    await userEvent.click(within(await sheet()).getByRole("button", { name: "Voltar a cobrar" }));
    await waitFor(() => expect(sent(requests, "PUT")).toHaveLength(1));
    expect(await sent(requests, "PUT")[0].json()).toEqual({ amount: "2300.00", skipped: false });
  });

  const failing = { status: 500, body: problem(500, "Erro interno do servidor") };
  it.each([
    ["Salvar valor de novembro", {}, `PUT ${MONTHS}`, "Não foi possível ajustar o valor. Tente de novo."],
    [
      "Voltar ao valor normal",
      { adjusted: true, amount: "2300.00" },
      `DELETE ${MONTHS}`,
      "Não foi possível voltar ao valor normal. Tente de novo.",
    ],
    ["Pular novembro", {}, `PUT ${MONTHS}`, "Não foi possível pular este mês. Tente de novo."],
    ["Voltar a cobrar", { skipped: true }, `DELETE ${MONTHS}`, "Não foi possível voltar a cobrar. Tente de novo."],
  ] as const)("%s shows its fixed error, never the server's", async (button, bill, route, message) => {
    show(bill, { [route]: failing });
    const dialog = await sheet();
    if (button === "Salvar valor de novembro") await typeAmount(dialog, "2.300,00");
    await userEvent.click(await within(dialog).findByRole("button", { name: button }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText("Erro interno do servidor")).not.toBeInTheDocument();
  });

  it("fails an undo with the same fixed error", async () => {
    const requests = show({}, { [`DELETE ${MONTHS}`]: failing });
    await userEvent.click(within(await sheet()).getByRole("button", { name: "Pular novembro" }));
    await userEvent.click(await screen.findByRole("button", { name: "Desfazer" }));
    expect(await screen.findByText("Não foi possível pular este mês. Tente de novo.")).toBeInTheDocument();
    expect(sent(requests, "DELETE")).toHaveLength(1);
  });

  it("pays with the typed amount and shows a fixed error on a refusal", async () => {
    const requests = show(
      {},
      { [`POST /api/bills/${BILL_ALUGUEL.id}/pay`]: { status: 409, body: problem(409, "Já paga") } },
    );
    await userEvent.click(within(await sheet()).getByRole("button", { name: "Pagar" }));
    expect(await screen.findByText("Não foi possível marcar como paga.")).toBeInTheDocument();
    expect(screen.queryByText("Já paga")).not.toBeInTheDocument();
    const post = requests.find((request) => request.method === "POST");
    expect(await post?.json()).toEqual({ date: "2026-11-05", amount: "2259.56" });
  });

  it.each(["", "0"])("sends nothing for the amount %j", async (typed) => {
    const requests = show();
    const dialog = await sheet();
    const input = within(dialog).getByLabelText("Valor de novembro");
    await userEvent.clear(input);
    if (typed) await userEvent.type(input, typed);
    expect(within(dialog).queryByRole("button", { name: "Salvar valor de novembro" })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Pagar" }));
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(requests.some((request) => request.method !== "GET")).toBe(false);
  });

  it("numbers a parcela", async () => {
    show({ installment: 3, installments: 10 });
    expect(visible(await sheet(), "Parcela 3/10 · vence dia 10/11")).toBeInTheDocument();
  });

  it("marks an overdue month as Venceu", async () => {
    show(LUZ);
    const line = visible(await sheet("Luz (Enel) · novembro"), "Venceu dia 02/11");
    expect(line).toHaveClass("text-expense");
  });

  it("asks to check the boleto of a variable amount", async () => {
    show({ variable: true });
    expect(visible(await sheet(), "Valor variável · confira o boleto")).toBeInTheDocument();
  });

  it("dates the payment in another month", async () => {
    show({ due_date: "2026-12-10" });
    const dialog = await sheet("Aluguel Residencial · dezembro");
    expect(visible(dialog, "Conta fixa · vence dia 10/12")).toBeInTheDocument();
    expect(visible(dialog, "Conta de dezembro: a data do pagamento fica em dezembro.")).toBeInTheDocument();
  });

  it("keeps a card's sheet as Pagar only", async () => {
    show({ bill_id: "card-porto", name: "Porto", amount: "450.00", is_card: true });
    const dialog = await sheet("Pagar Fatura Porto");
    expect(within(dialog).getByText("Confira com a fatura do banco.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Valor")).toHaveValue("450,00");
    expect(within(dialog).getByRole("button", { name: "Pagar" })).toBeInTheDocument();
    for (const name of [/Pular/, /Salvar/, "Editar conta"])
      expect(within(dialog).queryByRole("button", { name })).not.toBeInTheDocument();
  });

  it("opens Editar conta, disabled until the bill is known", async () => {
    const onEditBill = vi.fn();
    show({}, {}, onEditBill);
    await userEvent.click(within(await sheet()).getByRole("button", { name: "Editar conta" }));
    expect(onEditBill).toHaveBeenCalledOnce();
    await closed();
  });

  it("disables Editar conta without a handler", async () => {
    show();
    expect(within(await sheet()).getByRole("button", { name: "Editar conta" })).toBeDisabled();
  });
});
