import { expect, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";
import { requireServer } from "./server";

/** `YYYY-MM` of the month `offset` months from now. */
const monthFrom = (offset: number) => {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

test("Parcelar 3x writes three parcelas", async ({ page, request }) => {
  await requireServer(request);
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
  const launch = page.getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
  await launch.getByRole("button", { name: "Fechar" }).click();

  const tabs = page.getByRole("navigation", { name: "Navegação principal" });
  await tabs.getByRole("button", { name: "Lançar" }).click();
  await launch.getByRole("radio", { name: "Conta" }).click();
  await launch.getByLabel("Valor").fill("300,00");
  await launch.getByRole("switch", { name: "Parcelar compra" }).click();
  await launch.getByRole("radio", { name: "3×" }).click();
  await expect(launch).toContainText("Projeção: 3× de R$ 100,00");
  await launch.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("3 parcelas lançadas")).toBeVisible();
  await page.goto(`/mes?m=${monthFrom(1)}`);
  await expect(page.getByRole("region", { name: "Lançamentos" })).toContainText("R$ 100,00");
});

test("Posso comprar isso? from the sidebar: 6× R$ 12.000,00 names the red month and recalculates in 10x", async ({
  page,
  request,
}) => {
  await requireServer(request);
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-posso-comprar-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("12.345,67");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await page.getByRole("button", { name: "Pular" }).click();
  const launch = page.getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
  await launch.getByRole("button", { name: "Fechar" }).click();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole("complementary", { name: "Barra lateral" })
    .getByRole("link", { name: "Posso comprar isso?" })
    .click();
  await expect(page).toHaveURL(/\/posso-comprar/);
  const writes: string[] = [];
  page.on("request", (sent) => {
    if (sent.method() !== "GET" && sent.url().includes("/api/")) writes.push(`${sent.method()} ${sent.url()}`);
  });
  await expect(page.getByRole("heading", { level: 1, name: "Posso comprar isso?" })).toBeVisible();

  await page.getByLabel("Valor total estimado").fill("72.000,00");
  await page.getByRole("radio", { name: "6x" }).click();
  await expect(page.getByText(/^6 parcelas de R\$\s12\.000,00 a partir de /)).toBeVisible();
  await page.getByRole("button", { name: "Calcular Projeção" }).click();

  // Today keeps R$ 345,67; the second parcela is the first red day.
  const verdict = page.getByRole("region", { name: "Veredito do orçamento" });
  await expect(verdict).toContainText("VEREDITO DO ORÇAMENTO • ALERTA CRÍTICO");
  await expect(verdict.getByRole("heading")).toHaveText(/ você fica no vermelho: -R\$\s11\.654,33$/);
  await expect(verdict).toContainText(/mas a soma da 2ª parcela \(R\$\s12\.000,00\)/);
  const months = page
    .getByRole("list", { name: "Projeção Mensal Comparativa (Antes vs. Depois)" })
    .getByRole("listitem");
  await expect(months).toHaveCount(6);
  await expect(months.nth(1)).toContainText("CRÍTICO");
  await expect(months.nth(1)).toContainText("Saldo com Compra:");

  await page.getByRole("button", { name: "Testar em 10x" }).click();
  await expect(page.getByRole("radio", { name: "10x" })).toBeChecked();
  await expect(page.getByRole("heading", { name: "Curva de Saldo Projetado (10 Meses)" })).toBeVisible();
  await expectNoClipped(page);

  await page.setViewportSize({ width: 375, height: 812 });
  await expectNoClipped(page);
  expect(writes).toEqual([]);
});

test("Histórico keeps a simulation in this browser, restores it and leaves with the session", async ({
  page,
  request,
}) => {
  await requireServer(request);
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-historico-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("12.345,67");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await page.getByRole("button", { name: "Pular" }).click();
  await page
    .getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ })
    .getByRole("button", { name: "Fechar" })
    .click();

  await page.goto("/posso-comprar");
  const history = page.getByRole("button", { name: "Histórico" });
  await page.getByLabel("Valor total estimado").fill("1.200,00");
  await expect(history).toHaveCount(0);
  await page.getByRole("radio", { name: "6x" }).click();
  await page.getByRole("button", { name: "Calcular Projeção" }).click();
  await page.getByRole("button", { name: "Limpar simulação" }).click();

  await history.click();
  const sheet = page.getByRole("dialog", { name: "Histórico de simulações" });
  await expect(sheet).toContainText("As últimas 10 simulações ficam só neste navegador.");
  await expectNoClipped(page);
  await sheet.getByRole("button", { name: /^R\$\s1\.200,00 · 6x/ }).click();
  await expect(page.getByLabel("Valor total estimado")).toHaveValue("1.200,00");
  await expect(page.getByRole("radio", { name: "6x" })).toBeChecked();
  await expect(page.getByRole("region", { name: "Veredito do orçamento" })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(history).toBeVisible();
  await history.click();
  await sheet.getByRole("button", { name: /^R\$\s1\.200,00 · 6x/ }).click();
  await expect(page.getByRole("heading", { name: "Curva de Saldo Projetado (6 Meses)" })).toBeVisible();
  await expectNoClipped(page);
  await page.goto("/ajustes#conta");
  await page.getByRole("button", { name: "Sair de todos os aparelhos" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Sair de todos" }).click();
  await expect(page).toHaveURL(/\/entrar/);
  const kept = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.startsWith("soldi:simulations:")),
  );
  expect(kept).toEqual([]);
});
