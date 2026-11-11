import { expect, test } from "@playwright/test";

import { requireServer } from "./server";

/** `YYYY-MM-DD` of `day` next month, in the server's São Paulo calendar. */
const nextMonthDay = (day: number) => {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
    .format(new Date())
    .split("-")
    .map(Number);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
};

test("next month opens with this month's unpaid conta fixa and the red banner names it and jumps to its day", async ({
  page,
  request,
}) => {
  await requireServer(request);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-forecast-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nome").fill("Aluguel");
  await page.getByLabel("Valor").fill("1.600,00");
  await page.getByLabel("Dia").fill("28");
  await page.getByRole("radio", { name: "Aluguel" }).check({ force: true });
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await page.getByRole("button", { name: "Pular" }).click();
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

  await page.getByRole("button", { name: "Próximo mês" }).click();
  const ledger = page.getByRole("region", { name: "Lançamentos" });
  await expect(ledger.getByRole("heading", { level: 3 }).first()).toContainText(
    /Agendado · 28 .*-R\$\s2\.200,00.*Previsto · Crítico/,
  );
  await expect(ledger.getByRole("listitem", { name: "Aluguel" })).toContainText("Conta fixa · a pagar");
  await expect(ledger.getByRole("listitem", { name: "Aluguel" })).toContainText("Motivo da queda");

  const banner = page.getByRole("region", { name: "Alerta do mês" });
  await expect(banner).toHaveText(/^Dia 1 fica no vermelho: -R\$\s600,00\.Ver o dia 1$/);
  await expect(page.getByText(/Pior dia/)).toHaveCount(0);
  const bannerTop = (await banner.boundingBox())?.y ?? 0;
  const heroTop = (await page.getByRole("region", { name: "Saldo hoje" }).boundingBox())?.y ?? 0;
  expect(bannerTop).toBeLessThan(heroTop);

  const categories: { id: string; kind: string; name: string }[] = await (
    await page.request.get("/api/categories")
  ).json();
  const daily = categories.find((category) => category.kind === "daily");
  for (const day of [1, 2, 3, 4]) {
    const created = await page.request.post("/api/transactions", {
      data: { date: nextMonthDay(day), amount: "1.00", kind: "daily", category_id: daily?.id, note: null },
    });
    expect(created.ok()).toBe(true);
  }
  await page.reload();
  await expect(banner).toContainText(
    `Dia 1 fica no vermelho: -R$\u00a0601,00. Conta de ${daily?.name} prevista excede o saldo em caixa projetado.`,
  );
  const first = page.locator(`#dia-${nextMonthDay(1)}`);
  await banner.getByRole("button", { name: "Ver o dia 1" }).click();
  await expect(first).toHaveClass(/ring-2/);
  await expect(first).toBeInViewport();
});
