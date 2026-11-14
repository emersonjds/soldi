import { expect, type Locator, type Page, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";
import { requireServer } from "./server";

/** `YYYY-MM` `offset` months from today's, in São Paulo. */
const monthFrom = (offset: number) => {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
    .format(new Date())
    .split("-")
    .map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
};

/** A fresh account through the API, opened last month so Ontem is always offered, tour seen, Mês at 375 px. */
const signUpByApi = async (page: Page, name: string) => {
  const api = page.request;
  await api.post("/api/auth/sign-up", {
    data: { email: `e2e-${name}-${Date.now()}@example.com`, password: "uma-senha-bem-longa" },
  });
  await api.post("/api/onboarding", { data: { opening_balance: "1000.00", opening_date: `${monthFrom(-1)}-01` } });
  await api.post("/api/me/tour-seen");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/mes");
};

const openLancar = async (page: Page) => {
  await page.getByRole("button", { name: "Lançar", exact: true }).first().click();
  return page.getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
};

const pickerOf = (page: Page) => page.getByRole("dialog", { name: "Categoria", exact: true });

test("logs a spend in a brand-new subcategory in four taps after the amount (SOL-140)", async ({ page, request }) => {
  await requireServer(request);
  await signUpByApi(page, "sub-inline");
  const launch = await openLancar(page);
  await launch.getByRole("button", { name: "Ontem" }).click();
  await launch.getByLabel("Valor").click();
  await page.keyboard.type("12345");

  let taps = 0;
  const tap = async (target: Locator) => {
    taps += 1;
    await target.click();
  };
  const picker = pickerOf(page);
  await tap(launch.getByRole("button", { name: "Categoria Gasto" }));
  await expect(picker.getByRole("radiogroup", { name: "Mais usadas" })).toBeVisible();
  await expectNoClipped(page);
  await tap(picker.getByRole("button", { name: "Adicionar subcategoria em Alimentação" }));
  const create = page.getByRole("dialog", { name: "Nova Categoria" });
  await create.getByLabel("Nome do agrupador").fill("Padaria");
  await tap(create.getByRole("button", { name: "Criar Categoria" }));

  await expect(picker).toBeHidden();
  await expect(launch.getByRole("button", { name: "Categoria Alimentação › Padaria" })).toBeVisible();
  await expect(launch.getByLabel("Valor")).toHaveValue("123,45");
  await expect(launch.getByRole("button", { name: "Ontem" })).toHaveAttribute("aria-pressed", "true");
  await tap(launch.getByRole("button", { name: "Salvar" }));
  expect(taps).toBeLessThanOrEqual(4);

  const ledger = page.getByRole("region", { name: "Lançamentos" });
  await expect(ledger.getByRole("button", { name: /Padaria/ })).toContainText("R$ 123,45");

  await page.setViewportSize({ width: 1440, height: 900 });
  await (await openLancar(page)).getByRole("button", { name: /^Categoria/ }).click();
  await expect(picker.getByRole("button", { name: "Novo grupo" })).toBeVisible();
  await expectNoClipped(page);
});

test("creates a card from Lançar, spends on it and finds it in the card's fatura (SOL-140)", async ({
  page,
  request,
}) => {
  await requireServer(request);
  await signUpByApi(page, "card-inline");
  const categoriesBefore: unknown[] = await (await page.request.get("/api/categories")).json();
  const launch = await openLancar(page);
  await page.keyboard.type("5000");

  const cardField = launch.getByRole("combobox", { name: "Cartão" });
  await launch.getByRole("button", { name: "Novo cartão" }).click();
  const cardSheet = page.getByRole("dialog", { name: "Novo cartão" });
  await cardSheet.getByLabel("Nome do cartão").fill("Porto");
  await cardSheet.getByRole("textbox", { name: "Fecha dia" }).fill("3");
  await cardSheet.getByRole("textbox", { name: "Dia do vencimento" }).fill("10");
  await expectNoClipped(page);
  await cardSheet.getByRole("button", { name: "Criar cartão" }).click();

  await expect(cardSheet).toBeHidden();
  await expect(cardField.locator("option:checked")).toHaveText("Porto");
  await expect(launch.getByLabel("Valor")).toHaveValue("50,00");
  await launch.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("region", { name: "Lançamentos" }).getByRole("button", { name: /Gasto/ })).toContainText(
    "R$ 50,00",
  );

  const entries: { card_id: string | null }[] = await (
    await page.request.get(`/api/transactions?month=${monthFrom(0)}`)
  ).json();
  expect(entries).toHaveLength(1);
  expect(entries[0].card_id).toBeTruthy();
  const categoriesAfter: unknown[] = await (await page.request.get("/api/categories")).json();
  expect(categoriesAfter).toHaveLength(categoriesBefore.length);

  // A purchase before the closing day falls in this month's fatura, on or after it in next month's.
  const today = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(8));
  await page.goto(`/mes?m=${monthFrom(today < 3 ? 0 : 1)}`);
  await page.getByRole("region", { name: "Contas a pagar" }).getByRole("button", { name: "Ver Fatura Porto" }).click();
  await expect(page.getByRole("dialog", { name: "Fatura Porto" })).toContainText("R$ 50,00");

  await page.goto("/mes");
  await page.setViewportSize({ width: 1440, height: 900 });
  await (await openLancar(page)).getByRole("combobox", { name: "Cartão" }).selectOption("new");
  await expect(cardSheet.getByRole("button", { name: "Criar cartão" })).toBeVisible();
  await expectNoClipped(page);
});

