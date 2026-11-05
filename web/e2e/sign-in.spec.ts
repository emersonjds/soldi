import { expect, test } from "@playwright/test";

test("the sign-in page renders", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/entrar");

  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Senha")).toBeVisible();
});
