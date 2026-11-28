import { expect, type Locator, type Page, test } from "@playwright/test";

import { expectNoClipped } from "./clipped";
import { requireServer } from "./server";

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** A cell's figure in cents, its sign kept: `-1.045,26` → -104526. */
const centsIn = async (cell: Locator) => {
  const [figure = ""] = ((await cell.textContent()) ?? "").match(/[-−]?[\d.]+,\d{2}/) ?? [];
  const value = Number(figure.replace(/\D/g, ""));
  return /^[-−]/.test(figure) ? -value : value;
};

const widths = async (page: Page) => {
  for (const width of [375, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoClipped(page);
  }
  await page.setViewportSize({ width: 375, height: 812 });
};

test("one month of a conta gets its own amount or is skipped, from Contas a pagar, Lista and the Planilha; a fatura opens its sheet (SOL-173)", async ({
  page,
  request,
}) => {
  await requireServer(request);
  test.setTimeout(120_000);
  // The server's São Paulo calendar, not the runner's clock; two months ahead nothing is paid or owed yet.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const monthFrom = (offset: number) =>
    new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + offset, 1)).toISOString().slice(0, 7);
  const month = monthFrom(2);
  const mes = MONTHS[Number(month.slice(5)) - 1];
  const Mes = `${mes[0].toUpperCase()}${mes.slice(1)}`;

  const api = page.request;
  await api.post("/api/auth/sign-up", {
    data: { email: `e2e-one-occurrence-${Date.now()}@example.com`, password: "uma-senha-bem-longa" },
  });
  await api.post("/api/onboarding", { data: { opening_balance: "1000.00", opening_date: `${monthFrom(0)}-01` } });
  await api.post("/api/me/tour-seen");
  const categories: { id: string; kind: string; is_savings: boolean }[] = await (
    await api.get("/api/categories")
  ).json();
  const billCategory = categories.find((each) => each.kind === "bill" && !each.is_savings);
  const daily = categories.find((each) => each.kind === "daily" && !each.is_savings);
  for (const data of [
    { name: "Caixa Habitação", amount: "1045.26", due_day: 12 },
    { name: "Internet", amount: "99.90", due_day: 8 },
  ]) {
    expect((await api.post("/api/bills", { data: { ...data, category_id: billCategory?.id } })).ok()).toBe(true);
  }
  const card = await api.post("/api/bills", {
    data: { name: "Porto", category_id: billCategory?.id, closing_day: 5, due_day: 12 },
  });
  expect(card.ok()).toBe(true);
  const { id: cardId }: { id: string } = await card.json();
  // Bought after the 5th closes next month's fatura, due on the 12th two months ahead.
  const spend = await api.post("/api/transactions", {
    data: { date: `${monthFrom(1)}-06`, amount: "300.00", kind: "daily", category_id: daily?.id, card_id: cardId },
  });
  expect(spend.ok()).toBe(true);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/mes?m=${month}`);
  const bills = page.getByRole("region", { name: "Contas a pagar" });
  const caixa = bills.getByRole("listitem", { name: "Caixa Habitação" });
  const sheet = page.getByRole("dialog", { name: `Caixa Habitação · ${mes}` });
  const undo = page.getByRole("button", { name: "Desfazer" });

  // Contas a pagar: the amount opens the month; Salvar appears once the amount changes; Desfazer restores.
  const adjust = caixa.getByRole("button", { name: /ajustar pagamento de Caixa Habitação$/ });
  await adjust.click();
  await expect(sheet.getByRole("button", { name: "Pagar", exact: true })).toBeVisible();
  // The sheet turns into a dialog from 1024: the amount is typed in a sheet opened at 375.
  await widths(page);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await adjust.click();
  await expect(sheet.getByRole("button", { name: "Pagar", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: `Pular ${mes}` })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Editar conta" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: `Salvar valor de ${mes}` })).toHaveCount(0);
  await sheet.getByLabel(`Valor de ${mes}`).fill("1.100,00");
  await expect(sheet).toContainText(`Só ${mes} muda. Os outros meses seguem R$ 1.045,26.`);
  await expectNoClipped(page);
  await sheet.getByRole("button", { name: `Salvar valor de ${mes}` }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText(`Valor de ${mes} ajustado`)).toBeVisible();
  await expect(caixa).toContainText("R$ 1.100,00");
  await expect(caixa).toContainText("valor ajustado");
  await undo.click();
  await expect(caixa).toContainText("R$ 1.045,26");
  await expect(caixa).not.toContainText("valor ajustado");

  // Planilha before: the 12th's Saída holds the conta and the fatura.
  const ledger = page.getByRole("region", { name: "Lançamentos" });
  const views = ledger.getByRole("radiogroup", { name: "Ver lançamentos como" });
  const row = (day: string) => ledger.locator(`tr:has([data-day="${month}-${day}"])`);
  const saida = (day: string) => row(day).locator("td").nth(2);
  const saldo = (day: string) => row(day).locator("td").nth(4);
  await views.getByRole("radio", { name: "Planilha" }).click();
  await expect(saida("12")).toHaveText(/^1\.345,26/);
  const saldoBefore = await centsIn(saldo("12"));
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate().toString();
  const endBefore = await centsIn(saldo(lastDay));

  // Lista: the conta's row opens its month; Salvar valor moves only this month's Saída and Saldo.
  await views.getByRole("radio", { name: "Lista" }).click();
  await ledger.getByRole("button", { name: /^Abrir\s*Caixa Habitação/ }).click();
  await sheet.getByLabel(`Valor de ${mes}`).fill("1.100,00");
  await sheet.getByRole("button", { name: `Salvar valor de ${mes}` }).click();
  await expect(sheet).toBeHidden();
  await expect(ledger.getByRole("listitem", { name: "Caixa Habitação" })).toContainText("valor ajustado");
  await views.getByRole("radio", { name: "Planilha" }).click();
  await expect(saida("12")).toHaveText(/^1\.400,00/);
  await expect.poll(() => centsIn(saldo("12"))).toBe(saldoBefore - 5474);
  expect(await centsIn(saldo(lastDay))).toBe(endBefore - 5474);

  // The Planilha: a cell whose only Saída is one conta opens its month; Pular leaves it out.
  const internet = page.getByRole("dialog", { name: `Internet · ${mes}` });
  await saida("08").click();
  await internet.getByRole("button", { name: `Pular ${mes}` }).click();
  await expect(internet).toBeHidden();
  await expect(page.getByText(`${Mes} pulado`)).toBeVisible();
  await expect(saida("08")).toContainText("sem valor");
  await views.getByRole("radio", { name: "Lista" }).click();
  const struck = ledger.getByRole("listitem", { name: "Internet" });
  await expect(struck).toContainText(`pulada em ${mes}`);
  await expect(bills.getByRole("listitem", { name: "Internet" })).toContainText(`pulada em ${mes}`);
  await widths(page);

  // A Saída cell holding only the skipped month creates a conta; the day detail reopens the month; Voltar a cobrar brings it back.
  await views.getByRole("radio", { name: "Planilha" }).click();
  await saida("08").click();
  const create = page.getByRole("dialog", { name: "Lançar" });
  await expect(create.getByRole("radio", { name: "Conta" })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(create).toBeHidden();
  const detail = page.getByRole("dialog").filter({ has: page.getByRole("region", { name: "Saída" }) });
  await row("08").locator(`[data-day="${month}-08"]`).click();
  await detail.getByRole("button", { name: new RegExp(`^Abrir\\s*Internet.*pulada em ${mes}`) }).click();
  await internet.getByRole("button", { name: "Voltar a cobrar" }).click();
  await expect(internet).toBeHidden();
  await expect(page.getByText(`Internet volta a cobrar em ${mes}`)).toBeVisible();
  await expect(saida("08")).toHaveText(/^99,90/);

  // The 12th holds two items: the conta opens its month, the fatura its sheet.
  await saida("12").click();
  await expect(detail.getByRole("button", { name: /^Abrir\s*Caixa Habitação/ })).toBeVisible();
  await detail.getByRole("button", { name: /^Ver fatura\s*Porto/ }).click();
  const fatura = page.getByRole("dialog", { name: "Fatura Porto" });
  await expect(fatura).toContainText("R$ 300,00");
  await page.keyboard.press("Escape");
  await expect(fatura).toBeHidden();

  // Lista: the card's row opens its fatura.
  await views.getByRole("radio", { name: "Lista" }).click();
  await ledger.getByRole("button", { name: /^Ver fatura\s*Porto/ }).click();
  await expect(fatura).toBeVisible();
  await page.keyboard.press("Escape");

  // Back to the normal amount; the next month never moved.
  await caixa.getByRole("button", { name: /ajustar pagamento de Caixa Habitação$/ }).click();
  await expect(sheet).toContainText("Valor ajustado · o normal é R$ 1.045,26");
  await sheet.getByRole("button", { name: "Voltar ao valor normal" }).click();
  await expect(page.getByText("Valor normal de volta")).toBeVisible();
  await expect(caixa).toContainText("R$ 1.045,26");
  await page.goto(`/mes?m=${monthFrom(3)}`);
  await expect(caixa).toContainText("R$ 1.045,26");
  await expect(caixa).not.toContainText("valor ajustado");
});
