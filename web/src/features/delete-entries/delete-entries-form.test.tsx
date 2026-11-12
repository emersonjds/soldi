import { screen, waitFor } from "@testing-library/react";
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

const open = (month = "2026-11", opening = "2026-01-10") =>
  renderWithQuery(
    <>
      <DeleteEntriesForm month={month} opening={opening} />
      <Toaster />
    </>,
  );

const deleteButton = () => screen.getByRole("button", { name: "Excluir Lançamentos" });

const confirmation = () => screen.getByPlaceholderText("CONFIRMAR");

const deletedPeriod = (requests: Request[]) =>
  new URL(requests.find((request) => request.method === "DELETE")?.url ?? "").searchParams.get("period");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 5, 12));
  return () => vi.useRealTimers();
});

describe("DeleteEntriesForm", () => {
  it("offers today's month with its count, its year and everything", async () => {
    serve({ "2026-11": count(42) });
    open();

    expect(screen.getByRole("radiogroup", { name: "Selecione o escopo para exclusão:" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Mês atual" })).toBeChecked();
    expect(await screen.findByText("Novembro 2026 (42 registros)")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Ano de 2026" })).not.toBeChecked();
    expect(screen.getByText("Todos os 11 meses deste ano")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Zerar tudo" })).toBeInTheDocument();
    expect(screen.getByText("Limpa toda a base da conta")).toBeInTheDocument();
    expect(screen.getByText("Ação destrutiva sem retorno")).toBeInTheDocument();
    expect(screen.queryByText(/Serão apagados/)).not.toBeInTheDocument();
  });

  it("names another switcher month Mês selecionado and counts the year from January", async () => {
    serve({ "2025-03": count(1) });
    open("2025-03", "2024-06-01");

    expect(screen.getByRole("radio", { name: "Mês selecionado" })).toBeChecked();
    expect(await screen.findByText("Março 2025 (1 registro)")).toBeInTheDocument();
    expect(screen.getByText("Todos os 12 meses deste ano")).toBeInTheDocument();
  });

  it("counts the year's months from the opening month", () => {
    serve({});
    open("2026-11", "2026-08-20");

    expect(screen.getByText("Todos os 4 meses deste ano")).toBeInTheDocument();
  });

  it("enables Excluir Lançamentos only on the exact word CONFIRMAR", async () => {
    serve({ "2026-11": count(42) });
    open();

    expect(deleteButton()).toBeDisabled();
    await userEvent.type(confirmation(), "confirmar");
    expect(deleteButton()).toBeDisabled();
    await userEvent.clear(confirmation());
    await userEvent.type(confirmation(), " CONFIRMAR");
    expect(deleteButton()).toBeDisabled();
    await userEvent.clear(confirmation());
    await userEvent.type(confirmation(), "CONFIRMAR");
    expect(deleteButton()).toBeEnabled();
  });

  it("deletes the month, toasts and clears the word", async () => {
    const requests = serve({ "2026-11": count(37) });
    open();

    await userEvent.type(confirmation(), "CONFIRMAR");
    await userEvent.click(deleteButton());

    expect(await screen.findByText("37 lançamentos apagados")).toBeInTheDocument();
    expect(confirmation()).toHaveValue("");
    expect(deletedPeriod(requests)).toBe("2026-11");
    expect(await screen.findByText("Novembro 2026 (0 registros)")).toBeInTheDocument();
  });

  it("deletes the year or everything", async () => {
    const requests = serve({}, { status: 200, body: { deleted: 1 } });
    open();

    await userEvent.click(screen.getByRole("radio", { name: "Ano de 2026" }));
    await userEvent.type(confirmation(), "CONFIRMAR");
    await userEvent.click(deleteButton());
    expect(await screen.findByText("1 lançamento apagado")).toBeInTheDocument();
    expect(deletedPeriod(requests)).toBe("2026");

    await userEvent.click(screen.getByRole("radio", { name: "Zerar tudo" }));
    await userEvent.type(confirmation(), "CONFIRMAR");
    await userEvent.click(deleteButton());
    await waitFor(() =>
      expect(requests.filter((request) => request.method === "DELETE").map((request) => request.url)).toHaveLength(2),
    );
    expect(new URL(requests.filter((request) => request.method === "DELETE")[1].url).searchParams.get("period")).toBe(
      "all",
    );
  });

  it("disables the button while deleting", async () => {
    serve({ "2026-11": count(37) }, new Promise<never>(() => undefined));
    open();

    await userEvent.type(confirmation(), "CONFIRMAR");
    await userEvent.click(deleteButton());

    expect(await screen.findByRole("button", { name: "Excluindo…" })).toBeDisabled();
  });

  it("keeps the word and says so when deleting fails", async () => {
    serve({ "2026-11": count(37) }, { status: 500, body: { detail: "Falhou." } });
    open();

    await userEvent.type(confirmation(), "CONFIRMAR");
    await userEvent.click(deleteButton());

    expect(await screen.findByText("Não foi possível apagar. Tente de novo.")).toBeInTheDocument();
    expect(confirmation()).toHaveValue("CONFIRMAR");
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
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Novembro 2026 (37 registros)")).toBeInTheDocument();
  });
});
