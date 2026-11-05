import { expect, test } from "@playwright/test";

import path from "node:path";

const API = process.env.E2E_API_URL ?? "http://localhost:8080";
const SAMPLE = path.join(__dirname, "../../crates/soldi-server/tests/fixtures/termometro-sample.xlsx");

test("a new user imports the Termômetro workbook and finds March's bill in Mês", async ({ page, request }) => {
  const health = await request.get(`${API}/api/health`).catch(() => null);
  test.skip(!health?.ok(), `Soldi server unreachable at ${API}/api/health; start it to run this flow.`);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-import-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Saldo de hoje").fill("0,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await expect(page.getByRole("region", { name: "Saldo hoje" })).toBeVisible();

  await page.goto("/ajustes");
  await page.getByRole("link", { name: /^Importar planilha/ }).click();
  await page.getByLabel("Escolha ou arraste o arquivo .xlsx").setInputFiles(SAMPLE);

  await expect(page.getByRole("region", { name: "2025" })).toContainText("lançamentos");
  await expect(page.getByRole("region", { name: "2026" })).toContainText("lançamentos");
  await page.getByRole("button", { name: "Importar" }).click();

  await expect(page.getByText(/^Importado: \d+ lançamentos$/)).toBeVisible();
  await page.waitForURL(/\/mes/);
  await page.goto("/mes?m=2026-03");
  const ledger = page.getByRole("region", { name: "Lançamentos" });
  // A row with a note shows the note; the import notes each row `Planilha {year}` under Importado (conta).
  await expect(ledger.getByRole("button", { name: /^Planilha 2026 Conta/ })).toContainText("R$ 2.259,56");
  await expect(page.getByRole("region", { name: "Resumo do mês" })).toContainText("SaídasR$ 2.259,56");
});
