import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://localhost:8080";

/** `YYYY-MM` of the month `offset` months from now. */
const monthFrom = (offset: number) => {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

test("an entry repeated 3x shows in three months; edit and delete reach this one and the following", async ({
  page,
  request,
}) => {
  const health = await request.get(`${API}/api/health`).catch(() => null);
  test.skip(!health?.ok(), `Soldi server unreachable at ${API}/api/health; start it to run this flow.`);
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-repeat-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await page.getByRole("button", { name: "Pular" }).click();
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

  // The ledger hides future days, so the series starts two months back and ends this month.
  const [first, second, third] = [monthFrom(-2), monthFrom(-1), monthFrom(0)];
  expect((await page.request.patch("/api/settings", { data: { opening_date: `${first}-01` } })).ok()).toBe(true);

  const ledger = page.getByRole("region", { name: "Lançamentos" });
  const internet = ledger.getByRole("button", { name: /^Internet/ });
  const visit = async (month: string) => {
    await page.goto(`/mes?m=${month}`);
    await expect(ledger).toBeVisible();
  };

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  const launch = page.getByRole("dialog", { name: "Lançar" });
  await launch.getByRole("radio", { name: "Saída" }).click();
  await launch.getByLabel("Valor").fill("100,00");
  await launch.getByLabel("Outra data").fill(`${first}-01`);
  await launch.getByLabel("Observação").fill("Internet");
  await launch.getByRole("switch", { name: "Repetir" }).click();
  await launch.getByRole("radio", { name: "3x" }).click();
  await launch.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("3 lançamentos criados")).toBeVisible();

  for (const [month, place] of [
    [first, "1/3"],
    [second, "2/3"],
    [third, "3/3"],
  ]) {
    await visit(month);
    await expect(internet).toContainText(`Saída · ${place}R$ 100,00`);
  }

  await visit(second);
  await internet.click();
  await page.getByRole("dialog", { name: "Internet" }).getByRole("button", { name: "Editar" }).click();
  const edit = page.getByRole("dialog", { name: "Editar lançamento" });
  await expect(edit).toContainText("Parte de uma série de 3");
  await edit.getByLabel("Valor").fill("120,00");
  await edit.getByRole("radio", { name: "Este e os próximos" }).click();
  await edit.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Série atualizada")).toBeVisible();
  await expect(internet).toContainText("R$ 120,00");

  await visit(third);
  await expect(internet).toContainText("Saída · 3/3R$ 120,00");
  await visit(first);
  await expect(internet).toContainText("Saída · 1/3R$ 100,00");

  await visit(second);
  await internet.click();
  const actions = page.getByRole("dialog", { name: "Internet" });
  await actions.getByRole("button", { name: "Excluir" }).click();
  await actions.getByRole("radio", { name: "Este e os próximos" }).click();
  await actions.getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText("Série excluída")).toBeVisible();
  await expect(internet).toHaveCount(0);

  await visit(third);
  await expect(ledger).toContainText("Nenhum lançamento ainda");
  await visit(first);
  await expect(internet).toContainText("Saída · 1/1R$ 100,00");
});
