import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://localhost:8080";

test("a new user walks the four-card tour after onboarding and lands on Lançar with a hint", async ({
  page,
  request,
}) => {
  const health = await request.get(`${API}/api/health`).catch(() => null);
  test.skip(!health?.ok(), `Soldi server unreachable at ${API}/api/health; start it to run this flow.`);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-tour-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();

  await expect(page).toHaveURL(/\/tour$/);
  for (const [step, title] of ["Entradas", "Saídas e Diário", "Projeção do fim do mês", "Economia"].entries()) {
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText(`Passo ${step + 1} de 4`)).toBeAttached();
    if (step < 3) await page.getByRole("button", { name: "Próximo" }).click();
  }
  await page.getByRole("button", { name: "Começar" }).click();

  const sheet = page.getByRole("dialog", { name: "Lançar" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Comece pela sua primeira entrada do mês")).toBeVisible();
  await expect(sheet.getByRole("radio", { name: "Entrada" })).toBeChecked();
  await expect(page).toHaveURL(/\/mes$/);

  await page.reload();
  await expect(page.getByRole("region", { name: "Saldo hoje" })).toBeVisible();
  await expect(page).toHaveURL(/\/mes$/);
  await expect(page.getByRole("dialog", { name: "Lançar" })).toHaveCount(0);
});
