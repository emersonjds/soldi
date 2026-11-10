import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://localhost:8080";

/** `YYYY-MM` of the month `offset` months from now. */
const monthFrom = (offset: number) => {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

test("Simular previews a purchase without writing it; Parcelar 3x writes three parcelas", async ({ page, request }) => {
  const health = await request.get(`${API}/api/health`).catch(() => null);
  test.skip(!health?.ok(), `Soldi server unreachable at ${API}/api/health; start it to run this flow.`);
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-simulate-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await page.getByRole("button", { name: "Pular" }).click();
  const launch = page.getByRole("dialog", { name: "Lançar" });
  await launch.getByRole("button", { name: "Fechar" }).click();

  const tabs = page.getByRole("navigation", { name: "Navegação principal" });
  await tabs.getByRole("button", { name: "Lançar" }).click();
  await launch.getByRole("switch", { name: "Simular" }).click();
  await launch.getByRole("radio", { name: "Saída" }).click();
  await launch.getByLabel("Valor").fill("1.600,00");
  await expect(launch.getByRole("status")).toHaveText("Com essa compra, hoje vira Crítico");
  await launch.getByRole("button", { name: "Descartar" }).click();
  await expect(launch).toBeHidden();
  await expect(page.getByRole("region", { name: "Lançamentos" })).toContainText("Nenhum lançamento ainda");

  await tabs.getByRole("button", { name: "Lançar" }).click();
  await launch.getByRole("radio", { name: "Saída" }).click();
  await launch.getByLabel("Valor").fill("300,00");
  await launch.getByRole("switch", { name: "Parcelar" }).click();
  await launch.getByRole("radio", { name: "3x" }).click();
  await expect(launch).toContainText("3× R$ 100,00 · até");
  await launch.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("3 parcelas lançadas")).toBeVisible();
  await page.goto(`/mes?m=${monthFrom(1)}`);
  await expect(page.getByRole("region", { name: "Lançamentos" })).toContainText("R$ 100,00");
});
