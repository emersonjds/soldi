import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/test/render";

import { DeleteEntriesForm } from "./delete-entries-form";

type Reply = { status: number; body?: unknown };

type Answer = Reply | Promise<Reply>;

/** Counts per `period`; `remove` answers the DELETE and, when it succeeds, empties every count. */
const serve = (counts: Record<string, Answer>, remove: Answer = { status: 200, body: { deleted: 37 } }) => {
  const requests: Request[] = [];
  let deleted = false;
  vi.stubGlobal("fetch", async (request: Request) => {
    requests.push(request);
    const period = new URL(request.url).searchParams.get("period") ?? "";
    const emptied = deleted ? count(0) : counts[period];
    const answer = request.method === "DELETE" ? remove : emptied;
    const { status, body } = await (answer ?? { status: 404, body: { detail: period } });
    if (request.method === "DELETE" && status === 200) deleted = true;
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return requests;
};

const count = (value: number) => ({ status: 200, body: { count: value } });

const open = () =>
  renderWithQuery(
    <>
      <DeleteEntriesForm />
      <Toaster />
    </>,
  );

const deleteButton = () => screen.getByRole("button", { name: /^Apagar/ });

const confirmDialog = async () => {
  await userEvent.click(await screen.findByRole("button", { name: "Apagar 37 lançamentos" }));
  return screen.findByRole("alertdialog", { name: "Apagar 37 lançamentos?" });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 5, 12));
  return () => vi.useRealTimers();
});

