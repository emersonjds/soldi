import { expect, type Page, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";
import { pickDate } from "./pick-date";
import { requireServer } from "./server";

/** `YYYY-MM` of the month `offset` months from now. */
const monthFrom = (offset: number) => {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

/** `YYYY-MM-DD` of the day `offset` days from today. */
const dayFrom = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const signUp = async (page: Page, name: string) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-${name}-${Date.now()}@example.com`);
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
};

test("a weekly Parcelado Conta asks for a count, then lands four rows a week apart", async ({ page, request }) => {
  await requireServer(request);
  test.setTimeout(90_000);
  await signUp(page, "weekly");
  expect((await page.request.patch("/api/settings", { data: { opening_date: `${monthFrom(0)}-01` } })).ok()).toBe(true);

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  const launch = page.getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
  await launch.getByRole("radio", { name: "Conta" }).click();
  await launch.getByLabel("Valor").fill("100,00");
  await launch.getByLabel("Observação").fill("Diarista");
  await expect(launch.getByRole("switch", { name: "Recorrente" })).toHaveCount(0);
  await expect(launch.getByRole("button", { name: "Criar como Conta Fixa" })).toHaveCount(0);
  await launch.getByRole("switch", { name: "Parcelado" }).click();
  await launch.getByRole("radio", { name: "Semanal" }).click();
  await launch.getByRole("button", { name: "Salvar" }).click();
  await expect(launch.getByRole("alert")).toHaveText("Escolha quantas parcelas.");
  await expectNoClipped(page);
  await launch.getByRole("radio", { name: "Outro" }).click();
  await launch.getByLabel("Semanas").fill("4");
  await expect(launch.getByText(/repete toda semana até/)).toBeVisible();
  await expectNoClipped(page);
  await launch.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("4 lançamentos criados")).toBeVisible();

  for (const [index, offset] of [0, 7, 14, 21].entries()) {
    const date = dayFrom(offset);
    await page.goto(`/mes?m=${date.slice(0, 7)}`);
    await expect(page.locator(`#dia-${date}`).getByRole("button", { name: /^Diarista/ })).toContainText(
      `Saída · ${index + 1}/4${index + 1} de 4`,
    );
  }
});

test("Toda a série from the second entry rewrites and deletes the first too, after asking", async ({
  page,
  request,
}) => {
  await requireServer(request);
  test.setTimeout(90_000);
  await signUp(page, "all");
  const [first, second] = [monthFrom(-2), monthFrom(-1)];
  expect((await page.request.patch("/api/settings", { data: { opening_date: `${first}-01` } })).ok()).toBe(true);

  const internet = page.getByRole("region", { name: "Lançamentos" }).getByRole("button", { name: /^Internet/ });
  const visit = async (month: string) => {
    await page.goto(`/mes?m=${month}`);
    await expect(page.getByRole("region", { name: "Saldo hoje" })).toBeVisible();
    await page.waitForLoadState("networkidle");
  };

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  const launch = page.getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
  await launch.getByRole("radio", { name: "Diário" }).click();
  await launch.getByLabel("Valor").fill("100,00");
  await pickDate(launch, "Outra data", `${first}-01`);
  await launch.getByLabel("Observação").fill("Internet");
  await launch.getByRole("switch", { name: "Recorrente" }).click();
  await launch.getByRole("radio", { name: "3", exact: true }).click();
  await launch.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("3 lançamentos criados")).toBeVisible();

  await visit(second);
  await internet.click();
  await page.getByRole("dialog", { name: "Internet" }).getByRole("button", { name: "Editar" }).click();
  const edit = page.getByRole("dialog", { name: "Editar Lançamento Recorrente" });
  await edit.getByLabel("Valor").fill("120,00");
  await edit.getByRole("radio", { name: "Toda a série (3 lançamentos)" }).click();
  await edit.getByRole("button", { name: "Salvar Alterações na Série" }).click();
  const ask = page.getByRole("alertdialog", { name: "Alterar toda a série?" });
  await expect(ask).toContainText("O lançamento anterior a este também muda, inclusive se o mês já fechou.");
  await ask.getByRole("button", { name: "Alterar toda a série" }).click();
  await expect(page.getByText("Série atualizada")).toBeVisible();
  await visit(first);
  await expect(internet).toContainText("Diário · 1/31 de 3- R$ 120,00");

  await visit(second);
  await internet.click();
  const actions = page.getByRole("dialog", { name: "Internet" });
  await actions.getByRole("button", { name: "Excluir" }).click();
  await actions.getByRole("radio", { name: "Toda a série (3 lançamentos)" }).click();
  await actions.getByRole("button", { name: "Excluir" }).click();
  await page
    .getByRole("alertdialog", { name: "Excluir toda a série?" })
    .getByRole("button", { name: "Excluir toda a série" })
    .click();
  await expect(page.getByText("Série excluída")).toBeVisible();
  await visit(first);
  await expect(internet).toHaveCount(0);
});

