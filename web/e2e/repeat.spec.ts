import { expect, test } from "@playwright/test";

import { pickDate } from "./pick-date";
import { requireServer } from "./server";

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
  await launch.getByRole("radio", { name: "Conta" }).click();
  await launch.getByLabel("Valor").fill("100,00");
  await pickDate(launch, "Outra data", `${first}-01`);
  await launch.getByLabel("Observação").fill("Internet");
  await launch.getByRole("switch", { name: "Repetir lançamento (Série)" }).click();
  await launch.getByRole("radio", { name: "3×" }).click();
  await launch.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("3 lançamentos criados")).toBeVisible();

  // The badge reads `1/3` on screen and `1 de 3` to screen readers.
  for (const [month, place] of [
    [first, "1/31 de 3"],
    [second, "2/32 de 3"],
    [third, "3/33 de 3"],
  ]) {
    await visit(month);
    await expect(internet).toContainText(`Saída · ${place}- R$ 100,00`);
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
  await expect(internet).toContainText("Saída · 3/33 de 3- R$ 120,00");
  await visit(first);
  await expect(internet).toContainText("Saída · 1/31 de 3- R$ 100,00");

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
  await expect(internet).toContainText("Saída · 1/11 de 1- R$ 100,00");
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
    await edit.getByRole("radiogroup", { name: "Duração da série" }).getByRole("radio", { name: count }).click();
    await edit.getByRole("button", { name: "Salvar Alterações na Série" }).click();
  };

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  const launch = page.getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
  await launch.getByRole("radio", { name: "Conta" }).click();
  await launch.getByLabel("Valor").fill("100,00");
  await pickDate(launch, "Outra data", `${first}-01`);
  await launch.getByLabel("Observação").fill("Internet");
  await launch.getByRole("switch", { name: "Repetir lançamento (Série)" }).click();
  await launch.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("12 lançamentos criados")).toBeVisible();

  await resize(first, "6 meses");
  await expect(page.getByText("Série ajustada com sucesso para 6 meses futuros.")).toBeVisible();
  await visit(sixth);
  await expect(internet).toContainText("Saída · 6/66 de 6");
  await visit(seventh);
  await expect(ledger).toHaveCount(0);

  await resize(sixth, "12 meses");
  await expect(page.getByText("Série ajustada com sucesso para 12 meses futuros.")).toBeVisible();
  await visit(twelfth);
  await expect(internet).toContainText("Saída · 12/1212 de 12");
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
  await launch.getByRole("radio", { name: "Conta" }).click();
  await launch.getByLabel("Valor").fill("100,00");
  await pickDate(launch, "Outra data", `${first}-05`);
  await launch.getByLabel("Observação").fill("Internet");
  await launch.getByRole("switch", { name: "Repetir lançamento (Série)" }).click();
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
  await expect(onDay(`${third}-10`)).toContainText("Saída · 3/123 de 12");
  await visit(twelfth);
  await expect(onDay(`${twelfth}-10`)).toContainText("Saída · 12/1212 de 12");
  await visit(second);
  await expect(onDay(`${second}-05`)).toContainText("Saída · 2/122 de 12");
});
