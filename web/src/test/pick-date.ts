import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const longDate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" });

/** Opens the `DateField` labelled `label` inside `scope` and picks `date` (`YYYY-MM-DD`) on its calendar. */
export const pickDate = async (label: string, date: string, scope: HTMLElement = document.body) => {
  const [year, month, day] = date.split("-").map(Number);
  await userEvent.click(within(scope).getByRole("button", { name: new RegExp(`^${label}(, |$)`) }));
  await userEvent.selectOptions(await screen.findByRole("combobox", { name: "Escolha o ano" }), String(year));
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Escolha o mês" }), String(month - 1));
  const name = longDate.format(new Date(year, month - 1, day));
  await userEvent.click(screen.getByRole("button", { name: new RegExp(`, ${name}`) }));
};