test("an entry repeated 3x shows in three months; edit and delete reach this one and the following", async ({
  page,
  request,
}) => {
  await requireServer(request);
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
  await page
    .getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ })
    .getByRole("button", { name: "Fechar" })
    .click();

  const [first, second, third] = [monthFrom(-2), monthFrom(-1), monthFrom(0)];
  expect((await page.request.patch("/api/settings", { data: { opening_date: `${first}-01` } })).ok()).toBe(true);

  const ledger = page.getByRole("region", { name: "Lançamentos" });
  const internet = ledger.getByRole("button", { name: /^Internet/ });
  const visit = async (month: string) => {
    await page.goto(`/mes?m=${month}`);
    await expect(page.getByRole("region", { name: "Saldo hoje" })).toBeVisible();
    await page.waitForLoadState("networkidle");
  };

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  const launch = page.getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
  await launch.getByRole("radio", { name: "Diário" }).click();
  await launch.getByLabel("Valor").fill("100,00");
  await pickDate(launch, "Outra data", `${first}-01`);
  await launch.getByLabel("Observação").fill("Internet");
  await launch.getByRole("switch", { name: "Recorrente" }).click();
  await launch.getByRole("radio", { name: "3", exact: true }).click();
  await launch.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("3 lançamentos criados")).toBeVisible();

  // The badge reads `1/3` on screen and `1 de 3` to screen readers.
  for (const [month, place] of [
    [first, "1/31 de 3"],
    [second, "2/32 de 3"],
    [third, "3/33 de 3"],
  ]) {
    await visit(month);
    await expect(internet).toContainText(`Diário · ${place}- R$ 100,00`);
  }

  await visit(second);
  await internet.click();
  await page.getByRole("dialog", { name: "Internet" }).getByRole("button", { name: "Editar" }).click();
  const edit = page.getByRole("dialog", { name: "Editar Lançamento Recorrente" });
  await expect(edit).toContainText("Parte de uma série de 3 meses");
  await edit.getByLabel("Valor").fill("120,00");
  await edit.getByRole("radio", { name: "Este e os próximos" }).click();
  await edit.getByRole("button", { name: "Salvar Alterações na Série" }).click();
  await expect(page.getByText("Série atualizada")).toBeVisible();
  await expect(internet).toContainText("R$ 120,00");

  await visit(third);
  await expect(internet).toContainText("Diário · 3/33 de 3- R$ 120,00");
  await visit(first);
  await expect(internet).toContainText("Diário · 1/31 de 3- R$ 100,00");

  await visit(second);
  await internet.click();
  const actions = page.getByRole("dialog", { name: "Internet" });
  await actions.getByRole("button", { name: "Excluir" }).click();
  await actions.getByRole("radio", { name: "Este e os próximos" }).click();
  await actions.getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText("Série excluída")).toBeVisible();
  await expect(internet).toHaveCount(0);

  await visit(third);
  await expect(ledger).toHaveCount(0);
  await visit(first);
  await expect(internet).toContainText("Diário · 1/11 de 1- R$ 100,00");
});

