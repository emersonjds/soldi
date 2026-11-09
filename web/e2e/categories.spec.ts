import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? process.env.E2E_BASE_URL ?? "http://localhost:8080";
const SHOTS = process.env.E2E_SHOTS;

test("a subcategory is created under Pets from the header +, renamed, and deleted with its parent until Desfazer", async ({
  page,
  request,
}) => {
  const health = await request.get(`${API}/api/health`).catch(() => null);
  test.skip(!health?.ok(), `Soldi server unreachable at ${API}/api/health; start it to run this flow.`);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-categories-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await page.getByRole("button", { name: "Pular" }).click();
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Ajustes" }).click();
  await page.getByRole("link", { name: /^Categorias/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Categorias" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Diário" })).toBeChecked();

  await page.getByRole("button", { name: "Nova categoria" }).click();
  await page
    .getByRole("dialog", { name: "Nova" })
    .getByRole("button", { name: /^Subcategoria/ })
    .click();
  const parents = page.getByRole("dialog", { name: "Subcategoria de qual categoria?" });
  await parents.getByPlaceholder("Buscar categoria").fill("Pets");
  await parents.getByRole("option", { name: "Pets" }).click();
  const create = page.getByRole("dialog", { name: "Nova categoria" });
  await expect(create.getByText("Em Pets")).toBeVisible();
  await create.getByLabel("Nome").fill("Pet shop");
  await create.getByRole("button", { name: "Criar" }).click();
  const children = page.getByRole("list", { name: "Subcategorias de Pets" });
  await expect(children.getByRole("button", { name: "Editar Pet shop" })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/categorias-375.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  await children.getByRole("button", { name: "Editar Pet shop" }).click();
  const edit = page.getByRole("dialog", { name: "Editar categoria" });
  await edit.getByLabel("Nome").fill("Pet shop e banho");
  await edit.getByRole("button", { name: "Salvar" }).click();
  await expect(children.getByRole("button", { name: "Editar Pet shop e banho" })).toBeVisible();

  await page.getByRole("button", { name: "Mais ações de Pets" }).click();
  await page.getByRole("menuitem", { name: "Excluir" }).click();
  await expect(page.getByText("Categoria excluída")).toBeVisible();
  await expect(page.getByText("1 subcategoria também; lançamentos continuam com a categoria.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar Pets" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Editar Pet shop e banho" })).toHaveCount(0);
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(children.getByRole("button", { name: "Editar Pet shop e banho" })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/categorias-1440.png`, fullPage: true });
    await page.getByRole("button", { name: "Editar Pet shop e banho" }).click();
    await expect(page.getByRole("dialog", { name: "Editar categoria" })).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/categorias-edit-1440.png` });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("button", { name: "Editar Pet shop e banho" }).click();
    await expect(page.getByRole("dialog", { name: "Editar categoria" })).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/categorias-edit-375.png` });
  }
});
