import { expect, test } from "@playwright/test";

import { requireServer } from "./server";

test("deleting this month's entries empties the ledger and the preview", async ({ page, request }) => {
  await requireServer(request);
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-delete-${Date.now()}@example.com`);
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

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const today = `${month}-${String(now.getDate()).padStart(2, "0")}`;
  const categories: { id: string; kind: string }[] = await (await page.request.get("/api/categories")).json();
  const daily = categories.find((category) => category.kind === "daily");
  for (const amount of ["10.00", "20.00"]) {
    const created = await page.request.post("/api/transactions", {
      data: { date: today, amount, kind: "daily", category_id: daily?.id, note: null },
    });
    expect(created.ok()).toBe(true);
  }

  await page.goto("/ajustes");
  await page.getByRole("link", { name: /^Apagar lançamentos/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Apagar lançamentos" })).toBeVisible();
  await expect(page.getByText(/^Serão apagados 2 lançamentos de /)).toBeVisible();

  await page.getByRole("button", { name: "Apagar 2 lançamentos" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Apagar 2 lançamentos?" });
  await confirm.getByLabel("Digite APAGAR para confirmar").fill("APAGAR");
  await confirm.getByRole("button", { name: "Apagar" }).click();

  await expect(page.getByText("2 lançamentos apagados")).toBeVisible();
  await expect(page.getByText("Nada para apagar neste período.")).toBeVisible();
  await expect(page).toHaveURL(/\/ajustes\/apagar/);

  await page.goto(`/mes?m=${month}`);
  await expect(page.getByRole("region", { name: "Saldo hoje" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Lançamentos" })).toHaveCount(0);
});
