import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BILLS_OF_MONTH } from "@/test/stub-api";

import { BillStatus } from "./bill-status";

const [POWER, RENT] = BILLS_OF_MONTH;

const status = (bill = RENT, busy = false) => {
  const onPay = vi.fn();
  const onUnpay = vi.fn();
  render(<BillStatus bill={bill} label={bill.name} onPay={onPay} onUnpay={onUnpay} busy={busy} />);
  return { onPay, onUnpay };
};

describe("BillStatus", () => {
  it("pays an open bill from the Pagar pill, a 44 px target at every width", async () => {
    const { onPay } = status();
    const pill = screen.getByRole("button", { name: "Pagar Aluguel Residencial" });
    expect(pill).toHaveTextContent("Pagar");
    expect(pill).toHaveClass("min-h-11");
    expect(pill).not.toHaveClass("lg:hidden");
    await userEvent.click(pill);
    expect(onPay).toHaveBeenCalledOnce();
  });

  it("shows a Pago badge on desktop and a pressed ✓ Pago toggle on mobile that undoes", async () => {
    const { onUnpay } = status({ ...RENT, paid: true });
    expect(screen.getByText("Pago", { exact: true })).toHaveClass("hidden", "lg:inline-flex", "bg-income-soft");
    const toggle = screen.getByRole("button", { name: "Pago, Aluguel Residencial" });
    expect(toggle).toHaveTextContent("✓ Pago");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveClass("lg:hidden", "min-h-11");
    await userEvent.click(toggle);
    expect(onUnpay).toHaveBeenCalledOnce();
  });

  it("shows a red Vencido badge on desktop and a Vencido button that pays on mobile", async () => {
    const { onPay } = status(POWER);
    expect(screen.getByText("Vencido", { selector: "span.hidden" })).toHaveClass("lg:inline-flex", "bg-expense");
    const button = screen.getByRole("button", { name: "Pagar Luz (Enel), vencida" });
    expect(button).toHaveTextContent("Vencido");
    expect(button).toHaveClass("lg:hidden");
    await userEvent.click(button);
    expect(onPay).toHaveBeenCalledOnce();
  });

  it("disables every control while a payment is on its way", () => {
    status(RENT, true);
    expect(screen.getByRole("button", { name: "Pagar Aluguel Residencial" })).toBeDisabled();
  });
});
