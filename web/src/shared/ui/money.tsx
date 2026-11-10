import { cn } from "@/lib/utils";
import { useCurrency } from "@/shared/lib/currency";
import { formatMoney } from "@/shared/lib/money";

/** An API decimal in the user's currency with tabular figures; income gets `+` and green, a negative amount red. */
export const Money = ({
  amount,
  income = false,
  className,
}: {
  amount: string;
  income?: boolean;
  className?: string;
}) => {
  const currency = useCurrency();
  return (
    <span
      className={cn(
        "whitespace-nowrap tabular-nums",
        income && "text-income-text",
        amount.startsWith("-") && "text-expense",
        className,
      )}
    >
      {income ? `+ ${formatMoney(amount, currency)}` : formatMoney(amount, currency)}
    </span>
  );
};
