import { expect, type Page, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";
import { requireServer } from "./server";

const signUp = async (page: Page, who: string) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-${who}-${Date.now()}@example.com`);
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

test("an entry shows up in Para onde vai and Cofrinhos starts empty", async ({ page, request }) => {
  await requireServer(request);
  // The dev server compiles both report screens on first visit.
  test.setTimeout(90_000);

  await signUp(page, "reports");

  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await nav.getByRole("button", { name: "Lançar" }).click();
  await page.keyboard.type("80,00");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("region", { name: "Lançamentos" }).getByRole("button", { name: /Gasto/ })).toBeVisible();

  await nav.getByRole("button", { name: "Lançar" }).click();
  await page.getByRole("radio", { name: "Entrada" }).click();
  await page.getByLabel("Valor").fill("2.000,00");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("region", { name: "Resumo do mês" })).toContainText("R$ 2.000,00");

  await nav.getByRole("link", { name: "Para onde vai" }).click();
  const gasto = page.getByRole("list", { name: "Categorias" }).getByRole("button", { name: /^Gasto/ });
  await expect(gasto).toContainText("100,0% das despesas");
  await expect(gasto).toContainText("R$ 80,00");
  await expect(page.getByRole("radio", { name: "Entradas" })).toHaveCount(0);
  await gasto.click();
  await expect(page.getByRole("region", { name: "Lançamentos: Gasto" })).toContainText("- R$ 80,00");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByText("Total Saídas:")).toContainText("Total Saídas: R$ 80,00");
  await page.setViewportSize({ width: 375, height: 812 });

  await nav.getByRole("link", { name: "Economia" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Cofrinhos & Metas de Poupança" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Total guardado em cofrinhos" })).toContainText("Nada guardado ainda.");
});

test("Economia folds two cofrinhos and lists both their entries, unclipped from 375 to 1440", async ({
  page,
  request,
}) => {
  await requireServer(request);
  test.setTimeout(90_000);
  await signUp(page, "groups");

  // The server's São Paulo calendar, not the runner's clock.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const categories: { id: string; kind: string; is_savings: boolean; parent_id: string | null }[] = await (
    await page.request.get("/api/categories")
  ).json();
  const economia = categories.find(
    (category) => category.is_savings && !category.parent_id && category.kind === "bill",
  );
  const save = async (category_id: string | undefined, amount: string, note: string) => {
    const created = await page.request.post("/api/transactions", {
      data: { date: today, amount, kind: "bill", category_id, note },
    });
    expect(created.ok()).toBe(true);
  };
  for (const [name, amount] of [
    ["Reserva", "12345.67"],
    ["Viagem", "2345.10"],
  ]) {
    const created = await page.request.post("/api/categories", {
      data: { name, kind: "bill", parent_id: economia?.id, target: "50000.00" },
    });
    expect(created.ok()).toBe(true);
    await save((await created.json()).id, amount, `Aporte ${name}`);
  }
  await save(economia?.id, "150.00", "Guardado solto");

  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Para onde vai" })
    .click();
  await page.setViewportSize({ width: 1440, height: 900 });
  const legend = page.getByRole("list", { name: "Categorias" });
  await expect(legend.getByRole("button", { name: /^Economia/ })).toContainText("R$ 14.840,77");
  await legend.getByRole("button", { name: "Mostrar subcategorias de Economia" }).click();
  await expect(legend).toContainText("Economia (sem subcategoria)R$ 150,00");
  await legend.getByRole("button", { name: /^Economia/ }).click();

  const entries = page.getByRole("region", { name: "Lançamentos: Economia" });
  await expect(entries).toContainText("Aporte Reserva (Reserva)");
  await expect(entries).toContainText("Aporte Viagem (Viagem)");
  await expect(entries).toContainText("3 itens");
  await expect(entries).toContainText("Total no recorte selecionado: R$ 14.840,77");

  for (const width of [375, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoClipped(page);
  }
});
