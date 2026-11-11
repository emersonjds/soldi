import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { BillOfMonth } from "./bill-queries";

/** The status pill's shape; Contas fixas reuses it. */
export const statusPill = "inline-flex min-h-8 items-center justify-center rounded-full px-2.5 font-semibold text-xs";

export const PAID_TONE = "bg-income-soft text-tier-green-foreground";

/** A 44 px target around a 32 px pill. */
const PillButton = ({
  label,
  pressed,
  onClick,
  busy,
  tone,
  className,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  busy: boolean;
  tone: string;
  className?: string;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={pressed}
    onClick={onClick}
    disabled={busy}
    className={cn(
      "flex min-h-11 shrink-0 items-center rounded-full focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60",
      className,
    )}
  >
    <span className={cn(statusPill, tone)}>{children}</span>
  </button>
);

/**
 * Spec 2026-11-11 §2.6: `Pagar` pays at every width; at 1024 px and up `Pago` and `Vencido` are badges (the round
 * check acts), below it they are the buttons: `✓ Pago` undoes, `Vencido` pays.
 */
export const BillStatus = ({
  bill,
  label,
  onPay,
  onUnpay,
  busy,
}: {
  bill: BillOfMonth;
  label: string;
  onPay: () => void;
  onUnpay: () => void;
  busy: boolean;
}) => {
  if (bill.paid)
    return (
      <>
        <span className={cn(statusPill, PAID_TONE, "hidden lg:inline-flex")}>Pago</span>
        <PillButton
          label={`Pago, ${label}`}
          pressed
          onClick={onUnpay}
          busy={busy}
          tone={PAID_TONE}
          className="lg:hidden"
        >
          ✓ Pago
        </PillButton>
      </>
    );
  if (bill.overdue)
    return (
      <>
        <span className={cn(statusPill, "hidden bg-expense text-primary-foreground lg:inline-flex")}>Vencido</span>
        <PillButton
          label={`Pagar ${label}, vencida`}
          onClick={onPay}
          busy={busy}
          tone="bg-expense-soft font-bold text-expense-text"
          className="lg:hidden"
        >
          Vencido
        </PillButton>
      </>
    );
  return (
    <PillButton
      label={`Pagar ${label}`}
      onClick={onPay}
      busy={busy}
      tone="min-w-15 bg-muted px-3 text-primary lg:min-w-0 lg:rounded-lg lg:hover:bg-primary lg:hover:text-primary-foreground"
    >
      Pagar
    </PillButton>
  );
};
