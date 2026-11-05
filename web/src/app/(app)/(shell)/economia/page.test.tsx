import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { router, setSearch } from "@/test/next-navigation";
import { renderWithQuery } from "@/test/render";
import { problem, SAVINGS, SETTINGS, signedIn } from "@/test/stub-api";

import EconomiaPage from "./page";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

type Reply = { status: number; body?: unknown };

const OCTOBER_OPENING = { ...SETTINGS, opening_date: "2026-10-01" };

const open = (replies: Record<string, Reply> = {}) => {
  const requests = signedIn({
    "GET /api/settings": { status: 200, body: OCTOBER_OPENING },
    "GET /api/savings": { status: 200, body: SAVINGS },
    ...replies,
  });
  renderWithQuery(
    <>
      <EconomiaPage />
      <Toaster />
    </>,
  );
  return requests;
};

const withMonth = (month: number, rest: Partial<Schemas["SavingsMonth"]>): Schemas["SavingsYear"] => ({
  ...SAVINGS,
  months: SAVINGS.months.map((row) => (row.month === month ? { ...row, ...rest } : row)),
});

const hero = () => screen.getByRole("region", { name: "Guardado no ano" });
const row = (name: string) => screen.getByRole("row", { name: new RegExp(`^${name}`) });
const puts = (requests: Request[]) => requests.filter((request) => request.method === "PUT");

