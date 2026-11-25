import { expect, type Locator, test } from "@playwright/test";

import { requireServer } from "./server";

const SHOTS = process.env.E2E_SHOTS;

/** Counts the taps a task takes; typing is not a tap (SOL-147 §4). */
const counter = () => {
  let count = 0;
  const tap = async (target: Locator) => {
    count += 1;
    await target.click();
  };
  return { tap, taken: () => count };
};

test("a group and a subcategory take two taps each at 375 px, then rename, delete and Desfazer from the sheet", async ({
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
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Ajustes" }).click();
  await page.getByRole("link", { name: /^Categorias/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Categorias" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Diário", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Entradas", exact: true })).toBeInViewport();
  await expect(page.getByRole("group", { name: "Mês" })).toHaveCount(0);

  const group = counter();
  await group.tap(page.getByRole("button", { name: "Nova categoria", exact: true }));
  const create = page.getByRole("dialog", { name: "Nova categoria" });
  await expect(create.getByLabel("Nome", { exact: true })).toBeFocused();
  await page.keyboard.type("Cursos livres");
  await expect(create.getByRole("button", { name: "Criar", exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 375, height: 476 });
  await expect(create.getByRole("button", { name: "Criar", exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 375, height: 812 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/categorias-new-375.png` });
  await group.tap(create.getByRole("button", { name: "Criar", exact: true }));
  await expect(page.getByText("Categoria criada")).toBeVisible();
  await expect(page.getByRole("listitem", { name: "Cursos livres", exact: true })).toBeVisible();
  expect(group.taken()).toBe(2);

  const sub = counter();
  const gasto = page.getByRole("listitem", { name: "Gasto", exact: true });
  await sub.tap(gasto.getByRole("button", { name: "Nova subcategoria em Gasto", exact: true }));
  const child = page.getByRole("dialog", { name: "Nova subcategoria" });
  await expect(child.getByText("Dentro de Gasto")).toBeVisible();
  await expect(child.getByLabel("Nome", { exact: true })).toBeFocused();
  await page.keyboard.type("Pet shop");
  await expect(child.getByRole("button", { name: "Criar", exact: true })).toBeInViewport();
  await sub.tap(child.getByRole("button", { name: "Criar", exact: true }));
  const children = page.getByRole("list", { name: "Subcategorias de Gasto" });
  await expect(children.getByRole("button", { name: "Editar Pet shop" })).toBeVisible();
  expect(sub.taken()).toBe(2);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/categorias-375.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  await page.getByRole("searchbox", { name: "Buscar categoria" }).fill("zzz");
  await expect(page.getByText("Nenhuma categoria encontrada.")).toBeVisible();
  await page.getByRole("searchbox", { name: "Buscar categoria" }).fill("");

  await children.getByRole("button", { name: "Editar Pet shop" }).click();
  const edit = page.getByRole("dialog", { name: "Editar categoria" });
  await edit.getByLabel("Nome", { exact: true }).fill("Pet shop e banho");
  await expect(edit.getByRole("button", { name: "Excluir" })).toBeInViewport();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/categorias-edit-375.png` });
  await edit.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(children.getByRole("button", { name: "Editar Pet shop e banho" })).toBeVisible();

  await gasto.getByRole("button", { name: "Editar Gasto", exact: true }).click();
  await page.getByRole("dialog", { name: "Editar categoria" }).getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText("Categoria excluída")).toBeVisible();
  await expect(page.getByText("1 subcategoria também; lançamentos continuam com a categoria.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar Gasto", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Editar Pet shop e banho" })).toHaveCount(0);
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(children.getByRole("button", { name: "Editar Pet shop e banho" })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("main").getByRole("complementary")).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/categorias-1440.png`, fullPage: true });
  await page.getByRole("button", { name: "Nova subcategoria em Gasto", exact: true }).click();
  const wide = page.getByRole("dialog", { name: "Nova subcategoria" });
  await expect(wide.getByLabel("Nome", { exact: true })).toBeFocused();
  await expect(wide.getByRole("button", { name: "Criar", exact: true })).toBeInViewport();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/categorias-sub-1440.png` });
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
  const launch = page.getByRole("dialog", { name: "Lançar" });
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
