import type { ComponentProps } from "react";

import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { renderWithQuery } from "@/test/render";
import { BILLS_OF_MONTH, MERCADO, problem, signedIn } from "@/test/stub-api";

import { FaturaSheet } from "./fatura-sheet";

type Transaction = Schemas["Transaction"];
type Series = NonNullable<Transaction["series"]>;
const entry = (id: string, amount: string, note: string, series?: Partial<Series>): Transaction => ({
  id,
  date: "2026-10-12",
  amount,
  kind: "daily",
  category: MERCADO,
  note,
  card_id: "card-porto",
  ...(series && {
    series: {
      id: `s-${note}`,
      position: 1,
      total: 1,
      last_date: "2026-10-12",
      every: "month",
      open_ended: false,
      ...series,
    },
  }),
});

const SPOTIFY = entry("t1", "39.90", "Spotify", { open_ended: true });
const NOTEBOOK = entry("t2", "250.00", "Notebook", { position: 3, total: 10 });
const BIG = entry("t3", "80.00", "Mercado grande");
const SMALL = entry("t4", "30.00", "Padaria");

const AHEAD = ["2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05"];
const FATURA: Schemas["CardFatura"] = {
  month: "2026-11",
  total: "399.90",
  carried: "0.00",
  paid: "0.00",
  entries: [SPOTIFY, NOTEBOOK, BIG, SMALL],
  ahead: AHEAD.map((month, index) => ({ month, total: index < 2 ? "289.90" : "39.90" })),
};

const PORTO_ROW: Schemas["BillOfMonth"] = {
  ...BILLS_OF_MONTH[1],
  bill_id: "card-porto",
  name: "Porto",
  amount: "450.00",
  is_card: true,
};

const ROUTE = "GET /api/months/2026-11/faturas/card-porto";

const show = (
  fatura: Partial<Schemas["CardFatura"]> = {},
  bill: Partial<Schemas["BillOfMonth"]> = {},
  entrySheet: ComponentProps<typeof FaturaSheet>["entrySheet"] = () => null,
) => {
  const requests = signedIn({ [ROUTE]: { status: 200, body: { ...FATURA, ...fatura } } });
  renderWithQuery(
    <FaturaSheet bill={{ ...PORTO_ROW, ...bill }} open onOpenChange={() => undefined} entrySheet={entrySheet} />,
  );
  return requests;
};

const sheet = () => screen.findByRole("dialog", { name: "Fatura Porto" });
const total = async () => within(await sheet()).findByText("R$ 399,90");

describe("FaturaSheet", () => {
  it("shows the total, when it is due and what weighs on it, group by group", async () => {
    show();
    await total();
    const dialog = await sheet();

    expect(dialog).toHaveTextContent("Vence dia 10/11");
    expect(
      within(dialog)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.firstChild?.textContent),
    ).toEqual(["Assinaturas", "Parcelas", "Compras", "Próximos meses"]);
    expect(within(dialog).getByRole("region", { name: "Assinaturas" })).toHaveTextContent("R$ 39,90 · 10%");
    const spotify = within(dialog).getByRole("button", { name: /Spotify/ });
    expect(spotify).toHaveTextContent("Todo mês · R$ 478,80 por ano");
    expect(spotify).toHaveClass("min-h-14");
    expect(within(spotify).getByText("Spotify")).toHaveClass("truncate", "text-base");
  });

  it("reads Venceu in red for an overdue fatura (D17)", async () => {
    show({}, { overdue: true });
    await total();
    expect(within(await sheet()).getByText("Venceu dia 10/11")).toHaveClass("text-expense");
  });

  it("reads Paga once the payment covers the total", async () => {
    show({ paid: "399.90" });
    await total();
    expect(await sheet()).toHaveTextContent("Paga");
  });

  it("says where a partial payment's rest goes", async () => {
    show({ total: "450.00", paid: "300.00" });
    expect(
      await within(await sheet()).findByText("Pagou R$ 300,00 · R$ 150,00 vão para a fatura de dezembro"),
    ).toBeInTheDocument();
  });

  it("names last month's carry", async () => {
    show({ carried: "150.00" });
    await total();
    const dialog = await sheet();
    expect(dialog).toHaveTextContent("Restante da fatura de outubro");
    expect(dialog).toHaveTextContent("R$ 150,00");
  });

  it("lists the next six faturas with a link to Posso comprar?", async () => {
    show();
    await total();
    const ahead = within(await sheet()).getByRole("region", { name: "Próximos meses" });
    expect(within(ahead).getAllByRole("listitem")[0]).toHaveTextContent("dez/26R$ 289,90");
    expect(within(ahead).getAllByRole("listitem")).toHaveLength(6);
    expect(within(ahead).getByRole("link", { name: "Posso comprar?" })).toHaveAttribute("href", "/posso-comprar");
    expect(within(ahead).getByRole("link", { name: "Posso comprar?" })).toHaveClass("min-h-11");
  });

  it("hides Próximos meses when nothing is committed ahead", async () => {
    show({ ahead: AHEAD.map((month) => ({ month, total: "0.00" })) });
    await total();
    expect(within(await sheet()).queryByText("Próximos meses")).not.toBeInTheDocument();
  });

  it("shows only the groups that have rows", async () => {
    show({ total: "39.90", entries: [SPOTIFY] });
    const dialog = await sheet();
    await within(dialog).findByRole("region", { name: "Assinaturas" });
    expect(within(dialog).getByRole("region", { name: "Assinaturas" })).toHaveTextContent("100%");
    expect(within(dialog).queryByRole("region", { name: "Parcelas" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("region", { name: "Compras" })).not.toBeInTheDocument();
  });

  it("opens a row's entry in the sheet it is lent", async () => {
    show({}, {}, ({ transaction, open }) => (open ? <p>editing {transaction.id}</p> : null));
    await total();
    await userEvent.click(within(await sheet()).getByRole("button", { name: /Spotify/ }));
    expect(screen.getByText("editing t1")).toBeInTheDocument();
  });

  it("says so with its own words when loading fails, and tries again", async () => {
    let calls = 0;
    signedIn();
    const stubbed = globalThis.fetch;
    vi.stubGlobal("fetch", async (request: Request) => {
      if (new URL(request.url).pathname !== "/api/months/2026-11/faturas/card-porto") return stubbed(request);
      calls += 1;
      if (calls === 1) return Response.json(problem(500, "boom from the server"), { status: 500 });
      return Response.json(FATURA);
    });
    renderWithQuery(<FaturaSheet bill={PORTO_ROW} open onOpenChange={() => undefined} entrySheet={() => null} />);

    const dialog = await sheet();
    expect(await within(dialog).findByText("Não foi possível carregar.")).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("boom from the server");
    await userEvent.click(within(dialog).getByRole("button", { name: "Tentar de novo" }));
    expect(await within(dialog).findByText("R$ 399,90")).toBeInTheDocument();
  });

  it("shows only the title without a bill", () => {
    signedIn();
    renderWithQuery(<FaturaSheet bill={undefined} open onOpenChange={() => undefined} entrySheet={() => null} />);
    expect(screen.getByRole("dialog", { name: "Fatura" })).toBeInTheDocument();
  });
});