describe("Economia", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
    setSearch("");
    router.replace.mockClear();
  });

  it("shows the year's savings, its share of income and the progress to the goal", async () => {
    open();

    expect(screen.getByRole("heading", { level: 1, name: "Economia" })).toBeInTheDocument();
    expect(
      await within(await screen.findByRole("region", { name: "Guardado no ano" })).findByText("R$ 500,00"),
    ).toBeInTheDocument();
    expect(hero()).toHaveTextContent("5,6% das entradas");
    expect(hero()).toHaveTextContent("Meta 20%");
    expect(within(hero()).getByRole("progressbar", { name: "Progresso da meta" })).toHaveAttribute(
      "aria-valuenow",
      "27.8",
    );
  });

  it("lists the twelve months with a colored dot by share, dashes before the opening and a total", async () => {
    open();

    await screen.findByRole("region", { name: "Guardado no ano" });
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(14);
    expect(row("Janeiro")).toHaveTextContent("—");
    expect(within(row("Janeiro")).queryByRole("button")).not.toBeInTheDocument();
    expect(row("Novembro")).toHaveTextContent("R$ 5.000,00");
    expect(
      within(row("Novembro")).getByRole("button", { name: /^Guardado em Novembro: R\$\s400,00\. Editar$/ }),
    ).toBeInTheDocument();
    expect(within(row("Novembro")).getAllByText("8,0%")[0].previousSibling).toHaveClass("bg-tier-yellow");
    expect(within(row("Outubro")).getAllByText("2,5%")[0].previousSibling).toHaveClass("bg-tier-red");
    expect(row("Dezembro")).toHaveTextContent("—");
    expect(row("Total")).toHaveTextContent("R$ 9.000,00");
    expect(row("Total")).toHaveTextContent("R$ 500,00");
    expect(row("Total")).toHaveTextContent("5,6%");
  });

  it("paints a share above 15% green and exactly 15% yellow", async () => {
    open({ "GET /api/savings": { status: 200, body: withMonth(12, { pct: "15.0" }) } });
    await screen.findByRole("region", { name: "Guardado no ano" });
    expect(within(row("Dezembro")).getAllByText("15,0%")[0].previousSibling).toHaveClass("bg-tier-yellow");
    expect(within(row("Novembro")).getAllByText("8,0%")[0].previousSibling).toHaveClass("bg-tier-yellow");
  });

  it("paints a share above 15% green", async () => {
    open({ "GET /api/savings": { status: 200, body: withMonth(12, { pct: "16.2" }) } });
    await screen.findByRole("region", { name: "Guardado no ano" });
    expect(within(row("Dezembro")).getAllByText("16,2%")[0].previousSibling).toHaveClass("bg-tier-green");
  });

  it("edits a month's savings inline, shows it at once and says Salvo", async () => {
    const saved = withMonth(11, { saved: "650.00", pct: "13.0" });
    open();
    await userEvent.click(await screen.findByRole("button", { name: /^Guardado em Novembro/ }));
    const requests = signedIn({
      "GET /api/settings": { status: 200, body: OCTOBER_OPENING },
      "GET /api/savings": { status: 200, body: saved },
      "PUT /api/savings/2026/11": { status: 200, body: { year: 2026, month: 11, amount: "650.00" } },
    });

    const input = screen.getByRole("textbox", { name: "Guardado em Novembro" });
    expect(input).toHaveValue("400,00");
    await userEvent.clear(input);
    await userEvent.type(input, "R$ 650,00{Enter}");

    expect(await screen.findByText("Salvo")).toBeInTheDocument();
    expect(within(row("Novembro")).getByRole("button", { name: /R\$\s650,00/ })).toBeInTheDocument();
    expect((await within(row("Novembro")).findAllByText("13,0%"))[0]).toBeInTheDocument();
    expect(await puts(requests)[0].json()).toEqual({ amount: "650.00" });
  });

  it("fills the cents from the right as digits are typed and saves on blur", async () => {
    const requests = open({
      "PUT /api/savings/2026/10": { status: 200, body: { year: 2026, month: 10, amount: "1234.50" } },
    });
    await userEvent.click(await screen.findByRole("button", { name: /^Guardado em Outubro/ }));
    const input = screen.getByRole("textbox", { name: "Guardado em Outubro" });
    await userEvent.clear(input);
    await userEvent.type(input, "12345");
    expect(input).toHaveValue("123,45");
    fireEvent.blur(input);

    await waitFor(() => expect(puts(requests)).toHaveLength(1));
    expect(await puts(requests)[0].json()).toEqual({ amount: "123.45" });
  });

  it("Escape cancels and an unchanged value saves nothing", async () => {
    const requests = open();
    await userEvent.click(await screen.findByRole("button", { name: /^Guardado em Novembro/ }));
    await userEvent.type(screen.getByRole("textbox", { name: "Guardado em Novembro" }), "9{Escape}");

    expect(screen.getByRole("button", { name: /^Guardado em Novembro: R\$\s400,00/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Guardado em Novembro/ }));
    await userEvent.type(screen.getByRole("textbox", { name: "Guardado em Novembro" }), "{Enter}");
    expect(screen.getByRole("button", { name: /^Guardado em Novembro/ })).toBeInTheDocument();
    expect(puts(requests)).toHaveLength(0);
  });

  it("refuses an empty amount and puts the old value back when the server fails", async () => {
    const requests = open({ "PUT /api/savings/2026/11": { status: 500, body: problem(500, "Falhou.") } });
    await userEvent.click(await screen.findByRole("button", { name: /^Guardado em Novembro/ }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Guardado em Novembro" }));
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByText("Informe um valor como 250,00.")).toBeInTheDocument();
    expect(puts(requests)).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: /^Guardado em Novembro/ }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Guardado em Novembro" }),
      "{Backspace}{Backspace}{Backspace}{Enter}",
    );

    expect(await screen.findByText("Não foi possível salvar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Guardado em Novembro: R\$\s400,00/ })).toBeInTheDocument();
  });

  it("edits the goal inline", async () => {
    const requests = open({
      "PATCH /api/settings": { status: 200, body: { ...OCTOBER_OPENING, savings_goal_pct: 15 } },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Editar meta" }));
    const input = screen.getByRole("spinbutton", { name: "Meta (% das entradas)" });
    expect(input).toHaveValue(20);

    await userEvent.clear(input);
    await userEvent.type(input, "101");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    expect(screen.getByText("De 1 a 100.")).toBeInTheDocument();

    await userEvent.clear(input);
    await userEvent.type(input, "15{Enter}");

    await waitFor(() => expect(requests.some((request) => request.method === "PATCH")).toBe(true));
    const patch = requests.find((request) => request.method === "PATCH");
    expect(await patch?.json()).toEqual({ savings_goal_pct: 15 });
    expect(await screen.findByText("Meta salva")).toBeInTheDocument();
  });

  it("offers a goal when there is none, and Cancelar or Escape closes the editor", async () => {
    open({ "GET /api/savings": { status: 200, body: { ...SAVINGS, goal_pct: null, goal_progress_pct: null } } });

    expect(await screen.findByText("Sem meta")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Definir meta" }));
    expect(screen.getByRole("spinbutton", { name: "Meta (% das entradas)" })).toHaveValue(null);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await userEvent.click(screen.getByRole("button", { name: "Definir meta" }));
    await userEvent.keyboard("{Escape}");

    expect(screen.getByText("Sem meta")).toBeInTheDocument();
  });

  it("clears the goal when saved empty, and says when it cannot", async () => {
    const requests = open({ "PATCH /api/settings": { status: 500, body: problem(500, "Falhou.") } });
    await userEvent.click(await screen.findByRole("button", { name: "Editar meta" }));
    await userEvent.clear(screen.getByRole("spinbutton", { name: "Meta (% das entradas)" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Não foi possível salvar a meta.")).toBeInTheDocument();
    const patch = requests.find((request) => request.method === "PATCH");
    expect(await patch?.json()).toEqual({ savings_goal_pct: null });
  });

  it("hides the share of income when the year has none", async () => {
    open({ "GET /api/savings": { status: 200, body: { ...SAVINGS, pct: null } } });

    await screen.findByRole("region", { name: "Guardado no ano" });
    expect(hero()).not.toHaveTextContent("das entradas");
  });

  it("shows a skeleton while loading, then an error with a retry", async () => {
    const requests = open({ "GET /api/savings": { status: 500, body: problem(500, "Falhou.") } });

    expect(screen.getByRole("status", { name: "Carregando" })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));

    await waitFor(() => expect(requests.filter((request) => request.url.includes("/api/savings"))).toHaveLength(2));
  });

  it("opens the year in the address, moves with the switcher and stops at the opening year", async () => {
    setSearch("y=2027");
    const requests = open();

    expect(await screen.findByText("2027")).toBeInTheDocument();
    const year = requests.find((request) => request.url.includes("/api/savings"));
    expect(new URL(year?.url ?? "http://x").searchParams.get("year")).toBe("2027");
    await userEvent.click(screen.getByRole("button", { name: "Ano anterior" }));
    expect(router.replace).toHaveBeenLastCalledWith("/economia?y=2026", { scroll: false });
  });

  it("ignores a malformed year and cannot go before the opening year", async () => {
    setSearch("y=20x6");
    open();

    expect(await screen.findByText("2026")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Ano anterior" })).toBeDisabled());
  });
});
