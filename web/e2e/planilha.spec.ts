import { expect, type Page, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";
import { requireServer } from "./server";

/** Tables of the planilha whose whole width sits inside its scroller. */
const monthsInView = (page: Page) =>
  page.evaluate(() => {
    const tables = [...document.querySelectorAll("table[data-month]")];
    const frame = tables[0].parentElement?.getBoundingClientRect();
    if (!frame) return 0;
    return tables.filter((table) => {
      const box = table.getBoundingClientRect();
      return box.left >= frame.left - 1 && box.right <= frame.right + 1;
    }).length;
  });

/** Today's day button fully inside the planilha's scroller. */
const todayInView = (page: Page, today: string) =>
  page.evaluate((date) => {
    const button = document.querySelector(`[data-day="${date}"]`);
    const frame = button?.closest("table")?.parentElement?.getBoundingClientRect();
    const box = button?.getBoundingClientRect();
    if (!frame || !box) return false;
    return box.top >= frame.top && box.bottom <= frame.bottom && box.left >= frame.left - 1 && box.right <= frame.right;
  }, today);

test("Lançamentos switches to the planilha, remembers it, shows a day's entries and Ir pra hoje brings today back (SOL-163)", async ({
  page,
  request,
}) => {
  await requireServer(request);
  test.setTimeout(120_000);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(`e2e-planilha-${Date.now()}@example.com`);
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

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const categories: { id: string; kind: string }[] = await (await page.request.get("/api/categories")).json();
  const daily = categories.find((each) => each.kind === "daily");
  expect(
    (
      await page.request.post("/api/transactions", {
        data: { date: today, amount: "48.90", kind: "daily", category_id: daily?.id, note: "Feira" },
      })
    ).ok(),
  ).toBe(true);

  await page.goto("/mes");
  const ledger = page.getByRole("region", { name: "Lançamentos" });
  const views = ledger.getByRole("radiogroup", { name: "Ver lançamentos como" });
  await expect(ledger.getByRole("button", { name: /Feira/ })).toBeVisible();
  await expect(views.getByRole("radio", { name: "Lista" })).toHaveAttribute("aria-checked", "true");
  const address = page.url();

  await views.getByRole("radio", { name: "Planilha" }).click();
  await page.reload();
  await expect(views.getByRole("radio", { name: "Planilha" })).toHaveAttribute("aria-checked", "true");
  expect(page.url()).toBe(address);
  const day = ledger.locator(`[data-day="${today}"]`);
  await expect(day).toBeVisible();
  await expect.poll(() => todayInView(page, today)).toBe(true);
  const goToday = ledger.getByRole("button", { name: "Ir pra hoje" });
  await expect(goToday).toHaveCount(0);

  for (const width of [375, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => (document.scrollingElement?.scrollWidth ?? 0) <= window.innerWidth)).toBe(true);
    await expectNoClipped(page);
    if (width === 375) await expect.poll(() => monthsInView(page)).toBe(1);
    if (width === 1440) await expect.poll(() => monthsInView(page)).toBe(3);
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await day.click();
  await expect(page.getByRole("dialog", { name: /^Hoje/ })).toContainText("Feira");
  await page.keyboard.press("Escape");

  await page.evaluate(() => {
    const scroller = document.querySelector("table[data-month]")?.parentElement;
    scroller?.scrollTo({ left: scroller.scrollWidth });
  });
  await expect(goToday).toBeVisible();
  for (const target of [views.getByRole("radio", { name: "Planilha" }), day, goToday])
    expect((await target.boundingBox())?.height).toBeGreaterThanOrEqual(44);

  await goToday.click();
  await expect.poll(() => todayInView(page, today)).toBe(true);
  await expect(day).toBeFocused();
  await expect(goToday).toHaveCount(0);
});
