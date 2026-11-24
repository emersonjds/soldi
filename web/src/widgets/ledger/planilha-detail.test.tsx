import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { stubIntersection } from "@/test/intersection";
import { renderWithQuery } from "@/test/render";
import {
  COMIDA,
  LUZ,
  MERCADO,
  PLANILHA_MONTH,
  problem,
  RESERVA,
  RESGATE,
  SALARIO,
  stubApi,
  WITH_COFRINHOS,
} from "@/test/stub-api";

import { Planilha } from "./planilha";

vi.mock("next/navigation", () => import("@/test/next-navigation"));

type Reply = { status: number; body?: unknown };

/** PLANILHA_MONTH with the 10th's conta as the second of six parcelas. */
const VIEW: Schemas["MonthView"] = {
  ...PLANILHA_MONTH,
  bills_of_month: PLANILHA_MONTH.bills_of_month.map((bill) =>
    bill.name === "Financiamento" ? { ...bill, installment: 2, installments: 6 } : bill,
  ),
};

/** The entries behind PLANILHA_MONTH's cells. */
const ENTRIES: Schemas["Transaction"][] = [
  { id: "p1", date: "2026-11-02", amount: "300.00", kind: "income", category: SALARIO },
  { id: "p2", date: "2026-11-02", amount: "50.00", kind: "income", category: RESGATE, cofrinho_id: RESERVA.id },
  {
    id: "t4",
    date: "2026-11-03",
    amount: "200.00",
    kind: "bill",
    category: LUZ,
    recurring_bill_id: VIEW.bills_of_month[0].bill_id,
  },
  { id: "p4", date: "2026-11-04", amount: "30.25", kind: "daily", category: MERCADO, note: "Feira" },
  { id: "p5", date: "2026-11-05", amount: "19.75", kind: "daily", category: COMIDA },
];

const REPLIES: Record<string, Reply> = {
  "GET /api/months/2026-11": { status: 200, body: VIEW },
  "GET /api/transactions": { status: 200, body: ENTRIES },
  "GET /api/categories": { status: 200, body: [...WITH_COFRINHOS, RESGATE] },
};

const show = (replies: Record<string, Reply> = {}, openingDate = "2026-03-10") => {
  const requests = stubApi({ ...REPLIES, ...replies });
  const intersection = stubIntersection();
  const { client } = renderWithQuery(<Planilha today="2026-11-05" openingDate={openingDate} />);
  intersection.show(screen.getByRole("table", { name: "Novembro 2026" }));
  return {
    client,
    transactions: () =>
      requests.flatMap(({ url }) =>
        new URL(url).pathname === "/api/transactions" ? [new URL(url).searchParams.get("month")] : [],
      ),
  };
};

/** The row of `day`'s button and its cells: Data, Entrada, Saída, Diário, Saldo. */
const row = async (name: string) => {
  const tr = (await screen.findByRole("button", { name })).closest("tr");
  if (!tr) throw new Error(`no row for ${name}`);
  return { tr, cells: within(tr).getAllByRole("cell") };
};

/** Taps the row's Saldo cell and returns the detail that opens. */
const tap = async (name: string) => {
  await userEvent.click((await row(name)).cells[4]);
  return screen.findByRole("dialog");
};

const text = (element: Element) => element.textContent?.replace(/\s+/g, " ").trim();

/** Each group as `[name, total, ...items]`, an item as `title | amount | caption`. */
const groups = (detail: HTMLElement) =>
  within(detail)
    .queryAllByRole("region")
    .map((group) => [
      group.getAttribute("aria-label"),
      text(within(group).getByRole("heading")),
      ...within(group)
        .getAllByRole("listitem")
        .map((item) => [...item.children].map(text).join(" | ")),
    ]);

