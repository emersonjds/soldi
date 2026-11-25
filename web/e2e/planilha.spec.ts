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

/** Tables of the planilha cut by its scroller's edge. */
const partialMonths = (page: Page) =>
  page.evaluate(() => {
    const tables = [...document.querySelectorAll("table[data-month]")];
    const frame = tables[0].parentElement?.getBoundingClientRect();
    if (!frame) return -1;
    return tables.filter((table) => {
      const box = table.getBoundingClientRect();
      const meets = box.right > frame.left + 1 && box.left < frame.right - 1;
      return meets && (box.left < frame.left - 1 || box.right > frame.right + 1);
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
  // A six-digit balance: the widest month the breakpoints are sized for.
  const salary = categories.find((each) => each.kind === "income");
  expect(
    (
      await page.request.post("/api/transactions", {
        data: { date: today, amount: "123456.78", kind: "income", category_id: salary?.id },
      })
    ).ok(),
  ).toBe(true);
  // Six months of history: today's month opens away from scrollLeft 0.
  const [year, month] = today.split("-").map(Number);
  const opening = new Date(Date.UTC(year, month - 7, 1)).toISOString().slice(0, 10);
  expect((await page.request.patch("/api/settings", { data: { opening_date: opening } })).ok()).toBe(true);
  const fetched = new Set<string>();
  page.on("request", (request) => {
    const hit = new URL(request.url()).pathname.match(/^\/api\/months\/(\d{4}-\d{2})$/);
    if (hit) fetched.add(hit[1]);
  });

  await page.goto("/mes");
  const ledger = page.getByRole("region", { name: "Lançamentos" });
  const views = ledger.getByRole("radiogroup", { name: "Ver lançamentos como" });
  await expect(ledger.getByRole("button", { name: /Feira/ })).toBeVisible();
  await expect(views.getByRole("radio", { name: "Lista" })).toHaveAttribute("aria-checked", "true");
  const address = page.url();

  await views.getByRole("radio", { name: "Planilha" }).click();
  fetched.clear();
  await page.reload();
  await expect(views.getByRole("radio", { name: "Planilha" })).toHaveAttribute("aria-checked", "true");
  expect(page.url()).toBe(address);
  const day = ledger.locator(`[data-day="${today}"]`);
  await expect(day).toBeVisible();
  await expect.poll(() => todayInView(page, today)).toBe(true);
  const goToday = ledger.getByRole("button", { name: "Ir pra hoje" });
  await expect(goToday).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  // One month in view and its neighbour on each side.
  expect(fetched.size).toBeLessThanOrEqual(3);

  const cardWidth: Record<number, number> = {};
  for (const [width, shown] of [
    [375, 1],
    [1024, 1],
    [1280, 2],
    [1440, 3],
    [1920, 4],
    [2560, 5],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => (document.scrollingElement?.scrollWidth ?? 0) <= window.innerWidth)).toBe(true);
    await expectNoClipped(page);
    await expect.poll(() => monthsInView(page)).toBe(shown);
    await expect.poll(() => partialMonths(page)).toBe(0);
    cardWidth[width] = (await ledger.boundingBox())?.width ?? 0;
  }
  expect(cardWidth[1920]).toBeGreaterThan(cardWidth[1440]);
  expect(cardWidth[2560]).toBeGreaterThan(cardWidth[1920]);

  fetched.clear();
  await page.reload();
  await expect.poll(() => todayInView(page, today)).toBe(true);
  await page.waitForLoadState("networkidle");
  // Five months in view and a neighbour on each side.
  expect(fetched.size).toBeLessThanOrEqual(7);

  await page.setViewportSize({ width: 1920, height: 900 });
  const main = page.getByRole("main");
  await views.getByRole("radio", { name: "Lista" }).click();
  await expect.poll(async () => (await main.boundingBox())?.width).toBe(72 * 16);
  await views.getByRole("radio", { name: "Planilha" }).click();
  await expect.poll(async () => (await main.boundingBox())?.width).toBeGreaterThan(72 * 16);

  await page.setViewportSize({ width: 375, height: 812 });
  await day.click();
  const detail = page.getByRole("dialog", { name: /^Hoje/ });
  await expect(detail).toContainText("Feira");
  // SOL-171: the detail adds on its day; the right column stays out of the planilha.
  await expect(detail.getByRole("button", { name: /^Lançar Diário em / })).toBeVisible();
  await expectNoClipped(page);
  await page.keyboard.press("Escape");
  await expect(main.getByText("Termômetro do Mês")).toHaveCount(0);
  await expect(main.getByText("Próximos meses")).toHaveCount(0);

  await page.evaluate(() => {
    const scroller = document.querySelector("table[data-month]")?.parentElement;
    scroller?.scrollTo({ left: scroller.scrollWidth });
  });
  await expect(goToday).toBeVisible();
  for (const target of [views.getByRole("radio", { name: "Planilha" }), day, goToday])
    expect((await target.boundingBox())?.height).toBeGreaterThanOrEqual(44);

  await goToday.click();
  // SOL-172: today's row flashes for 2.4 s, and only today's.
  await expect(day.locator("xpath=ancestor::tr")).toHaveAttribute("data-flash", "");
  await expect(ledger.locator("tr[data-flash]")).toHaveCount(1);
  await expect.poll(() => todayInView(page, today)).toBe(true);
  await expect(day).toBeFocused();
  await expect(goToday).toHaveCount(0);

  // SOL-171: today's Saída is a "-": a tap opens Lançar as a conta on today, and closing it leaves the grid in place.
  const outflow = day.locator("xpath=ancestor::tr").locator("td").nth(2);
  await expect(outflow).toContainText("-");
  const box = await outflow.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);
  const scroll = () =>
    page.evaluate(() => {
      const scroller = document.querySelector("table[data-month]")?.parentElement;
      return [scroller?.scrollLeft, scroller?.scrollTop];
    });
  const before = await scroll();
  await outflow.click();
  const create = page.getByRole("dialog", { name: /^Novo (Registro|Lançamento)$/ });
  await expect(create.getByRole("radio", { name: "Conta" })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(create).toHaveCount(0);
  await expect(day).toBeFocused();
  expect(await scroll()).toEqual(before);
});
