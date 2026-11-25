import { expect, test } from "@playwright/test";

// Runs against production after each release (.github/workflows/smoke.yml); the normal suite skips it.
test.skip(process.env.SMOKE !== "1", "Production smoke: set SMOKE=1, SMOKE_EMAIL and SMOKE_PASSWORD.");

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** `YYYY-MM` and its switcher label, `offset` months from today's in São Paulo. */
const monthFromNow = (offset: number) => {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
    .format(new Date())
    .split("-")
    .map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return { key: date.toISOString().slice(0, 7), label: `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}` };
};

test("signs in, switches months both ways, launches a Diário and deletes it", { tag: "@smoke" }, async ({ page }) => {
  const email = process.env.SMOKE_EMAIL;
  const password = process.env.SMOKE_PASSWORD;
  if (!email || !password) throw new Error("SMOKE_EMAIL and SMOKE_PASSWORD are required.");
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/entrar/);

  await page.goto("/mes");
  const switcher = page.getByRole("group", { name: "Mês" }).first();
  const [now, next] = [monthFromNow(0), monthFromNow(1)];
  await expect(switcher).toContainText(now.label);
  await switcher.getByRole("button", { name: "Próximo mês" }).click();
  await expect(page).toHaveURL(new RegExp(`/mes\\?m=${next.key}$`));
  await expect(switcher).toContainText(next.label);
  await switcher.getByRole("button", { name: "Mês anterior" }).click();
  await expect(page).toHaveURL(new RegExp(`/mes\\?m=${now.key}$`));
  await expect(switcher).toContainText(now.label);

  // A unique note: a leftover from a broken run never hides this one's deletion.
  const note = `smoke ${Date.now()}`;
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Lançar" }).click();
  const launch = page.getByRole("dialog", { name: "Lançar" });
  await launch.getByLabel("Valor").fill("1,00");
  await launch.getByLabel("Observação").fill(note);
  await launch.getByRole("button", { name: "Salvar" }).click();

  const row = page.getByRole("region", { name: "Lançamentos" }).getByRole("button", { name: new RegExp(note) });
  await expect(row).toContainText("R$ 1,00");
  await row.click();
  await page.getByRole("dialog", { name: note }).getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText("Lançamento excluído")).toBeVisible();
  await expect(row).toHaveCount(0);
});