describe("Planilha day detail", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  });
  afterEach(() => vi.useRealTimers());

  it("opens a bottom sheet on a tap anywhere on the row, with the day's entries under totals equal to its cells", async () => {
    const { transactions } = show();
    const { cells } = await row("Segunda-feira, 2 de novembro");

    const detail = await tap("Segunda-feira, 2 de novembro");

    expect(detail).toHaveAccessibleName("2 nov");
    expect(detail).toHaveAttribute("data-slot", "sheet-content");
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
    expect(within(detail).getByText("Saldo ao final:")).toBeInTheDocument();
    expect(groups(detail)).toEqual([
      ["Entrada", "Entrada R$ 350,00", "Salário | + R$ 300,00 | Entrada", "Resgate › Reserva | + R$ 50,00 | Resgatado"],
    ]);
    expect(text(within(detail).getByRole("heading", { name: /Entrada/ }))).toContain(cells[1].textContent);
    expect(within(detail).getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: /Editar|Excluir/ })).not.toBeInTheDocument();
    expect(transactions()).toEqual(["2026-11"]);
  });

  it("lists a day's paid conta, then its unpaid contas after the entries, and Diário last", async () => {
    show();

    expect(groups(await tap("Terça-feira, 3 de novembro"))).toEqual([
      ["Saída", "Saída R$ 200,00", "Luz | - R$ 200,00 | Conta fixa · paga"],
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    const { cells } = await row("Quinta-feira, 5 de novembro, hoje");
    const today = await tap("Quinta-feira, 5 de novembro, hoje");
    expect(today).toHaveAccessibleName("Hoje, 5 nov");
    expect(groups(today)).toEqual([
      ["Saída", "Saída R$ 400,00", "Internet | - R$ 400,00 | Conta fixa · venceu dia 02/11"],
      ["Diário", "Diário R$ 19,75", "Comida fora | - R$ 19,75 | Diário"],
    ]);
    expect(text(within(today).getByRole("heading", { name: /Saída/ }))).toContain(cells[2].textContent?.slice(0, 6));
    expect(text(within(today).getByRole("heading", { name: /Diário/ }))).toContain(cells[3].textContent);
  });

  it("shows a future day's landed parcela under Projeção, never an estimated Diário", async () => {
    show();

    const detail = await tap("Terça-feira, 10 de novembro");

    expect(detail).toHaveAccessibleName("Previsto · 10 nov");
    expect(within(detail).getByText("Projeção:")).toBeInTheDocument();
    expect(groups(detail)).toEqual([
      ["Saída", "Saída R$ 1.850,00", "Financiamento | - R$ 1.850,00 | Parcela 2/6 · a pagar"],
    ]);
  });

  it("says when a day has nothing, in the past and ahead", async () => {
    show();

    expect(await tap("Domingo, 1 de novembro")).toHaveTextContent("Nada lançado neste dia.");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    const ahead = await tap("Quarta-feira, 11 de novembro");
    expect(ahead).toHaveTextContent("Nada previsto para este dia.");
    expect(groups(ahead)).toEqual([]);
  });

  it("says a day before the opening date has no balance yet", async () => {
    show({}, "2026-11-03");

    const detail = await tap("Domingo, 1 de novembro");

    expect(detail).toHaveTextContent("Este dia é anterior ao seu saldo inicial.");
    expect(within(detail).queryByText("Saldo ao final:")).not.toBeInTheDocument();
    expect(detail).not.toHaveTextContent("Nada lançado neste dia.");
  });

  it("returns focus to the day when the sheet closes", async () => {
    show();
    await tap("Domingo, 1 de novembro");

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Domingo, 1 de novembro" })).toHaveFocus();
  });

  it("keeps the cells and the landed contas when the entries fail, with a retry", async () => {
    show({ "GET /api/transactions": { status: 500, body: problem(500, "boom") } });
    expect((await row("Segunda-feira, 2 de novembro")).cells[1]).toHaveTextContent("350,00");

    const detail = await tap("Quinta-feira, 5 de novembro, hoje");

    expect(await within(detail).findByText("Não foi possível carregar os lançamentos deste dia.")).toBeInTheDocument();
    expect(groups(detail)).toEqual([
      ["Saída", "Saída R$ 400,00", "Internet | - R$ 400,00 | Conta fixa · venceu dia 02/11"],
    ]);
    expect(detail).not.toHaveTextContent("Nada lançado neste dia.");
    const retry = within(detail).getByRole("button", { name: "Tentar de novo" });
    expect(retry).toHaveClass("min-h-11");

    stubApi(REPLIES);
    await userEvent.click(retry);

    expect(await within(detail).findByText("Comida fora")).toBeInTheDocument();
    expect(within(detail).queryByText("Não foi possível carregar os lançamentos deste dia.")).not.toBeInTheDocument();
  });
});

