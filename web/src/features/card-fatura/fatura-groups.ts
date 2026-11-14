import { OPEN_LABEL } from "@/entities/transaction/series-step";
import type { Schemas } from "@/shared/api/client";
import { shortDay } from "@/shared/lib/date";
import { wholeShare } from "@/shared/lib/percent";
import { cents, fromCents } from "@/shared/lib/tier";

type Transaction = Schemas["Transaction"];
type Label = "Assinaturas" | "Parcelas" | "Compras";

export type FaturaRow = { key: string; title: string; caption: string; amount: string; entry: Transaction };
export type FaturaGroup = { label: Label; total: string; share: number; rows: FaturaRow[] };

const LABELS: Label[] = ["Assinaturas", "Parcelas", "Compras"];
const PER_YEAR = { month: 12, week: 52, year: 1 } as const;

const labelOf = ({ series }: Transaction): Label => {
  if (!series) return "Compras";
  return series.open_ended ? "Assinaturas" : "Parcelas";
};

/** `members` come newest date first, as the API lists them. */
const rowOf = (key: string, members: Transaction[], money: (amount: string) => string): FaturaRow => {
  const [latest] = members;
  const { series } = latest;
  let caption = shortDay(latest.date);
  if (series?.open_ended) {
    caption =
      series.every === "year"
        ? OPEN_LABEL.year
        : `${OPEN_LABEL[series.every]} · ${money(fromCents(cents(latest.amount) * PER_YEAR[series.every]))} por ano`;
    if (members.length > 1) caption += ` · ${members.length} nesta fatura`;
  } else if (series) {
    caption =
      series.position === series.total
        ? `${series.total}/${series.total} · última`
        : `${series.position}/${series.total} · faltam ${series.total - series.position}`;
  }
  const amount = fromCents(members.reduce((sum, member) => sum + cents(member.amount), 0));
  return { key, title: latest.note || latest.category.name, caption, amount, entry: latest };
};

/** SOL-119: what weighs on a fatura, in a fixed order, largest first; a series is one row. */
export const faturaGroups = (
  entries: Transaction[],
  total: string,
  money: (amount: string) => string,
): FaturaGroup[] => {
  const bySeries = new Map<string, Transaction[]>();
  for (const entry of entries) {
    const key = entry.series?.id ?? entry.id;
    bySeries.set(key, [...(bySeries.get(key) ?? []), entry]);
  }
  const base = cents(total);
  return LABELS.flatMap((label) => {
    const rows = [...bySeries]
      .filter(([, members]) => labelOf(members[0]) === label)
      .map(([key, members]) => rowOf(key, members, money))
      .sort((a, b) => cents(b.amount) - cents(a.amount) || a.title.localeCompare(b.title, "pt-BR"));
    if (rows.length === 0) return [];
    const sum = rows.reduce((acc, row) => acc + cents(row.amount), 0);
    return [{ label, total: fromCents(sum), share: base > 0 ? wholeShare(sum, base) : 0, rows }];
  });
};
