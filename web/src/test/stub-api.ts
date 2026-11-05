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

/** In the API's order: kind, then name. */
export const CATEGORIES = [EXTRA, SALARIO, ALUGUEL, LUZ, COMIDA, MERCADO];

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

export const BILL_ALUGUEL: Schemas["Bill"] = {
  id: "b1000000-0000-4000-8000-000000000001",
  category_id: ALUGUEL.id,
  name: "Aluguel Residencial",
  amount: "2259.56",
  due_day: 10,
  active: true,
};

export const BILL_LUZ: Schemas["Bill"] = {
  id: "b1000000-0000-4000-8000-000000000002",
  category_id: LUZ.id,
  name: "Luz (Enel)",
  amount: "284.10",
  due_day: 2,
  active: true,
};

export const BILL_PAUSED: Schemas["Bill"] = {
  id: "b1000000-0000-4000-8000-000000000003",
  category_id: LUZ.id,
  name: "Academia",
  amount: "99.90",
  due_day: 15,
  active: false,
};

export const BILLS = [BILL_ALUGUEL, BILL_LUZ, BILL_PAUSED];

/** Today is 2026-11-05: the rent is due on the 10th, the power bill went overdue on the 2nd. */
export const BILLS_OF_MONTH: Schemas["BillOfMonth"][] = [
  {
    bill_id: BILL_LUZ.id,
    name: BILL_LUZ.name,
    icon: LUZ.icon,
    color: LUZ.color,
    amount: "284.10",
    due_date: "2026-11-02",
    paid: false,
    transaction_id: null,
    overdue: true,
  },
  {
    bill_id: BILL_ALUGUEL.id,
    name: BILL_ALUGUEL.name,
    icon: ALUGUEL.icon,
    color: ALUGUEL.color,
    amount: "2259.56",
    due_date: "2026-11-10",
    paid: false,
    transaction_id: null,
    overdue: false,
  },
];

const share = (
  { id, name, icon, color, kind }: Schemas["Category"],
  amount: string,
  pct: string,
  previous_amount: string,
  delta_pct: string | null,
): Schemas["CategoryShare"] => ({ category_id: id, name, icon, color, kind, amount, pct, previous_amount, delta_pct });

/** Ana's November by category: rent fell against October, groceries grew, salary is new. */
export const REPORT: Schemas["CategoryReport"] = {
  month: "2026-11",
  outflow_total: "1384.31",
  income_total: "500.00",
  outflow: [share(ALUGUEL, "1200.00", "86.7", "1276.60", "-6.0"), share(MERCADO, "184.31", "13.3", "155.67", "18.4")],
  income: [share(SALARIO, "500.00", "100.0", "0.00", null)],
};

const savingsMonth = (month: number, rest: Partial<Schemas["SavingsMonth"]> = {}): Schemas["SavingsMonth"] => ({
  month,
  income: "0.00",
  saved: "0.00",
  pct: null,
  ...rest,
});

/** Ana opened in October 2026: nothing exists before it; she kept 400 of 5.000 in November. */
export const SAVINGS: Schemas["SavingsYear"] = {
  year: 2026,
  months: Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    if (month < 10) return { month, income: null, saved: null, pct: null };
    if (month === 10) return savingsMonth(10, { income: "4000.00", saved: "100.00", pct: "2.5" });
    if (month === 11) return savingsMonth(11, { income: "5000.00", saved: "400.00", pct: "8.0" });
    return savingsMonth(month);
  }),
  total_income: "9000.00",
  total_saved: "500.00",
  pct: "5.6",
  goal_pct: 20,
  goal_progress_pct: "27.8",
};

/** A Termômetro workbook of 2025 and 2026 with one unreadable cell. */
export const PREVIEW: Schemas["ImportPreview"] = {
  token: "a1000000-0000-4000-8000-000000000001",
  years: [
    {
      year: 2025,
      transactions: 42,
      income_total: "60000.00",
      bills_total: "27114.72",
      daily_total: "18240.55",
      savings_months: 12,
    },
    {
      year: 2026,
      transactions: 9,
      income_total: "15000.00",
      bills_total: "6778.68",
      daily_total: "3120.40",
      savings_months: 0,
    },
  ],
  errors: [{ sheet: "2026", cell: "D14", message: "fórmula que não é soma" }],
};

export const fieldProblem = (status: number, field: string) => ({
  ...problem(status, "invalid"),
  errors: [{ field, message: "invalid" }],
});