test("a duplicate name is refused in its kind and offered from the other kind, keeping the amount (SOL-140)", async ({
  page,
  request,
}) => {
  await requireServer(request);
  await signUpByApi(page, "duplicate");
  const launch = await openLancar(page);
  await page.keyboard.type("7700");
  const picker = pickerOf(page);
  await launch.getByRole("button", { name: /^Categoria/ }).click();
  await picker.getByRole("button", { name: "Novo grupo" }).click();
  const create = page.getByRole("dialog", { name: "Nova Categoria" });
  const name = create.getByLabel("Nome do agrupador");

  await name.fill("Mercado");
  await create.getByRole("button", { name: "Criar Categoria" }).click();
  await expect(create.getByText("Já existe uma categoria com esse nome")).toBeVisible();
  await expect(name).toBeFocused();

  await name.fill("Luz");
  await expect(create.getByText('"Luz" já existe em Casa, para outro tipo de gasto.')).toBeVisible();
  await create.getByRole("button", { name: "Usar esta categoria" }).click();
  await expect(picker).toBeHidden();
  await expect(launch.getByRole("radio", { name: "Conta" })).toBeChecked();
  await expect(launch.getByRole("button", { name: "Categoria Casa › Luz" })).toBeVisible();
  await expect(launch.getByLabel("Valor")).toHaveValue("77,00");
});

test("an Entrada group is still created from Lançar (SOL-140)", async ({ page, request }) => {
  await requireServer(request);
  await signUpByApi(page, "income-group");
  const launch = await openLancar(page);
  await launch.getByRole("radio", { name: "Entrada" }).click();
  await launch.getByRole("button", { name: /^Categoria/ }).click();
  await pickerOf(page).getByRole("button", { name: "Novo grupo" }).click();
  const create = page.getByRole("dialog", { name: "Nova Categoria" });
  await expect(create.getByText("Quando acontece")).toHaveCount(0);
  await create.getByLabel("Nome do agrupador").fill("Freelas");
  await create.getByRole("button", { name: "Criar Categoria" }).click();

  await expect(launch.getByRole("button", { name: "Categoria Freelas" })).toBeVisible();
  await expect(launch.getByRole("radio", { name: "Entrada" })).toBeChecked();
});
