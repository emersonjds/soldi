import { expect, type Page, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://localhost:8080";

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

test("at 375 the tab bar never covers the last row, and Lançar shows Salvar without scrolling", async ({
  page,
  request,
}) => {
  const health = await request.get(`${API}/api/health`).catch(() => null);
  test.skip(!health?.ok(), `Soldi server unreachable at ${API}/api/health; start it to run this flow.`);

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

  for (const path of ["/mes", "/para-onde-vai", "/economia", "/ajustes"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect.poll(() => overlap(page), { message: path }).toBeLessThanOrEqual(0);
  }

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  const launch = page.getByRole("dialog", { name: "Lançar" });
  await expect(launch.getByRole("button", { name: "Salvar" })).toBeInViewport({ ratio: 1 });
  expect(await launch.evaluate((sheet) => sheet.scrollTop)).toBe(0);
});
