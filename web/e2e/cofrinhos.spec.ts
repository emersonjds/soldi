import { expect, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";
import { requireServer } from "./server";

test("a cofrinho fills from a Saída in Economia and empties with a resgate", async ({ page, request }) => {
  await requireServer(request);
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-cofrinhos-${Date.now()}@example.com`);
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

  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await nav.getByRole("link", { name: "Economia" }).click();
  const hero = page.getByRole("region", { name: "Total guardado em cofrinhos" });
  await expect(hero).toContainText("Nada guardado ainda.");
  await expect(hero.getByRole("button", { name: "Resgatar" })).toBeDisabled();
  await expect(page.getByRole("region", { name: "Reserva Livre" })).toContainText("sem teto fixado");
  await page.getByRole("button", { name: "Começar objetivo" }).click();
  const create = page.getByRole("dialog", { name: "Novo cofrinho" });
  await create.getByLabel("Nome").fill("Reserva");
  await create.getByLabel("Meta").fill("1.000,00");
  await create.getByRole("button", { name: "Criar" }).click();
  await expect(page.getByText("Cofrinho criado")).toBeVisible();

  await expect(page.getByRole("region", { name: "Seus Cofrinhos" })).toContainText("1 ativo");
  const reserva = page.getByRole("region", { name: "Reserva", exact: true });
  await expect(reserva.getByRole("button", { name: /^Resgatar/ })).toHaveCount(0);
  await reserva.getByRole("button", { name: "Guardar primeiro valor" }).click();
  const lancar = page.getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
  await expect(lancar.getByRole("radio", { name: "Conta" })).toBeChecked();
  await expect(lancar.getByRole("radio", { name: "Economia › Reserva" })).toHaveAttribute("aria-checked", "true");
  await lancar.getByLabel("Valor").fill("200,00");
  await lancar.getByRole("button", { name: "Salvar" }).click();

  await expect(reserva).toContainText("R$ 200,00 de R$ 1.000,00");
  await expect(reserva.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "20");
  await expect(hero).toContainText("Meta Global Consolidada: R$ 200,00 de R$ 1.000,00");
  await expect(hero).toContainText("20,0% concluído");

  for (const width of [375, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoClipped(page);
  }
  await page.setViewportSize({ width: 375, height: 812 });

  await reserva.getByRole("button", { name: "Mais ações de Reserva" }).click();
  await page.getByRole("menuitem", { name: "Movimentos" }).click();
  const sheet = page.getByRole("dialog", { name: "Reserva" });
  await expect(sheet.getByRole("list", { name: "Movimentos" })).toContainText("Guardado");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  await hero.getByRole("button", { name: "Resgatar" }).click();
  await page
    .getByRole("dialog", { name: "Resgatar" })
    .getByRole("button", { name: /^Reserva/ })
    .click();
  await sheet.getByLabel("Valor").fill("5.000,00");
  await sheet.getByRole("button", { name: "Confirmar resgate" }).click();
  await expect(sheet.getByText("Você só tem R$ 200,00 guardado aqui")).toBeVisible();
  await sheet.getByLabel("Valor").fill("50,00");
  await sheet.getByRole("button", { name: "Confirmar resgate" }).click();
  await expect(page.getByText("Resgate feito")).toBeVisible();
  await expect(sheet.getByRole("list", { name: "Movimentos" })).toContainText("Resgatado");
  await page.keyboard.press("Escape");
  await expect(reserva).toContainText("R$ 150,00 de R$ 1.000,00");
  await expect(hero).toContainText("R$ 150,00");

  await hero.getByRole("button", { name: "Movimentos" }).click();
  const all = page.getByRole("dialog", { name: "Movimentos" });
  await expect(all.getByRole("list", { name: "Movimentos" }).getByRole("listitem")).toHaveCount(2);
  await expect(all).toContainText("Reserva");
  await page.keyboard.press("Escape");

  await nav.getByRole("link", { name: "Mês" }).click();
  const ledger = page.getByRole("region", { name: "Lançamentos" });
  await expect(ledger.getByRole("button", { name: /^Economia › Reserva/ })).toContainText("Guardado- R$ 200,00");
  await expect(ledger.getByRole("button", { name: /^Resgate › Reserva/ })).toContainText("Resgatado+ R$ 50,00");
  await expect(page.getByRole("region", { name: "Termômetro do Mês" })).not.toContainText("Guardou");
  const glance = page.getByRole("region", { name: "Cofrinhos" });
  await expect(glance.getByRole("progressbar", { name: "Progresso de Reserva" })).toHaveAttribute(
    "aria-valuenow",
    "15",
  );
  for (const width of [375, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoClipped(page);
  }
});

test("Economia do ano lists each month's saving and opens it on Mês, unclipped from 375 to 1440", async ({
  page,
  request,
}) => {
  await requireServer(request);
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-savings-year-${Date.now()}@example.com`);
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
  const [year, month] = today.split("-").map(Number);
  const previous = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  expect((await page.request.patch("/api/settings", { data: { opening_date: `${previous}-01` } })).ok()).toBe(true);

  const categories: { id: string; kind: string; is_savings: boolean; parent_id: string | null }[] = await (
    await page.request.get("/api/categories")
  ).json();
  const economia = categories.find((category) => category.is_savings && !category.parent_id);
  const salary = categories.find((category) => category.kind === "income" && !category.is_savings);
  const post = async (data: Record<string, unknown>) =>
    expect((await page.request.post("/api/transactions", { data })).ok()).toBe(true);
  for (const date of [today, `${previous}-10`]) {
    await post({ date, amount: "64482.80", kind: "income", category_id: salary?.id });
  }
  await post({ date: today, amount: "12345.67", kind: "bill", category_id: economia?.id });
  await post({ date: `${previous}-10`, amount: "5000.00", kind: "bill", category_id: economia?.id });
  const resgate = await page.request.post(`/api/cofrinhos/${economia?.id}/withdraw`, {
    data: { date: `${previous}-20`, amount: "5200.00" },
  });
  expect(resgate.ok()).toBe(true);

  const name = (yearMonth: string) => {
    const long = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(
      new Date(`${yearMonth}-15T12:00:00Z`),
    );
    return `${long.charAt(0).toUpperCase()}${long.slice(1)} de ${yearMonth.slice(0, 4)}`;
  };
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Economia" }).click();
  const card = page.getByRole("region", { name: "Economia do ano" });
  await expect(card.getByRole("heading", { level: 1 })).toHaveText(/^Evolução e Poupança/);
  const current = card.getByRole("list", { name: "Meses" }).getByRole("link", {
    name: `${name(today.slice(0, 7))}: guardou R$ 12.345,67, 19,1% das entradas, faixa alta, ajustar`,
  });
  await expect(current).toContainText("Atual");
  await expect(current).toContainText("Entradas: R$ 64.482,80");
  await expect(current).toHaveAttribute("href", `/para-onde-vai?m=${today.slice(0, 7)}&g=economia`);
  if (previous.slice(0, 4) !== today.slice(0, 4)) await card.getByRole("button", { name: "Ano anterior" }).click();
  const last = card
    .getByRole("list", { name: "Meses" })
    .getByRole("link", { name: `${name(previous)}: guardou -R$ 200,00, -0,3% das entradas` });
  await expect(last).toContainText("-R$ 200,00");

  for (const width of [375, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoClipped(page);
  }

  await last.click();
  await expect(page).toHaveURL(new RegExp(`/mes\\?m=${previous}$`));
  await expect(page.getByRole("group", { name: "Mês" }).first()).toContainText(name(previous).replace(" de ", " "));
});
