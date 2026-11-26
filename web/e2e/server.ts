import { type APIRequestContext, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? process.env.E2E_BASE_URL ?? "http://localhost:8080";

/** Skips the flow when no Soldi server answers locally; in CI a missing server fails it. */
export const requireServer = async (request: APIRequestContext) => {
  const health = await request.get(`${API}/api/health`).catch(() => null);
  if (health?.ok()) return;
  const message = `Soldi server unreachable at ${API}/api/health; start it to run this flow.`;
  if (process.env.CI) throw new Error(message);
  test.skip(true, message);
};

/**
 * `preferred`, or the next day when that is today's (`YYYY-MM-DD`) day of the month: D55 pays a fixed conta on its
 * due day, so a test that needs one still unpaid gives it another day. On the month's last day it is the day before,
 * still in the month and unpaid but not owed until next month (D13: registered after its day).
 */
export const dueDay = (today: string, preferred: number) => {
  const day = Number(today.slice(8));
  if (preferred !== day) return preferred;
  const last = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  return day < last ? day + 1 : day - 1;
};
