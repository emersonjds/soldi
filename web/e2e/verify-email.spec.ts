import { expect, test } from "@playwright/test";

import { requireServer } from "./server";
import { existsSync, readFileSync } from "node:fs";

// The console mailer logs each link; CI writes the server's output to the repository root.
const LOG = process.env.E2E_SERVER_LOG ?? "../server.log";
const links = () => readFileSync(LOG, "utf8").match(/\/verificar-email#token=[\w-]+/g) ?? [];

test("a user asks for a verification link in Minha Conta, opens it and sees Verificado", async ({ page, request }) => {
  await requireServer(request);
  test.skip(!existsSync(LOG) && !process.env.CI, `No server log at ${LOG}; set E2E_SERVER_LOG to run this flow.`);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-verify-${Date.now()}@example.com`);
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

  await page.goto("/ajustes#conta");
  await expect(page.getByText("Não verificado")).toBeVisible();
  const before = links().length;
  await page.getByRole("button", { name: "Verificar e-mail" }).click();
  await expect(page.getByText(/^Enviamos um link para e2e-verify-/)).toBeVisible();
  await expect.poll(() => links().length).toBeGreaterThan(before);

  await page.goto(links().at(-1) ?? "");
  await expect(page.getByRole("heading", { name: "E-mail verificado" })).toBeVisible();
  await expect(page).toHaveURL(/\/verificar-email$/);
  await page.getByRole("link", { name: "Ir para o Soldi" }).click();
  await expect(page).toHaveURL(/\/mes/);
  await page.goto("/ajustes#conta");
  await expect(page.getByText("Verificado", { exact: true })).toBeVisible();
});
