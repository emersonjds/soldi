import { expect, type Page, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";
import { requireServer } from "./server";

test("a new user logs a Diário in three taps and sees it with the day balance", async ({ page, request }) => {
  await requireServer(request);

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
  await page
    .getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ })
    .getByRole("button", { name: "Fechar" })
    .click();

  await expect(page.getByRole("region", { name: "Saldo hoje" })).toContainText("R$ 1.000,00");

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  await expect(page.getByRole("radio", { name: "Mercado" })).toHaveAttribute("aria-checked", "true");
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
  await requireServer(request);

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
  await page
    .getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ })
    .getByRole("button", { name: "Fechar" })
    .click();

  const hero = page.getByRole("region", { name: "Saldo hoje" });
  const summary = page.getByRole("region", { name: "Resumo do mês" });
  const bills = page.getByRole("region", { name: "Contas a pagar" });
  const bill = bills.getByRole("listitem", { name: "Aluguel" });
  await expect(bill).toContainText("R$ 300,00");
  await expect(bills).toContainText("0 de 1 pagas");
  await expect(summary).toContainText(/Projetado\s*R\$\s700,00/);

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
  await expect(summary).toContainText(/Projetado\s*R\$\s650,00/);
});

test("Lançar fills the cents from the right and a category created from the picker comes selected", async ({
  page,
  request,
}) => {
  await requireServer(request);

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
  await page
    .getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ })
    .getByRole("button", { name: "Fechar" })
    .click();

  const tabs = page.getByRole("navigation", { name: "Navegação principal" });
  await tabs.getByRole("button", { name: "Lançar" }).click();
  await expect(page.getByRole("radio", { name: "Mercado" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.type("12345");
  await expect(page.getByLabel("Valor")).toHaveValue("123,45");
  await page.getByRole("button", { name: "Salvar" }).click();

  const ledger = page.getByRole("region", { name: "Lançamentos" });
  await expect(ledger.getByRole("button", { name: /Mercado/ })).toContainText("R$ 123,45");

  await tabs.getByRole("button", { name: "Lançar" }).click();
  await page.getByRole("button", { name: "Ver todas" }).click();
  await page.getByRole("dialog", { name: "Categoria" }).getByRole("button", { name: "Nova categoria" }).click();
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
  await expect(page.getByRole("radio", { name: "Feira" })).toHaveAttribute("aria-checked", "true");
});

test("the hero shows the balance and the summary, and the spending glance opens its screen", async ({
  page,
  request,
}) => {
  await requireServer(request);

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
  await page
    .getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ })
    .getByRole("button", { name: "Fechar" })
    .click();

  const hero = page.getByRole("region", { name: "Saldo hoje" });
  const monthSummary = page.getByRole("region", { name: "Resumo do mês" });
  await monthSummary.getByRole("button", { name: "Lançar entrada" }).click();
  await expect(page.getByRole("radio", { name: "Entrada" })).toBeChecked();
  await page.keyboard.type("200000");
  await page.getByRole("button", { name: "Salvar" }).click();

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  await expect(page.getByRole("radio", { name: "Mercado" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.type("1250");
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(monthSummary).toContainText(/Entradas\s*R\$\s2\.000,00/);
  await expect(monthSummary).toContainText(/Saídas\s*R\$\s12,50/);
  await expect(hero).toContainText(/Saldo hoje em conta\s*R\$\s2\.987,50/);

  const spending = page.getByRole("region", { name: "Para Onde Vai" });
  await expect(spending.getByRole("listitem")).toHaveText([/Mercado\s*R\$\s12,50\s*100,0%/]);
  await spending.getByRole("link", { name: "Ver análise" }).click();
  await expect(page).toHaveURL(/\/para-onde-vai\?m=\d{4}-\d{2}$/);

  await page.goBack();
  await expect(page.getByRole("region", { name: "Para Onde Vai" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Cofrinhos" })).toHaveCount(0);
});

test("Lançamentos shows only bills under Contas, and Lançar picks from a row of categories", async ({
  page,
  request,
}) => {
  await requireServer(request);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-filter-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("50.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await page.getByRole("button", { name: "Pular" }).click();
  await page
    .getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ })
    .getByRole("button", { name: "Fechar" })
    .click();

  const tabs = page.getByRole("navigation", { name: "Navegação principal" });
  await tabs.getByRole("button", { name: "Lançar" }).click();
  const launch = page.getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
  const row = launch.getByRole("radiogroup", { name: "Categoria" });
  await expect(row.getByRole("radio")).toHaveText([
    "Mercado",
    "Beleza",
    "Casa",
    "Combustível",
    "Comida fora",
    "Educação",
    "Farmácia",
    "Lazer",
  ]);
  await row.getByRole("radio", { name: "Comida fora" }).click();
  await launch.getByLabel("Valor").fill("12.345,67");
  await expectNoClipped(page);
  await expect(launch.getByRole("button", { name: "Salvar" })).toBeInViewport();
  await launch.getByRole("button", { name: "Salvar" }).click();

  await tabs.getByRole("button", { name: "Lançar" }).click();
  await expect(row.getByRole("radio").first()).toHaveText("Comida fora");
  await launch.getByRole("radio", { name: "Conta" }).click();
  await expect(row.getByRole("radio", { name: "Aluguel" })).toHaveAttribute("aria-checked", "true");
  await launch.getByLabel("Valor").fill("23.456,78");
  await launch.getByRole("button", { name: "Salvar" }).click();

  const ledger = page.getByRole("region", { name: "Lançamentos" });
  await expect(ledger.getByRole("button", { name: /Aluguel/ })).toContainText("R$ 23.456,78");
  await ledger.getByRole("radio", { name: "Contas" }).click();
  await expect(ledger.getByRole("button", { name: /Comida fora/ })).toBeHidden();
  await expect(ledger.getByRole("button", { name: /Aluguel/ })).toBeVisible();
  for (const width of [375, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoClipped(page);
  }
  await ledger.getByRole("radio", { name: "Diário" }).click();
  await expect(ledger.getByRole("button", { name: /Comida fora/ })).toContainText("R$ 12.345,67");
  await expect(ledger.getByRole("button", { name: /Aluguel/ })).toBeHidden();

  await page.getByRole("button", { name: "Lançar", exact: true }).first().click();
  await expect(launch.getByRole("radiogroup", { name: "Categoria" })).toBeVisible();
  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoClipped(page);
  }
});

const signUp = async (page: Page, prefix: string, bill?: { name: string; amount: string; day: string }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-${prefix}-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  if (bill) {
    await page.getByLabel("Nome").fill(bill.name);
    await page.getByLabel("Valor").fill(bill.amount);
    await page.getByLabel("Dia").fill(bill.day);
    await page.getByRole("radio", { name: "Aluguel" }).check({ force: true });
    await page.getByRole("button", { name: "Continuar" }).click();
  } else {
    await page.getByRole("button", { name: "Pular por agora" }).click();
  }
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await page.getByRole("button", { name: "Pular" }).click();
  await page
    .getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ })
    .getByRole("button", { name: "Fechar" })
    .click();
};

const box = async (page: Page, name: string) => {
  const found = await page.getByRole("region", { name, exact: true }).boundingBox();
  if (!found) throw new Error(`no ${name}`);
  return found;
};

test("a fresh account's Mês shows the hero alone at every width (D25)", async ({ page, request }) => {
  await requireServer(request);
  await signUp(page, "fresh");

  for (const width of [375, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await expect(page.getByRole("region", { name: "Saldo hoje" })).toContainText("R$ 1.000,00");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("main").getByRole("region", { name: /^(?!Saldo hoje$|Resumo do mês$)/ })).toHaveCount(
      0,
    );
    await expect(page.getByText("Para onde foi a entrada deste mês")).toBeHidden();
    await expectNoClipped(page);
  }
});

test("Mês follows the mobile frame's order at 375, a stack and a 2-column rail at 1024, two stacks at 1440", async ({
  page,
  request,
}) => {
  await requireServer(request);
  await signUp(page, "flow", { name: "Aluguel", amount: "1.600,00", day: "28" });

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const categories: { id: string; kind: string }[] = await (await page.request.get("/api/categories")).json();
  const daily = categories.find((category) => category.kind === "daily");
  const created = await page.request.post("/api/transactions", {
    data: { date: today, amount: "12.50", kind: "daily", category_id: daily?.id, note: "Padaria" },
  });
  expect(created.ok()).toBe(true);
  await page.reload();

  const banner = page.getByRole("region", { name: "Alerta do mês" });
  await expect(banner).toContainText(
    /(Dia 28 fica|Hoje está) no vermelho: -R\$\s612,50\. Conta de Aluguel prevista excede o saldo em caixa projetado\./,
  );
  await expect(page.getByRole("region", { name: "Para Onde Vai" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Próximos meses" })).toBeVisible();

  const order = ["Saldo hoje", "Contas a pagar", "Termômetro do Mês", "Lançamentos", "Próximos meses", "Para Onde Vai"];
  const tops = await Promise.all(order.map(async (name) => (await box(page, name)).y));
  expect(tops).toEqual([...tops].sort((a, b) => a - b));
  expect((await box(page, "Alerta do mês")).y).toBeLessThan(tops[0]);
  await expectNoClipped(page);

  await page.setViewportSize({ width: 1024, height: 900 });
  const [ledger, thermometer, months, spending] = await Promise.all(
    ["Lançamentos", "Termômetro do Mês", "Próximos meses", "Para Onde Vai"].map((name) => box(page, name)),
  );
  expect(thermometer.y).toBeGreaterThan(ledger.y);
  expect(months.y).toBe(thermometer.y);
  expect(spending.width).toBeGreaterThan(thermometer.width * 1.8);
  await expectNoClipped(page);

  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const [hero, rail, glance] = await Promise.all(
      ["Saldo hoje", "Termômetro do Mês", "Para Onde Vai"].map((name) => box(page, name)),
    );
    expect(rail.x).toBeGreaterThan(hero.x + hero.width);
    expect(Math.abs(glance.width - rail.width)).toBeLessThan(2);
    expect(Math.abs(rail.y - hero.y)).toBeLessThan(2);
    await expect(page.getByRole("region", { name: "Resumo do mês" })).toBeHidden();
    await expect(page.getByRole("img", { name: /^Entradas|^Saídas/ })).toHaveCount(0);
    await expectNoClipped(page);
  }
});
