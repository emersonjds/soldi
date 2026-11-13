import { expect, test } from "@playwright/test";

import { requireServer } from "./server";

/** `YYYY-MM` `offset` months from today's, in São Paulo. */
const monthFromNow = (offset: number) => {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
    .format(new Date())
    .split("-")
    .map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
};

test("the month switcher moves both ways on Mês and on Contas fixas (SOL-120)", async ({ page, request }) => {
  await requireServer(request);
  const api = page.request;
  await api.post("/api/auth/sign-up", {
    data: { email: `e2e-month-switch-${Date.now()}@example.com`, password: "uma-senha-bem-longa" },
  });
  await api.post("/api/onboarding", { data: { opening_balance: "1000.00", opening_date: `${monthFromNow(-2)}-01` } });
  await api.post("/api/me/tour-seen");

  for (const path of ["/mes", "/ajustes/contas"]) {
    await page.goto(`${path}?m=${monthFromNow(1)}`);
    const switcher = page.getByRole("group", { name: "Mês" }).first();
    await switcher.getByRole("button", { name: "Mês anterior" }).click();
    await expect(page).toHaveURL(new RegExp(`${path}\\?m=${monthFromNow(0)}$`));
    await switcher.getByRole("button", { name: "Mês anterior" }).click();
    await expect(page).toHaveURL(new RegExp(`m=${monthFromNow(-1)}$`));
    await switcher.getByRole("button", { name: "Próximo mês" }).click();
    await expect(page).toHaveURL(new RegExp(`m=${monthFromNow(0)}$`));
  }
});
