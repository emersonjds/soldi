import { expect, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";
import { requireServer } from "./server";

const SHOTS = process.env.E2E_SHOTS;

test("Contas fixas sums the active bills against the month's income, pauses one from its row and filters by tab", async ({
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
  await page
    .getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ })
    .getByRole("button", { name: "Fechar" })
    .click();

  // The server's São Paulo calendar, not the runner's clock.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
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
  await expect(page.getByRole("heading", { level: 1, name: "Contas Fixas Recorrentes" })).toBeVisible();
  const total = page.getByRole("region", { name: "Total de Despesas Fixas" });
  const next = page.getByRole("region", { name: "Próximo Vencimento" });
  const list = page.getByRole("list", { name: "Contas fixas" });
  await expect(total).toContainText("R$ 46.790,10");
  await expect(total).toContainText("3 contas");
  await expect(total).toContainText("Compromete 73% da renda líquida");
  await expect(next).toContainText("Hoje");

  // Desfazer must not reach the server: a resume would move active_since (D17).
  const patches: string[] = [];
  page.on("request", (sent) => sent.method() === "PATCH" && patches.push(sent.url()));
  await page.getByRole("switch", { name: "Ativa: Aluguel Residencial" }).click();
  await expect(page.getByRole("tab", { name: "Pausadas (1)" })).toBeVisible();
  await expect(list.getByRole("listitem").last()).toContainText("Aluguel Residencial");
  await expect(total).toContainText("2 contas");
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByRole("tab", { name: "Pausadas (0)" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Ativa: Aluguel Residencial" })).toBeChecked();
  await expect(total).toContainText("3 contas");
  await expect(next).toContainText("Aluguel Residencial");
  expect(patches).toEqual([]);

  await page.getByRole("switch", { name: "Ativa: Academia" }).click();
  await expect(page.getByText("Conta pausada")).toBeVisible();
  await expect(list.getByRole("listitem").last()).toContainText("AcademiaPausada");
  await expect(total).toContainText("R$ 35.802,45");
  await expect(total).toContainText("2 contas");
  await expect(total).toContainText("Compromete 56% da renda líquida");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Mais ações de Condomínio" }).click();
  await page.getByRole("menuitem", { name: "Editar" }).click();
  await expect(page.getByRole("dialog", { name: "Editar conta" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await expect(page.getByText("Conta pausada")).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(() => patches.length).toBe(1);
  await page.reload();
  await page.getByRole("tab", { name: "Pausadas (1)" }).click();
  await expect(list).toContainText("Academia");
  await expect(page.getByText("Mostrando 1 de 3 contas fixas configuradas")).toBeVisible();
  await page.getByRole("tab", { name: "Todas (3)" }).click();

  for (const width of [375, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoClipped(page);
    if (SHOTS && (width === 375 || width === 1440)) {
      await page.screenshot({ path: `${SHOTS}/contas-fixas-${width}.png`, fullPage: true, animations: "disabled" });
    }
  }
});

test("a parcelado conta fixa shows its parcela each month and leaves after the last", async ({ page, request }) => {
  await requireServer(request);
  test.setTimeout(90_000);
  // The server's São Paulo calendar, not the runner's clock.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const month = (offset: number) => {
    const date = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + offset, 1));
    return date.toISOString().slice(0, 7);
  };
  const abbrev = (yearMonth: string) =>
    `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(yearMonth.slice(5)) - 1]}/${yearMonth.slice(2, 4)}`;
  const api = page.request;
  await api.post("/api/auth/sign-up", {
    data: { email: `e2e-parcelado-${Date.now()}@example.com`, password: "uma-senha-bem-longa" },
  });
  await api.post("/api/onboarding", { data: { opening_balance: "1000.00", opening_date: `${month(0)}-01` } });
  await api.post("/api/me/tour-seen");
  await page.setViewportSize({ width: 375, height: 812 });

  // Due on the 28th: this month while the 28th is ahead, else the next.
  const first = Number(today.slice(8)) <= 28 ? month(0) : month(1);
  const [second, after] = [month(first === month(0) ? 1 : 2), month(first === month(0) ? 2 : 3)];

  await page.goto("/ajustes/contas");
  await page.getByRole("button", { name: "Nova Conta Fixa" }).click();
  await page.getByLabel("Nome da conta fixa").fill("Fies");
  await page.getByLabel("Valor mensal fixo estimado").fill("500,00");
  await page.getByRole("switch", { name: "Parcelado" }).click();
  await page.getByLabel("Dia do vencimento recorrente").fill("28");
  await page.getByLabel("Quantas parcelas").fill("3");
  await page.getByLabel("Parcela atual").fill("2");
  await expect(page.getByText(`Parcela 2/3 em ${abbrev(first)} · termina em ${abbrev(second)}`)).toBeVisible();
  await page.getByLabel("Categoria").selectOption({ index: 1 });
  await expectNoClipped(page);
  await page.getByRole("button", { name: "Salvar Conta Fixa" }).click();
  await expect(page.getByText("Conta salva")).toBeVisible();
  await expect(page.getByRole("list", { name: "Contas fixas" })).toContainText(`Fies · até ${abbrev(second)}`);

  const fies = page.getByRole("region", { name: "Contas a pagar" }).getByRole("listitem", { name: /^Fies/ });
  for (const [shown, parcela] of [
    [first, "2/3"],
    [second, "última parcela"],
  ]) {
    await page.goto(`/mes?m=${shown}`);
    await expect(fies).toContainText(`Fies · ${parcela}`);
  }
  await page.goto(`/mes?m=${after}`);
  await expect(page.getByRole("region", { name: "Saldo hoje" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(fies).toHaveCount(0);
});
