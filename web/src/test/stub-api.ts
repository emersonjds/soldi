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

const category = (
  id: string,
  name: string,
  kind: Schemas["CategoryKind"],
  icon: string,
  color: string,
): Schemas["Category"] => ({ id, name, kind, icon, color });

export const SALARIO = category("c1000000-0000-4000-8000-000000000001", "Salário", "income", "briefcase", "cat-11");
export const EXTRA = category("c1000000-0000-4000-8000-000000000002", "Extra", "income", "sparkles", "cat-12");
export const ALUGUEL = category("c1000000-0000-4000-8000-000000000003", "Aluguel", "bill", "home", "cat-6");
export const LUZ = category("c1000000-0000-4000-8000-000000000004", "Luz", "bill", "zap", "cat-7");
export const MERCADO = category("c1000000-0000-4000-8000-000000000005", "Mercado", "daily", "shopping-cart", "cat-1");
export const COMIDA = category("c1000000-0000-4000-8000-000000000006", "Comida fora", "daily", "utensils", "cat-2");

export const CATEGORIES = [SALARIO, EXTRA, ALUGUEL, LUZ, MERCADO, COMIDA];

/** Ana's November: 1.842,10 on the 1st, salary on the 3rd, rent on the 4th, groceries today (the 5th). */
export const TRANSACTIONS: Schemas["Transaction"][] = [
  {
    id: "t1000000-0000-4000-8000-000000000003",
    date: "2026-11-05",
    amount: "184.31",
    kind: "daily",
    note: "Compras da semana",
    category: MERCADO,
  },
  {
    id: "t1000000-0000-4000-8000-000000000002",
    date: "2026-11-04",
    amount: "1200.00",
    kind: "bill",
    category: ALUGUEL,
  },
  {
    id: "t1000000-0000-4000-8000-000000000001",
    date: "2026-11-03",
    amount: "500.00",
    kind: "income",
    category: SALARIO,
  },
];

const day = (date: string, balance: string, tier: Schemas["Tier"], rest: Partial<Schemas["Day"]> = {}) => ({
  date,
  income: "0.00",
  bills: "0.00",
  daily: "0.00",
  balance,
  tier,
  is_today: false,
  is_future: false,
  ...rest,
});

export const MONTH: Schemas["MonthView"] = {
  month: "2026-11",
  days: [
    day("2026-11-01", "1842.10", "light_green"),
    day("2026-11-02", "1842.10", "light_green"),
    day("2026-11-03", "2342.10", "green", { income: "500.00" }),
    day("2026-11-04", "1142.10", "light_green", { bills: "1200.00" }),
    day("2026-11-05", "957.79", "yellow", { daily: "184.31", is_today: true }),
    ...Array.from({ length: 25 }, (_, index) =>
      day(`2026-11-${String(index + 6).padStart(2, "0")}`, "957.79", "yellow", { is_future: true }),
    ),
  ],
  balance_today: "957.79",
  balance_today_tier: "yellow",
  totals: { income: "500.00", bills: "1200.00", daily: "184.31", outflow: "1384.31", performance: "-884.31" },
  projected_balance: "957.79",
  projected_tier: "yellow",
  bills_of_month: [],
  savings: null,
};
