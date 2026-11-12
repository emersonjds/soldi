type Month = [year: number, month: number];

const pad = (value: number) => String(value).padStart(2, "0");
const lastDay = ([year, month]: Month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const clamped = (month: Month, day: number) => `${month[0]}-${pad(month[1])}-${pad(Math.min(day, lastDay(month)))}`;
const next = ([year, month]: Month): Month => (month === 12 ? [year + 1, 1] : [year, month + 1]);

/** D28, mirror of `bills::domain::fatura_due`: the due date of the fatura a spend on `date` joins. */
export const faturaDue = (date: string, closingDay: number, dueDay: number) => {
  const own: Month = [Number(date.slice(0, 4)), Number(date.slice(5, 7))];
  const closes = date < clamped(own, closingDay) ? own : next(own);
  return clamped(dueDay > closingDay ? closes : next(closes), dueDay);
};
