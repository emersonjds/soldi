import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/lib/money";

/** An API decimal in BRL with tabular figures; income gets `+` and green, a negative amount red. */
export const Money = ({
  amount,
  income = false,
  className,
}: {
  amount: string;
  income?: boolean;
  className?: string;
}) => (
  <span
    className={cn(
      "whitespace-nowrap tabular-nums",
      income && "text-income",
      amount.startsWith("-") && "text-expense",
      className,
    )}
  >
    {income ? `+ ${formatBRL(amount)}` : formatBRL(amount)}
  </span>
);
