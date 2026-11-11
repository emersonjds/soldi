import { expect, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";

const API = process.env.E2E_API_URL ?? "http://localhost:8080";

/** `[year, month, day]` of today in the server's São Paulo calendar. */
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).split("-").map(Number);

/** `YYYY-MM` `offset` months from today's. */
const monthFromNow = (offset: number) => {
  const [year, month] = today();
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
};

test("Próximos meses paints the first two months the rent is owed Crítico and a chip opens the second", async ({
  page,
  request,
}) => {
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

  // A new user's bill is owed from today (D17): after the 28th, this month's rent is not.
  const first = today()[2] > 28 ? 1 : 0;
  const strip = page.getByRole("region", { name: "Próximos meses" });
  const chips = strip.getByRole("button", { name: /\d{4}/ });
  await expect(chips).toHaveCount(6);
  const red = /: Crítico, menor saldo -R\$\s[\d.]+,\d\d, \d+ dias? no vermelho$/;
  await expect(chips.nth(first)).toHaveAccessibleName(red);
  await expect(chips.nth(first + 1)).toHaveAccessibleName(red);
  await strip.getByRole("radio", { name: "12 meses" }).click();
  await expect(chips).toHaveCount(12);
  // Rent with nothing coming in: the last months fall below -R$ 10.000.
  await expect(chips.nth(11)).toContainText(/-\d{2}\.\d{3}/);
  await expectNoClipped(page);

  await chips.nth(first + 1).click();
  await expect(page).toHaveURL(new RegExp(`m=${monthFromNow(first + 1)}`));
  const hero = page.getByRole("region", { name: "Saldo hoje" });
  await expect(hero.getByRole("button", { name: /Dia 1 fica no vermelho: -R\$\s600,00/ })).toBeVisible();
  await expect(hero.getByRole("button", { name: /Pior dia: 28\/\d\d, -R\$\s2\.200,00/ })).toBeVisible();
});
