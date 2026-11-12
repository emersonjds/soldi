import { expect, test } from "@playwright/test";

import { requireServer } from "./server";

test("a user renames, changes the password, signs out everywhere and signs in with the new one", async ({
  page,
  request,
}) => {
  await requireServer(request);

  const email = `e2e-account-${Date.now()}@example.com`;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(email);
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

  await page.getByRole("link", { name: "Minha conta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Minha Conta & Segurança" })).toBeVisible();
  await page.getByRole("button", { name: "Alterar dados" }).click();
  const profile = page.getByRole("dialog", { name: "Alterar dados" });
  await profile.getByLabel("Nome").fill("Ana Paula");
  await profile.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Nome salvo")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: /^Minha conta,/ })).toContainText("Ana Paula");

  await page.getByRole("button", { name: "Trocar senha" }).click();
  const password = page.getByRole("dialog", { name: "Trocar senha" });
  await password.getByLabel("Senha atual").fill("uma-senha-bem-longa");
  await password.getByLabel("Nova senha").fill("outra-senha-bem-longa");
  await password.getByRole("button", { name: "Trocar senha" }).click();
  await expect(page.getByText("Senha trocada. Os outros aparelhos foram desconectados.")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Sair de todos os aparelhos" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Sair de todos" }).click();
  await expect(page).toHaveURL(/\/entrar/);

  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("outra-senha-bem-longa");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("link", { name: /^Minha conta,/ })).toContainText("Ana Paula");
});
