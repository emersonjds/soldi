import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/test/render";

import { DeleteEntriesForm } from "./delete-entries-form";

type Reply = { status: number; body?: unknown };

type Answer = Reply | Promise<Reply>;

/** Counts per `period`; `remove` answers the DELETE and, when it succeeds, empties that period's count. */
const serve = (counts: Record<string, Answer>, remove: Answer = { status: 200, body: { deleted: 37 } }) => {
  const requests: Request[] = [];
  const emptied = new Set<string>();
  vi.stubGlobal("fetch", async (request: Request) => {
    requests.push(request);
    const period = new URL(request.url).searchParams.get("period") ?? "";
    const counted = emptied.has(period) ? count(0) : counts[period];
    const answer = request.method === "DELETE" ? remove : counted;
    const { status, body } = await (answer ?? { status: 404, body: { detail: period } });
    if (request.method === "DELETE" && status === 200) emptied.add(period);
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
  it("offers today's month, its year and everything, each with its count", async () => {
    serve({ "2026-11": count(42), "2026": count(120), all: count(300) });
    open();

    expect(screen.getByRole("radiogroup", { name: "Selecione o escopo para exclusão:" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Mês atual" })).toBeChecked();
    expect(await screen.findByText("Novembro 2026 (42 registros)")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Ano de 2026" })).not.toBeChecked();
    expect(await screen.findByText("120 registros em 11 meses")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Zerar tudo" })).toBeInTheDocument();
    expect(await screen.findByText("Limpa toda a base da conta (300 registros)")).toBeInTheDocument();
    expect(screen.getByText("Ação destrutiva sem retorno")).toBeInTheDocument();
    expect(screen.queryByText(/Serão apagados/)).not.toBeInTheDocument();
  });

  it("names another switcher month Mês selecionado, counts the year from January and deletes that month", async () => {
    const requests = serve({ "2025-03": count(1), "2025": count(1) });
    open("2025-03", "2024-06-01");

    expect(screen.getByRole("radio", { name: "Mês selecionado" })).toBeChecked();
    expect(await screen.findByText("Março 2025 (1 registro)")).toBeInTheDocument();
    expect(await screen.findByText("1 registro em 12 meses")).toBeInTheDocument();
    await userEvent.type(confirmation(), "CONFIRMAR");
    await userEvent.click(deleteButton());
    await waitFor(() => expect(deletedPeriod(requests)).toBe("2025-03"));
  });

  it.each([
    ["2026-11", "2026-08-20", "4 meses"],
    ["2025-04", "2025-08-20", "5 meses"],
    ["2026-11", "2026-11-03", "1 mês"],
    ["2024-05", "2025-02-01", "0 meses"],
    ["2027-02", "2026-01-01", "0 meses"],
  ])("counts the months of %s's year from the opening %s to today", async (month, opening, months) => {
    serve({ [month.slice(0, 4)]: count(2) });
    open(month, opening);

    expect(await screen.findByText(`2 registros em ${months}`)).toBeInTheDocument();
  });

  it("keeps Excluir Lançamentos off when the chosen scope has nothing", async () => {
    serve({ "2026-11": count(0), "2026": count(5), all: count(5) });
    open();

    await screen.findByText("Novembro 2026 (0 registros)");
    await userEvent.type(confirmation(), "CONFIRMAR");
    expect(deleteButton()).toBeDisabled();
  });

  it("forgets the typed word when the scope changes", async () => {
    serve({ "2026-11": count(42), "2026": count(120), all: count(300) });
    open();

    await userEvent.type(confirmation(), "CONFIRMAR");
    expect(deleteButton()).toBeEnabled();
    await userEvent.click(screen.getByRole("radio", { name: "Zerar tudo" }));

    expect(confirmation()).toHaveValue("");
    expect(deleteButton()).toBeDisabled();
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
    await userEvent.type(confirmation(), "CONFIRMAR ");
    expect(deleteButton()).toBeDisabled();
    await userEvent.clear(confirmation());
    await userEvent.type(confirmation(), "CONFIRMAR");
    expect(deleteButton()).toBeEnabled();
  });

  it("deletes the month, toasts, clears the word and focuses the scopes", async () => {
    const requests = serve({ "2026-11": count(37) });
    open();

    await userEvent.type(confirmation(), "CONFIRMAR");
    await userEvent.click(deleteButton());

    expect(await screen.findByText("37 lançamentos apagados")).toBeInTheDocument();
    expect(confirmation()).toHaveValue("");
    expect(screen.getByRole("radiogroup")).toHaveFocus();
    expect(deletedPeriod(requests)).toBe("2026-11");
    expect(await screen.findByText("Novembro 2026 (0 registros)")).toBeInTheDocument();
  });

  it("deletes the year or everything", async () => {
    const requests = serve(
      { "2026-11": count(1), "2026": count(1), all: count(9) },
      { status: 200, body: { deleted: 1 } },
    );
    open();

    await userEvent.click(screen.getByRole("radio", { name: "Ano de 2026" }));
    await screen.findByText("1 registro em 11 meses");
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
