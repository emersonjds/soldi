const pad = (value: number) => String(value).padStart(2, "0");

/** Today in the browser's zone as `YYYY-MM-DD`; `toISOString` would give tomorrow late at night in Brazil. */
export const todayISO = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

export const yesterdayISO = (now = new Date()) => {
  const date = new Date(now);
  date.setDate(date.getDate() - 1);
  return todayISO(date);
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isMonth = (value: string | null): value is string => value !== null && MONTH.test(value);

/** The `?m=YYYY-MM` of the address, or the current month when absent or malformed. */
export const monthParam = (asked: string | null) => (isMonth(asked) ? asked : todayISO().slice(0, 7));

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** `2026-11-05` → `5 nov`. */
export const shortDay = (date: string) => {
  const [, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
};

/** `2027-06-30` → `jun 2027`. */
export const monthYear = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** `2026-11` → `Nov`; the year rides in `monthLong`. */
export const monthShort = (month: string) => {
  const name = MONTHS[Number(month.slice(5, 7)) - 1];
  return name[0].toUpperCase() + name.slice(1);
};

/** `2026-11` → `novembro de 2026`. */
export const monthLong = (month: string) => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} de ${month.slice(0, 4)}`;

/** `2026-11` or `2026-11-04` → `Novembro/2026`. */
export const monthSlashYear = (date: string) => {
  const name = MONTH_NAMES[Number(date.slice(5, 7)) - 1];
  return `${name[0].toUpperCase()}${name.slice(1)}/${date.slice(0, 4)}`;
};

/** `2026-10-10` seen from `2026-11` → `outubro`; from `2027-01` → `outubro de 2026`. */
export const monthName = (date: string, viewing: string) => {
  const name = MONTH_NAMES[Number(date.slice(5, 7)) - 1];
  return date.slice(0, 4) === viewing.slice(0, 4) ? name : `${name} de ${date.slice(0, 4)}`;
};

/** `2026-11-02` → `02/11`. */
export const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** `2026-11` plus 2 → `2027-01`. */
export const addMonths = (month: string, count: number) => {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + count;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
};

const lastDay = (month: string) =>
  new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

/** The server's `repeat_dates`: `date`'s day in each of the next `count - 1` months, clamped to the month's last day. */
export const repeatDates = (date: string, count: number) =>
  Array.from({ length: count - 1 }, (_, index) => {
    const month = addMonths(date.slice(0, 7), index + 1);
    return `${month}-${pad(Math.min(Number(date.slice(8, 10)), lastDay(month)))}`;
  });
