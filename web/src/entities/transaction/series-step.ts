import type { Schemas } from "@/shared/api/client";
import { addDays, addMonths, monthSlashYear, monthYear, shortDay, slashDate } from "@/shared/lib/date";

export type Every = Schemas["RepeatEvery"];

export const UNITS: Record<
  Every,
  { one: string; many: string; last: string; lasts: (n: number) => string; future: string; label: string }
> = {
  month: {
    one: "mês",
    many: "meses",
    last: "o último mês",
    lasts: (n) => `os ${n} últimos meses`,
    future: "futuros",
    label: "Meses",
  },
  week: {
    one: "semana",
    many: "semanas",
    last: "a última semana",
    lasts: (n) => `as ${n} últimas semanas`,
    future: "futuras",
    label: "Semanas",
  },
  year: {
    one: "ano",
    many: "anos",
    last: "o último ano",
    lasts: (n) => `os ${n} últimos anos`,
    future: "futuros",
    label: "Anos",
  },
};

/** The chip of an open series, in place of `k/N`. */
export const OPEN_LABEL: Record<Every, string> = { month: "Todo mês", week: "Toda semana", year: "Todo ano" };

const year = (date: string, added: number) => String(Number(date.slice(0, 4)) + added);

/** `repete todo dia 10 até out 2027` | `repete toda semana até 31 dez 2026` | `repete todo ano em 10 nov até 2037`. */
export const repeatSummary = (every: Every, date: string, count: number) => {
  const lastWeek = addDays(date, 7 * (count - 1));
  if (every === "week") return `repete toda semana até ${shortDay(lastWeek)} ${lastWeek.slice(0, 4)}`;
  if (every === "year") return `repete todo ano em ${shortDay(date)} até ${year(date, count - 1)}`;
  // The day clamp never changes the month.
  return `repete todo dia ${Number(date.slice(8))} até ${monthYear(addMonths(date.slice(0, 7), count - 1))}`;
};

/** `Agosto/2026` | `14/01/2027` | `2037`: where a series of `last` ends after `added` more. */
export const seriesEnd = (every: Every, last: string, added: number) => {
  if (every === "week") return slashDate(addDays(last, 7 * added));
  if (every === "year") return year(last, added);
  return monthSlashYear(addMonths(last.slice(0, 7), added));
};

/** `Série estendida: …` / `Série encurtada: …`. */
export const resizeLine = (every: Every, last: string, added: number) => {
  const unit = UNITS[every];
  const end = seriesEnd(every, last, added);
  if (added > 0) return `Série estendida: Adiciona ${added} ${added === 1 ? unit.one : unit.many}. Termina em ${end}.`;
  return `Série encurtada: Remove ${added === -1 ? unit.last : unit.lasts(-added)}. Termina em ${end}.`;
};