test("a 12x series shrinks to 6 from its first entry and grows back to 12 from its last", async ({ page, request }) => {
  await requireServer(request);
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-resize-${Date.now()}@example.com`);
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

  const [first, sixth, seventh, twelfth] = [monthFrom(0), monthFrom(5), monthFrom(6), monthFrom(11)];
  expect((await page.request.patch("/api/settings", { data: { opening_date: `${first}-01` } })).ok()).toBe(true);

  const ledger = page.getByRole("region", { name: "Lançamentos" });
  const internet = ledger.getByRole("button", { name: /^Internet/ });
  const visit = async (month: string) => {
    await page.goto(`/mes?m=${month}`);
    await expect(page.getByRole("region", { name: "Saldo hoje" })).toBeVisible();
    await page.waitForLoadState("networkidle");
  };
  const resize = async (month: string, count: string) => {
    await visit(month);
    await internet.click();
    await page.getByRole("dialog", { name: "Internet" }).getByRole("button", { name: "Editar" }).click();
    const edit = page.getByRole("dialog", { name: "Editar Lançamento Recorrente" });
    await edit
      .getByRole("radiogroup", { name: "Quantas vezes" })
      .getByRole("radio", { name: count, exact: true })
      .click();
    await edit.getByRole("button", { name: "Salvar Alterações na Série" }).click();
  };

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  const launch = page.getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
  await launch.getByRole("radio", { name: "Diário" }).click();
  await launch.getByLabel("Valor").fill("100,00");
  await pickDate(launch, "Outra data", `${first}-01`);
  await launch.getByLabel("Observação").fill("Internet");
  await launch.getByRole("switch", { name: "Recorrente" }).click();
  await launch.getByRole("radio", { name: "12", exact: true }).click();
  await launch.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("12 lançamentos criados")).toBeVisible();

  await resize(first, "6");
  await expect(page.getByText("Série ajustada com sucesso para 6 meses futuros.")).toBeVisible();
  await visit(sixth);
  await expect(internet).toContainText("Diário · 6/66 de 6");
  await visit(seventh);
  await expect(ledger).toHaveCount(0);

  await resize(sixth, "12");
  await expect(page.getByText("Série ajustada com sucesso para 12 meses futuros.")).toBeVisible();
  await visit(twelfth);
  await expect(internet).toContainText("Diário · 12/1212 de 12");
});

test("a 12x series on the 5th moves to the 10th from its third entry on", async ({ page, request }) => {
  await requireServer(request);
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-move-${Date.now()}@example.com`);
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

  const [first, second, third, twelfth] = [monthFrom(0), monthFrom(1), monthFrom(2), monthFrom(11)];
  expect((await page.request.patch("/api/settings", { data: { opening_date: `${first}-01` } })).ok()).toBe(true);

  const ledger = page.getByRole("region", { name: "Lançamentos" });
  const internet = ledger.getByRole("button", { name: /^Internet/ });
  const visit = async (month: string) => {
    await page.goto(`/mes?m=${month}`);
    await expect(ledger).toBeVisible();
  };
  const onDay = (date: string) => page.locator(`#dia-${date}`).getByRole("button", { name: /^Internet/ });

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  const launch = page.getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
  await launch.getByRole("radio", { name: "Diário" }).click();
  await launch.getByLabel("Valor").fill("100,00");
  await pickDate(launch, "Outra data", `${first}-05`);
  await launch.getByLabel("Observação").fill("Internet");
  await launch.getByRole("switch", { name: "Recorrente" }).click();
  await launch.getByRole("radio", { name: "12", exact: true }).click();
  await launch.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("12 lançamentos criados")).toBeVisible();

  await visit(third);
  await internet.click();
  await page.getByRole("dialog", { name: "Internet" }).getByRole("button", { name: "Editar" }).click();
  const edit = page.getByRole("dialog", { name: "Editar Lançamento Recorrente" });
  await edit.getByRole("radio", { name: "Este e os próximos" }).click();
  await pickDate(edit, "Outra data", `${third}-10`);
  await expect(
    edit.getByText("Os próximos lançamentos também serão movidos automaticamente para o dia 10."),
  ).toBeVisible();
  await edit.getByRole("button", { name: "Salvar Alterações na Série" }).click();
  await expect(page.getByText("Série movida para o dia 10")).toBeVisible();

  await visit(third);
  await expect(onDay(`${third}-10`)).toContainText("Diário · 3/123 de 12");
  await visit(twelfth);
  await expect(onDay(`${twelfth}-10`)).toContainText("Diário · 12/1212 de 12");
  await visit(second);
  await expect(onDay(`${second}-05`)).toContainText("Diário · 2/122 de 12");
});

