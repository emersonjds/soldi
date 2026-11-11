import { expect, test } from "@playwright/test";

import { requireServer } from "./server";

test("a new user picks Euro right after sign-up and sees the month in euros", async ({ page, request }) => {
  await requireServer(request);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-currency-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page.getByRole("heading", { name: "Qual moeda você usa?" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Real BRL" })).toBeChecked();
  await page.getByText("Euro").click();
  await expect(page.getByRole("radio", { name: "Euro EUR" })).toBeChecked();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await expect(page.getByText("€ 1.000,00")).toBeVisible();
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await page.getByRole("button", { name: "Pular" }).click();
  await page
    .getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ })
    .getByRole("button", { name: "Fechar" })
    .click();

  await expect(page.getByRole("region", { name: "Saldo hoje" })).toContainText("€ 1.000,00");
});
