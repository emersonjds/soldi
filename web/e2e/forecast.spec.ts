import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://localhost:8080";

/** `YYYY-MM-DD` of `day` next month, in the browser's calendar. */
const nextMonthDay = (day: number) => {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, day);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

test("an unpaid conta fixa paints next month's due day Crítico and the hero line jumps to it", async ({
  page,
  request,
}) => {
  const health = await request.get(`${API}/api/health`).catch(() => null);
  test.skip(!health?.ok(), `Soldi server unreachable at ${API}/api/health; start it to run this flow.`);

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
    /Agendado · 28 .*-R\$\s600,00.*Previsto · Crítico/,
  );
  await expect(ledger.getByRole("listitem", { name: "Aluguel" })).toContainText("Conta fixa · a pagar");

  const hero = page.getByRole("region", { name: "Saldo hoje" });
  await hero.getByRole("button", { name: /Dia 28 fica no vermelho: -R\$\s600,00/ }).click();
  await expect(page.locator(`#dia-${nextMonthDay(28)}`)).toHaveClass(/ring-2/);
  await expect(ledger.getByRole("listitem", { name: "Aluguel" })).toContainText("Motivo da queda");
});
