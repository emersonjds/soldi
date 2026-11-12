import { vi } from "vitest";

import type { Schemas } from "@/shared/api/client";
import { tierOf } from "@/shared/lib/tier";

type Reply = { status: number; body?: unknown };

export const problem = (status: number, detail: string) => ({ type: "about:blank", title: detail, status, detail });

const DEFAULTS: Record<string, Reply> = { "GET /api/categories/pins": { status: 200, body: { category_ids: [] } } };

/** Answers `fetch` by `"METHOD /path?query"`, else `"METHOD /path"`, else `DEFAULTS`; unknown calls get a 404 problem. Returns the requests seen. */
export const stubApi = (replies: Record<string, Reply>) => {
  const requests: Request[] = [];
  vi.stubGlobal("fetch", async (request: Request) => {
    requests.push(request);
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;
    const reply = replies[`${route}${url.search}`] ??
      replies[route] ??
      DEFAULTS[route] ?? { status: 404, body: problem(404, route) };
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
  tour_seen: true,
  email_verified: true,
};

export const SETTINGS: Schemas["Settings"] = {
  currency: "BRL",
  opening_balance: "1842.10",
  opening_date: "2026-11-01",
  tier_red: "-500.00",
  tier_zero: "0.00",
  tier_yellow: "1000.00",
  tier_green: "2000.00",
};

export const signedIn = (replies: Record<string, Reply> = {}, user: Schemas["User"] = ANA) =>
  stubApi({
    "GET /api/auth/me": { status: 200, body: user },
    "GET /api/settings": { status: 200, body: SETTINGS },
    "GET /api/forecast": { status: 200, body: FORECAST_FLAT },
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
  rest: Partial<Schemas["Category"]> = {},
): Schemas["Category"] => ({ id, name, kind, icon, color, is_savings: false, ...rest });

export const SALARIO = category("c1000000-0000-4000-8000-000000000001", "Salário", "income", "briefcase", "cat-11");
export const EXTRA = category("c1000000-0000-4000-8000-000000000002", "Extra", "income", "sparkles", "cat-12");
export const ALUGUEL = category("c1000000-0000-4000-8000-000000000003", "Aluguel", "bill", "home", "cat-6");
export const LUZ = category("c1000000-0000-4000-8000-000000000004", "Luz", "bill", "zap", "cat-7");
export const MERCADO = category("c1000000-0000-4000-8000-000000000005", "Mercado", "daily", "shopping-cart", "cat-1");
export const COMIDA = category("c1000000-0000-4000-8000-000000000006", "Comida fora", "daily", "utensils", "cat-2");

export const ECONOMIA = category("c1000000-0000-4000-8000-000000000007", "Economia", "bill", "piggy-bank", "cat-11", {
  is_savings: true,
});
export const RESERVA = category("c1000000-0000-4000-8000-000000000008", "Reserva", "bill", "shield", "cat-3", {
  parent_id: ECONOMIA.id,
  target: "10000.00",
  deadline: "2027-06-30",
});
export const VIAGEM = category("c1000000-0000-4000-8000-000000000009", "Viagem", "bill", "plane", "cat-8", {
  parent_id: ECONOMIA.id,
});
export const RESGATE = category("c1000000-0000-4000-8000-000000000010", "Resgate", "income", "piggy-bank", "cat-11", {
  is_savings: true,
});

/** In the API's order: kind, then name. */
export const CATEGORIES = [EXTRA, SALARIO, ALUGUEL, LUZ, COMIDA, MERCADO];

/** A mixed group (D26): `Veículo` is Saída and holds a Diário and a Saída subcategory. */
export const VEICULO = category("c1000000-0000-4000-8000-000000000020", "Veículo", "bill", "car", "cat-8");
export const COMBUSTIVEL = category("c1000000-0000-4000-8000-000000000021", "Combustível", "daily", "fuel", "cat-8", {
  parent_id: VEICULO.id,
});
export const PARCELA = category("c1000000-0000-4000-8000-000000000022", "Parcela", "bill", "car", "cat-8", {
  parent_id: VEICULO.id,
});
export const WITH_MIXED_GROUP = [...CATEGORIES, VEICULO, COMBUSTIVEL, PARCELA];

/** With `Economia` and its cofrinhos, each parent followed by its children; `Resgate` only with `include_system`. */
export const WITH_COFRINHOS = [EXTRA, SALARIO, ALUGUEL, ECONOMIA, RESERVA, VIAGEM, LUZ, COMIDA, MERCADO];

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
  withdrawn: "0.00",
  bills: "0.00",
  daily: "0.00",
  balance,
  tier,
  projected_balance: balance,
  projected_tier: tier,
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
  totals: {
    income: "500.00",
    withdrawn: "0.00",
    bills: "1200.00",
    daily: "184.31",
    outflow: "1384.31",
    performance: "-884.31",
    saved: "0.00",
  },
  projected_balance: "957.79",
  projected_tier: "yellow",
  bills_of_month: [],
  savings: { saved: "0.00", rate_pct: "0.0" },
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
    is_card: false,
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
    is_card: false,
  },
];

/** October's rent still unpaid, carried into November and landed today (the 5th), D17. */
export const CARRIED_ALUGUEL: Schemas["BillOfMonth"] = {
  ...BILLS_OF_MONTH[1],
  due_date: "2026-10-10",
  overdue: true,
  is_card: false,
  lands_on: "2026-11-05",
};

/** The owner's November (SOL-49/50), today the 5th: R$ 6.150,00 until the 22nd, red on the 23rd, worst on the 28th, back on the 30th. */
const forecastProjection = (index: number): [string, Schemas["Tier"]] => {
  if (index < 22) return ["6150.00", "green"];
  if (index < 24) return ["-675.00", "red"];
  if (index < 27) return ["-916.00", "red"];
  if (index < 29) return ["-2916.00", "red"];
  return ["491.00", "yellow"];
};

const forecastDay = (index: number): Schemas["Day"] => {
  const date = `2026-11-${String(index + 1).padStart(2, "0")}`;
  const [projected, tier] = forecastProjection(index);
  return day(date, "6150.00", "green", {
    projected_balance: projected,
    projected_tier: tier,
    is_today: index === 4,
    is_future: index > 4,
  });
};

const forecastBill = (id: number, name: string, amount: string, due: string): Schemas["BillOfMonth"] => ({
  bill_id: `b2000000-0000-4000-8000-00000000000${id}`,
  name,
  icon: ALUGUEL.icon,
  color: ALUGUEL.color,
  amount,
  due_date: due,
  paid: false,
  transaction_id: null,
  overdue: false,
  is_card: false,
  lands_on: due,
});

export const FORECAST_MONTH: Schemas["MonthView"] = {
  ...MONTH,
  days: Array.from({ length: 30 }, (_, index) => forecastDay(index)),
  projected_balance: "491.00",
  projected_tier: "yellow",
  bills_of_month: [
    forecastBill(1, "Cartão", "4900.00", "2026-11-23"),
    forecastBill(2, "Financiamento", "2000.00", "2026-11-28"),
    forecastBill(3, "Condomínio", "1168.00", "2026-11-30"),
  ],
};

export const FORECAST_TRANSACTIONS: Schemas["Transaction"][] = [
  {
    id: "t2000000-0000-4000-8000-000000000003",
    date: "2026-11-30",
    amount: "4575.00",
    kind: "income",
    note: "Salário",
    category: SALARIO,
  },
  {
    id: "t2000000-0000-4000-8000-000000000002",
    date: "2026-11-25",
    amount: "241.00",
    kind: "daily",
    note: "Feira",
    category: MERCADO,
  },
  {
    id: "t2000000-0000-4000-8000-000000000001",
    date: "2026-11-23",
    amount: "1925.00",
    kind: "bill",
    note: "Seguro",
    category: ALUGUEL,
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
  groups: [
    { ...share(ALUGUEL, "1200.00", "86.7", "1276.60", "-6.0"), children: [] },
    { ...share(MERCADO, "184.31", "13.3", "155.67", "18.4"), children: [] },
    { ...share(SALARIO, "500.00", "100.0", "0.00", null), children: [] },
  ],
};

/** Ana's 2026 from her opening in August: a resgate month, a month with no income, the bounds of each dot and a December already entered. */
export const SAVINGS_YEAR: Schemas["SavingsYear"] = {
  year: 2026,
  income_total: "64482.80",
  deposited_total: "5716.53",
  withdrawn_total: "300.00",
  saved_total: "5416.53",
  rate_pct: "8.4",
  months: [
    {
      month: "2026-12",
      income: "3000.00",
      deposited: "0.00",
      withdrawn: "0.00",
      saved: "0.00",
      rate_pct: "0.0",
      forecast: true,
    },
    {
      month: "2026-11",
      income: "6500.00",
      deposited: "776.13",
      withdrawn: "0.00",
      saved: "776.13",
      rate_pct: "11.9",
      forecast: false,
    },
    {
      month: "2026-10",
      income: "4000.00",
      deposited: "100.00",
      withdrawn: "300.00",
      saved: "-200.00",
      rate_pct: "-5.0",
      forecast: false,
    },
    {
      month: "2026-09",
      income: "0.00",
      deposited: "0.00",
      withdrawn: "0.00",
      saved: "0.00",
      rate_pct: null,
      forecast: false,
    },
    {
      month: "2026-08",
      income: "53982.80",
      deposited: "4840.40",
      withdrawn: "0.00",
      saved: "4840.40",
      rate_pct: "15.1",
      forecast: false,
    },
  ],
};

const group = ({ id, name, icon, color }: Schemas["Category"], amount: string, pct: string) => ({
  category_id: id,
  name,
  icon,
  color,
  amount,
  pct,
});

/** Ana's whole 2025: a seven-digit Entradas, five spending groups, two income groups and two cards. */
export const YEAR_REPORT: Schemas["YearReport"] = {
  year: 2025,
  first_month: "2025-01",
  last_month: "2025-12",
  totals: {
    income: "1234567.89",
    bills: "60000.00",
    daily: "30000.00",
    outflow: "90000.00",
    performance: "1144567.89",
    saved: "11500.00",
    withdrawn: "500.00",
  },
  spent: "78000.00",
  top_months: [
    { month: "2025-03", spent: "7200.00" },
    { month: "2025-07", spent: "6800.00" },
    { month: "2025-12", spent: "3600.00" },
  ],
  spending: [
    group(ALUGUEL, "36000.00", "46.2"),
    group(MERCADO, "18000.00", "23.1"),
    group(COMIDA, "12000.00", "15.4"),
    group(LUZ, "7200.00", "9.2"),
    group(COMBUSTIVEL, "4800.00", "6.2"),
  ],
  income: [group(SALARIO, "1200000.00", "97.2"), group(EXTRA, "34567.89", "2.8")],
  card_spent: "25350.00",
  card_pct: "32.5",
  cards: [
    { card_id: "d1000000-0000-4000-8000-000000000001", name: "Nubank", amount: "15350.00" },
    { card_id: "d1000000-0000-4000-8000-000000000002", name: "Itaú", amount: "10000.00" },
  ],
};

const cofrinho = (
  { id, name, icon, color, target, deadline }: Schemas["Category"],
  rest: Partial<Schemas["Cofrinho"]> = {},
): Schemas["Cofrinho"] => ({
  category_id: id,
  name,
  icon,
  color,
  target,
  deadline,
  balance: "0.00",
  progress_pct: target ? "0.0" : null,
  done: false,
  monthly_suggestion: null,
  parent: false,
  ...rest,
});

/** Ana keeps 300 of 10.000 in Reserva until June 2027, 1.000 in Viagem without a goal and 0 loose in Economia. */
export const COFRINHO_RESERVA = cofrinho(RESERVA, {
  balance: "300.00",
  progress_pct: "3.0",
  monthly_suggestion: "1212.50",
});
export const COFRINHO_VIAGEM = cofrinho(VIAGEM, { balance: "1000.00" });
export const COFRINHO_SEM_OBJETIVO = cofrinho(ECONOMIA, { name: "Sem objetivo", balance: "0.00", parent: true });

export const COFRINHOS: Schemas["Cofrinhos"] = {
  total_saved: "1300.00",
  saved_this_month: "500.00",
  items: [COFRINHO_RESERVA, COFRINHO_VIAGEM],
};

/** Reserva: 200 in on the 3rd, 100 on the 4th; 50 taken out today. */
export const MOVEMENTS: Schemas["Transaction"][] = [
  {
    id: "t2000000-0000-4000-8000-000000000003",
    date: "2026-11-05",
    amount: "50.00",
    kind: "income",
    category: RESGATE,
    cofrinho_id: RESERVA.id,
  },
  { id: "t2000000-0000-4000-8000-000000000002", date: "2026-11-04", amount: "100.00", kind: "bill", category: RESERVA },
  {
    id: "t2000000-0000-4000-8000-000000000001",
    date: "2026-11-03",
    amount: "200.00",
    kind: "bill",
    category: RESERVA,
    note: "Décimo terceiro",
  },
];

export const fieldProblem = (status: number, field: string) => ({
  ...problem(status, "invalid"),
  errors: [{ field, message: "invalid" }],
});

const datesBetween = (from: string, to: string) => {
  const dates: string[] = [];
  for (let at = Date.parse(from); at <= Date.parse(to); at += 86_400_000)
    dates.push(new Date(at).toISOString().slice(0, 10));
  return dates;
};

/** Days `from` to `to`; each `[date, balance]` step holds until the next one. */
export const forecastFixture = (
  today: string,
  from: string,
  to: string,
  steps: [string, string][],
): Schemas["Forecast"] => ({
  today,
  days: datesBetween(from, to).map((date) => {
    const balance = steps.filter(([on]) => on <= date).pop()?.[1] ?? steps[0][1];
    return { date, projected_balance: balance, projected_tier: tierOf(balance, SETTINGS) };
  }),
});

/** The owner's November and December from the 10th (SOL-49 data, no December salary typed); -R$ 7.577,00 holds from Dec 30 on. */
export const FORECAST = forecastFixture("2026-11-10", "2026-11-10", "2027-10-31", [
  ["2026-11-10", "6150.00"],
  ["2026-11-23", "-675.00"],
  ["2026-11-25", "-916.00"],
  ["2026-11-28", "-2916.00"],
  ["2026-11-30", "491.00"],
  ["2026-12-23", "-4409.00"],
  ["2026-12-28", "-6409.00"],
  ["2026-12-30", "-7577.00"],
]);

/** Nothing typed ahead. */
export const FORECAST_FLAT = forecastFixture("2026-11-10", "2026-11-10", "2027-10-31", [["2026-11-10", "1842.10"]]);

/** Opening on 15/01/2027: November and December have no day. */
export const FORECAST_LATE_OPENING = forecastFixture("2026-11-10", "2027-01-15", "2027-10-31", [
  ["2027-01-15", "1000.00"],
  ["2027-02-10", "2500.00"],
]);