/** A fresh account through the API, opened at the first of this month, tour seen. */
const signUpByApi = async (page: Page, name: string) => {
  const api = page.request;
  await api.post("/api/auth/sign-up", {
    data: { email: `e2e-${name}-${Date.now()}@example.com`, password: "uma-senha-bem-longa" },
  });
  await api.post("/api/onboarding", { data: { opening_balance: "1000.00", opening_date: `${monthFrom(0)}-01` } });
  await api.post("/api/me/tour-seen");
  await page.setViewportSize({ width: 375, height: 812 });
};

test("a Recorrente Sempre salário reads Todo mês in every month ahead and Parar recorrência keeps this month only", async ({
  page,
  request,
}) => {
  await requireServer(request);
  test.setTimeout(90_000);
  await signUpByApi(page, "sempre");

  const ledger = page.getByRole("region", { name: "Lançamentos" });
  const salary = ledger.getByRole("button", { name: /^Salário/ });
  const visit = async (month: string) => {
    await page.goto(`/mes?m=${month}`);
    await expect(page.getByRole("region", { name: "Saldo hoje" })).toBeVisible();
    await page.waitForLoadState("networkidle");
  };

  await visit(monthFrom(0));
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  const launch = page.getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
  await launch.getByRole("radio", { name: "Entrada" }).click();
  await launch.getByLabel("Valor").fill("5.000,00");
  await launch.getByLabel("Observação").fill("Salário");
  await launch.getByRole("switch", { name: "Recorrente" }).click();
  await expect(launch.getByRole("radio", { name: "Sempre" })).toBeChecked();
  await expect(launch.getByText(/^Repete todo dia \d+, sem data para parar\.$/)).toBeVisible();
  await expect(launch.getByRole("button", { name: "Já começou em outra parcela?" })).toHaveCount(0);
  await expectNoClipped(page);
  await launch.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Lançado", { exact: true })).toBeVisible();

  for (const offset of [0, 1, 11]) {
    await visit(monthFrom(offset));
    await expect(salary).toContainText("Entrada · Todo mês");
    await expect(salary).toContainText("R$ 5.000,00");
  }

  await visit(monthFrom(0));
  await salary.click();
  await page.getByRole("dialog", { name: "Salário" }).getByRole("button", { name: "Editar" }).click();
  const edit = page.getByRole("dialog", { name: "Editar Lançamento Recorrente" });
  await expectNoClipped(page);
  await edit.getByRole("button", { name: "Parar recorrência" }).click();
  await expect(page.getByText("Recorrência parada. Sai dos próximos meses.")).toBeVisible();

  await visit(monthFrom(1));
  await expect(salary).toHaveCount(0);
  await visit(monthFrom(0));
  await expect(salary).toContainText("R$ 5.000,00");
});

test("a Diário on a card with Recorrente Sempre lands in the faturas ahead", async ({ page, request }) => {
  await requireServer(request);
  test.setTimeout(90_000);
  await signUpByApi(page, "subscription");
  const categories: { id: string; kind: string; is_savings: boolean }[] = await (
    await page.request.get("/api/categories")
  ).json();
  const bill = categories.find((category) => category.kind === "bill" && !category.is_savings);
  const card = await page.request.post("/api/bills", {
    data: { name: "Nubank", category_id: bill?.id, closing_day: 5, due_day: 12 },
  });
  expect(card.ok()).toBe(true);

  await page.goto(`/mes?m=${monthFrom(0)}`);
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  const launch = page.getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
  await launch.getByRole("radio", { name: "Diário" }).click();
  await launch.getByLabel("Valor").fill("39,90");
  await launch.getByLabel("Cartão").selectOption({ label: "Nubank" });
  await launch.getByLabel("Observação").fill("Spotify");
  await launch.getByRole("switch", { name: "Recorrente" }).click();
  await launch.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Lançado", { exact: true })).toBeVisible();

  // One member per month, so every fatura from the third month on holds exactly one.
  await page.goto(`/mes?m=${monthFrom(3)}`);
  await expect(
    page.getByRole("region", { name: "Lançamentos" }).getByRole("button", { name: /^Spotify/ }),
  ).toContainText("Diário · Todo mês");
  await expect(
    page.getByRole("region", { name: "Contas a pagar" }).getByRole("listitem", { name: /Nubank/ }),
  ).toContainText("R$ 39,90");
});

