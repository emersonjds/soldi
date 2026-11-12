import { expect, type Page, test } from "@playwright/test";

import { requireServer } from "./server";

const PASSWORD = "uma-senha-bem-longa";

const signUp = async (page: Page, email: string) => {
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
};

test("a user deletes the account, cannot sign in with it and can sign up again with the same e-mail", async ({
  page,
  request,
}) => {
  await requireServer(request);

  const email = `e2e-delete-${Date.now()}@example.com`;
  await page.setViewportSize({ width: 1440, height: 900 });
  await signUp(page, email);
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
  await page.getByRole("button", { name: "Excluir conta definitivamente" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Excluir sua conta?" });
  await dialog.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await dialog.getByLabel("Digite EXCLUIR para confirmar").fill("EXCLUIR");
  await dialog.getByRole("button", { name: "Excluir para sempre" }).click();
  await expect(page).toHaveURL(/\/entrar/);
  await expect(page.getByText("Sua conta foi excluída.")).toBeVisible();

  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha incorretos")).toBeVisible();

  await signUp(page, email);
  await expect(page.getByRole("button", { name: "Continuar" })).toBeVisible();
});
