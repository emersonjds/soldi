import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMonth } from "@/entities/month/month-query";
import { useTransactions } from "@/entities/transaction/transaction-queries";
import type { Schemas } from "@/shared/api/client";
import { stubIntersection } from "@/test/intersection";
import { renderWithQuery } from "@/test/render";
import {
  BILL_ALUGUEL,
  COMIDA,
  ESTIMATE_MONTH,
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

const CARD: Schemas["Bill"] = {
  ...BILL_ALUGUEL,
  id: "b3000000-0000-4000-8000-000000000003",
  name: "Porto",
  amount: null,
  closing_day: 3,
};

/** Diário spends on CARD: the server keeps them out of the day's Diário (D28). */
const CARD_SPENDS: Schemas["Transaction"][] = [
  { id: "c5", date: "2026-11-05", amount: "80.00", kind: "daily", category: COMIDA, note: "Jantar", card_id: CARD.id },
  {
    id: "c1",
    date: "2026-11-01",
    amount: "25.00",
    kind: "daily",
    category: MERCADO,
    note: "Padaria",
    card_id: CARD.id,
  },
];

const REPLIES: Record<string, Reply> = {
  "GET /api/months/2026-11": { status: 200, body: VIEW },
  "GET /api/transactions": { status: 200, body: ENTRIES },
  "GET /api/categories": { status: 200, body: [...WITH_COFRINHOS, RESGATE] },
};

const show = (replies: Record<string, Reply> = {}, openingDate = "2026-03-10", estimate?: string) => {
  const requests = stubApi({ ...REPLIES, ...replies });
  const intersection = stubIntersection();
  const { client, rerender } = renderWithQuery(
    <Planilha today="2026-11-05" openingDate={openingDate} estimate={estimate} />,
  );
  intersection.show(screen.getByRole("table", { name: "Novembro 2026" }));
  return {
    client,
    rerender,
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

  it("lists a card spend in Diário after the cash ones, on the fatura and out of the total, which stays the cell's", async () => {
    show({
      "GET /api/transactions": { status: 200, body: [...ENTRIES, ...CARD_SPENDS] },
      "GET /api/bills": { status: 200, body: [CARD] },
    });
    const { cells } = await row("Quinta-feira, 5 de novembro, hoje");

    const today = await tap("Quinta-feira, 5 de novembro, hoje");

    await within(today).findByText("Porto · na fatura");
    expect(groups(today)).toEqual([
      ["Saída", "Saída R$ 400,00", "Internet | - R$ 400,00 | Conta fixa · venceu dia 02/11"],
      ["Diário", "Diário R$ 19,75", "Comida fora | - R$ 19,75 | Diário", "Jantar | - R$ 80,00 | Porto · na fatura"],
    ]);
    expect(text(within(today).getByRole("heading", { name: /Diário/ }))).toContain(cells[3].textContent);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    const only = await tap("Domingo, 1 de novembro");
    expect(groups(only)).toEqual([["Diário", "Diário", "Padaria | - R$ 25,00 | Porto · na fatura"]]);
    expect(only).not.toHaveTextContent("Nada lançado neste dia.");
  });
});

/** ESTIMATE_MONTH's typed Diário ahead, plus a card spend on the 7th kept out of the total. */
const AHEAD: Schemas["Transaction"][] = [
  ...ENTRIES,
  { id: "a7", date: "2026-11-07", amount: "20.00", kind: "daily", category: MERCADO, note: "Padaria" },
  { id: "k7", date: "2026-11-07", amount: "90.00", kind: "daily", category: COMIDA, note: "Jantar", card_id: CARD.id },
  { id: "a8", date: "2026-11-08", amount: "80.00", kind: "daily", category: MERCADO, note: "Feira grande" },
];

const ESTIMATED: Record<string, Reply> = {
  "GET /api/months/2026-11": { status: 200, body: ESTIMATE_MONTH },
  "GET /api/transactions": { status: 200, body: AHEAD },
  "GET /api/bills": { status: 200, body: [CARD] },
};

describe("Planilha Diário previsto (SOL-164)", () => {
  const media = window.matchMedia;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  });
  afterEach(() => {
    window.matchMedia = media;
    vi.useRealTimers();
  });

  it("A19: takes the keyboard to Ajustar Diário previsto in the popover, and Esc gives focus back to the day", async () => {
    window.matchMedia = (query) => ({ ...media(query), matches: query === "(hover: hover) and (pointer: fine)" });
    show(ESTIMATED, "2026-03-10", "50.00");
    const day = await screen.findByRole("button", { name: "Sexta-feira, 6 de novembro" });

    day.focus();
    await userEvent.keyboard("{Enter}");
    const popover = await screen.findByRole("dialog");

    expect(popover).toHaveAttribute("data-slot", "popover-content");
    await userEvent.tab();
    expect(within(popover).getByRole("link", { name: "Ajustar Diário previsto" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(day).toHaveFocus();
  });

  it("A12: shows a future Diário cell with the estimate, italic, read as including it; today unchanged", async () => {
    show(ESTIMATED, "2026-03-10", "50.00");

    const sixth = (await row("Sexta-feira, 6 de novembro")).cells[3];
    expect(sixth).toHaveTextContent(/^50,00 inclui Diário previsto$/);
    expect(sixth).toHaveClass("italic");
    expect(within(sixth).getByText("inclui Diário previsto")).toHaveClass("sr-only");
    expect((await row("Sábado, 7 de novembro")).cells[3]).toHaveTextContent(/^50,00 inclui Diário previsto$/);
    expect((await row("Domingo, 8 de novembro")).cells[3]).toHaveTextContent(/^80,00$/);
    expect((await row("Quinta-feira, 5 de novembro, hoje")).cells[3]).toHaveTextContent(/^19,75$/);
  });

  it("A12: lists the estimate in an otherwise empty day's Diário, total equal to the cell, with a link to the setting", async () => {
    show(ESTIMATED, "2026-03-10", "50.00");

    const detail = await tap("Sexta-feira, 6 de novembro");

    expect(groups(detail)).toEqual([
      ["Diário", "Diário R$ 50,00", "Diário previsto | - R$ 50,00 | Estimativa de R$ 50,00/dia"],
    ]);
    expect(within(detail).getByText("Diário previsto")).toHaveClass("italic");
    expect(detail).not.toHaveTextContent("Nada previsto para este dia.");
    const link = within(detail).getByRole("link", { name: "Ajustar Diário previsto" });
    expect(link).toHaveAttribute("href", "/ajustes#diario-previsto");
    expect(link).toHaveClass("min-h-11", "text-primary", "focus-visible:outline-ring");
  });
  it("S8: puts the estimate after the typed cash Diário and before the card spend, outside the fatura", async () => {
    show(ESTIMATED, "2026-03-10", "50.00");

    const detail = await tap("Sábado, 7 de novembro");

    await within(detail).findByText("Porto · na fatura");
    expect(groups(detail)).toEqual([
      [
        "Diário",
        "Diário R$ 50,00",
        "Padaria | - R$ 20,00 | Diário",
        "Diário previsto | - R$ 30,00 | Estimativa de R$ 50,00/dia, menos R$ 20,00 lançados",
        "Jantar | - R$ 90,00 | Porto · na fatura",
      ],
    ]);
  });

  it("S13: shows no estimate item or link once the typed Diário reaches it", async () => {
    show(ESTIMATED, "2026-03-10", "50.00");

    const detail = await tap("Domingo, 8 de novembro");

    await within(detail).findByText("Feira grande");
    expect(detail).not.toHaveTextContent("Diário previsto");
  });

  it("notes the estimate under the legend, and nothing while off", async () => {
    show(ESTIMATED, "2026-03-10", "50.00");
    expect(screen.getByRole("link", { name: /^Inclui Diário previsto de R\$\s50,00\/dia$/ })).toBeInTheDocument();
    cleanup();

    show();
    expect(screen.queryByRole("link", { name: /Inclui Diário previsto/ })).not.toBeInTheDocument();
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
    const shown = show();
    await screen.findByRole("button", { name: "Segunda-feira, 2 de novembro" });
    await waitFor(() => expect(shown.client.getQueryState(["transactions", "2026-11"])?.status).toBe("success"));
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
    return shown;
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

  it("closes on a click on the row of the open popover, without opening it again", async () => {
    show();
    await screen.findByRole("button", { name: "Domingo, 1 de novembro" });
    await userEvent.click(rowOf("Domingo, 1 de novembro").cells[4]);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await userEvent.click(rowOf("Domingo, 1 de novembro").cells[4]);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Domingo, 1 de novembro" })).toHaveFocus();
  });

  it("drops a pending hover when the planilha goes", async () => {
    const { client, rerender } = await loaded();
    const Kept = () => {
      useMonth("2026-11");
      useTransactions("2026-11");
      return null;
    };
    const before = vi.getTimerCount();
    fireEvent.pointerEnter(rowOf("Segunda-feira, 2 de novembro"));
    expect(vi.getTimerCount()).toBe(before + 1);

    rerender(
      <QueryClientProvider client={client}>
        <Kept />
      </QueryClientProvider>,
    );

    expect(vi.getTimerCount()).toBe(before);
  });
});
