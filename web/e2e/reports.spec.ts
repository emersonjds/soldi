import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://localhost:8080";

test("an entry shows up in Para onde vai and Cofrinhos starts empty", async ({ page, request }) => {
  const health = await request.get(`${API}/api/health`).catch(() => null);
  test.skip(!health?.ok(), `Soldi server unreachable at ${API}/api/health; start it to run this flow.`);
  // The dev server compiles both report screens on first visit.
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-reports-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await page.getByRole("button", { name: "Pular" }).click();
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await nav.getByRole("button", { name: "Lançar" }).click();
  await page.keyboard.type("80,00");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(
    page.getByRole("region", { name: "Lançamentos" }).getByRole("button", { name: /Mercado/ }),
  ).toBeVisible();

  await nav.getByRole("button", { name: "Lançar" }).click();
  await page.getByRole("radio", { name: "Entrada" }).click();
  await page.getByLabel("Valor").fill("2.000,00");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(
    page.getByRole("region", { name: "Saldo hoje" }).getByRole("img", { name: /^Entradas R\$\s2\.000,00:/ }),
  ).toBeVisible();

  await nav.getByRole("link", { name: "Para onde vai" }).click();
  const mercado = page.getByRole("list", { name: "Categorias" }).getByRole("button", { name: /^Mercado/ });
  await expect(mercado).toContainText("100%");
  await expect(mercado).toContainText("R$ 80,00");
  await mercado.click();
  await expect(page.getByRole("region", { name: "Lançamentos de Mercado" })).toContainText("R$ 80,00");

  await nav.getByRole("link", { name: "Cofrinhos" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Cofrinhos" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Guardado" })).toContainText("R$ 0,00");
  await expect(page.getByText("Nenhum cofrinho ainda. Comece pela reserva de emergência.")).toBeVisible();
});