describe("Planilha day detail with a fine pointer", () => {
  const media = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = (query) => ({ ...media(query), matches: query === "(hover: hover) and (pointer: fine)" });
  });
  afterEach(() => {
    window.matchMedia = media;
    vi.useRealTimers();
  });

  /** Waits for November's entries, then takes over the clock. */
  const loaded = async () => {
    const { client } = show();
    await screen.findByRole("button", { name: "Segunda-feira, 2 de novembro" });
    await waitFor(() => expect(client.getQueryState(["transactions", "2026-11"])?.status).toBe("success"));
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  };

  const rowOf = (name: string) => {
    const tr = screen.getByRole("button", { name }).closest("tr");
    if (!tr) throw new Error(`no row for ${name}`);
    return tr;
  };

  const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  it("opens the popover after a 300 ms hover on a day with entries or contas, never on an empty day", async () => {
    await loaded();

    fireEvent.pointerEnter(rowOf("Domingo, 1 de novembro"));
    wait(1000);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.pointerLeave(rowOf("Domingo, 1 de novembro"));

    fireEvent.pointerEnter(rowOf("Segunda-feira, 2 de novembro"));
    wait(299);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    wait(1);
    const popover = screen.getByRole("dialog");
    expect(popover).toHaveAttribute("data-slot", "popover-content");
    expect(popover).toHaveAccessibleName("2 nov");
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull();
    expect(within(popover).getByText("Saldo ao final:")).toBeInTheDocument();
  });

  it("closes 150 ms after the pointer leaves both the row and the popover", async () => {
    await loaded();
    const tr = rowOf("Quinta-feira, 5 de novembro, hoje");
    fireEvent.pointerEnter(tr);
    wait(300);
    const popover = screen.getByRole("dialog");

    fireEvent.pointerLeave(tr);
    wait(100);
    fireEvent.pointerEnter(popover);
    wait(500);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.pointerLeave(popover);
    wait(149);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    wait(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on a click on any day, empty ones included, and Esc gives focus back to the day", async () => {
    show();
    await screen.findByRole("button", { name: "Domingo, 1 de novembro" });

    await userEvent.click(rowOf("Domingo, 1 de novembro").cells[4]);
    const past = await screen.findByRole("dialog");
    expect(past).toHaveAttribute("data-slot", "popover-content");
    expect(await within(past).findByText("Nada lançado neste dia.")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Domingo, 1 de novembro" })).toHaveFocus();

    screen.getByRole("button", { name: "Quarta-feira, 11 de novembro" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText("Nada previsto para este dia.")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Quarta-feira, 11 de novembro" })).toHaveFocus();
  });

  it("gives focus back to the day when a clicked popover closes on pointer leave", async () => {
    await loaded();
    const tr = rowOf("Quinta-feira, 5 de novembro, hoje");
    fireEvent.click(tr.cells[4]);
    const popover = screen.getByRole("dialog");
    wait(0);
    expect(popover.contains(document.activeElement)).toBe(true);

    fireEvent.pointerLeave(tr);
    wait(150);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quinta-feira, 5 de novembro, hoje" })).toHaveFocus();
  });
});
