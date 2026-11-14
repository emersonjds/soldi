import { expect, type Page, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";
import { requireServer } from "./server";

/** `YYYY-MM` `offset` months from today's, in São Paulo. */
const monthFrom = (offset: number) => {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
    .format(new Date())
    .split("-")
    .map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
};

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** `2026-12` → `dez/26`, as the panel reads a month ahead. */
const monthAbbrev = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]}/${month.slice(2, 4)}`;

/** A fresh account through the API, opened at the first of this month, tour seen. */
const signUpByApi = async (page: Page, name: string) => {
  const api = page.request;
  await api.post("/api/auth/sign-up", {
    data: { email: `e2e-${name}-${Date.now()}@example.com`, password: "uma-senha-bem-longa" },
  });
  await api.post("/api/onboarding", { data: { opening_balance: "1000.00", opening_date: `${monthFrom(0)}-01` } });
  await api.post("/api/me/tour-seen");
  await page.setViewportSize({ width: 375, height: 812 });
};

test("a card's fatura opens from Contas a pagar, shows what weighs on it, and Parar recorrência empties the months ahead (SOL-119)", async ({
  page,
  request,
}) => {
  await requireServer(request);
  test.setTimeout(90_000);
  await signUpByApi(page, "card-fatura");
  const categories: { id: string; kind: string; is_savings: boolean }[] = await (
    await page.request.get("/api/categories")
  ).json();
  const billCategory = categories.find((category) => category.kind === "bill" && !category.is_savings);
  const daily = categories.find((category) => category.kind === "daily" && !category.is_savings);
  const card = await page.request.post("/api/bills", {
    data: { name: "Nubank", category_id: billCategory?.id, closing_day: 5, due_day: 12 },
  });
  expect(card.ok()).toBe(true);
  const { id: cardId }: { id: string } = await card.json();

  const date = `${monthFrom(1)}-06`;
  for (const extra of [
    { note: "Spotify", amount: "39.90", open_ended: true },
    { note: "Notebook", amount: "300.00", installments: 3 },
    { note: "Mercado", amount: "80.00" },
  ]) {
    const created = await page.request.post("/api/transactions", {
      data: { date, kind: "daily", category_id: daily?.id, card_id: cardId, ...extra },
    });
    expect(created.ok()).toBe(true);
  }

  await page.goto(`/mes?m=${monthFrom(2)}`);
  await page.getByRole("region", { name: "Contas a pagar" }).getByRole("button", { name: "Ver Fatura Nubank" }).click();

  const panel = page.getByRole("dialog", { name: "Fatura Nubank" });
  await expect(panel).toContainText("R$ 219,90");
  await expect(panel.getByRole("heading", { level: 3 })).toHaveText([
    /^Assinaturas/,
    /^Parcelas/,
    /^Compras/,
    "Próximos meses",
  ]);
  await expect(panel.getByRole("button", { name: /^Spotify/ })).toContainText("Todo mês · R$ 478,80 por ano");
  await expect(panel.getByRole("button", { name: /^Notebook/ })).toContainText("1/3 · faltam 2");
  const ahead = panel.getByRole("region", { name: "Próximos meses" }).getByRole("listitem");
  await expect(ahead.first()).toContainText(monthAbbrev(monthFrom(3)));
  await expect(ahead.first()).toContainText("R$ 139,90");
  await expectNoClipped(page);

  await panel.getByRole("button", { name: /^Spotify/ }).click();
  await page
    .getByRole("dialog", { name: "Editar Lançamento Recorrente" })
    .getByRole("button", { name: "Parar recorrência" })
    .click();
  await expect(page.getByText("Recorrência parada. Sai dos próximos meses.")).toBeVisible();
  await expect(ahead.first()).toContainText("R$ 100,00");
  await expect(panel).toContainText("R$ 219,90");
  // ponytail: a stopped series has no memory of having been open; its last member reads as a parcela.
  await expect(panel.getByRole("region", { name: "Parcelas" }).getByRole("button", { name: /^Spotify/ })).toContainText(
    "1/1 · última",
  );
  await expect(panel.getByRole("region", { name: "Assinaturas" })).toHaveCount(0);
});
