import { expect, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";
import { requireServer } from "./server";

const SHOTS = process.env.E2E_SHOTS;

test("Contas fixas sums the active bills against this month's income and pauses one from its row", async ({
  page,
  request,
}) => {
  await requireServer(request);
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-bills-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await page.getByRole("button", { name: "Pular" }).click();
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

  // The server's São Paulo calendar, not the runner's clock.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(
    new Date(`${today}T12:00:00Z`),
  );
  const categories: { id: string; kind: string; is_savings: boolean; parent_id: string | null }[] = await (
    await page.request.get("/api/categories")
  ).json();
  const bill = categories.find((category) => category.kind === "bill" && !category.is_savings);
  const salary = categories.find((category) => category.kind === "income" && !category.is_savings);
  const income = await page.request.post("/api/transactions", {
    data: { date: today, amount: "64482.80", kind: "income", category_id: salary?.id },
  });
  expect(income.ok()).toBe(true);
  for (const [name, amount, day] of [
    ["Aluguel Residencial", "12345.67", Number(today.slice(8))],
    ["Condomínio", "23456.78", 1],
    ["Academia", "10987.65", 28],
  ] as const) {
    const created = await page.request.post("/api/bills", {
      data: { name, amount, due_day: day, category_id: bill?.id },
    });
    expect(created.ok()).toBe(true);
  }

  await page.goto("/ajustes/contas");
  const total = page.getByRole("region", { name: "Total das contas fixas" });
  await expect(total).toContainText("R$ 46.790,10");
  await expect(total).toContainText("3 contas ativas");
  await expect(total).toContainText(`Comprometem 73% das entradas de ${month}`);
  await expect(page.getByRole("region", { name: "Próximo vencimento" })).toContainText("Vence hoje");

  // Desfazer must not reach the server: a resume would move active_since (D17).
  const patches: string[] = [];
  page.on("request", (sent) => sent.method() === "PATCH" && patches.push(sent.url()));
  await page.getByRole("switch", { name: "Ativa: Aluguel Residencial" }).click();
  await expect(page.getByRole("list", { name: "Pausadas" })).toContainText("Aluguel Residencial");
  await expect(total).toContainText("2 contas ativas");
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByRole("list", { name: "Contas ativas" })).toContainText("Aluguel Residencial");
  await page.reload();
  await expect(page.getByRole("switch", { name: "Ativa: Aluguel Residencial" })).toBeChecked();
  await expect(total).toContainText("3 contas ativas");
  await expect(page.getByRole("region", { name: "Próximo vencimento" })).toContainText("Aluguel Residencial");
  expect(patches).toEqual([]);

  await page.getByRole("switch", { name: "Ativa: Academia" }).click();
  await expect(page.getByText("Conta pausada")).toBeVisible();
  await expect(page.getByRole("list", { name: "Pausadas" })).toContainText("Academia");
  await expect(total).toContainText("R$ 35.802,45");
  await expect(total).toContainText("2 contas ativas");
  await expect(total).toContainText(`Comprometem 56% das entradas de ${month}`);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: /^Condomínio/ }).click();
  await expect(page.getByRole("dialog", { name: "Editar conta" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await expect(page.getByText("Conta pausada")).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(() => patches.length).toBe(1);
  await page.reload();
  await expect(page.getByRole("list", { name: "Pausadas" })).toContainText("Academia");

  for (const width of [375, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoClipped(page);
    if (SHOTS && (width === 375 || width === 1440)) {
      await page.screenshot({ path: `${SHOTS}/contas-fixas-${width}.png`, fullPage: true, animations: "disabled" });
    }
  }
});
