import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://localhost:8080";

/** `YYYY-MM-DD` of `day` next month, in the server's São Paulo calendar. */
const nextMonthDay = (day: number) => {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
    .format(new Date())
    .split("-")
    .map(Number);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
};

test("Próximos meses paints this and next month Crítico and a chip opens next month", async ({ page, request }) => {
  const health = await request.get(`${API}/api/health`).catch(() => null);
  test.skip(!health?.ok(), `Soldi server unreachable at ${API}/api/health; start it to run this flow.`);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-months-ahead-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nome").fill("Aluguel");
  await page.getByLabel("Valor").fill("1.600,00");
  await page.getByLabel("Dia").fill("28");
  await page.getByRole("radio", { name: "Aluguel" }).check({ force: true });
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await page.getByRole("button", { name: "Pular" }).click();
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

  const strip = page.getByRole("region", { name: "Próximos meses" });
  const chips = strip.getByRole("button", { name: /\d{4}/ });
  await expect(chips).toHaveCount(6);
  await expect(chips.nth(0)).toHaveAccessibleName(/: Crítico, \d+ dias? no vermelho$/);
  await expect(chips.nth(1)).toHaveAccessibleName(/: Crítico, \d+ dias? no vermelho$/);
  await strip.getByRole("radio", { name: "12 meses" }).click();
  await expect(chips).toHaveCount(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  await chips.nth(1).click();
  await expect(page).toHaveURL(new RegExp(`m=${nextMonthDay(1).slice(0, 7)}`));
  const hero = page.getByRole("region", { name: "Saldo hoje" });
  await expect(hero.getByRole("button", { name: /Dia 1 fica no vermelho: -R\$\s600,00/ })).toBeVisible();
  await expect(hero.getByRole("button", { name: /Pior dia: 28\/\d\d, -R\$\s2\.200,00/ })).toBeVisible();
});