describe("DeleteEntriesForm", () => {
  it("previews the current month, then the year, then everything", async () => {
    const requests = serve({ "2026-11": count(37), "2026": count(120), "2026-10": count(5), all: count(310) });
    open();

    expect(screen.getByRole("radio", { name: "Mês" })).toHaveAttribute("data-state", "on");
    expect(screen.getByLabelText("Mês")).toHaveValue("2026-11");
    expect(await screen.findByText("Serão apagados 37 lançamentos de novembro de 2026.")).toBeInTheDocument();
    expect(deleteButton()).toHaveAccessibleName("Apagar 37 lançamentos");
    expect(deleteButton()).toBeEnabled();
    expect(screen.getByText("Categorias, contas fixas e cofrinhos continuam, sem os lançamentos.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Mês"), { target: { value: "" } });
    expect(screen.getByLabelText("Mês")).toHaveValue("2026-11");
    fireEvent.change(screen.getByLabelText("Mês"), { target: { value: "2026-10" } });
    expect(await screen.findByText("Serão apagados 5 lançamentos de outubro de 2026.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Ano" }));
    expect(screen.queryByLabelText("Mês")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Ano")).toHaveValue(2026);
    expect(await screen.findByText("Serão apagados 120 lançamentos de 2026.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Tudo" }));
    expect(screen.queryByLabelText("Ano")).not.toBeInTheDocument();
    expect(await screen.findByText("Serão apagados 310 lançamentos de todo o período.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Tudo" }));
    expect(screen.getByRole("radio", { name: "Tudo" })).toHaveAttribute("data-state", "on");
    expect(requests.map((request) => new URL(request.url).searchParams.get("period"))).toEqual([
      "2026-11",
      "2026-10",
      "2026",
      "all",
    ]);
  });

  it("labels the period choice as a radio group", () => {
    serve({ "2026-11": count(37) });
    open();

    expect(screen.getByRole("radiogroup", { name: "Período" })).toBeInTheDocument();
    expect(screen.getByText("Período")).toBeVisible();
  });

  it("asks nothing for a year outside 2000 to 2100 and keeps the button off", async () => {
    const requests = serve({ "2026-11": count(37), "2025": count(3) });
    open();
    await screen.findByText(/Serão apagados 37/);

    await userEvent.click(screen.getByRole("radio", { name: "Ano" }));
    fireEvent.change(screen.getByLabelText("Ano"), { target: { value: "1999" } });

    expect(screen.getByLabelText("Ano")).toHaveAccessibleDescription("Informe um ano entre 2000 e 2100.");
    expect(screen.getByLabelText("Ano")).toBeInvalid();
    expect(deleteButton()).toHaveAccessibleName("Apagar lançamentos");
    expect(deleteButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Ano"), { target: { value: "2025" } });
    await screen.findByText("Serão apagados 3 lançamentos de 2025.");
    expect(requests.map((request) => new URL(request.url).searchParams.get("period"))).toEqual([
      "2026-11",
      "2026",
      "2025",
    ]);
  });

  it("refuses a month outside 2000 to 2100 with the year's message", async () => {
    const requests = serve({ "2026-11": count(37) });
    open();
    await screen.findByText(/Serão apagados 37/);

    const field = screen.getByLabelText("Mês");
    expect(field).toHaveAttribute("min", "2000-01");
    expect(field).toHaveAttribute("max", "2100-12");
    fireEvent.change(field, { target: { value: "1999-05" } });

    expect(field).toHaveAccessibleDescription("Informe um ano entre 2000 e 2100.");
    expect(field).toBeInvalid();
    expect(deleteButton()).toBeDisabled();
    expect(requests).toHaveLength(1);
  });

  it("says 1 lançamento in the singular", async () => {
    serve({ "2026-11": count(1) });
    open();

    expect(await screen.findByText("Será apagado 1 lançamento de novembro de 2026.")).toBeInTheDocument();
    expect(deleteButton()).toHaveAccessibleName("Apagar 1 lançamento");
  });

  it("has nothing to delete in an empty period", async () => {
    serve({ "2026-11": count(0) });
    open();

    expect(await screen.findByText("Nada para apagar neste período.")).toBeInTheDocument();
    expect(deleteButton()).toBeDisabled();
  });

  it("shows Contando… while counting, button off", () => {
    serve({ "2026-11": new Promise<never>(() => undefined) });
    open();

    expect(screen.getByText("Contando…")).toBeInTheDocument();
    expect(deleteButton()).toBeDisabled();
  });

  it("says so when counting fails and retries", async () => {
    let fail = true;
    serve({
      get "2026-11"() {
        const answer = fail ? { status: 500, body: { detail: "Falhou." } } : count(37);
        fail = false;
        return answer;
      },
    });
    open();

    expect(await screen.findByText("Não foi possível contar os lançamentos.")).toBeInTheDocument();
    expect(deleteButton()).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Serão apagados 37 lançamentos de novembro de 2026.")).toBeInTheDocument();
  });

  it("confirms only on the exact word, and cancel deletes nothing", async () => {
    const requests = serve({ "2026-11": count(37) });
    open();

    const dialog = await confirmDialog();
    expect(dialog).toHaveTextContent(
      "Serão apagados 37 lançamentos de novembro de 2026. Isso não pode ser desfeito. O saldo dos meses seguintes muda.",
    );
    const field = within(dialog).getByLabelText("Digite APAGAR para confirmar");
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("autocorrect", "off");
    expect(field).toHaveAttribute("spellcheck", "false");
    expect(field).toHaveAttribute("autocapitalize", "characters");
    const confirm = within(dialog).getByRole("button", { name: "Apagar" });
    expect(confirm).toBeDisabled();

    await userEvent.type(field, "apagar");
    expect(confirm).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(field, "APAGAR");
    expect(confirm).toBeEnabled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(requests.some((request) => request.method === "DELETE")).toBe(false);

    await confirmDialog();
    expect(screen.getByLabelText("Digite APAGAR para confirmar")).toHaveValue("");
  });

  it("deletes, toasts and lands on the empty preview without leaving", async () => {
    const requests = serve({ "2026-11": count(37) });
    open();

    const dialog = await confirmDialog();
    await userEvent.type(within(dialog).getByLabelText("Digite APAGAR para confirmar"), "APAGAR");
    await userEvent.click(within(dialog).getByRole("button", { name: "Apagar" }));

    expect(await screen.findByText("37 lançamentos apagados")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Nada para apagar neste período.")).toBeInTheDocument();
    const remove = requests.find((request) => request.method === "DELETE");
    expect(new URL(remove?.url ?? "").searchParams.get("period")).toBe("2026-11");
  });

  it("disables both buttons while deleting", async () => {
    serve({ "2026-11": count(37) }, new Promise<never>(() => undefined));
    open();

    const dialog = await confirmDialog();
    await userEvent.type(within(dialog).getByLabelText("Digite APAGAR para confirmar"), "APAGAR");
    await userEvent.click(within(dialog).getByRole("button", { name: "Apagar" }));

    expect(await within(dialog).findByRole("button", { name: "Apagando…" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeDisabled();
  });

  it("keeps the dialog through Esc while deleting, then toasts", async () => {
    let finish: (reply: Reply) => void = () => undefined;
    serve({ "2026-11": count(37) }, new Promise<Reply>((resolve) => (finish = resolve)));
    open();

    const dialog = await confirmDialog();
    await userEvent.type(within(dialog).getByLabelText("Digite APAGAR para confirmar"), "APAGAR");
    await userEvent.click(within(dialog).getByRole("button", { name: "Apagar" }));
    await within(dialog).findByRole("button", { name: "Apagando…" });
    await userEvent.keyboard("{Escape}");

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    finish({ status: 200, body: { deleted: 37 } });
    expect(await screen.findByText("37 lançamentos apagados")).toBeInTheDocument();
  });

  it("keeps the dialog and the typed word when deleting fails", async () => {
    serve({ "2026-11": count(37) }, { status: 500, body: { detail: "Falhou." } });
    open();

    const dialog = await confirmDialog();
    await userEvent.type(within(dialog).getByLabelText("Digite APAGAR para confirmar"), "APAGAR");
    await userEvent.click(within(dialog).getByRole("button", { name: "Apagar" }));

    expect(await within(dialog).findByText("Não foi possível apagar. Tente de novo.")).toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Digite APAGAR para confirmar")).toHaveValue("APAGAR");
  });
});
