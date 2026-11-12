import { expect, type Page, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";
import { requireServer } from "./server";

const signUp = async (page: Page) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-meu-ano-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await page.getByRole("button", { name: "Pular" }).click();
  await page
    .getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ })
    .getByRole("button", { name: "Fechar" })
    .click();
};

type Category = { id: string; kind: string; is_savings: boolean; parent_id: string | null };

/** From January 1st: a seven-digit salary today, rent and groceries in January, a card purchase today. */
const seed = async (page: Page, today: string) => {
  const year = today.slice(0, 4);
  const opened = await page.request.patch("/api/settings", { data: { opening_date: `${year}-01-01` } });
  expect(opened.ok()).toBe(true);
  const categories: Category[] = await (await page.request.get("/api/categories")).json();
  const first = (kind: string) =>
    categories.find((category) => category.kind === kind && !category.is_savings && !category.parent_id)?.id;
  const card = await page.request.post("/api/bills", {
    data: { name: "Nubank", category_id: first("bill"), closing_day: 5, due_day: 12 },
  });
  expect(card.ok()).toBe(true);
  const card_id = (await card.json()).id;
  for (const data of [
    { date: today, amount: "1234567.89", kind: "income", category_id: first("income") },
    { date: `${year}-01-15`, amount: "1500.00", kind: "bill", category_id: first("bill") },
    { date: `${year}-01-15`, amount: "3000.00", kind: "daily", category_id: first("daily") },
    { date: today, amount: "500.00", kind: "daily", category_id: first("daily"), card_id },
  ]) {
    const created = await page.request.post("/api/transactions", { data });
    expect(created.ok()).toBe(true);
  }
};

const expectYear = async (page: Page) => {
  const region = (name: string) => page.getByRole("region", { name });
  await expect(region("Resumo do ano")).toContainText("+ R$ 1.234.567,89");
  await expect(region("Resumo do ano")).toContainText("- R$ 5.000,00");
  await expect(region("Resumo do ano")).toContainText("Para onde foi a entrada do ano");
  const months = region("Meses com mais gastos").getByRole("link");
  await expect(months).toHaveCount(2);
  await expect(months.first()).toContainText(/1º\s*Janeiro\s*- R\$\s4\.500,00/);
  await expect(region("Onde você mais gastou")).toContainText("- R$ 3.500,00");
  await expect(region("Maiores entradas")).toContainText("+ R$ 1.234.567,89");
  await expect(region("No cartão de crédito")).toContainText("- R$ 500,00");
  await expect(region("No cartão de crédito")).toContainText("10,0% dos seus gastos no ano");
  await expectNoClipped(page);
};

test("Meu ano sums the year from the sidebar at 1440 and the Economia pair at 375, unclipped", async ({
  page,
  request,
}) => {
  await requireServer(request);
  test.setTimeout(90_000);
  // The server's São Paulo calendar, not the runner's clock.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  test.skip(today.slice(5, 7) === "01", "January opens last year by default.");

  await signUp(page);
  await seed(page, today);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("navigation", { name: "Menu lateral" }).getByRole("link", { name: "Meu ano" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Meu ano" })).toBeVisible();
  await expectYear(page);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Economia" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Cofrinhos & Metas de Poupança" })).toBeVisible();
  await page.getByRole("navigation", { name: "Economia e Meu ano" }).getByRole("link", { name: "Meu ano" }).click();
  await expect(
    page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Economia" }),
  ).toHaveAttribute("aria-current", "page");
  await expectYear(page);
});