test("a future Conta on Conta fixa becomes a conta fixa paid on its day, counted once", async ({ page, request }) => {
  await requireServer(request);
  test.setTimeout(90_000);
  await signUp(page, "future-conta");
  const due = dayFrom(3);
  const month = due.slice(0, 7);
  expect((await page.request.patch("/api/settings", { data: { opening_date: `${monthFrom(0)}-01` } })).ok()).toBe(true);

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  const launch = page.getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
  await launch.getByRole("radio", { name: "Conta" }).click();
  await launch.getByLabel("Valor").fill("177,31");
  await launch.getByLabel("Observação").fill("Gás");
  await pickDate(launch, "Outra data", due);
  await launch.getByRole("switch", { name: "Conta fixa" }).click();
  await expect(launch.getByText("Todo mês, sem fim. Ao salvar, abre o cadastro da conta fixa.")).toBeVisible();
  await expectNoClipped(page);
  await launch.getByRole("button", { name: "Salvar" }).click();
  const sheet = page.getByRole("dialog", { name: "Nova conta" });
  await expect(sheet.getByLabel("Nome da conta fixa")).toHaveValue("Gás");
  await sheet.getByRole("button", { name: "Salvar Conta Fixa" }).click();
  await expect(page.getByText("Conta fixa criada")).toBeVisible();

  const view = await (await page.request.get(`/api/months/${month}`)).json();
  expect(view.bills_of_month).toMatchObject([{ name: "Gás", paid: true, lands_on: null }]);
  const day = view.days.find((found: { date: string }) => found.date === due);
  expect(day.projected_balance).toBe("822.69");

  await page.goto(`/mes?m=${month}`);
  await expect(page.getByRole("region", { name: "Contas a pagar" })).toContainText("1 de 1 paga");
  const ledger = page.getByRole("region", { name: "Lançamentos" });
  await expect(ledger.locator(`#dia-${due}`).getByText("Gás")).toHaveCount(1);
  await expect(ledger.getByText("Conta fixa · a pagar")).toHaveCount(0);
});

