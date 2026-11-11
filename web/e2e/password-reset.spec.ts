import { expect, test } from "@playwright/test";

import { requireServer } from "./server";

test("a user who forgot the password asks for a reset link from Entrar", async ({ page, request }) => {
  await requireServer(request);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/entrar");
  await page.getByRole("link", { name: "Esqueci minha senha" }).click();

  await expect(page.getByRole("heading", { name: "Esqueci minha senha" })).toBeVisible();
  await page.getByLabel("E-mail").fill(`e2e-reset-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Enviar link" }).click();

  await expect(
    page.getByText(
      "Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha. Ele vale por 1 hora.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Voltar para Entrar" })).toBeVisible();
});
