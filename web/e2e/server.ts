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
