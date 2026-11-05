import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://localhost:8080";

test("a cofrinho fills from a Saída in Economia and empties with a resgate", async ({ page, request }) => {
  const health = await request.get(`${API}/api/health`).catch(() => null);
  test.skip(!health?.ok(), `Soldi server unreachable at ${API}/api/health; start it to run this flow.`);
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-cofrinhos-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();

  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await nav.getByRole("link", { name: "Cofrinhos" }).click();
  await expect(page.getByText("Nenhum cofrinho ainda. Comece pela reserva de emergência.")).toBeVisible();
  await page.getByRole("button", { name: "Novo cofrinho" }).click();
  const create = page.getByRole("dialog", { name: "Novo cofrinho" });
  await create.getByLabel("Nome").fill("Reserva");
  await create.getByLabel("Meta").fill("1.000,00");
  await create.getByRole("button", { name: "Criar" }).click();
  await expect(page.getByText("Cofrinho criado")).toBeVisible();

  await nav.getByRole("button", { name: "Lançar" }).click();
  await page.getByRole("radio", { name: "Saída" }).click();
  await page.getByLabel("Valor").fill("200,00");
  await page.getByRole("combobox", { name: "Categoria" }).click();
  await page.getByPlaceholder("Buscar categoria").fill("Reserva");
  await page.getByRole("option", { name: "Economia › Reserva" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();

  const reserva = page.getByRole("list", { name: "Cofrinhos" }).getByRole("button", { name: /^Reserva/ });
  await expect(reserva).toContainText("R$ 200,00 de R$ 1.000,00");
  await expect(reserva).toContainText("20%");
  await expect(reserva.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "20");

  await reserva.click();
  const sheet = page.getByRole("dialog", { name: "Reserva" });
  await sheet.getByRole("button", { name: "Resgatar" }).click();
  await sheet.getByLabel("Valor").fill("50,00");
  await sheet.getByRole("button", { name: "Confirmar resgate" }).click();
  await expect(page.getByText("Resgate feito")).toBeVisible();
  await expect(sheet.getByRole("list", { name: "Movimentos" })).toContainText("Resgatado");
  await page.keyboard.press("Escape");
  await expect(reserva).toContainText("R$ 150,00 de R$ 1.000,00");
  await expect(page.getByRole("region", { name: "Guardado" })).toContainText("R$ 150,00");

  await nav.getByRole("link", { name: "Mês" }).click();
  const ledger = page.getByRole("region", { name: "Lançamentos" });
  await expect(ledger.getByRole("button", { name: /^Economia › Reserva/ })).toContainText("GuardadoR$ 200,00");
  await expect(ledger.getByRole("button", { name: /^Resgate › Reserva/ })).toContainText("Resgatado+ R$ 50,00");
  await expect(page.getByRole("region", { name: "Termômetro do Mês" })).toContainText("Guardou R$ 150,00 este mês.");
});
