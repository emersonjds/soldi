import { describe, expect, it } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { MERCADO } from "@/test/stub-api";

import { faturaGroups } from "./fatura-groups";

type Transaction = Schemas["Transaction"];
const money = (amount: string) => `R$ ${amount}`;
type Series = NonNullable<Transaction["series"]>;
const entry = (
  id: string,
  amount: string,
  note: string,
  series?: Partial<Series>,
  date = "2026-10-12",
): Transaction => ({
  id,
  date,
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
      last_date: date,
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

describe("faturaGroups", () => {
  it("orders Assinaturas, Parcelas, Compras, rows largest first, with shares of the total", () => {
    const groups = faturaGroups([SMALL, SPOTIFY, BIG, NOTEBOOK], "399.90", money);
    expect(groups.map(({ label, total, share }) => [label, total, share])).toEqual([
      ["Assinaturas", "39.90", 10],
      ["Parcelas", "250.00", 63],
      ["Compras", "110.00", 28],
    ]);
    expect(groups[2].rows.map((row) => row.title)).toEqual(["Mercado grande", "Padaria"]);
  });

  it("captions a subscription by its yearly cost, a parcela by what is left, a purchase by its day", () => {
    const [subscriptions, parcels, purchases] = faturaGroups([SPOTIFY, NOTEBOOK, BIG], "369.90", money);
    expect(subscriptions.rows[0].caption).toBe("Todo mês · R$ 478.80 por ano");
    expect(parcels.rows[0].caption).toBe("3/10 · faltam 7");
    expect(purchases.rows[0].caption).toBe("12 out");
  });

  it("reads the last parcela and a yearly subscription plainly", () => {
    const last = entry("t5", "100.00", "TV", { position: 10, total: 10 });
    const yearly = entry("t6", "99.00", "Domínio", { open_ended: true, every: "year" });
    const groups = faturaGroups([last, yearly], "199.00", money);
    expect(groups.map((group) => group.rows[0].caption)).toEqual(["Todo ano", "10/10 · última"]);
  });

  it("sums a weekly subscription's members into one row that opens the latest", () => {
    const week = (id: string, date: string) =>
      entry(id, "25.00", "Academia", { open_ended: true, every: "week" }, date);
    const [group] = faturaGroups(
      [week("w4", "2026-10-26"), week("w3", "2026-10-19"), week("w2", "2026-10-12"), week("w1", "2026-10-05")],
      "100.00",
      money,
    );
    expect(group.rows).toHaveLength(1);
    expect(group.rows[0]).toMatchObject({
      amount: "100.00",
      caption: "Toda semana · R$ 1300.00 por ano · 4 nesta fatura",
    });
    expect(group.rows[0].entry.id).toBe("w4");
  });

  it("lists nothing for no entries and no share for a zero total", () => {
    expect(faturaGroups([], "0.00", money)).toEqual([]);
    expect(faturaGroups([SMALL], "0.00", money)[0].share).toBe(0);
  });

  it("breaks a tie by title and names an entry without a note by its category", () => {
    const [group] = faturaGroups([entry("t7", "30.00", ""), SMALL], "60.00", money);
    expect(group.rows.map((row) => row.title)).toEqual(["Mercado", "Padaria"]);
  });
});
