import { expect, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";
import { requireServer } from "./server";

test("a cofrinho fills from a Saída in Economia and empties with a resgate", async ({ page, request }) => {
  await requireServer(request);
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
  await page.getByRole("button", { name: "Pular" }).click();
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await nav.getByRole("link", { name: "Cofrinhos" }).click();
  await expect(page.getByText("Nenhum cofrinho ainda. Comece pela reserva de emergência.")).toBeVisible();
  await page.getByRole("button", { name: "Novo cofrinho" }).click();
  const create = page.getByRole("dialog", { name: "Novo cofrinho" });
  await create.getByLabel("Nome").fill("Reserva");
  await create.getByLabel("Meta").fill("1.000,00");
  await create.getByRole("button", { name: "Criar" }).click();
  await expect(page.getByText("Cofrinho criado")).toBeVisible();

  await expect(page.getByRole("region", { name: "Seus cofrinhos" })).toContainText("1 ativo");
  const reservaCard = page.getByRole("region", { name: "Reserva" });
  await expect(reservaCard.getByRole("button", { name: "Resgatar" })).toHaveCount(0);
  await reservaCard.getByRole("button", { name: "Guardar primeiro valor" }).click();
  const lancar = page.getByRole("dialog", { name: "Lançar" });
  await expect(lancar.getByRole("radio", { name: "Saída" })).toBeChecked();
  await expect(lancar.getByRole("radio", { name: "Economia › Reserva" })).toHaveAttribute("aria-checked", "true");
  await lancar.getByLabel("Valor").fill("200,00");
  await lancar.getByRole("button", { name: "Salvar" }).click();

  const reserva = page.getByRole("list", { name: "Cofrinhos" }).getByRole("button", { name: /^Reserva/ });
  await expect(reserva).toContainText("R$ 200,00 de R$ 1.000,00");
  await expect(reserva).toContainText("20%");
  await expect(reserva.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "20");

  for (const width of [375, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoClipped(page);
  }
  await page.setViewportSize({ width: 375, height: 812 });

  const actions = reservaCard.getByRole("button", { name: "Resgatar de Reserva" }).locator("..");
  const row = await actions.boundingBox();
  if (!row) throw new Error("no action row");
  await page.mouse.click(row.x + row.width - 4, row.y + row.height / 2);
  const sheet = page.getByRole("dialog", { name: "Reserva" });
  await expect(sheet.getByRole("button", { name: "Resgatar", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  await reservaCard.getByRole("button", { name: "Resgatar de Reserva" }).click();
  await sheet.getByLabel("Valor").fill("5.000,00");
  await sheet.getByRole("button", { name: "Confirmar resgate" }).click();
  await expect(sheet.getByText("Você só tem R$ 200,00 guardado aqui")).toBeVisible();
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
  const glance = page.getByRole("region", { name: "Cofrinhos" });
  await expect(glance.getByRole("progressbar", { name: "Progresso de Reserva" })).toHaveAttribute(
    "aria-valuenow",
    "15",
  );
  for (const width of [375, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoClipped(page);
  }
});
