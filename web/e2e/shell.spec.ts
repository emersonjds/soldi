import { expect, type Page, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";
import { requireServer } from "./server";

/** Scrolls to the end and returns how far the lowest piece of content inside `main` sits below the tab bar's top. */
const overlap = (page: Page) =>
  page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const tabBar = document.querySelector('nav[aria-label="Navegação principal"]')?.getBoundingClientRect().top ?? 0;
    let bottom = 0;
    for (const element of document.querySelectorAll("main *")) {
      if (element.children.length) continue;
      const box = element.getBoundingClientRect();
      if (box.height) bottom = Math.max(bottom, box.bottom);
    }
    return bottom - tabBar;
  });

/** Fills every list the shell's pages show: a launch in each category and eight cofrinhos. */
const seed = async (page: Page) => {
  const now = new Date();
  const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((part) => String(part).padStart(2, "0"));
  const categories: { id: string; kind: string; is_savings: boolean; parent_id: string | null }[] = await (
    await page.request.get("/api/categories")
  ).json();
  const savings = categories.find((category) => category.is_savings && !category.parent_id);
  for (let index = 1; index <= 8; index++) {
    const created = await page.request.post("/api/categories", {
      data: { name: `Cofrinho ${index}`, kind: savings?.kind, parent_id: savings?.id, target: "1000.00" },
    });
    expect(created.ok()).toBe(true);
  }
  for (const category of categories.filter((category) => !category.is_savings && !category.parent_id)) {
    const created = await page.request.post("/api/transactions", {
      data: { date: today.join("-"), amount: "10.00", kind: category.kind, category_id: category.id },
    });
    expect(created.ok()).toBe(true);
  }
};

test("at 375 the tab bar never covers the last row of a long page, and a long Lançar still shows Salvar", async ({
  page,
  request,
}) => {
  await requireServer(request);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-shell-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await page.getByRole("button", { name: "Pular" }).click();
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

  await seed(page);
  for (const path of ["/mes", "/para-onde-vai", "/economia", "/ajustes"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight), {
        message: `${path} scrolls past the tab bar's 92px`,
      })
      .toBeGreaterThan(92);
    await expect.poll(() => overlap(page), { message: path }).toBeLessThanOrEqual(0);
  }

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  const launch = page.getByRole("dialog", { name: "Lançar" });
  await launch.getByRole("switch", { name: "Repetir" }).click();
  await launch.getByRole("radio", { name: "12x" }).click();
  expect(await launch.evaluate((sheet) => sheet.scrollHeight > sheet.clientHeight)).toBe(true);
  await launch.evaluate((sheet) => sheet.scrollTo(0, 0));
  await expect(launch.getByRole("button", { name: "Salvar" })).toBeInViewport({ ratio: 1 });
});

test("the shell follows Stitch from 375 to 1440: app bar and tab bar on mobile, switcher, today's tier and avatar on top", async ({
  page,
  request,
}) => {
  await requireServer(request);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-shell-bar-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("12.345,67");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await page.getByRole("button", { name: "Pular" }).click();
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

  const bar = page.getByRole("banner");
  const tabs = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(bar.getByRole("link", { name: "Soldi, ir para hoje" })).toBeVisible();
  await expect(bar.locator("p", { hasText: /^Mês$/ })).toBeVisible();
  await expect(bar.getByRole("link", { name: "Minha conta" })).toBeVisible();
  await expect(bar.getByRole("img", { name: /^Saldo hoje/ })).toBeHidden();
  await expect(tabs.locator("a, button")).toHaveText(["Mês", "Para onde vai", "", "Economia", "Ajustes"]);
  await expect(tabs.getByRole("link", { name: "Mês" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Ajustes" }).click();
  await page.getByRole("link", { name: /^Contas fixas/ }).click();
  await expect(bar.locator("p", { hasText: /^Contas Fixas$/ })).toBeVisible();
  await expectNoClipped(page);

  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/mes");
    const pill = bar.getByRole("img", { name: /^Saldo hoje: / });
    await expect(pill).toBeVisible();
    const tier = await pill.getAttribute("aria-label");
    await expect(bar.getByRole("button", { name: "Lançar" })).toBeVisible();
    await expect(bar.getByRole("link", { name: "Minha conta", exact: true })).toHaveAttribute("href", "/ajustes/conta");
    await expect(tabs).toBeHidden();
    await expectNoClipped(page);

    await bar.getByRole("button", { name: "Próximo mês" }).click();
    await expect(page).toHaveURL(/\?m=/);
    await expect(pill).toHaveAttribute("aria-label", tier ?? "");
    await page
      .getByRole("complementary", { name: "Barra lateral" })
      .getByRole("link", { name: "Contas Fixas" })
      .click();
    await expect(page).toHaveURL(/\/ajustes\/contas\?m=/);
    await expect(bar.getByRole("group", { name: "Mês" })).toBeVisible();
    await expect(pill).toHaveAttribute("aria-label", tier ?? "");
    await expectNoClipped(page);
  }
});
