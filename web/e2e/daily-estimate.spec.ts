import { expect, type Page, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";
import { requireServer } from "./server";

const WIDTHS = [375, 1024, 1280, 1440];

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

const atEveryWidth = async (page: Page) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const wider = await page.evaluate(() =>
      (document.scrollingElement?.scrollWidth ?? 0) <= window.innerWidth
        ? []
        : [...document.querySelectorAll("body *")]
            .filter(
              (element) =>
                element.getBoundingClientRect().right > window.innerWidth + 0.5 &&
                (element.parentElement?.getBoundingClientRect().right ?? 0) <= window.innerWidth + 0.5,
            )
            .slice(0, 4)
            .map((element) => `${element.tagName}.${element.className} "${element.textContent?.slice(0, 40)}"`),
    );
    expect(wider, `page wider than ${width}px`).toEqual([]);
    await expectNoClipped(page);
  }
  await page.setViewportSize({ width: 375, height: 812 });
};

const tallEnough = async (page: Page, ...names: (string | RegExp)[]) => {
  for (const name of names) {
    const target = page.getByRole("link", { name }).locator("visible=true").first();
    expect((await target.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
};

/** The server's São Paulo calendar, not the runner's clock. */
const calendar = () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  return { today, tomorrow, month: tomorrow.slice(0, 7) };
};

test("Diário previsto: off changes nothing; on from Ajustes it shows in the hero, Lista, Planilha and Próximos meses; off again (SOL-164)", async ({
  page,
  request,
}) => {
  await requireServer(request);
  test.setTimeout(180_000);
  await signUp(page, "estimate");
  const { tomorrow, month } = calendar();
  const categories: { id: string; kind: string; is_savings: boolean }[] = await (
    await page.request.get("/api/categories")
  ).json();
  const saida = categories.find((each) => each.kind === "bill" && !each.is_savings);
  // A Saída keeps the Lista on screen and leaves tomorrow's previsto whole.
  expect(
    (
      await page.request.post("/api/transactions", {
        data: { date: tomorrow, amount: "10.00", kind: "bill", category_id: saida?.id, note: "Seguro" },
      })
    ).ok(),
  ).toBe(true);
  const totals = async () => (await (await page.request.get(`/api/months/${month}`)).json()).totals;
  const before = await totals();

  // A1: never set.
  await page.goto(`/mes?m=${month}`);
  await expect(page.getByRole("region", { name: "Lançamentos" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Próximos meses" })).toBeVisible();
  await expect(page.getByText("Diário previsto")).toHaveCount(0);

  await page.goto("/ajustes");
  const section = page.locator("#diario-previsto");
  const field = section.getByLabel("Valor por dia");
  await expect(field).toBeVisible();
  expect(Number.parseFloat(await field.evaluate((input) => getComputedStyle(input).fontSize))).toBeGreaterThanOrEqual(
    16,
  );
  await atEveryWidth(page);

  // A5: a typed value turns it on.
  await field.fill("10.000,00");
  const turnOn = section.getByRole("button", { name: "Ligar Diário previsto" });
  expect((await turnOn.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await turnOn.click();
  await expect(page.getByText("Diário previsto ligado")).toBeVisible();
  const toggle = section.getByRole("switch", { name: "Somar à projeção" });
  await expect(toggle).toBeChecked();
  await expect(section).toContainText(/Ligado: a projeção conta R\$\s10\.000,00 por dia\./);
  await atEveryWidth(page);

  // A11, A13: tomorrow takes the estimate.
  await page.goto(`/mes?m=${month}`);
  const ledger = page.getByRole("region", { name: "Lançamentos" });
  const line = ledger.getByRole("link", {
    name: /^Diário previsto, R\$\s10\.000,00, estimativa\. Ajustar Diário previsto$/,
  });
  await expect(line.first()).toBeVisible();
  const ahead = page.getByRole("region", { name: "Próximos meses" });
  await expect(ahead.getByRole("link", { name: /^Inclui Diário previsto de R\$\s10\.000,00\/dia$/ })).toBeVisible();
  await tallEnough(page, /^Inclui Diário previsto/, /^Diário previsto, /);
  await atEveryWidth(page);
  expect(await totals()).toEqual(before);

  // Planilha cell and day detail.
  await ledger
    .getByRole("radiogroup", { name: "Ver lançamentos como" })
    .getByRole("radio", { name: "Planilha" })
    .click();
  const cell = ledger.locator(`[data-day="${tomorrow}"]`);
  const row = ledger.locator("tr").filter({ has: page.locator(`[data-day="${tomorrow}"]`) });
  await expect(row).toContainText(/10\.000,00/);
  await expect(row).toContainText("inclui Diário previsto");
  await cell.click();
  const detail = page.getByRole("dialog");
  await expect(detail).toContainText("Diário previsto");
  await expect(detail.getByRole("link", { name: "Ajustar Diário previsto" })).toBeVisible();
  await atEveryWidth(page);
  await page.keyboard.press("Escape");
  await ledger.getByRole("radiogroup", { name: "Ver lançamentos como" }).getByRole("radio", { name: "Lista" }).click();

  // A9: the hero note goes to the setting.
  await page.goto(`/mes?m=${month}`);
  await page
    .getByRole("link", { name: /^Inclui Diário previsto de R\$\s10\.000,00\/dia$/ })
    .locator("visible=true")
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/ajustes\\?m=${month}#diario-previsto$`));
  await expect(section).toBeInViewport();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/mes\\?m=${month}$`));
  await page.goto("/ajustes");
  await expect(toggle).toBeVisible();

  // Off: the value stays, every screen reads as today's.
  await toggle.click();
  await expect(page.getByText("Diário previsto desligado")).toBeVisible();
  await expect(section).toContainText(/Desligado\. Valor guardado: R\$\s10\.000,00\/dia\./);
  await atEveryWidth(page);

  await page.goto(`/mes?m=${month}`);
  await expect(ledger).toBeVisible();
  await expect(ahead).toBeVisible();
  await expect(page.getByText("Diário previsto")).toHaveCount(0);
  expect(await totals()).toEqual(before);
  await ledger
    .getByRole("radiogroup", { name: "Ver lançamentos como" })
    .getByRole("radio", { name: "Planilha" })
    .click();
  await expect(row).toContainText(/10,00/);
  await expect(row).not.toContainText("inclui Diário previsto");

  await page.goto("/posso-comprar");
  await page.getByLabel("Valor total estimado").fill("1.200,00");
  await page.getByRole("radio", { name: "6x" }).click();
  await page.getByRole("button", { name: "Calcular Projeção" }).click();
  await expect(page.getByRole("region", { name: "Veredito do orçamento" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Inclui Diário previsto/ })).toHaveCount(0);
});

test("Diário previsto: the suggestion from three months of Diário turns it on (SOL-164 A5)", async ({
  page,
  request,
}) => {
  await requireServer(request);
  test.setTimeout(120_000);
  await signUp(page, "estimate-hint");
  const { today } = calendar();
  const [year, month] = today.split("-").map(Number);
  const opening = new Date(Date.UTC(year, month - 5, 1)).toISOString().slice(0, 10);
  expect((await page.request.patch("/api/settings", { data: { opening_date: opening } })).ok()).toBe(true);
  const categories: { id: string; kind: string }[] = await (await page.request.get("/api/categories")).json();
  const daily = categories.find((each) => each.kind === "daily");
  const spent = new Date(Date.UTC(year, month - 3, 10)).toISOString().slice(0, 10);
  expect(
    (
      await page.request.post("/api/transactions", {
        data: { date: spent, amount: "920.00", kind: "daily", category_id: daily?.id, note: "Feira" },
      })
    ).ok(),
  ).toBe(true);

  await page.goto("/ajustes");
  const section = page.locator("#diario-previsto");
  const hint = section.getByText(/^Sugestão: R\$\s[\d.,]+\/dia, média do seu Diário fora do cartão de /);
  await expect(hint).toBeVisible();
  const amount = (await hint.textContent())?.match(/R\$\s([\d.,]+)\/dia/)?.[1];
  await expect(section.getByLabel("Valor por dia")).toHaveValue(amount ?? "");
  await section.getByRole("button", { name: "Ligar Diário previsto" }).click();
  await expect(page.getByText("Diário previsto ligado")).toBeVisible();

  const settings = await (await page.request.get("/api/settings")).json();
  expect(settings.daily_estimate_on).toBe(true);
  expect(Number(settings.daily_estimate).toFixed(2).replace(".", ",")).toBe(amount?.replace(/\./g, "") ?? "");
});
