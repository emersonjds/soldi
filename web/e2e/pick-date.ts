import type { Locator } from "@playwright/test";

const longDate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" });

/** Opens the `DateField` labelled `label` inside `scope` and picks `date` (`YYYY-MM-DD`) on its calendar. */
export const pickDate = async (scope: Locator, label: string, date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const page = scope.page();
  await scope.getByRole("button", { name: new RegExp(`^${label}(, |$)`) }).click();
  await page.getByRole("combobox", { name: "Escolha o ano" }).selectOption(String(year));
  await page.getByRole("combobox", { name: "Escolha o mês" }).selectOption(String(month - 1));
  const name = longDate.format(new Date(year, month - 1, day));
  await page.getByRole("button", { name: new RegExp(`, ${name}`) }).click();
};
