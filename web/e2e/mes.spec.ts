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
  await page.getByRole("button", { name: "Pular" }).click();
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

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

test("a bill from onboarding shows under Contas a pagar, pays from the round check and moves the projection", async ({
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
  await page.getByRole("button", { name: "Pular" }).click();
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

  const hero = page.getByRole("region", { name: "Saldo hoje" });
  const bills = page.getByRole("region", { name: "Contas a pagar" });
  const bill = bills.getByRole("listitem", { name: "Aluguel" });
  await expect(bill).toContainText("R$ 300,00");
  await expect(bills).toContainText("0 de 1 pagas");
  await expect(hero).toContainText(/Projetado fim do mês\s*R\$\s700,00/);

  const chip = bills.getByRole("radio", { name: "dia 28, 1 conta a pagar" });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-checked", "true");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-checked", "false");

  await bill.getByRole("button", { name: "Marcar Aluguel como paga" }).click();
  await expect(bill.getByRole("button", { name: "Desmarcar Aluguel" })).toHaveAttribute("aria-pressed", "true");
  await expect(bills).toContainText("1 de 1 pagas");
  await expect(hero).toContainText("R$ 700,00");

  await bill.getByRole("button", { name: "Desmarcar Aluguel" }).click();
  await expect(page.getByText("Pagamento desfeito")).toBeVisible();
  await expect(hero).toContainText("R$ 1.000,00");

  await bill.getByRole("button", { name: /ajustar pagamento de Aluguel/ }).click();
  const sheet = page.getByRole("dialog", { name: "Pagar Aluguel" });
  await sheet.getByLabel("Valor").fill("350,00");
  await sheet.getByRole("button", { name: "Confirmar" }).click();

  await expect(bill.getByRole("button", { name: "Desmarcar Aluguel" })).toHaveAttribute("aria-pressed", "true");
  await expect(hero).toContainText(/Projetado fim do mês\s*R\$\s650,00/);
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
  await page.getByRole("button", { name: "Pular" }).click();
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

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
  await page
    .getByRole("dialog", { name: "Nova" })
    .getByRole("button", { name: /^Categoria/ })
    .click();
  const create = page.getByRole("dialog", { name: "Nova categoria" });
  await create.getByLabel("Nome").fill("Feira");
  await create.getByRole("radio", { name: "Ícone shopping-cart" }).check({ force: true });
  await create.getByRole("button", { name: "Criar" }).click();

  await expect(page.getByText("Categoria criada")).toBeVisible();
  await expect(create).toBeHidden();
  await expect(page.getByRole("combobox", { name: "Categoria" })).toHaveText(/Feira/);
});

test("the hero splits the income, and the glance cards open their screens", async ({ page, request }) => {
  const health = await request.get(`${API}/api/health`).catch(() => null);
  test.skip(!health?.ok(), `Soldi server unreachable at ${API}/api/health; start it to run this flow.`);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-grid-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await page.getByRole("button", { name: "Pular" }).click();
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

  const hero = page.getByRole("region", { name: "Saldo hoje" });
  await expect(hero).toContainText("Nenhuma entrada neste mês");
  await hero.getByRole("button", { name: "Lançar entrada" }).click();
  await expect(page.getByRole("radio", { name: "Entrada" })).toBeChecked();
  await page.keyboard.type("200000");
  await page.getByRole("button", { name: "Salvar" }).click();

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  await expect(page.getByRole("combobox", { name: "Categoria" })).toHaveText(/Mercado/);
  await page.keyboard.type("1250");
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(hero.getByRole("img", { name: /^Entradas R\$\s2\.000,00: diário 1%, livre 99%$/ })).toBeVisible();
  await expect(hero.getByRole("listitem")).toHaveText([/^Diário\s*R\$\s12,50 · 1%$/, /^Livre\s*R\$\s1\.987,50 · 99%$/]);
  await expect(hero).toContainText("Sobram 99% das entradas");
  await expect(hero).toContainText(/Saldo hoje\s*R\$\s2\.987,50/);

  const spending = page.getByRole("region", { name: "Para onde vai" });
  await expect(spending.getByRole("listitem")).toHaveText([/Mercado\s*R\$\s12,50\s*100%/]);
  await spending.getByRole("link", { name: "Ver tudo" }).click();
  await expect(page).toHaveURL(/\/para-onde-vai\?m=\d{4}-\d{2}$/);

  await page.goBack();
  const cofrinhos = page.getByRole("region", { name: "Cofrinhos" });
  await expect(cofrinhos).toContainText("Nenhum cofrinho ainda. Comece pela reserva de emergência.");
  await cofrinhos.getByRole("link", { name: "Ver cofrinhos" }).click();
  await expect(page).toHaveURL(/\/economia$/);
});
