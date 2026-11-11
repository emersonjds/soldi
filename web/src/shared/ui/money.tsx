import { cn } from "@/lib/utils";
import { useCurrency } from "@/shared/lib/currency";
import { formatMoney, formatMoneyParts } from "@/shared/lib/money";

const FIGURE = {
  figure: "text-[28px] leading-9",
  hero: "text-[40px] leading-12 lg:text-5xl lg:leading-14",
  display: "text-[34px] leading-10 lg:text-[40px] lg:leading-12",
};

/** Spec §4.2: the symbol and `,cents` at 55% of the integer. */
const MINOR = new Set<Intl.NumberFormatPartTypes>(["currency", "literal", "decimal", "fraction"]);

/** SOL-79 §2.3, the Mês hero: plain below lg, then `,cents` raised at 55% and the symbol whole. */
const RAISED = new Set<Intl.NumberFormatPartTypes>(["decimal", "fraction"]);

const minorOf = (size: "figure" | "hero" | "display", type: Intl.NumberFormatPartTypes) => {
  if (size === "display") return RAISED.has(type) && "lg:align-super lg:text-[0.55em]";
  return MINOR.has(type) && "text-[0.55em]";
};

/**
 * An API decimal in the user's currency with tabular figures; income gets `+` and green, a negative amount red.
 * `figure` and `hero` shrink the symbol and cents; screen readers and `getByText` still get one string.
 */
export const Money = ({
  amount,
  income = false,
  size = "row",
  className,
}: {
  amount: string;
  income?: boolean;
  size?: "row" | "figure" | "hero" | "display";
  className?: string;
}) => {
  const currency = useCurrency();
  const text = income ? `+ ${formatMoney(amount, currency)}` : formatMoney(amount, currency);
  const classes = cn(
    "whitespace-nowrap tabular-nums",
    size !== "row" && ["font-bold tracking-[-0.02em]", FIGURE[size]],
    income && "text-income-text",
    amount.startsWith("-") && "text-expense",
    className,
  );

  if (size === "row") return <span className={classes}>{text}</span>;

  return (
    <span className={classes}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {income && "+ "}
        {formatMoneyParts(amount, currency).map(({ type, value }, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Intl's parts are a fixed sequence, never reordered.
          <span key={index} className={cn(minorOf(size, type))}>
            {value}
          </span>
        ))}
      </span>
    </span>
  );
};
