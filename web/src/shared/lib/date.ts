const pad = (value: number) => String(value).padStart(2, "0");

/** Today in the browser's zone as `YYYY-MM-DD`; `toISOString` would give tomorrow late at night in Brazil. */
export const todayISO = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

export const yesterdayISO = (now = new Date()) => {
  const date = new Date(now);
  date.setDate(date.getDate() - 1);
  return todayISO(date);
};
