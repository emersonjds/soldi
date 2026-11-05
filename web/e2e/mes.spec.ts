import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://localhost:8080";

test("a new user logs a Diário in three taps and sees it with the day balance", async ({ page, request }) => {
  const health = await request.get(`${API}/api/health`).catch(() => null);
  test.skip(!health?.ok(), `Soldi server unreachable at ${API}/api/health; start it to run this flow.`);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();

  await expect(page.getByRole("region", { name: "Saldo hoje" })).toContainText("R$ 1.000,00");

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  await expect(page.getByRole("combobox", { name: "Categoria" })).toHaveText(/Mercado/);
  await page.keyboard.type("12,50");
  await page.getByRole("button", { name: "Salvar" }).click();

  const ledger = page.getByRole("region", { name: "Lançamentos" });
  await expect(ledger.getByRole("button", { name: /Mercado/ })).toContainText("R$ 12,50");
  await expect(ledger.getByRole("heading", { level: 3 }).first()).toContainText(/Hoje.*R\$\s987,50.*Apertado/);
  await expect(page.getByRole("region", { name: "Saldo hoje" })).toContainText("R$ 987,50");
});

test("a bill from onboarding shows under Contas do Mês, pays in one tap and moves the projection", async ({
  page,
  request,
}) => {
  const health = await request.get(`${API}/api/health`).catch(() => null);
  test.skip(!health?.ok(), `Soldi server unreachable at ${API}/api/health; start it to run this flow.`);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-bill-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nome").fill("Aluguel");
  await page.getByLabel("Valor").fill("300,00");
  await page.getByLabel("Dia").fill("28");
  await page.getByRole("radio", { name: "Aluguel" }).check({ force: true });
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();

  const hero = page.getByRole("region", { name: "Saldo hoje" });
  const summary = page.getByRole("region", { name: "Resumo do mês" });
  const bill = page.getByRole("region", { name: "Contas do Mês" }).getByRole("listitem", { name: "Aluguel" });
  await expect(bill).toContainText("R$ 300,00");
  await expect(summary).toContainText("R$ 700,00");

  await bill.getByRole("button", { name: /^Pagar Aluguel/ }).click();
  await expect(bill.getByRole("button", { name: "Pago: desfazer Aluguel" })).toBeVisible();
  await expect(hero).toContainText("R$ 700,00");

  await bill.getByRole("button", { name: "Pago: desfazer Aluguel" }).click();
  await expect(page.getByText("Pagamento desfeito")).toBeVisible();
  await expect(hero).toContainText("R$ 1.000,00");

  await bill.getByRole("button", { name: /ajustar pagamento de Aluguel/ }).click();
  const sheet = page.getByRole("dialog", { name: "Pagar Aluguel" });
  await sheet.getByLabel("Valor").fill("350,00");
  await sheet.getByRole("button", { name: "Confirmar" }).click();

  await expect(bill.getByRole("button", { name: "Pago: desfazer Aluguel" })).toBeVisible();
  await expect(summary).toContainText("R$ 650,00");
});

test("Lançar fills the cents from the right and a category created from the picker comes selected", async ({
  page,
  request,
}) => {
  const health = await request.get(`${API}/api/health`).catch(() => null);
  test.skip(!health?.ok(), `Soldi server unreachable at ${API}/api/health; start it to run this flow.`);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-mask-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();

  const tabs = page.getByRole("navigation", { name: "Navegação principal" });
  await tabs.getByRole("button", { name: "Lançar" }).click();
  await expect(page.getByRole("combobox", { name: "Categoria" })).toHaveText(/Mercado/);
  await page.keyboard.type("12345");
  await expect(page.getByLabel("Valor")).toHaveValue("123,45");
  await page.getByRole("button", { name: "Salvar" }).click();

  const ledger = page.getByRole("region", { name: "Lançamentos" });
  await expect(ledger.getByRole("button", { name: /Mercado/ })).toContainText("R$ 123,45");

  await tabs.getByRole("button", { name: "Lançar" }).click();
  await page.getByRole("button", { name: "Nova categoria" }).click();
  const create = page.getByRole("dialog", { name: "Nova categoria" });
  await create.getByLabel("Nome").fill("Feira");
  await create.getByRole("radio", { name: "Ícone shopping-cart" }).check({ force: true });
  await create.getByRole("button", { name: "Criar" }).click();

  await expect(page.getByText("Categoria criada")).toBeVisible();
  await expect(create).toBeHidden();
  await expect(page.getByRole("combobox", { name: "Categoria" })).toHaveText(/Feira/);
});
