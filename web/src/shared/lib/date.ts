const pad = (value: number) => String(value).padStart(2, "0");

/** Today in the browser's zone as `YYYY-MM-DD`; `toISOString` would give tomorrow late at night in Brazil. */
export const todayISO = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

export const yesterdayISO = (now = new Date()) => {
  const date = new Date(now);
  date.setDate(date.getDate() - 1);
  return todayISO(date);
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The `?m=YYYY-MM` of the address, or the current month when absent or malformed. */
export const monthParam = (asked: string | null) => (asked && MONTH.test(asked) ? asked : todayISO().slice(0, 7));

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** `2026-11-05` → `5 nov`. */
export const shortDay = (date: string) => {
  const [, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
};
