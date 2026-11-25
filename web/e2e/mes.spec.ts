import { expect, type Page, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";
import { requireServer } from "./server";

const SHOTS = process.env.E2E_SHOTS;

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
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

  await expect(page.getByRole("region", { name: "Saldo hoje" })).toContainText("R$ 1.000,00");

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  await expect(page.getByRole("radio", { name: "Gasto" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.type("12,50");
  await page.getByRole("button", { name: "Salvar" }).click();

  const ledger = page.getByRole("region", { name: "Lançamentos" });
  await expect(ledger.getByRole("button", { name: /Gasto/ })).toContainText("R$ 12,50");
  await expect(ledger.getByRole("heading", { level: 3 }).first()).toContainText(/Hoje.*R\$\s987,50.*Apertado/);
  await expect(page.getByRole("region", { name: "Saldo hoje" })).toContainText("R$ 987,50");
});

test("a bill from onboarding shows under Contas a pagar, pays from the round check and moves the projection", async ({
  page,
  request,
}) => {
  await requireServer(request);

  await page.setViewportSize({ width: 1440, height: 900 });
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
  await expect(bills).toContainText("0 de 1 paga");
  await expect(hero).toContainText(/Projetado no fim do mês\s*R\$\s700,00/);

  const chip = bills.getByRole("radio", { name: "dia 28, 1 conta a pagar" });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-checked", "true");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-checked", "false");

  await bill.getByRole("button", { name: "Marcar Aluguel como paga" }).click();
  await expect(bill.getByRole("button", { name: "Desmarcar Aluguel" })).toHaveAttribute("aria-pressed", "true");
  await expect(bills).toContainText("1 de 1 paga");
  await expect(hero).toContainText("R$ 700,00");

  await bill.getByRole("button", { name: "Desmarcar Aluguel" }).click();
  await expect(page.getByText("Pagamento desfeito")).toBeVisible();
  await expect(hero).toContainText("R$ 1.000,00");

  await bill.getByRole("button", { name: /ajustar pagamento de Aluguel/ }).click();
  const sheet = page.getByRole("dialog", { name: "Pagar Aluguel" });
  await sheet.getByLabel("Valor").fill("350,00");
  await sheet.getByRole("button", { name: "Confirmar" }).click();

  await expect(bill.getByRole("button", { name: "Desmarcar Aluguel" })).toHaveAttribute("aria-pressed", "true");
  await expect(hero).toContainText(/Projetado no fim do mês\s*R\$\s650,00/);
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
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

  const tabs = page.getByRole("navigation", { name: "Navegação principal" });
  await tabs.getByRole("button", { name: "Lançar" }).click();
  await expect(page.getByRole("radio", { name: "Gasto" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.type("12345");
  await expect(page.getByLabel("Valor")).toHaveValue("123,45");
  await page.getByRole("button", { name: "Salvar" }).click();

  const ledger = page.getByRole("region", { name: "Lançamentos" });
  await expect(ledger.getByRole("button", { name: /Gasto/ })).toContainText("R$ 123,45");

  await tabs.getByRole("button", { name: "Lançar" }).click();
  await page.getByRole("button", { name: "Ver todas" }).click();
  await page.getByRole("dialog", { name: "Categoria" }).getByRole("button", { name: "Nova categoria" }).click();
  const create = page.getByRole("dialog", { name: "Nova categoria" });
  await expect(create.getByRole("radio", { name: "Grupo" })).toBeChecked();
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
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

  const hero = page.getByRole("region", { name: "Saldo hoje" });
  const monthSummary = page.getByRole("region", { name: "Resumo do mês" });
  await monthSummary.getByRole("button", { name: "Lançar entrada" }).click();
  await expect(page.getByRole("radio", { name: "Entrada" })).toBeChecked();
  await page.keyboard.type("200000");
  await page.getByRole("button", { name: "Salvar" }).click();

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  await expect(page.getByRole("radio", { name: "Gasto" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.type("1250");
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(monthSummary).toContainText(/Entradas\s*R\$\s2\.000,00/);
  await expect(monthSummary).toContainText(/Gastos\s*R\$\s12,50/);
  await expect(hero).toContainText(/Saldo hoje em conta\s*R\$\s2\.987,50/);

  const spending = page.getByRole("region", { name: "Para Onde Vai" });
  await expect(spending.getByRole("listitem")).toHaveText([/Gasto\s*R\$\s12,50\s*100,0%/]);
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
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

  const tabs = page.getByRole("navigation", { name: "Navegação principal" });
  await tabs.getByRole("button", { name: "Lançar" }).click();
  const launch = page.getByRole("dialog", { name: "Lançar" });
  const row = launch.getByRole("radiogroup", { name: "Categoria" });
  await expect(row.getByRole("radio")).toHaveText([
    "Gasto",
    "Educação",
    "Saúde",
    "Alimentação",
    "Família",
    "Lazer",
    "Transporte",
  ]);
  await row.getByRole("radio", { name: "Lazer" }).click();
  await launch.getByLabel("Valor").fill("12.345,67");
  await expectNoClipped(page);
  await expect(launch.getByRole("button", { name: "Salvar" })).toBeInViewport();
  await launch.getByRole("button", { name: "Salvar" }).click();

  await tabs.getByRole("button", { name: "Lançar" }).click();
  await expect(row.getByRole("radio").first()).toHaveText("Lazer");
  await launch.getByRole("radio", { name: "Conta" }).click();
  await expect(row.getByRole("radio", { name: "Casa", exact: true })).toHaveAttribute("aria-checked", "true");
  await launch.getByLabel("Valor").fill("23.456,78");
  await launch.getByRole("button", { name: "Salvar" }).click();

  const ledger = page.getByRole("region", { name: "Lançamentos" });
  await expect(ledger.getByRole("button", { name: /Casa/ })).toContainText("R$ 23.456,78");
  await ledger.getByRole("radio", { name: "Contas fixas" }).click();
  await expect(ledger.getByRole("button", { name: /Lazer/ })).toBeHidden();
  await expect(ledger.getByRole("button", { name: /Casa/ })).toBeVisible();
  for (const width of [375, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoClipped(page);
  }
  await ledger.getByRole("radio", { name: "Diário" }).click();
  await expect(ledger.getByRole("button", { name: /Lazer/ })).toContainText("R$ 12.345,67");
  await expect(ledger.getByRole("button", { name: /Casa/ })).toBeHidden();

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
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();
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
    await expect(page.getByRole("img", { name: /^Entradas|^Gastos/ })).toHaveCount(0);
    await expectNoClipped(page);
  }
});

test("Contas a pagar groups the month by kind with the paid count, pays and undoes, edits from the name and Excluir has Desfazer (SOL-153)", async ({
  page,
  request,
}) => {
  await requireServer(request);
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-groups-${Date.now()}@example.com`);
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
  const categories: { id: string; kind: string; is_savings: boolean }[] = await (
    await page.request.get("/api/categories")
  ).json();
  const category = categories.find((each) => each.kind === "bill" && !each.is_savings);
  const inElevenMonths = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) + 10, 1));
  for (const data of [
    {
      name: "Internet da casa de praia em Ubatuba SP",
      amount: "99999.99",
      installments: 12,
      last_month: inElevenMonths.toISOString().slice(0, 10),
    },
    { name: "Luz", amount: "180.00", variable: true },
  ]) {
    const created = await page.request.post("/api/bills", {
      data: { ...data, due_day: Number(today.slice(8)), category_id: category?.id },
    });
    expect(created.ok()).toBe(true);
  }

  await page.goto("/mes");
  const bills = page.getByRole("region", { name: "Contas a pagar" });
  const title = bills.getByRole("heading", { level: 2 });
  const fixed = bills.getByRole("button", { name: /^Valor fixo/ });
  await expect(title).toContainText("0 de 2 pagas");
  await expect(fixed).toHaveAttribute("aria-expanded", "true");
  await expect(fixed).toContainText(/0 de 1 paga · falta R\$\s99\.999,99/);
  await expect(bills.getByRole("button", { name: /^Valor variável/ })).toContainText(/falta ≈ R\$\s180,00/);
  await expect(bills.getByRole("link", { name: "Gerenciar contas fixas" })).toHaveAttribute("href", "/ajustes/contas");
  await expect(bills.getByRole("listitem", { name: "Internet da casa de praia em Ubatuba SP" })).toContainText(
    /Parcela 1\/12 · termina em [a-z]{3}\/\d{2}/,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectNoClipped(page);

  const internet = bills.getByRole("listitem", { name: "Internet da casa de praia em Ubatuba SP" });
  await internet.getByRole("button", { name: "Pagar Internet da casa de praia em Ubatuba SP" }).click();
  await expect(fixed).toContainText("1 de 1 paga");
  await expect(fixed).toHaveAttribute("aria-expanded", "true");
  await expect(title).toContainText("1 de 2 pagas");
  await internet.getByRole("button", { name: "Pago, Internet da casa de praia em Ubatuba SP" }).click();
  await expect(page.getByText("Pagamento desfeito")).toBeVisible();
  await expect(title).toContainText("0 de 2 pagas");

  await bills.getByRole("button", { name: "Editar Internet da casa de praia em Ubatuba SP" }).click();
  const sheet = page.getByRole("dialog", { name: "Editar conta" });
  await sheet.getByLabel("Nome da conta fixa").fill("Internet");
  await sheet.getByRole("button", { name: "Salvar Conta Fixa" }).click();
  await expect(page.getByText("Conta salva")).toBeVisible();
  const renamed = bills.getByRole("listitem", { name: "Internet", exact: true });
  await expect(renamed).toBeVisible();

  await bills.getByRole("button", { name: "Editar Internet", exact: true }).click();
  await sheet.getByRole("button", { name: "Excluir conta fixa" }).click();
  await expect(page.getByText("Conta fixa excluída")).toBeVisible();
  await expect(renamed).toBeHidden();
  await expect(title).toContainText("0 de 1 paga");
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(renamed).toBeVisible();
  await expect(title).toContainText("0 de 2 pagas");

  await bills.getByRole("button", { name: "Editar Internet", exact: true }).click();
  const deleted = page.waitForResponse(
    (response) => response.request().method() === "DELETE" && response.url().includes("/api/bills/"),
  );
  await sheet.getByRole("button", { name: "Excluir conta fixa" }).click();
  await page.mouse.move(0, 0);
  expect((await deleted).ok()).toBe(true);
  await page.reload();
  await expect(title).toContainText("0 de 1 paga");
  await expect(bills.getByRole("listitem", { name: "Internet", exact: true })).toHaveCount(0);
});

test("Lançamentos shows the whole month and splits Contas fixas from Valor variável, keeping each day's projection (SOL-154)", async ({
  page,
  request,
}) => {
  await requireServer(request);
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-ledger-${Date.now()}@example.com`);
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
  const api = page.request;
  expect((await api.patch("/api/settings", { data: { opening_date: `${today.slice(0, 7)}-01` } })).ok()).toBe(true);
  const categories: { id: string; kind: string; is_savings: boolean }[] = await (
    await api.get("/api/categories")
  ).json();
  const daily = categories.find((each) => each.kind === "daily");
  const bill = categories.find((each) => each.kind === "bill" && !each.is_savings);
  const pastDays = Array.from(
    { length: Math.min(Number(today.slice(8)) - 1, 9) },
    (_, index) => `${today.slice(0, 8)}${String(index + 1).padStart(2, "0")}`,
  );
  for (const date of pastDays) {
    const created = await api.post("/api/transactions", {
      data: { date, amount: "10.00", kind: "daily", category_id: daily?.id, note: `Feira ${date}` },
    });
    expect(created.ok()).toBe(true);
  }
  const ids: Record<string, string> = {};
  for (const data of [
    { name: "Internet da casa de praia em Ubatuba SP", amount: "99999.99" },
    { name: "Luz", amount: "180.00", variable: true },
    { name: "Gás", amount: "90.00", variable: true },
  ]) {
    const created = await api.post("/api/bills", {
      data: { ...data, due_day: Number(today.slice(8)), category_id: bill?.id },
    });
    expect(created.ok()).toBe(true);
    ids[data.name] = (await created.json()).id;
  }
  expect((await api.post(`/api/bills/${ids.Luz}/pay`, { data: { date: today, amount: "175.40" } })).ok()).toBe(true);

  await page.goto("/mes");
  const ledger = page.getByRole("region", { name: "Lançamentos" });
  await expect(ledger.getByRole("button", { name: /Feira/ })).toHaveCount(pastDays.length);
  await expect(ledger.getByRole("button", { name: /Ver o mês inteiro|Mostrar menos/ })).toHaveCount(0);
  const header = ledger.locator(`#dia-${today}`).getByRole("heading", { level: 3 });
  const projection = await header.textContent();

  await ledger.getByRole("radio", { name: "Contas fixas" }).click();
  await expect(ledger.getByRole("listitem", { name: "Internet da casa de praia em Ubatuba SP" })).toBeVisible();
  await expect(ledger.getByRole("listitem", { name: "Gás" })).toHaveCount(0);
  await expect(ledger.getByRole("button", { name: /R\$\s175,40/ })).toHaveCount(0);
  await expect(ledger.getByRole("button", { name: /Feira/ })).toHaveCount(0);
  await expect(header).toHaveText(projection ?? "");
  await expectNoClipped(page);

  await ledger.getByRole("radio", { name: "Valor variável" }).click();
  await expect(ledger.getByRole("listitem", { name: "Gás" })).toBeVisible();
  await expect(ledger.getByRole("button", { name: /R\$\s175,40/ })).toBeVisible();
  await expect(ledger.getByRole("listitem", { name: "Internet da casa de praia em Ubatuba SP" })).toHaveCount(0);
  await expect(header).toHaveText(projection ?? "");
  for (const width of [375, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expectNoClipped(page);
  }
});

test("Contas a pagar and Lançamentos collapse from their chevron and stay that way after a reload (SOL-158)", async ({
  page,
  request,
}) => {
  await requireServer(request);
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-collapse-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("uma-senha-bem-longa");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Saldo de hoje").fill("1.000,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Ver meu mês" }).click();
  await page.getByRole("button", { name: "Pular" }).click();
  await page.getByRole("dialog", { name: "Lançar" }).getByRole("button", { name: "Fechar" }).click();

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const api = page.request;
  const categories: { id: string; kind: string; is_savings: boolean }[] = await (
    await api.get("/api/categories")
  ).json();
  const daily = categories.find((each) => each.kind === "daily");
  const bill = categories.find((each) => each.kind === "bill" && !each.is_savings);
  expect(
    (
      await api.post("/api/transactions", {
        data: { date: today, amount: "48.90", kind: "daily", category_id: daily?.id, note: "Feira" },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await api.post("/api/bills", {
        data: {
          name: "Internet da casa de praia em Ubatuba SP",
          amount: "99999.99",
          due_day: 28,
          category_id: bill?.id,
        },
      })
    ).ok(),
  ).toBe(true);

  await page.goto("/mes");
  const bills = page.getByRole("region", { name: "Contas a pagar" });
  const ledger = page.getByRole("region", { name: "Lançamentos" });
  await expect(ledger.getByRole("button", { name: /Feira/ })).toBeVisible();
  const billsToggle = bills.getByRole("button", { name: "Contas a pagar" });
  const ledgerToggle = ledger.getByRole("button", { name: "Lançamentos" });
  await expect(billsToggle).toHaveAttribute("aria-expanded", "true");

  await billsToggle.click();
  await ledgerToggle.click();
  await page.reload();
  await expect(bills).toContainText("0 de 1 paga");
  await expect(billsToggle).toHaveAttribute("aria-expanded", "false");
  await expect(ledgerToggle).toHaveAttribute("aria-expanded", "false");
  await expect(bills.getByRole("listitem")).toHaveCount(0);
  await expect(ledger.getByRole("button", { name: /Feira/ })).toHaveCount(0);

  for (const state of ["fechado", "aberto"]) {
    for (const width of [375, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expectNoClipped(page);
      if (SHOTS)
        await page.screenshot({
          path: `${SHOTS}/collapse-${state}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
    }
    if (state === "fechado") {
      await billsToggle.click();
      await ledgerToggle.click();
      await expect(ledger.getByRole("button", { name: /Feira/ })).toBeVisible();
    }
  }
});
