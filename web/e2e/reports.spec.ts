import { expect, type Page, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";
import { requireServer } from "./server";

const signUp = async (page: Page, who: string) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-${who}-${Date.now()}@example.com`);
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

test("an entry shows up in Para onde vai and Cofrinhos starts empty", async ({ page, request }) => {
  await requireServer(request);
  // The dev server compiles both report screens on first visit.
  test.setTimeout(90_000);

  await signUp(page, "reports");

  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await nav.getByRole("button", { name: "Lançar" }).click();
  await page.keyboard.type("80,00");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("region", { name: "Lançamentos" }).getByRole("button", { name: /Gasto/ })).toBeVisible();

  await nav.getByRole("button", { name: "Lançar" }).click();
  await page.getByRole("radio", { name: "Entrada" }).click();
  await page.getByLabel("Valor").fill("2.000,00");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("region", { name: "Resumo do mês" })).toContainText("R$ 2.000,00");

  await nav.getByRole("link", { name: "Para onde vai" }).click();
  const gasto = page.getByRole("list", { name: "Categorias" }).getByRole("button", { name: /^Gasto/ });
  await expect(gasto).toContainText("100,0% dos gastos");
  await expect(gasto).toContainText("R$ 80,00");
  await expect(page.getByRole("radio", { name: "Entradas" })).toHaveCount(0);
  await gasto.click();
  await expect(page.getByRole("region", { name: "Lançamentos: Gasto" })).toContainText("- R$ 80,00");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByText("Gastos:")).toContainText("Gastos: R$ 80,00");
  await page.setViewportSize({ width: 375, height: 812 });

  await nav.getByRole("link", { name: "Economia" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Cofrinhos & Metas de Poupança" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Total guardado em cofrinhos" })).toContainText("Nada guardado ainda.");
});

test("Para onde vai keeps Guardado no mês apart from the shares, unclipped from 375 to 1440", async ({
  page,
  request,
}) => {
  await requireServer(request);
  test.setTimeout(90_000);
  await signUp(page, "guardado");

  // The server's São Paulo calendar, not the runner's clock.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const categories: { id: string; kind: string; is_savings: boolean; parent_id: string | null }[] = await (
    await page.request.get("/api/categories")
  ).json();
  const economia = categories.find((category) => category.is_savings && !category.parent_id);
  const daily = categories.find((category) => category.kind === "daily" && !category.parent_id);
  const post = async (data: Record<string, unknown>) =>
    expect((await page.request.post("/api/transactions", { data })).ok()).toBe(true);
  await post({ date: today, amount: "250.40", kind: "daily", category_id: daily?.id });
  await post({ date: today, amount: "500.00", kind: "bill", category_id: economia?.id });
  const resgate = await page.request.post(`/api/cofrinhos/${economia?.id}/withdraw`, {
    data: { date: today, amount: "120.00" },
  });
  expect(resgate.ok()).toBe(true);

  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Para onde vai" })
    .click();
  const composition = page.getByRole("region", { name: "Composição de Gastos" });
  await expect(composition).toContainText(/Guardado no mês\s*R\$\s380,00/);
  await expect(composition).toContainText(/Total de gastos\s*R\$\s250,40/);
  const legend = page.getByRole("list", { name: "Categorias" });
  await expect(legend.getByRole("button", { name: /^Economia/ })).toHaveCount(0);
  await expect(legend.getByRole("button").first()).toContainText("100,0% dos gastos");

  for (const width of [375, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoClipped(page);
  }
  await expect(page.getByText("Gastos:")).toContainText("Gastos: R$ 250,40");
});
