import { expect, test } from "@playwright/test";

import { requireServer } from "./server";

const SHOTS = process.env.E2E_SHOTS;

test("a subcategory is created from Gasto's card, renamed, and deleted with its parent until Desfazer", async ({
  page,
  request,
}) => {
  await requireServer(request);

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
  await page
    .getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ })
    .getByRole("button", { name: "Fechar" })
    .click();

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Ajustes" }).click();
  await page.getByRole("link", { name: /^Categorias/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Categorias & Subcategorias" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Gastos Diários/ })).toBeChecked();

  await page.getByRole("listitem", { name: "Gasto" }).getByRole("button", { name: "Adicionar subcategoria" }).click();
  const create = page.getByRole("dialog", { name: "Nova Categoria" });
  await expect(
    create.getByRole("radiogroup", { name: "Vincular à Categoria Pai" }).getByRole("radio", { name: "Gasto" }),
  ).toBeChecked();
  await create.getByLabel("Nome do agrupador").fill("Pet shop");
  await create.getByRole("button", { name: "Criar Categoria" }).click();
  const children = page.getByRole("list", { name: "Subcategorias de Gasto" });
  await expect(children.getByRole("button", { name: "Editar Pet shop" })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/categorias-375.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  await page.getByRole("searchbox", { name: "Buscar categoria" }).fill("zzz");
  await expect(page.getByText("Nenhuma categoria encontrada.")).toBeVisible();
  await page.getByRole("searchbox", { name: "Buscar categoria" }).fill("");

  await children.getByRole("button", { name: "Editar Pet shop" }).click();
  const edit = page.getByRole("dialog", { name: "Editar Categoria" });
  await edit.getByLabel("Nome do agrupador").fill("Pet shop e banho");
  await edit.getByRole("button", { name: "Salvar Categoria" }).click();
  await expect(children.getByRole("button", { name: "Editar Pet shop e banho" })).toBeVisible();

  await page.getByRole("button", { name: "Mais ações de Gasto" }).click();
  await page.getByRole("menuitem", { name: "Excluir" }).click();
  await expect(page.getByText("Categoria excluída")).toBeVisible();
  await expect(page.getByText("1 subcategoria também; lançamentos continuam com a categoria.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar Gasto" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Editar Pet shop e banho" })).toHaveCount(0);
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(children.getByRole("button", { name: "Editar Pet shop e banho" })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("complementary", { name: "Nova Categoria" })).toBeVisible();
  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/categorias-1440.png`, fullPage: true });
    await page.getByRole("listitem", { name: "Gasto" }).getByRole("button", { name: "Adicionar subcategoria" }).click();
    await page
      .getByRole("complementary", { name: "Nova Categoria" })
      .getByRole("radio", { name: "Subcategoria" })
      .waitFor();
    await page.screenshot({ path: `${SHOTS}/categorias-sub-1440.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("button", { name: "Editar Pet shop e banho" }).click();
    await expect(page.getByRole("dialog", { name: "Editar Categoria" })).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/categorias-edit-375.png` });
  }
});

test("Personalizar pins two categories at the head of Lançar's row, kept after a reload", async ({ page, request }) => {
  await requireServer(request);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-pins-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await page.getByRole("button", { name: "Pular" }).click();
  const launch = page.getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
  const chips = launch.getByRole("radiogroup", { name: "Categoria" }).getByRole("radio");

  await launch.getByRole("radio", { name: "Diário" }).click();
  await launch.getByRole("button", { name: "Personalizar" }).click();
  const sheet = page.getByRole("dialog", { name: "Personalizar categorias" });
  await expect(sheet).toContainText("Nenhuma fixada. A lista segue o uso deste mês.");
  await sheet.getByRole("button", { name: "Fixar Família" }).click();
  await sheet.getByRole("button", { name: "Fixar Saúde" }).click();
  await sheet.getByRole("button", { name: "Subir Saúde" }).click();
  await expect(sheet).toContainText(/Também fixada em Saída\./);
  await sheet.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Categorias personalizadas")).toBeVisible();
  await expect(chips.nth(0)).toHaveAccessibleName("Saúde");
  await expect(chips.nth(1)).toHaveAccessibleName("Família");

  await page.reload();
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  await launch.getByRole("radio", { name: "Diário" }).click();
  await expect(chips.nth(0)).toHaveAccessibleName("Saúde");
  await expect(chips.nth(1)).toHaveAccessibleName("Família");
});