test("a 24x Conta series from three months ago becomes a variable conta fixa; past months keep their totals", async ({
  page,
  request,
}) => {
  await requireServer(request);
  test.setTimeout(90_000);
  const api = page.request;
  await api.post("/api/auth/sign-up", {
    data: { email: `e2e-series-bill-${Date.now()}@example.com`, password: "uma-senha-bem-longa" },
  });
  await api.post("/api/onboarding", { data: { opening_balance: "5000.00", opening_date: `${monthFrom(-3)}-01` } });
  await api.post("/api/me/tour-seen");
  await page.setViewportSize({ width: 375, height: 812 });
  const categories: { id: string; kind: string; is_savings: boolean }[] = await (
    await api.get("/api/categories")
  ).json();
  const billCategory = categories.find((category) => category.kind === "bill" && !category.is_savings);
  const created = await api.post("/api/transactions", {
    data: {
      date: `${monthFrom(-3)}-01`,
      amount: "500.00",
      kind: "bill",
      category_id: billCategory?.id,
      note: "Porto",
      repeat_months: 24,
    },
  });
  expect(created.ok()).toBe(true);
  const past = monthFrom(-2);
  const totalsOf = async (month: string) => {
    const { totals, projected_balance } = await (await api.get(`/api/months/${month}`)).json();
    return { totals, projected_balance };
  };
  const before = await totalsOf(past);

  await page.goto(`/mes?m=${past}`);
  await page
    .getByRole("region", { name: "Lançamentos" })
    .getByRole("button", { name: /^Porto/ })
    .click();
  await page.getByRole("dialog", { name: "Porto" }).getByRole("button", { name: "Editar" }).click();
  await page
    .getByRole("dialog", { name: "Editar Lançamento Recorrente" })
    .getByRole("button", { name: "Conta parcelada" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Nova conta" });
  await expect(sheet).toContainText("Os lançamentos desta série até este mês viram pagamentos desta conta.");
  await expect(sheet.getByRole("switch", { name: "Parcelado" })).toBeChecked();
  await sheet.getByRole("switch", { name: "Valor varia todo mês" }).click();
  await sheet.getByRole("button", { name: "Salvar Conta Fixa" }).click();
  await expect(page.getByText("Conta parcelada criada")).toBeVisible();

  await page.goto(`/mes?m=${monthFrom(0)}`);
  const thisMonth = page.getByRole("region", { name: "Contas a pagar" }).getByRole("listitem", { name: "Porto" });
  await expect(thisMonth).toContainText("R$ 500,00");
  await expect(thisMonth).not.toContainText("≈");
  await page.goto(`/mes?m=${monthFrom(1)}`);
  const nextMonth = page.getByRole("region", { name: "Contas a pagar" }).getByRole("listitem", { name: "Porto" });
  await expect(nextMonth).toContainText("≈");
  await expect(nextMonth).toContainText("valor variável");

  expect(await totalsOf(past)).toEqual(before);
  expect(await (await api.get(`/api/transactions?month=${monthFrom(1)}`)).json()).toEqual([]);
});

test("a 2-member Conta series starting this month becomes a conta fixa with no end", async ({ page, request }) => {
  await requireServer(request);
  test.setTimeout(90_000);
  await signUpByApi(page, "series-fixa");
  const api = page.request;
  const categories: { id: string; kind: string; is_savings: boolean }[] = await (
    await api.get("/api/categories")
  ).json();
  const billCategory = categories.find((category) => category.kind === "bill" && !category.is_savings);
  const created = await api.post("/api/transactions", {
    data: {
      date: `${monthFrom(0)}-01`,
      amount: "2339.68",
      kind: "bill",
      category_id: billCategory?.id,
      note: "Financiamento",
      repeat_months: 2,
    },
  });
  expect(created.ok()).toBe(true);

  await page.goto(`/mes?m=${monthFrom(0)}`);
  await page
    .getByRole("region", { name: "Lançamentos" })
    .getByRole("button", { name: /^Financiamento/ })
    .click();
  await page.getByRole("dialog", { name: "Financiamento" }).getByRole("button", { name: "Editar" }).click();
  const edit = page.getByRole("dialog", { name: "Editar Lançamento Recorrente" });
  const fixa = edit.getByRole("button", { name: "Conta fixa" });
  const parcelada = edit.getByRole("button", { name: "Conta parcelada" });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 812 });
    // The sheet becomes a dialog across 1024 px and remounts.
    await expect(async () => {
      await fixa.scrollIntoViewIfNeeded({ timeout: 1000 });
      const [left, right] = [await fixa.boundingBox(), await parcelada.boundingBox()];
      expect(left && right && Math.abs(left.y - right.y) < 1 && left.x < right.x).toBe(true);
      expect(Math.min(left?.height ?? 0, right?.height ?? 0)).toBeGreaterThanOrEqual(44);
    }).toPass();
    expect(await fixa.evaluate((button) => getComputedStyle(button).fontSize)).toBe("16px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expectNoClipped(page);
  }
  await fixa.click();
  const sheet = page.getByRole("dialog", { name: "Nova conta" });
  await expect(sheet.getByRole("switch", { name: "Parcelado" })).not.toBeChecked();
  await expect(sheet).toContainText("Os dos próximos meses saem da lista: a conta fixa prevê todo mês, sem fim.");
  await sheet.getByRole("button", { name: "Salvar Conta Fixa" }).click();
  await expect(page.getByText("Conta fixa criada")).toBeVisible();

  for (const month of [monthFrom(0), monthFrom(3)]) {
    await page.goto(`/mes?m=${month}`);
    const bill = page.getByRole("region", { name: "Contas a pagar" }).getByRole("listitem", { name: "Financiamento" });
    await expect(bill).toContainText("R$ 2.339,68");
    await expect(bill).not.toContainText("termina em");
  }
  await page.goto(`/mes?m=${monthFrom(0)}`);
  await expect(
    page.getByRole("region", { name: "Lançamentos" }).getByRole("button", { name: /^Financiamento/ }),
  ).toContainText("Conta fixa · paga");
  expect(await (await api.get(`/api/transactions?month=${monthFrom(1)}`)).json()).toEqual([]);
});
