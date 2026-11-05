import { vi } from "vitest";

import type { Schemas } from "@/shared/api/client";

type Reply = { status: number; body?: unknown };

export const problem = (status: number, detail: string) => ({ type: "about:blank", title: detail, status, detail });

/** Answers `fetch` by `"METHOD /path"`; unknown calls get a 404 problem. Returns the requests seen. */
export const stubApi = (replies: Record<string, Reply>) => {
  const requests: Request[] = [];
  vi.stubGlobal("fetch", async (request: Request) => {
    requests.push(request);
    const route = `${request.method} ${new URL(request.url).pathname}`;
    const reply = replies[route] ?? { status: 404, body: problem(404, route) };
    const body = reply.body === undefined ? null : JSON.stringify(reply.body);
    const type = reply.status >= 400 ? "application/problem+json" : "application/json";
    return new Response(body, { status: reply.status, headers: { "content-type": type } });
  });
  return requests;
};

export const ANA: Schemas["User"] = {
  id: "7f3c1a52-6c2e-4a0e-9a57-2f0f5c8b9d11",
  email: "ana@example.com",
  name: "Ana",
  onboarded: true,
};

export const SETTINGS: Schemas["Settings"] = {
  opening_balance: "1842.10",
  opening_date: "2026-11-01",
  tier_red: "-500.00",
  tier_zero: "0.00",
  tier_yellow: "1000.00",
  tier_green: "2000.00",
  savings_goal_pct: null,
};

export const signedIn = (replies: Record<string, Reply> = {}, user: Schemas["User"] = ANA) =>
  stubApi({
    "GET /api/auth/me": { status: 200, body: user },
    "GET /api/settings": { status: 200, body: SETTINGS },
    ...replies,
  });

export const anonymous = (replies: Record<string, Reply> = {}) =>
  stubApi({ "GET /api/auth/me": { status: 401, body: problem(401, "Entre na sua conta.") }, ...replies });
